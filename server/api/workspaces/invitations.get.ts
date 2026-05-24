import { defineEventHandler, createError } from 'h3';
import { query } from '../../utils/db';
import { getUserFromEvent } from '../../utils/jwt';

export default defineEventHandler((event) => {
  const user = getUserFromEvent(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  // Fetch pending invitations, fetching workspace names and inviting owners
  const invitations = query(
    `SELECT wm.workspace_id, wm.created_at, w.name as workspace_name, u.name as owner_name, u.avatar_url as owner_avatar
     FROM workspace_members wm
     JOIN workspaces w ON wm.workspace_id = w.id
     JOIN users u ON w.owner_id = u.id
     WHERE wm.user_id = ? AND wm.status = 'pending'`,
    [user.userId]
  );

  return {
    invitations
  };
});
