import { defineEventHandler, getQuery, getCookie, deleteCookie, sendRedirect, createError, getRequestURL } from 'h3';
import { exec, queryOne } from '../../utils/db';
import { setSessionCookie } from '../../utils/jwt';
import crypto from 'node:crypto';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const query = getQuery(event);

  const code = query.code as string;
  const state = query.state as string;

  // 1. Validate returned State against stored Cookie
  const savedState = getCookie(event, 'auth_state');
  if (!state || state !== savedState) {
    throw createError({ statusCode: 400, message: 'Invalid state parameter' });
  }

  // 2. Fetch and remove Code Verifier
  const codeVerifier = getCookie(event, 'auth_code_verifier');
  if (!codeVerifier) {
    throw createError({ statusCode: 400, message: 'Missing PKCE code verifier' });
  }

  deleteCookie(event, 'auth_state');
  deleteCookie(event, 'auth_code_verifier');

  try {
    // 3. Exchange Authorization Code for JWT Access & ID Token
    const requestUrl = getRequestURL(event);
    const redirectUri = config.ssoRedirectUri || `${requestUrl.origin}/api/auth/callback`;
    
    const tokenResponse: any = await $fetch(`${config.ssoIssuer}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.ssoClientId,
        client_secret: config.ssoClientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
      })
    });

    if (tokenResponse.error || !tokenResponse.access_token) {
      throw new Error(tokenResponse.error || 'Failed to exchange OAuth code for access token.');
    }

    const accessToken = tokenResponse.access_token;

    // 4. Fetch user profile from OIDC userinfo endpoint
    const ssoUser: any = await $fetch(`${config.ssoIssuer}/oauth/userinfo`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const ssoId = ssoUser.sub;
    const email = ssoUser.email || '';
    const name = ssoUser.name || (email ? email.split('@')[0] : 'SSO User');
    const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`;

    // 5. Save/Retrieve user in SQLite database
    let user = queryOne('SELECT * FROM users WHERE sso_id = ? OR email = ?', [ssoId, email]);

    if (!user) {
      const userId = crypto.randomUUID();
      exec(
        'INSERT INTO users (id, email, name, avatar_url, sso_id) VALUES (?, ?, ?, ?, ?)',
        [userId, email, name, avatarUrl, ssoId]
      );
      user = { id: userId, email, name, avatar_url: avatarUrl, sso_id: ssoId };
    } else if (!user.sso_id) {
      // Link existing account with SSO ID
      exec('UPDATE users SET sso_id = ? WHERE id = ?', [ssoId, user.id]);
      user.sso_id = ssoId;
    }

    // 6. Establish session using JWT cookie
    const session = {
      userId: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatar_url || avatarUrl
    };

    setSessionCookie(event, session);

    return sendRedirect(event, '/');
  } catch (error: any) {
    console.error('SSO OAuth Callback Error:', error);
    throw createError({
      statusCode: 500,
      message: error.data?.error_description || error.message || 'SSO token exchange failed'
    });
  }
});
