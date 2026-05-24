import { defineEventHandler, getRouterParam, createError } from 'h3';
import { exec, queryOne } from '../../utils/db';
import { getUserFromEvent } from '../../utils/jwt';

export default defineEventHandler((event) => {
  const user = getUserFromEvent(event);
  
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized. Please log in first.'
    });
  }
  
  const diagramId = getRouterParam(event, 'id');
  if (!diagramId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Diagram ID parameter is missing.'
    });
  }
  
  // Verify ownership
  const diagram = queryOne('SELECT * FROM diagrams WHERE id = ? AND user_id = ?', [diagramId, user.userId]);
  
  if (!diagram) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden. You do not own this diagram.'
    });
  }
  
  exec('DELETE FROM diagrams WHERE id = ?', [diagramId]);
  
  return {
    success: true,
    message: 'Diagram deleted successfully.'
  };
});
