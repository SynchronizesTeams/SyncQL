import { defineWebSocketHandler } from '#imports';
import { exec } from '../utils/db';

interface Collaborator {
  peerId: string;
  userId: string;
  name: string;
  avatarUrl: string;
  color: string;
  cursor: { x: number; y: number } | null;
  role: 'owner' | 'editor' | 'viewer';
}

// In-memory rooms cache: Room ID -> Map of Peer ID -> Collaborator
const rooms = new Map<string, Map<string, Collaborator>>();

export default defineWebSocketHandler({
  open(peer) {
    try {
      const reqUrl = peer.url || peer.request?.url || '';
      const url = new URL(reqUrl, 'http://localhost');
      const diagramId = url.searchParams.get('diagramId');
      const userId = url.searchParams.get('userId');
      const name = url.searchParams.get('name') || 'Guest';
      const avatarUrl = url.searchParams.get('avatarUrl') || '';
      const role = (url.searchParams.get('role') || 'viewer') as 'owner' | 'editor' | 'viewer';
      
      if (!diagramId || !userId) {
        peer.close(1008, 'Missing required diagramId or userId parameters');
        return;
      }
      
      // Save info in peer context
      peer.ctx = { diagramId, userId, name, avatarUrl, role };
      
      // Subscribe to Nitro Room PubSub
      peer.subscribe(diagramId);
      
      // Initialize room cache
      if (!rooms.has(diagramId)) {
        rooms.set(diagramId, new Map());
      }
      const room = rooms.get(diagramId)!;
      
      // Assign unique cursor color
      const color = `hsl(${Math.random() * 360}, 85%, 60%)`;
      const collaborator: Collaborator = {
        peerId: peer.id,
        userId,
        name,
        avatarUrl,
        color,
        cursor: null,
        role
      };
      
      room.set(peer.id, collaborator);
      
      // Notify other collaborators
      peer.publish(diagramId, JSON.stringify({
        type: 'user-joined',
        collaborator
      }));
      
      // Send active list to the newly connected user
      peer.send(JSON.stringify({
        type: 'session-state',
        collaborators: Array.from(room.values())
      }));
      
      console.log(`WebSocket peer ${peer.id} (${role}) joined room ${diagramId}`);
    } catch (e) {
      console.error('WebSocket open handler error:', e);
      peer.close(1011, 'Internal Server Error');
    }
  },
  
  message(peer, message) {
    try {
      if (!peer.ctx) return;
      const { diagramId, role } = peer.ctx;
      const data = JSON.parse(message.text());
      const room = rooms.get(diagramId);
      
      // Determine active role dynamically from the session state
      let activeRole = role;
      if (room) {
        const collab = room.get(peer.id);
        if (collab) {
          activeRole = collab.role;
        }
      }
      
      // 1. Guard against viewer write attempts
      const writeActions = [
        'table-move-end', 'table-create', 'table-update', 'table-delete',
        'column-create', 'column-update', 'column-delete',
        'relation-create', 'relation-delete', 'diagram-update'
      ];
      
      if (writeActions.includes(data.type) && activeRole === 'viewer') {
        console.warn(`Unauthorized write attempt from viewer peer ${peer.id} in room ${diagramId}`);
        // Reset local client saving status back to avoid infinite saving wheel
        peer.send(JSON.stringify({ 
          type: 'ack', 
          ackId: data.ackId 
        }));
        return;
      }
      
      switch (data.type) {
        case 'cursor':
          if (room) {
            const collab = room.get(peer.id);
            if (collab) collab.cursor = { x: data.x, y: data.y };
          }
          peer.publish(diagramId, JSON.stringify({
            type: 'cursor-moved',
            peerId: peer.id,
            x: data.x,
            y: data.y
          }));
          break;
          
        case 'table-drag':
          peer.publish(diagramId, JSON.stringify({
            type: 'table-dragged',
            tableId: data.tableId,
            x: data.x,
            y: data.y
          }));
          break;
          
        case 'table-move-end':
          exec('UPDATE tables SET x = ?, y = ? WHERE id = ?', [data.x, data.y, data.tableId]);
          peer.publish(diagramId, JSON.stringify({
            type: 'table-moved',
            tableId: data.tableId,
            x: data.x,
            y: data.y
          }));
          if (data.ackId) peer.send(JSON.stringify({ type: 'ack', ackId: data.ackId }));
          break;
          
        case 'table-create':
          exec('INSERT INTO tables (id, diagram_id, name, color, x, y) VALUES (?, ?, ?, ?, ?, ?)', [
            data.table.id, diagramId, data.table.name, data.table.color, data.table.x, data.table.y
          ]);
          peer.publish(diagramId, JSON.stringify({
            type: 'table-created',
            table: data.table
          }));
          if (data.ackId) peer.send(JSON.stringify({ type: 'ack', ackId: data.ackId }));
          break;
          
        case 'table-update':
          exec('UPDATE tables SET name = ?, color = ? WHERE id = ?', [data.name, data.color, data.tableId]);
          peer.publish(diagramId, JSON.stringify({
            type: 'table-updated',
            tableId: data.tableId,
            name: data.name,
            color: data.color
          }));
          if (data.ackId) peer.send(JSON.stringify({ type: 'ack', ackId: data.ackId }));
          break;
          
        case 'table-delete':
          exec('DELETE FROM tables WHERE id = ?', [data.tableId]);
          peer.publish(diagramId, JSON.stringify({
            type: 'table-deleted',
            tableId: data.tableId
          }));
          if (data.ackId) peer.send(JSON.stringify({ type: 'ack', ackId: data.ackId }));
          break;
          
        case 'column-create':
          exec(`
            INSERT INTO columns (
              id, table_id, name, type, length, is_primary, is_nullable, 
              is_unique, is_unsigned, is_auto_increment, default_value, comment, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            data.column.id, data.column.table_id, data.column.name, data.column.type, data.column.length || null,
            data.column.is_primary ? 1 : 0, data.column.is_nullable ? 1 : 0, data.column.is_unique ? 1 : 0,
            data.column.is_unsigned ? 1 : 0, data.column.is_auto_increment ? 1 : 0, data.column.default_value || null,
            data.column.comment || null, data.column.sort_order || 0
          ]);
          peer.publish(diagramId, JSON.stringify({
            type: 'column-created',
            column: data.column
          }));
          if (data.ackId) peer.send(JSON.stringify({ type: 'ack', ackId: data.ackId }));
          break;
          
        case 'column-update':
          exec(`
            UPDATE columns SET 
              name = ?, type = ?, length = ?, is_primary = ?, is_nullable = ?, 
              is_unique = ?, is_unsigned = ?, is_auto_increment = ?, default_value = ?, comment = ? 
            WHERE id = ?
          `, [
            data.column.name, data.column.type, data.column.length || null,
            data.column.is_primary ? 1 : 0, data.column.is_nullable ? 1 : 0, data.column.is_unique ? 1 : 0,
            data.column.is_unsigned ? 1 : 0, data.column.is_auto_increment ? 1 : 0, data.column.default_value || null,
            data.column.comment || null, data.column.id
          ]);
          peer.publish(diagramId, JSON.stringify({
            type: 'column-updated',
            column: data.column
          }));
          if (data.ackId) peer.send(JSON.stringify({ type: 'ack', ackId: data.ackId }));
          break;
          
        case 'column-delete':
          exec('DELETE FROM columns WHERE id = ?', [data.columnId]);
          peer.publish(diagramId, JSON.stringify({
            type: 'column-deleted',
            columnId: data.columnId,
            tableId: data.tableId
          }));
          if (data.ackId) peer.send(JSON.stringify({ type: 'ack', ackId: data.ackId }));
          break;
          
        case 'relation-create':
          exec(`
            INSERT INTO relations (
              id, diagram_id, source_table_id, source_column_id, target_table_id, target_column_id, type, on_delete, on_update
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            data.relation.id, diagramId, data.relation.source_table_id, data.relation.source_column_id,
            data.relation.target_table_id, data.relation.target_column_id, data.relation.type || '1:N',
            data.relation.on_delete || 'CASCADE', data.relation.on_update || 'CASCADE'
          ]);
          peer.publish(diagramId, JSON.stringify({
            type: 'relation-created',
            relation: data.relation
          }));
          if (data.ackId) peer.send(JSON.stringify({ type: 'ack', ackId: data.ackId }));
          break;
          
        case 'relation-delete':
          exec('DELETE FROM relations WHERE id = ?', [data.relationId]);
          peer.publish(diagramId, JSON.stringify({
            type: 'relation-deleted',
            relationId: data.relationId
          }));
          if (data.ackId) peer.send(JSON.stringify({ type: 'ack', ackId: data.ackId }));
          break;
          
        case 'diagram-update':
          exec('UPDATE diagrams SET name = ?, dialect = ? WHERE id = ?', [data.name, data.dialect, diagramId]);
          peer.publish(diagramId, JSON.stringify({
            type: 'diagram-updated',
            name: data.name,
            dialect: data.dialect
          }));
          if (data.ackId) peer.send(JSON.stringify({ type: 'ack', ackId: data.ackId }));
          break;
          
        // 2. Permission Requests and Approvals routes
        case 'request-edit-access':
          if (room) {
            const requester = room.get(peer.id);
            if (requester) {
              peer.publish(diagramId, JSON.stringify({
                type: 'edit-access-requested',
                peerId: peer.id,
                userId: requester.userId,
                name: requester.name
              }));
            }
          }
          break;
          
        case 'grant-edit-access':
          if (role === 'owner' && room) {
            const targetCollab = room.get(data.targetPeerId);
            if (targetCollab) {
              targetCollab.role = 'editor';
              
              // Broadcast role change to everyone
              peer.publish(diagramId, JSON.stringify({
                type: 'role-updated',
                peerId: data.targetPeerId,
                role: 'editor'
              }));
            }
          }
          break;
          
        case 'deny-edit-access':
          if (role === 'owner' && room) {
            peer.publish(diagramId, JSON.stringify({
              type: 'edit-access-denied',
              peerId: data.targetPeerId
            }));
          }
          break;
      }
    } catch (e) {
      console.error('WebSocket message handler error:', e);
    }
  },
  
  close(peer) {
    try {
      if (!peer.ctx) return;
      const { diagramId } = peer.ctx;
      
      // Unsubscribe from Nitro room
      peer.unsubscribe(diagramId);
      
      const room = rooms.get(diagramId);
      if (room) {
        room.delete(peer.id);
        
        // Notify remaining collaborators
        peer.publish(diagramId, JSON.stringify({
          type: 'user-left',
          peerId: peer.id
        }));
        
        // Clean up empty rooms
        if (room.size === 0) {
          rooms.delete(diagramId);
        }
      }
      
      console.log(`WebSocket peer ${peer.id} left room ${diagramId}`);
    } catch (e) {
      console.error('WebSocket close handler error:', e);
    }
  }
});
