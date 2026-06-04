# Nuxt 4 Integration Guide (OAuth2 / OIDC with PKCE)

This guide walks you through integrating the **SynchronizeTeams SSO** Identity Provider into a **Nuxt 4** application.

Nuxt 4 places frontend source code under the `app/` directory by default and API handlers in the `server/` directory. We will use a secure, server-side OIDC Authorization Code Flow with PKCE.

---

## 🔑 1. Register Client on SSO Server

Before configuring Nuxt, register your client inside the SSO database. You can do this by adding the client using the Admin API or via the default database seeding:

* **Client ID**: `nuxt4-app`
* **Client Secret**: `nuxt4-secret-key-456`
* **Allowed Redirect URI**: `http://localhost:3000/api/auth/callback`
* **Allowed Scopes**: `openid profile email`

---

## 📁 2. Nuxt 4 Project Configuration

Add the following environment variables to your Nuxt 4 `.env` file:

```env
# Nuxt 4 Client Port
PORT=3000

# SSO Server Configuration
SSO_ISSUER=https://sso.synchronizeteams.com
SSO_CLIENT_ID=nuxt4-app
SSO_CLIENT_SECRET=nuxt4-secret-key-456
SSO_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Session Encryption Key (Random 32 chars)
SESSION_SECRET=a-secure-cookie-session-key-32-chars
```

---

## 🛠️ 3. Implementation Code

### A. Server API: Initiate Authentication (`server/api/auth/login.get.ts`)
This API endpoint generates a secure PKCE verifier, creates a challenge hash, sets the verifier in a cookie, and redirects the user to the SSO authorization screen.

```typescript
import { defineEventHandler, sendRedirect, setCookie } from 'h3'
import crypto from 'node:crypto'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // 1. Generate secure PKCE Verifier and State
  const codeVerifier = crypto.randomBytes(32).toString('base64url')
  const state = crypto.randomBytes(16).toString('hex')

  // 2. Generate PKCE S256 Challenge
  const challenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')

  // 3. Store verifier and state in secure HTTP-Only cookies
  setCookie(event, 'auth_code_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300 // 5 minutes
  })

  setCookie(event, 'auth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300
  })

  // 4. Build SSO Authorization Redirect URL
  const authUrl = new URL(`${config.ssoIssuer}/oauth/authorize`)
  authUrl.searchParams.append('response_type', 'code')
  authUrl.searchParams.append('client_id', config.ssoClientId)
  authUrl.searchParams.append('redirect_uri', config.ssoRedirectUri)
  authUrl.searchParams.append('scope', 'openid profile email')
  authUrl.searchParams.append('state', state)
  authUrl.searchParams.append('code_challenge', challenge)
  authUrl.searchParams.append('code_challenge_method', 'S256')

  return sendRedirect(event, authUrl.toString())
})
```

---

### B. Server API: Handle Callback (`server/api/auth/callback.get.ts`)
This handles the redirection back from the SSO Server. It verifies the returned `state`, fetches the stored `code_verifier` cookie, exchanges the `code` for tokens, and logs the user in.

