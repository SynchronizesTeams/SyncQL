import { defineEventHandler, sendRedirect, createError } from 'h3';

export default defineEventHandler(async (event) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  
  if (!clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'GOOGLE_CLIENT_ID is not configured in your .env file. Please use Guest Mode or configure OAuth.'
    });
  }
  
  const redirectUri = `${baseUrl}/api/auth/google/callback`;
  const googleUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('openid profile email')}`;
  
  return sendRedirect(event, googleUrl);
});
