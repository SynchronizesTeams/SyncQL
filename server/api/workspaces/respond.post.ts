import { defineEventHandler, createError, readBody } from 'h3';
import { exec, queryOne } from '../../utils/db';
import { getUserFromEvent } from '../../utils/jwt';

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const body = await readBody(event);
  const workspaceId = body.workspaceId;
  const action = body.action; // 'accept' or 'decline'

  if (!workspaceId || !['accept', 'decline'].includes(action)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid workspace ID or response action' });
  }

  const invite = queryOne(
    `SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ? AND status = 'pending'`,
    [workspaceId, user.userId]
  );

  if (!invite) {
    throw createError({ statusCode: 404, statusMessage: 'Invitation not found or already processed' });
  }

  if (action === 'accept') {
    exec(
      `UPDATE workspace_members SET status = 'accepted' WHERE workspace_id = ? AND user_id = ?`,
      [workspaceId, user.userId]
    );
  } else {
    exec(
      `DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?`,
      [workspaceId, user.userId]
    );
  }

  return {
    success: true,
    message: action === 'accept' ? 'Workspace invitation accepted!' : 'Workspace invitation declined.'
  };
});