```typescript
import { defineEventHandler, getQuery, getCookie, deleteCookie, setCookie, sendRedirect, createError } from 'h3'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const query = getQuery(event)

  const code = query.code as string
  const state = query.state as string

  // 1. Validate returned State against stored Cookie
  const savedState = getCookie(event, 'auth_state')
  if (!state || state !== savedState) {
    throw createError({ statusCode: 400, message: 'Invalid state parameter' })
  }

  // 2. Fetch and remove Code Verifier
  const codeVerifier = getCookie(event, 'auth_code_verifier')
  if (!codeVerifier) {
    throw createError({ statusCode: 400, message: 'Missing PKCE code verifier' })
  }

  deleteCookie(event, 'auth_state')
  deleteCookie(event, 'auth_code_verifier')

  try {
    // 3. Exchange Authorization Code for JWT Access & ID Token
    const tokenResponse: any = await $fetch(`${config.ssoIssuer}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.ssoClientId,
        client_secret: config.ssoClientSecret,
        code,
        redirect_uri: config.ssoRedirectUri,
        code_verifier: codeVerifier
      })
    })

    // 4. Save SSO Access Token in secure session cookie
    setCookie(event, 'access_token', tokenResponse.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokenResponse.expires_in
    })

    // 5. Redirect back to homepage
    return sendRedirect(event, '/')
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: error.data?.error_description || 'OAuth token exchange failed'
    })
  }
})
```

---

### C. Server API: Get Authenticated User Profile (`server/api/auth/me.get.ts`)
Validates the local access token and retrieves the OIDC identity payload from the SSO server.

```typescript
import { defineEventHandler, getCookie, createError } from 'h3'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const accessToken = getCookie(event, 'access_token')

  if (!accessToken) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  try {
    // Call userinfo endpoint of the SSO server using the Bearer access token
    const profile = await $fetch(`${config.ssoIssuer}/oauth/userinfo`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })
    return profile
  } catch (err) {
    throw createError({ statusCode: 401, message: 'Invalid or expired access token' })
  }
})
```

---

### D. Server API: Logout (`server/api/auth/logout.get.ts`)
Clears local authentication cookies.

```typescript
import { defineEventHandler, deleteCookie, sendRedirect } from 'h3'

export default defineEventHandler(async (event) => {
  deleteCookie(event, 'access_token')
  return sendRedirect(event, '/login')
})
```

---

### E. Frontend Nuxt Configuration (`nuxt.config.ts`)
Define runtime configuration and enable the Nuxt 4 directory structure layout:

```typescript
export default defineNuxtConfig({
  // Force Nuxt 4 directory layout structure
  future: {
    compatibilityVersion: 4,
  },
  runtimeConfig: {
    ssoIssuer: process.env.SSO_ISSUER || 'https://sso.synchronizeteams.com',
    ssoClientId: process.env.SSO_CLIENT_ID || 'nuxt4-app',
    ssoClientSecret: process.env.SSO_CLIENT_SECRET || 'nuxt4-secret-key-456',
    ssoRedirectUri: process.env.SSO_REDIRECT_URI || 'http://localhost:3000/api/auth/callback'
  }
})
```

---

### F. Frontend Pages (`app/pages/index.vue` and `app/pages/login.vue`)

#### 1. Home Dashboard Page (`app/pages/index.vue`)
Displays the logged-in user profile, or shows a login prompt.

```vue
<script setup lang="ts">
const { data: user, error } = await useFetch('/api/auth/me')

// If not logged in, redirect to login view
if (error.value || !user.value) {
  navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen bg-slate-900 text-white flex items-center justify-center">
    <div class="p-8 bg-slate-800 rounded-xl shadow-lg border border-slate-700 max-w-md w-full">
      <h1 class="text-2xl font-bold mb-4 text-emerald-400">Welcome to SynchronizeTeams</h1>
      <p class="mb-6 text-slate-300">You have successfully authenticated via SSO.</p>
      
      <div v-if="user" class="space-y-2 mb-6 bg-slate-950 p-4 rounded text-sm font-mono">
        <div><strong>Name:</strong> {{ user.name }}</div>
        <div><strong>Email:</strong> {{ user.email }}</div>
        <div><strong>Role:</strong> {{ user.role }}</div>
      </div>

      <a href="/api/auth/logout" class="block text-center py-2 px-4 bg-red-600 hover:bg-red-500 rounded font-medium transition">
        Log Out
      </a>
    </div>
  </div>
</template>
```

#### 2. Login Page (`app/pages/login.vue`)
Directs users to initiate the SSO redirect flow.

```vue
<template>
  <div class="min-h-screen bg-slate-900 text-white flex items-center justify-center">
    <div class="p-8 bg-slate-800 rounded-xl shadow-lg border border-slate-700 max-w-md w-full text-center">
      <h1 class="text-3xl font-extrabold mb-2 bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
        SynchronizeTeams
      </h1>
      <p class="mb-8 text-slate-400">Identity Sign-in Portal</p>

      <a href="/api/auth/login" class="inline-flex items-center justify-center py-3 px-6 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold rounded-lg transition w-full">
        Sign in with SSO
      </a>
    </div>
  </div>
</template>
```
