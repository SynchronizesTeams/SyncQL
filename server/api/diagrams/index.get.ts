import { defineEventHandler, createError } from 'h3';
import { query } from '../../utils/db';
import { getUserFromEvent } from '../../utils/jwt';

export default defineEventHandler((event) => {
  const user = getUserFromEvent(event);
  
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized. Please log in first.'
    });
  }
  
  const diagrams = query(
    'SELECT * FROM diagrams WHERE user_id = ? ORDER BY updated_at DESC',
    [user.userId]
  );
  
  return {
    diagrams
  };
});
