<template>
  <div class="modal-backdrop">
    <div class="modal-card glass-panel import-modal-card animate-fade-in">
      <div class="modal-header">
        <div class="modal-icon-title">
          <Sparkles class="modal-icon-sparkle" />
          <h2>Import Database Blueprint</h2>
        </div>
        <button class="modal-close-btn" @click="$emit('close')">&times;</button>
      </div>

      <!-- Mode Selector Tabs -->
      <div class="import-tabs">
        <button 
          class="import-tab-btn" 
          :class="{ 'is-active': activeTab === 'ddl' }"
          @click="activeTab = 'ddl'"
        >
          SQL DDL Script
        </button>
        <button 
          class="import-tab-btn" 
          :class="{ 'is-active': activeTab === 'json' }"
          @click="activeTab = 'json'"
        >
          JSON Backup (SyncQL/DrawSQL)
        </button>
      </div>

      <div class="import-form-body">
        <div class="form-group">
          <label for="import-name">Diagram Name</label>
          <input 
            id="import-name" 
            v-model="importForm.name" 
            type="text" 
            placeholder="e.g. Imported PostgreSQL System Schema" 
            class="input-field" 
            required
          />
        </div>

        <div class="form-group">
          <label for="import-desc">Description</label>
          <textarea 
            id="import-desc" 
            v-model="importForm.description" 
            placeholder="Describe what this database schema modeling represents..." 
            class="input-field textarea-field" 
            rows="2"
          ></textarea>
        </div>

        <!-- SQL DDL script panel settings -->
        <div v-if="activeTab === 'ddl'" class="ddl-form-group">
          <div class="form-group">
            <label>SQL Target Dialect</label>
            <div class="dialect-radio-group">
              <label 
                v-for="dialect in ['postgresql', 'mysql', 'sqlite']" 
                :key="dialect"
                class="dialect-radio-card"
                :class="{ 'is-active': importForm.dialect === dialect }"
              >
                <input 
                  type="radio" 
                  name="import-dialect" 
                  :value="dialect" 
                  v-model="importForm.dialect" 
                  class="radio-input"
                />
                <span class="dialect-title">{{ dialect === 'postgresql' ? 'PostgreSQL' : dialect === 'mysql' ? 'MySQL' : 'SQLite' }}</span>
              </label>
            </div>
          </div>

          <div class="form-group">
            <div class="label-with-hint">
              <label for="sql-script">Paste SQL DDL Script</label>
              <span class="hint-badge">Supports CREATE TABLE, foreign keys & ALTER TABLE</span>
            </div>
            <textarea 
              id="sql-script" 
              v-model="sqlScript" 
              placeholder="CREATE TABLE users (&#10;  id SERIAL PRIMARY KEY,&#10;  email VARCHAR(255) UNIQUE NOT NULL&#10;);&#10;&#10;CREATE TABLE orders (&#10;  id SERIAL PRIMARY KEY,&#10;  user_id INT REFERENCES users(id)&#10;);" 
              class="input-field textarea-field sql-textarea" 
              rows="9"
            ></textarea>
          </div>
        </div>

        <!-- JSON backup settings -->
        <div v-else class="json-form-group">
          <div class="form-group">
            <div class="label-with-hint">
              <label for="json-data">Paste Raw JSON Blueprint</label>
              <span class="hint-badge">DrawSQL or SyncQL exported JSON structure</span>
            </div>
            <textarea 
              id="json-data" 
              v-model="jsonBackup" 
              placeholder="{&#10;  &quot;tables&quot;: [...],&#10;  &quot;columns&quot;: [...],&#10;  &quot;relations&quot;: [...]&#10;}" 
              class="input-field textarea-field json-textarea" 
              rows="12"
            ></textarea>
          </div>
        </div>

        <div v-if="parseError" class="parse-error-box animate-fade-in">
          <AlertCircle class="error-icon" />
          <span>{{ parseError }}</span>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="$emit('close')">Cancel</button>
          <button class="btn btn-primary" @click="handleImport" :disabled="isImporting">
            <span v-if="isImporting" class="spinner-inline"></span>
            <span v-else>Parse & Import Blueprint</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { Sparkles, AlertCircle } from 'lucide-vue-next';

defineEmits(['close']);

const activeTab = ref('ddl');
const isImporting = ref(false);
const parseError = ref('');

const importForm = ref({
  name: '',
  description: '',
  dialect: 'postgresql'
});

