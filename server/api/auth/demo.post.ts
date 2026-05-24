import { defineEventHandler, readBody, createError } from 'h3';
import { exec, queryOne } from '../../utils/db';
import { setSessionCookie } from '../../utils/jwt';
import crypto from 'crypto';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const username = body?.username || 'Guest Collaborator';
  const avatar = body?.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=guest';
  
  const email = `demo_${username.toLowerCase().replace(/[^a-z0-9]/g, '')}@syncdb.local`;
  
  // Check if user exists
  let user = queryOne('SELECT * FROM users WHERE email = ?', [email]);
  
  if (!user) {
    const userId = crypto.randomUUID();
    exec(
      'INSERT INTO users (id, email, name, avatar_url) VALUES (?, ?, ?, ?)',
      [userId, email, username, avatar]
    );
    user = { id: userId, email, name: username, avatar_url: avatar };
  }
  
  const session = {
    userId: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatar_url
  };
  
  setSessionCookie(event, session);
  
  return {
    success: true,
    user: session
  };
});
