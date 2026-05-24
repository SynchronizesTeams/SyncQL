import { defineEventHandler, createError } from 'h3';
import { query, exec, queryOne } from '../../utils/db';
import { getUserFromEvent } from '../../utils/jwt';
import crypto from 'crypto';

export default defineEventHandler((event) => {
  const user = getUserFromEvent(event);
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    });
  }

  let workspaces = query(
    `SELECT w.*, u.name as owner_name,
            (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = w.id AND status = 'accepted') as member_count,
            (SELECT COUNT(*) FROM diagrams WHERE workspace_id = w.id) as diagram_count
     FROM workspaces w 
     JOIN users u ON w.owner_id = u.id
     LEFT JOIN workspace_members wm ON w.id = wm.workspace_id 
     WHERE w.owner_id = ? OR (wm.user_id = ? AND wm.status = 'accepted') 
     GROUP BY w.id`,
    [user.userId, user.userId]
  );

  // If they don't have any workspaces yet (e.g. new user), auto-create a Personal Workspace for them!
  if (workspaces.length === 0) {
    const personalId = crypto.randomUUID();
    exec(
      `INSERT INTO workspaces (id, name, owner_id) VALUES (?, ?, ?)`,
      [personalId, 'Personal Workspace', user.userId]
    );
    exec(
      `INSERT INTO workspace_members (workspace_id, user_id, role, status) VALUES (?, ?, ?, ?)`,
      [personalId, user.userId, 'owner', 'accepted']
    );
    
    // Re-fetch
    workspaces = query(
      `SELECT w.*, u.name as owner_name, 1 as member_count, 0 as diagram_count
       FROM workspaces w 
       JOIN users u ON w.owner_id = u.id
       WHERE w.id = ?`,
      [personalId]
    );
  }

  return {
    workspaces
  };
});