const sqlScript = ref('');
const jsonBackup = ref('');

const handleImport = async () => {
  parseError.value = '';
  
  if (!importForm.value.name.trim()) {
    parseError.value = 'Please provide a schema name first.';
    return;
  }

  isImporting.value = true;
  
  try {
    let parsedSchema = null;

    if (activeTab.value === 'ddl') {
      if (!sqlScript.value.trim()) {
        throw new Error('Please paste an SQL DDL script to parse.');
      }
      parsedSchema = parseSQL(sqlScript.value);
    } else {
      if (!jsonBackup.value.trim()) {
        throw new Error('Please paste a JSON backup payload.');
      }
      parsedSchema = parseJSON(jsonBackup.value);
    }

    // Submit parsed structure to backend
    const payload = {
      name: importForm.value.name,
      description: importForm.value.description,
      dialect: importForm.value.dialect,
      tables: parsedSchema.tables,
      relations: parsedSchema.relations
    };

    const res = await $fetch('/api/diagrams/import', {
      method: 'POST',
      body: payload
    });

    if (res.success && res.diagramId) {
      navigateTo(`/diagram/${res.diagramId}`);
    } else {
      throw new Error('Failed to import structural database elements.');
    }
  } catch (err) {
    parseError.value = err.message || 'Unknown parsing or importation failure.';
  } finally {
    isImporting.value = false;
  }
};

