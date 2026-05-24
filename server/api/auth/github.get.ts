import { defineEventHandler, sendRedirect, createError } from 'h3';

export default defineEventHandler(async (event) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  
  if (!clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'GITHUB_CLIENT_ID is not configured in your .env file. Please use Guest Mode or configure OAuth.'
    });
  }
  
  const redirectUri = `${baseUrl}/api/auth/github/callback`;
  const githubUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:email`;
  
  return sendRedirect(event, githubUrl);
});
