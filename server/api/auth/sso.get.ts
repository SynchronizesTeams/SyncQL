import { defineEventHandler, sendRedirect, setCookie, getRequestURL } from 'h3';
import crypto from 'node:crypto';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  // 1. Generate secure PKCE Verifier and State
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const state = crypto.randomBytes(16).toString('hex');

  // 2. Generate PKCE S256 Challenge
  const challenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  // 3. Store verifier and state in secure HTTP-Only cookies
  setCookie(event, 'auth_code_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300 // 5 minutes
  });

  setCookie(event, 'auth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300
  });

  // 4. Build SSO Authorization Redirect URL
  const authUrl = new URL(`${config.ssoIssuer}/oauth/authorize`);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('client_id', config.ssoClientId);
  
  // Resolve redirectUri dynamically if empty in runtimeConfig
  const requestUrl = getRequestURL(event);
  const redirectUri = config.ssoRedirectUri || `${requestUrl.origin}/api/auth/callback`;
  authUrl.searchParams.append('redirect_uri', redirectUri);
  authUrl.searchParams.append('scope', 'openid profile email');
  authUrl.searchParams.append('state', state);
  authUrl.searchParams.append('code_challenge', challenge);
  authUrl.searchParams.append('code_challenge_method', 'S256');

  return sendRedirect(event, authUrl.toString());
});