// ==========================================
// 1. ADVANCED CLIENT-SIDE SQL DDL PARSER
// ==========================================
const parseSQL = (sql) => {
  // Clean comments: remove -- lines and block /* ... */ comments
  const cleanSql = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const tables = [];
  const relations = [];

  // Match CREATE TABLE statements: matches "CREATE TABLE <name> ( <fields> )"
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["`]?)([a-zA-Z0-9_-]+)(?:["`]?)\s*\(([\s\S]*?)\)(?:\s*;|\s+ENGINE|\s*$)/gi;
  let match;
  
  while ((match = createTableRegex.exec(cleanSql)) !== null) {
    const tableName = match[1];
    const tableContent = match[2];
    const columns = [];

    // Split fields by comma respecting nested parentheses (e.g. DECIMAL(10,2) or VARCHAR(255))
    const fields = splitSqlFields(tableContent);

    fields.forEach(field => {
      const line = field.trim();
      if (!line) return;

      // A. Check for Inline Column Foreign Key REFERENCES
      // e.g.: user_id INT REFERENCES users(id)
      const inlineFKRegex = /(?:["`]?)([a-zA-Z0-9_-]+)(?:["`]?)\s+([a-zA-Z0-9()]+)(?:[\s\S]*?)REFERENCES\s+(?:["`]?)([a-zA-Z0-9_-]+)(?:["`]?)\s*\((?:["`]?)([a-zA-Z0-9_-]+)(?:["`]?)\)/i;
      const inlineFK = inlineFKRegex.exec(line);

      // B. Check for Explicit Table Foreign Key Constraints
      // e.g.: CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id)
      const tableFKRegex = /(?:CONSTRAINT\s+(?:["`]?)[a-zA-Z0-9_-]+(?:["`]?)\s+)?FOREIGN\s+KEY\s*\((?:["`]?)([a-zA-Z0-9_-]+)(?:["`]?)\)\s*REFERENCES\s+(?:["`]?)([a-zA-Z0-9_-]+)(?:["`]?)\s*\((?:["`]?)([a-zA-Z0-9_-]+)(?:["`]?)\)/i;
      const tableFK = tableFKRegex.exec(line);

      if (tableFK) {
        relations.push({
          source_table_name: tableName,
          source_column_name: tableFK[1],
          target_table_name: tableFK[2],
          target_column_name: tableFK[3],
          type: '1:N',
          on_delete: 'CASCADE',
          on_update: 'CASCADE'
        });
        return;
      }

      // C. Check for Explicit Primary Keys
      // e.g.: PRIMARY KEY (id) or PRIMARY KEY (id, order_id)
      const tablePKRegex = /PRIMARY\s+KEY\s*\((.*?)\)/i;
      const tablePK = tablePKRegex.exec(line);
      
      if (tablePK) {
        const pkCols = tablePK[1].replace(/["`']/g, '').split(',').map(s => s.trim());
        pkCols.forEach(pkCol => {
          const colObj = columns.find(c => c.name === pkCol);
          if (colObj) colObj.is_primary = true;
        });
        return;
      }

      // Ignore other table constraints like UNIQUE INDEX or KEY index declarations
      const isConstraintKeyword = /^(?:CONSTRAINT|KEY|UNIQUE|INDEX|CHECK)/i.test(line);
      if (isConstraintKeyword) return;

      // D. Otherwise, Parse Normal Column Line
      // e.g.: id INT PRIMARY KEY AUTO_INCREMENT
      const tokens = line.split(/\s+/);
      const colName = tokens[0].replace(/["`']/g, '');
      if (!colName) return;

      const typeToken = tokens[1] || 'VARCHAR';
      const typeMatch = /^([a-zA-Z]+)(?:\((.*?)\))?/i.exec(typeToken);
      const colType = typeMatch ? typeMatch[1].toUpperCase() : 'VARCHAR';
      const colLength = typeMatch && typeMatch[2] ? typeMatch[2] : '';

      const isPrimary = /PRIMARY\s+KEY/i.test(line);
      const isNullable = !/NOT\s+NULL/i.test(line);
      const isUnique = /UNIQUE/i.test(line);
      const isAutoIncrement = /AUTOINCREMENT|AUTO_INCREMENT|SERIAL|GENERATED\s+ALWAYS/i.test(line);
      
      // Extract Default Value
      const defaultMatch = /DEFAULT\s+('([^']*)'|"([^"]*)"|([^\s',]+))/i.exec(line);
      const defaultValue = defaultMatch ? (defaultMatch[2] || defaultMatch[3] || defaultMatch[4] || '') : '';

      // Extract Inline Comment
      const commentMatch = /COMMENT\s+'([^']*)'/i.exec(line);
      const comment = commentMatch ? commentMatch[1] : '';

      columns.push({
        name: colName,
        type: colType,
        length: colLength,
        is_primary: isPrimary,
        is_nullable: isNullable,
        is_unique: isUnique,
        is_auto_increment: isAutoIncrement,
        default_value: defaultValue,
        comment: comment
      });

      // Handle the inline FK definition if captured
      if (inlineFK && inlineFK[1] === colName) {
        relations.push({
          source_table_name: tableName,
          source_column_name: colName,
          target_table_name: inlineFK[3],
          target_column_name: inlineFK[4],
          type: '1:N',
          on_delete: 'CASCADE',
          on_update: 'CASCADE'
        });
      }
    });

    if (columns.length > 0) {
      tables.push({
        name: tableName,
        columns
      });
    }
  }

  // 2. Parse ALTER TABLE statements for foreign key constraints
  // e.g.: ALTER TABLE orders ADD FOREIGN KEY (user_id) REFERENCES users(id);
  const alterFKRegex = /ALTER\s+TABLE\s+(?:["`]?)([a-zA-Z0-9_-]+)(?:["`]?)\s+ADD\s+(?:CONSTRAINT\s+(?:["`]?)[a-zA-Z0-9_-]+(?:["`]?)\s+)?FOREIGN\s+KEY\s*\((?:["`]?)([a-zA-Z0-9_-]+)(?:["`]?)\)\s*REFERENCES\s+(?:["`]?)([a-zA-Z0-9_-]+)(?:["`]?)\s*\((?:["`]?)([a-zA-Z0-9_-]+)(?:["`]?)\)/gi;
  let alterMatch;
  
  while ((alterMatch = alterFKRegex.exec(cleanSql)) !== null) {
    relations.push({
      source_table_name: alterMatch[1],
      source_column_name: alterMatch[2],
      target_table_name: alterMatch[3],
      target_column_name: alterMatch[4],
      type: '1:N',
      on_delete: 'CASCADE',
      on_update: 'CASCADE'
    });
  }

  if (tables.length === 0) {
    throw new Error('No valid CREATE TABLE statements detected in the SQL script.');
  }

  // 3. Grid-Layout coordinate mapping with high aesthetic color accents
  const total = tables.length;
  const cols = Math.ceil(Math.sqrt(total));
  const xSpacing = 320;
  const ySpacing = 280;
  const colors = ['table-theme-violet', 'table-theme-emerald', 'table-theme-rose', 'table-theme-amber', 'table-theme-blue'];

  tables.forEach((t, i) => {
    t.x = 120 + (i % cols) * xSpacing;
    t.y = 120 + Math.floor(i / cols) * ySpacing;
    t.color = colors[i % colors.length];
  });

  return { tables, relations };
};

// splitSqlFields loops character by character keeping parenthesis count to avoid breaking on DECIMAL(10,2) commas
const splitSqlFields = (content) => {
  const parts = [];
  let current = '';
  let parenDepth = 0;
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if ((char === "'" || char === '"' || char === '`') && content[i - 1] !== '\\') {
      if (!inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuote = false;
      }
    }

    if (!inQuote) {
      if (char === '(') parenDepth++;
      if (char === ')') parenDepth--;
    }

    if (char === ',' && parenDepth === 0 && !inQuote) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) parts.push(current);
  return parts;
};

