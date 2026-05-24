import { defineEventHandler, getQuery, sendRedirect, createError } from 'h3';
import { exec, queryOne } from '../../../utils/db';
import { setSessionCookie } from '../../../utils/jwt';
import crypto from 'crypto';

export default defineEventHandler(async (event) => {
  const { code } = getQuery(event);
  
  if (!code) {
    throw createError({
      statusCode: 400,
      statusMessage: 'OAuth code query parameter is missing.'
    });
  }
  
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  
  if (!clientId || !clientSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Google OAuth Client Credentials are not configured in your .env.'
    });
  }
  
  try {
    // 1. Exchange code for access token
    const tokenRes = await $fetch<{ access_token?: string; error?: string }>('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${baseUrl}/api/auth/google/callback`
      }
    });
    
    if (tokenRes.error || !tokenRes.access_token) {
      throw new Error(tokenRes.error || 'Failed to exchange OAuth code for access token.');
    }
    
    const accessToken = tokenRes.access_token;
    
    // 2. Fetch user profile
    const googleUser = await $fetch<{ sub: string; name: string; picture: string; email: string }>('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    
    const email = googleUser.email;
    const name = googleUser.name;
    const avatarUrl = googleUser.picture;
    const googleId = googleUser.sub;
    
    // 3. Save/Retrieve user in SQLite
    let user = queryOne('SELECT * FROM users WHERE google_id = ? OR email = ?', [googleId, email]);
    
    if (!user) {
      const userId = crypto.randomUUID();
      exec(
        'INSERT INTO users (id, email, name, avatar_url, google_id) VALUES (?, ?, ?, ?, ?)',
        [userId, email, name, avatarUrl, googleId]
      );
      user = { id: userId, email, name, avatar_url: avatarUrl, google_id: googleId };
    } else if (!user.google_id) {
      // Link existing account with Google ID
      exec('UPDATE users SET google_id = ?, avatar_url = ? WHERE id = ?', [googleId, avatarUrl, user.id]);
      user.google_id = googleId;
      user.avatar_url = avatarUrl;
    }
    
    // 4. Establish session
    const session = {
      userId: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatar_url
    };
    
    setSessionCookie(event, session);
    
    return sendRedirect(event, '/');
  } catch (err: any) {
    console.error('Google OAuth Callback Error:', err);
    throw createError({
      statusCode: 500,
      statusMessage: `Google Authentication failed: ${err.message}`
    });
  }
});
