import { defineEventHandler, createError, getQuery } from 'h3';
import { query } from '../../utils/db';
import { getUserFromEvent } from '../../utils/jwt';

export default defineEventHandler((event) => {
  const user = getUserFromEvent(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const { q } = getQuery(event) as { q?: string };
  const queryParam = q?.trim() || '';

  if (queryParam.length < 2) {
    return {
      users: []
    };
  }

  // Find users case-insensitively whose name matches, excluding the active user
  const users = query(
    `SELECT id, name, email, avatar_url 
     FROM users 
     WHERE (LOWER(name) LIKE ? OR LOWER(email) LIKE ?) AND id != ?
     LIMIT 8`,
    [`%${queryParam.toLowerCase()}%`, `%${queryParam.toLowerCase()}%`, user.userId]
  );

  return {
    users
  };
});