// ==========================================
// 2. BACKUP JSON BLUEPRINT IMPORT PARSER
// ==========================================
const parseJSON = (jsonString) => {
  try {
    const data = JSON.parse(jsonString);
    let tables = data.tables || [];
    let relations = data.relations || [];
    let columns = data.columns || [];

    // Support both standardized imports and raw table-embedded columns imports
    if (tables.length > 0 && !tables[0].columns && columns.length > 0) {
      // DrawSQL standard JSON structure: columns are an adjacent array mapped by table_id
      tables.forEach(t => {
        t.columns = columns.filter(c => c.table_id === t.id);
      });
      
      // Map relationship references from ID to table/column Names
      relations.forEach(r => {
        const sourceTable = tables.find(t => t.id === r.source_table_id);
        const targetTable = tables.find(t => t.id === r.target_table_id);
        
        const sourceCol = columns.find(c => c.id === r.source_column_id);
        const targetCol = columns.find(c => c.id === r.target_column_id);
        
        if (sourceTable && sourceCol && targetTable && targetCol) {
          r.source_table_name = sourceTable.name;
          r.source_column_name = sourceCol.name;
          r.target_table_name = targetTable.name;
          r.target_column_name = targetCol.name;
        }
      });
    }

    if (tables.length === 0) {
      throw new Error('JSON format is missing required table structures.');
    }

    // Recalculate coordinates if layout positions are missing
    if (tables.some(t => t.x === undefined)) {
      const cols = Math.ceil(Math.sqrt(tables.length));
      const xSpacing = 320;
      const ySpacing = 280;
      const colors = ['table-theme-violet', 'table-theme-emerald', 'table-theme-rose', 'table-theme-amber', 'table-theme-blue'];

      tables.forEach((t, i) => {
        t.x = 120 + (i % cols) * xSpacing;
        t.y = 120 + Math.floor(i / cols) * ySpacing;
        t.color = t.color || colors[i % colors.length];
      });
    }

    return { tables, relations };
  } catch (err) {
    throw new Error('Invalid JSON blueprint payload: ' + err.message);
  }
};
</script>

<style scoped>
.import-modal-card {
  width: 640px !important;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  padding: 2rem !important;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.modal-icon-sparkle {
  width: 22px;
  height: 22px;
  color: hsl(var(--warning));
}

.import-tabs {
  display: flex;
  gap: 0.5rem;
  border-bottom: 1px solid hsl(var(--border) / 0.8);
  margin-bottom: 1.5rem;
}

.import-tab-btn {
  background: transparent;
  border: none;
  color: hsl(var(--muted-foreground));
  font-size: 0.875rem;
  font-weight: 600;
  padding: 0.75rem 1rem;
  cursor: pointer;
  position: relative;
  transition: all 0.15s ease;
}

.import-tab-btn:hover {
  color: hsl(var(--foreground));
}

.import-tab-btn.is-active {
  color: hsl(var(--primary));
}

.import-tab-btn.is-active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background-color: hsl(var(--primary));
}

.import-form-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  overflow-y: auto;
  padding-right: 4px;
}

.label-with-hint {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.4rem;
}

.label-with-hint label {
  margin-bottom: 0 !important;
}

.hint-badge {
  font-size: 0.7rem;
  color: hsl(var(--muted-foreground));
  background-color: hsl(var(--input));
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid hsl(var(--border));
}

.sql-textarea,
.json-textarea {
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.825rem;
  line-height: 1.4;
  background-color: hsl(var(--input) / 0.6) !important;
  color: #a8ffb2 !important;
}

.parse-error-box {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background-color: hsl(var(--destructive) / 0.15);
  border: 1px solid hsl(var(--destructive) / 0.3);
  color: #ffa4a4;
  border-radius: var(--radius-md);
  font-size: 0.8rem;
}

.error-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  border-top: 1px solid hsl(var(--border) / 0.6);
  padding-top: 1.25rem;
  margin-top: 0.5rem;
}
</style>
