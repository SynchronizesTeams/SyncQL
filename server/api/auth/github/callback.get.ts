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
  
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  
  if (!clientId || !clientSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'GitHub OAuth Client Credentials are not configured in your .env.'
    });
  }
  
  try {
    // 1. Exchange code for access token
    const tokenRes = await $fetch<{ access_token?: string; error?: string }>('https://github.com/login/oauth/access_token', {
      method: 'POST',
      body: {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${baseUrl}/api/auth/github/callback`
      },
      headers: {
        Accept: 'application/json'
      }
    });
    
    if (tokenRes.error || !tokenRes.access_token) {
      throw new Error(tokenRes.error || 'Failed to exchange OAuth code for access token.');
    }
    
    const accessToken = tokenRes.access_token;
    
    // 2. Fetch user profile
    const githubUser = await $fetch<{ id: number; login: string; avatar_url: string; name?: string; email?: string }>('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'SyncDB-DrawSQL-Clone'
      }
    });
    
    // 3. Fetch primary email if not visible in profile
    let email = githubUser.email;
    if (!email) {
      const emailsList = await $fetch<{ email: string; primary: boolean; verified: boolean }[]>('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'SyncDB-DrawSQL-Clone'
        }
      });
      const primaryEmail = emailsList.find(e => e.primary && e.verified) || emailsList[0];
      email = primaryEmail?.email;
    }
    
    if (!email) {
      email = `github_${githubUser.id}@syncdb.local`;
    }
    
    const name = githubUser.name || githubUser.login;
    const avatarUrl = githubUser.avatar_url;
    const githubId = String(githubUser.id);
    
    // 4. Save/Retrieve user in SQLite
    let user = queryOne('SELECT * FROM users WHERE github_id = ? OR email = ?', [githubId, email]);
    
    if (!user) {
      const userId = crypto.randomUUID();
      exec(
        'INSERT INTO users (id, email, name, avatar_url, github_id) VALUES (?, ?, ?, ?, ?)',
        [userId, email, name, avatarUrl, githubId]
      );
      user = { id: userId, email, name, avatar_url: avatarUrl, github_id: githubId };
    } else if (!user.github_id) {
      // Link existing account with GitHub ID
      exec('UPDATE users SET github_id = ?, avatar_url = ? WHERE id = ?', [githubId, avatarUrl, user.id]);
      user.github_id = githubId;
      user.avatar_url = avatarUrl;
    }
    
    // 5. Establish session
    const session = {
      userId: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatar_url
    };
    
    setSessionCookie(event, session);
    
    return sendRedirect(event, '/');
  } catch (err: any) {
    console.error('GitHub OAuth Callback Error:', err);
    throw createError({
      statusCode: 500,
      statusMessage: `GitHub Authentication failed: ${err.message}`
    });
  }
});
