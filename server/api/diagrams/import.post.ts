import { defineEventHandler, readBody, createError } from 'h3';
import { exec } from '../../utils/db';
import { getUserFromEvent } from '../../utils/jwt';
import crypto from 'crypto';

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event);
  
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized. Please log in first.'
    });
  }
  
  const body = await readBody(event);
  const name = body?.name || 'Imported Schema';
  const description = body?.description || 'Imported from external SQL DDL or backup';
  const dialect = body?.dialect || 'postgresql';
  const rawTables = body?.tables || [];
  const rawRelations = body?.relations || [];
  
  const diagramId = crypto.randomUUID();
  
  // 1. Insert Diagram Core Record
  exec(
    'INSERT INTO diagrams (id, name, description, user_id, dialect) VALUES (?, ?, ?, ?, ?)',
    [diagramId, name, description, user.userId, dialect]
  );
  
  // Name to UUID maps for table & columns mapping
  const tableIdMap: Record<string, string> = {};
  const columnIdMap: Record<string, string> = {};
  
  // 2. Loop and Insert Tables & Columns
  rawTables.forEach((table: any) => {
    const tableId = crypto.randomUUID();
    tableIdMap[table.name] = tableId;
    
    const x = typeof table.x === 'number' ? table.x : 100;
    const y = typeof table.y === 'number' ? table.y : 100;
    const color = table.color || 'table-theme-blue';
    
    exec(
      'INSERT INTO tables (id, diagram_id, name, color, x, y) VALUES (?, ?, ?, ?, ?, ?)',
      [tableId, diagramId, table.name, color, x, y]
    );
    
    // Insert columns inside this table
    const columns = table.columns || [];
    columns.forEach((col: any, index: number) => {
      const colId = crypto.randomUUID();
      columnIdMap[`${table.name}.${col.name}`] = colId;
      
      const type = col.type || 'INT';
      const length = col.length !== undefined ? String(col.length) : '';
      const isPrimary = col.is_primary ? 1 : 0;
      const isNullable = col.is_nullable ? 1 : 0;
      const isUnique = col.is_unique ? 1 : 0;
      const isUnsigned = col.is_unsigned ? 1 : 0;
      const isAutoIncrement = col.is_auto_increment ? 1 : 0;
      const defaultValue = col.default_value || '';
      const comment = col.comment || '';
      
      exec(
        'INSERT INTO columns (id, table_id, name, type, length, is_primary, is_nullable, is_unique, is_unsigned, is_auto_increment, default_value, comment, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          colId,
          tableId,
          col.name,
          type,
          length,
          isPrimary,
          isNullable,
          isUnique,
          isUnsigned,
          isAutoIncrement,
          defaultValue,
          comment,
          index
        ]
      );
    });
  });
  
  // 3. Loop and Insert Relations mapped by names
  rawRelations.forEach((rel: any) => {
    const sourceTableId = tableIdMap[rel.source_table_name];
    const sourceColumnId = columnIdMap[`${rel.source_table_name}.${rel.source_column_name}`];
    const targetTableId = tableIdMap[rel.target_table_name];
    const targetColumnId = columnIdMap[`${rel.target_table_name}.${rel.target_column_name}`];
    
    if (sourceTableId && sourceColumnId && targetTableId && targetColumnId) {
      const relationId = crypto.randomUUID();
      const relType = rel.type || '1:N';
      const onDelete = rel.on_delete || 'CASCADE';
      const onUpdate = rel.on_update || 'CASCADE';
      
      exec(
        'INSERT INTO relations (id, diagram_id, source_table_id, source_column_id, target_table_id, target_column_id, type, on_delete, on_update) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          relationId,
          diagramId,
          sourceTableId,
          sourceColumnId,
          targetTableId,
          targetColumnId,
          relType,
          onDelete,
          onUpdate
        ]
      );
    }
  });
  
  return {
    success: true,
    diagramId
  };
});
