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

  let users = [];

  if (queryParam.length === 0) {
    // Return other active developers as suggested collaborators immediately!
    users = query(
      `SELECT id, name, email, avatar_url 
       FROM users 
       WHERE id != ?
       LIMIT 8`,
      [user.userId]
    );
  } else {
    // Find users case-insensitively whose name or email matches, excluding the active user
    users = query(
      `SELECT id, name, email, avatar_url 
       FROM users 
       WHERE (LOWER(name) LIKE ? OR LOWER(email) LIKE ?) AND id != ?
       LIMIT 8`,
      [`%${queryParam.toLowerCase()}%`, `%${queryParam.toLowerCase()}%`, user.userId]
    );
  }

  return {
    users
  };
});
