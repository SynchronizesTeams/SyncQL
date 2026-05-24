<template>
  <aside class="sidebar-right glass-panel">
    <!-- 1. Table Inspector -->
    <div v-if="activeType === 'table' && selectedTable" class="inspector-container">
      <div class="inspector-header">
        <h3 class="inspector-title">Table Inspector</h3>
        <button v-if="!readOnly" class="delete-btn btn-icon" @click="$emit('delete-table', selectedTable.id)">
          <Trash2 class="trash-icon" />
        </button>
      </div>

      <div class="form-group">
        <label for="table-name">Table Name</label>
        <input 
          id="table-name" 
          v-model="tableNameLocal" 
          type="text" 
          class="input-field"
          :disabled="readOnly"
          @input="updateTable"
        />
      </div>

      <div class="form-group">
        <label>Header Accent Color</label>
        <div class="color-presets-grid">
          <button 
            v-for="color in colorPresets" 
            :key="color.class"
            class="color-dot-btn"
            :class="[color.class, { 'is-active': selectedTable.color === color.class, 'pointer-events-none opacity-50': readOnly }]"
            @click="readOnly ? null : updateTableColor(color.class)"
            :title="color.name"
          ></button>
        </div>
      </div>

      <div class="columns-actions border-top">
        <div class="columns-actions-header">
          <span class="action-label">Columns</span>
          <button v-if="!readOnly" class="btn btn-secondary btn-xs" @click="$emit('add-column', selectedTable.id)">
            <Plus class="btn-icon" /> Add Column
          </button>
        </div>

        <div class="inspector-cols-list">
          <div 
            v-for="col in tableColumns" 
            :key="col.id"
            class="cols-list-item"
            @click="$emit('select-column', col.id)"
          >
            <span v-if="col.is_primary" class="primary-key-bullet">🔑</span>
            <span class="col-list-name" :class="{ 'is-nullable': col.is_nullable }">{{ col.name }}</span>
            <span class="col-list-type">{{ col.type }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. Column Inspector -->
    <div v-else-if="activeType === 'column' && selectedColumn" class="inspector-container">
      <div class="inspector-header">
        <button class="back-link-btn" @click="$emit('select-table', selectedColumn.table_id)">
          <ArrowLeft class="back-arrow" /> Back to Table
        </button>
        <button v-if="!readOnly" class="delete-btn btn-icon" @click="$emit('delete-column', selectedColumn.id)">
          <Trash2 class="trash-icon" />
        </button>
      </div>

      <h3 class="inspector-title border-bottom-title">Column Inspector</h3>

      <div class="form-scroll scrollable">
        <div class="form-group">
          <label for="col-name">Column Name</label>
          <input 
            id="col-name" 
            v-model="colForm.name" 
            type="text" 
            class="input-field"
            :disabled="readOnly"
            @input="updateColumn"
          />
        </div>

        <div class="form-group">
          <label for="col-type">Data Type</label>
          <select 
            id="col-type" 
            v-model="colForm.type" 
            class="input-field select-field"
            :disabled="readOnly"
            @change="updateColumn"
          >
            <option v-for="t in getTypesList" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>

        <div v-if="typeNeedsLength" class="form-group">
          <label for="col-len">Length / Precision</label>
          <input 
            id="col-len" 
            v-model="colForm.length" 
            type="text" 
            placeholder="e.g. 255 or 10,2" 
            class="input-field"
            :disabled="readOnly"
            @input="updateColumn"
          />
        </div>

        <!-- Attributes checkmarks -->
        <div class="checkbox-options-panel">
          <label class="checkbox-option" :class="{ 'disabled-check': hasOtherPrimaryKey || readOnly }">
            <input 
              type="checkbox" 
              v-model="colForm.is_primary" 
              :disabled="hasOtherPrimaryKey || readOnly"
              @change="onPrimaryChange" 
            />
            <div class="checkbox-label-block">
              <span class="checkbox-title">Primary Key</span>
              <span class="checkbox-desc" v-if="!hasOtherPrimaryKey">Primary unique identifier</span>
              <span class="checkbox-desc" v-else style="color: hsl(var(--warning) / 0.8)">Table already has a primary key</span>
            </div>
          </label>

          <label class="checkbox-option" :class="{ 'disabled-check': colForm.is_primary || readOnly }">
            <input 
              type="checkbox" 
              v-model="colForm.is_nullable" 
              :disabled="colForm.is_primary || readOnly"
              @change="updateColumn" 
            />
            <div class="checkbox-label-block">
              <span class="checkbox-title">Nullable</span>
              <span class="checkbox-desc">Allow NULL values</span>
            </div>
          </label>

          <label class="checkbox-option" :class="{ 'disabled-check': readOnly }">
            <input 
              type="checkbox" 
              v-model="colForm.is_unique" 
              :disabled="readOnly"
              @change="updateColumn" 
            />
            <div class="checkbox-label-block">
              <span class="checkbox-title">Unique</span>
              <span class="checkbox-desc">Must contain unique values</span>
            </div>
          </label>

          <label class="checkbox-option" :class="{ 'disabled-check': !isAutoIncrementSupported || readOnly }">
            <input 
              type="checkbox" 
              v-model="colForm.is_auto_increment" 
              :disabled="!isAutoIncrementSupported || readOnly"
              @change="updateColumn" 
            />
            <div class="checkbox-label-block">
              <span class="checkbox-title">Auto Increment</span>
              <span class="checkbox-desc" v-if="isAutoIncrementSupported">Generate serial values</span>
              <span class="checkbox-desc" v-else style="color: hsl(var(--warning) / 0.8)">Unsupported for non-numeric types</span>
            </div>
          </label>
        </div>

        <div class="form-group border-top-form">
          <label for="col-def">Default Value</label>
          <input 
            id="col-def" 
            v-model="colForm.default_value" 
            type="text" 
            placeholder="NULL" 
            class="input-field"
            :disabled="readOnly"
            @input="updateColumn"
          />
        </div>

        <div class="form-group">
          <label for="col-comment">Comment / Description</label>
          <textarea 
            id="col-comment" 
            v-model="colForm.comment" 
            placeholder="Document column utility..." 
            class="input-field textarea-field" 
            rows="2"
            :disabled="readOnly"
            @input="updateColumn"
          ></textarea>
        </div>

        <!-- 3. Foreign Key Relationship Config inside Column Inspector -->
        <div v-if="columnRelation" class="form-group border-top-form">
          <label>Foreign Key Relationship</label>
          <div class="relation-mapping-box" style="margin-top: 0.5rem; margin-bottom: 0.75rem;">
            <div class="mapping-node">
              <span class="mapping-title">This Column</span>
              <span class="mapping-table-col">{{ getTableName(selectedColumn.table_id) }}.{{ selectedColumn.name }}</span>
            </div>
            <div class="mapping-divider" style="margin: 0.25rem 0;">references parent</div>
            <div class="mapping-node">
              <span class="mapping-title">Parent Column</span>
              <span class="mapping-table-col" v-if="columnRelation.source_column_id === selectedColumn.id">
                {{ getTableName(columnRelation.target_table_id) }}.{{ getColumnName(columnRelation.target_column_id) }}
              </span>
              <span class="mapping-table-col" v-else>
                {{ getTableName(columnRelation.source_table_id) }}.{{ getColumnName(columnRelation.source_column_id) }}
              </span>
            </div>
          </div>
          <button 
            v-if="!readOnly" 
            class="btn btn-secondary btn-xs" 
            style="align-self: flex-start; background: hsla(0, 80%, 60%, 0.15); border-color: hsla(0, 80%, 60%, 0.3); color: #ffa4a4;"
            @click="$emit('delete-relation', columnRelation.id)"
          >
            Delete Foreign Key
          </button>
        </div>

        <div v-else-if="!readOnly" class="form-group border-top-form">
          <label>Configure Foreign Key (FK)</label>
          <p style="font-size: 0.675rem; color: hsl(var(--muted-foreground)); margin-bottom: 0.75rem;">
            Establish a new visual linking relationship from this column.
          </p>
          
          <div class="fk-creator-fields" style="display: flex; flex-direction: column; gap: 0.75rem;">
            <div class="form-group-sub" style="display: flex; flex-direction: column; gap: 0.25rem;">
              <span style="font-size: 0.65rem; color: hsl(var(--muted-foreground)); font-weight: 700; text-transform: uppercase;">Parent Table</span>
              <select v-model="fkTargetTableId" class="input-field select-field" style="padding: 0.35rem 0.5rem; font-size: 0.775rem;">
                <option value="">-- Select Table --</option>
                <option v-for="t in otherTables" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
            </div>

            <div class="form-group-sub" v-if="fkTargetTableId" style="display: flex; flex-direction: column; gap: 0.25rem;">
              <span style="font-size: 0.65rem; color: hsl(var(--muted-foreground)); font-weight: 700; text-transform: uppercase;">Parent Column</span>
              <select v-model="fkTargetColumnId" class="input-field select-field" style="padding: 0.35rem 0.5rem; font-size: 0.775rem;">
                <option value="">-- Select Column --</option>
                <option v-for="c in targetColumns" :key="c.id" :value="c.id">
                  {{ c.name }} {{ c.is_primary ? '(PK)' : '' }}
                </option>
              </select>
            </div>

            <button 
              v-if="fkTargetTableId && fkTargetColumnId"
              class="btn btn-primary btn-xs"
              style="align-self: flex-start; margin-top: 0.25rem;"
              @click="createForeignKey"
            >
              Establish Foreign Key Link
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>

    <!-- 3. Relation Inspector -->
    <div v-else-if="activeType === 'relation' && selectedRelation" class="inspector-container">
      <div class="inspector-header">
        <h3 class="inspector-title">Relationship</h3>
        <button v-if="!readOnly" class="delete-btn btn-icon" @click="$emit('delete-relation', selectedRelation.id)">
          <Trash2 class="trash-icon" />
        </button>
      </div>

      <!-- Mapping diagram representation cards -->
      <div class="relation-mapping-box">
        <div class="mapping-node">
          <span class="mapping-title">Foreign Key</span>
          <span class="mapping-table-col">{{ getTableName(selectedRelation.source_table_id) }}.{{ getColumnName(selectedRelation.source_column_id) }}</span>
        </div>
        <div class="mapping-divider">👇 references</div>
        <div class="mapping-node">
          <span class="mapping-title">Referenced Table</span>
          <span class="mapping-table-col">{{ getTableName(selectedRelation.target_table_id) }}.{{ getColumnName(selectedRelation.target_column_id) }}</span>
        </div>
      </div>

      <div class="form-group border-top">
        <label for="rel-type">Relation Type</label>
        <select 
          id="rel-type" 
          v-model="relationTypeLocal" 
          class="input-field select-field"
          :disabled="readOnly"
          @change="updateRelation"
        >
          <option value="1:1">One to One (1:1)</option>
          <option value="1:N">One to Many (1:N)</option>
          <option value="N:1">Many to One (N:1)</option>
          <option value="N:M">Many to Many (N:M)</option>
        </select>
      </div>

      <div class="form-group">
        <label for="rel-on-delete">ON DELETE Action</label>
        <select 
          id="rel-on-delete" 
          v-model="relationOnDeleteLocal" 
          class="input-field select-field"
          :disabled="readOnly"
          @change="updateRelation"
        >
          <option value="CASCADE">CASCADE</option>
          <option value="SET NULL">SET NULL</option>
          <option value="RESTRICT">RESTRICT</option>
          <option value="NO ACTION">NO ACTION</option>
        </select>
      </div>

      <div class="form-group">
        <label for="rel-on-update">ON UPDATE Action</label>
        <select 
          id="rel-on-update" 
          v-model="relationOnUpdateLocal" 
          class="input-field select-field"
          :disabled="readOnly"
          @change="updateRelation"
        >
          <option value="CASCADE">CASCADE</option>
          <option value="SET NULL">SET NULL</option>
          <option value="RESTRICT">RESTRICT</option>
          <option value="NO ACTION">NO ACTION</option>
        </select>
      </div>
    </div>

    <!-- 4. Default Empty Inspector -->
    <div v-else class="empty-inspector">
      <div class="compass-icon">🧭</div>
      <h3>Inspector Panel</h3>
      <p>Select a table, column, or visual connection line on the canvas to configure DDL attributes.</p>
      
      <div class="tips-box">
        <span class="tip-header">Pro Tips:</span>
        <ul>
          <li>Double-click tables in Left Navigation to center viewport</li>
          <li>Drag visual ports on side of columns to link foreign keys!</li>
          <li>Hold Spacebar or Middle Mouse Click to pan grid canvas</li>
        </ul>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { Trash2, Plus, ArrowLeft } from 'lucide-vue-next';

const props = defineProps({
  activeType: { type: String, default: '' }, // 'table' | 'column' | 'relation' | ''
  tables: { type: Array, required: true },
  columns: { type: Array, required: true },
  relations: { type: Array, required: true },
  selectedTableId: { type: String, default: '' },
  selectedColumnId: { type: String, default: '' },
  selectedRelationId: { type: String, default: '' },
  dialect: { type: String, default: 'postgresql' },
  readOnly: { type: Boolean, default: false }
});

const emit = defineEmits([
  'update-table', 'update-column', 'update-relation', 
  'delete-table', 'delete-column', 'delete-relation',
  'add-column', 'select-table', 'select-column', 'add-relation'
]);

// Color Presets mapping HSL stylesheets
const colorPresets = [
  { name: 'Violet Glow', class: 'table-theme-violet' },
  { name: 'Emerald Forest', class: 'table-theme-emerald' },
  { name: 'Rose Red', class: 'table-theme-rose' },
  { name: 'Golden Amber', class: 'table-theme-amber' },
  { name: 'Sky Blue', class: 'table-theme-blue' },
  { name: 'Slate Gray', class: 'table-theme-slate' }
];

// 1. Table references
const selectedTable = computed(() => 
  props.tables.find(t => t.id === props.selectedTableId)
);
const tableColumns = computed(() => 
  props.columns.filter(c => c.table_id === props.selectedTableId)
);
const tableNameLocal = ref('');

watch(selectedTable, (newVal) => {
  if (newVal) {
    tableNameLocal.value = newVal.name;
  }
}, { immediate: true });

const updateTable = () => {
  if (!selectedTable.value) return;
  emit('update-table', {
    tableId: selectedTable.value.id,
    name: tableNameLocal.value,
    color: selectedTable.value.color
  });
};

const updateTableColor = (colorClass) => {
  if (!selectedTable.value) return;
  emit('update-table', {
    tableId: selectedTable.value.id,
    name: selectedTable.value.name,
    color: colorClass
  });
};

// 2. Column references
const selectedColumn = computed(() => 
  props.columns.find(c => c.id === props.selectedColumnId)
);

const colForm = ref({
  id: '',
  table_id: '',
  name: '',
  type: 'INT',
  length: '',
  is_primary: false,
  is_nullable: true,
  is_unique: false,
  is_auto_increment: false,
  default_value: '',
  comment: ''
});

watch(selectedColumn, (newVal) => {
  if (newVal) {
    colForm.value = {
      id: newVal.id,
      table_id: newVal.table_id,
      name: newVal.name,
      type: newVal.type,
      length: newVal.length || '',
      is_primary: !!newVal.is_primary,
      is_nullable: !!newVal.is_nullable,
      is_unique: !!newVal.is_unique,
      is_auto_increment: !!newVal.is_auto_increment,
      default_value: newVal.default_value || '',
      comment: newVal.comment || ''
    };
  }
}, { immediate: true });

const getTypesList = computed(() => {
  const common = ['INT', 'BIGINT', 'VARCHAR', 'TEXT', 'BOOLEAN', 'DECIMAL', 'DOUBLE', 'DATE', 'TIMESTAMP', 'JSON', 'UUID'];
  return common;
});

const typeNeedsLength = computed(() => {
  const t = colForm.value.type.toUpperCase();
  return t === 'VARCHAR' || t === 'DECIMAL' || t === 'CHAR';
});

const updateColumn = () => {
  if (!selectedColumn.value) return;
  emit('update-column', {
    ...colForm.value,
    is_primary: colForm.value.is_primary ? 1 : 0,
    is_nullable: colForm.value.is_nullable ? 1 : 0,
    is_unique: colForm.value.is_unique ? 1 : 0,
    is_auto_increment: colForm.value.is_auto_increment ? 1 : 0
  });
};

const onPrimaryChange = () => {
  if (colForm.value.is_primary) {
    colForm.value.is_nullable = false;
  }
  updateColumn();
};

const isAutoIncrementSupported = computed(() => {
  const t = colForm.value.type.toUpperCase();
  return t === 'INT' || t === 'BIGINT' || t === 'INTEGER' || t === 'SMALLINT' || t === 'SERIAL' || t === 'BIGSERIAL';
});

// If type is not auto-incrementable, make sure it gets unchecked
watch(() => colForm.value.type, (newType) => {
  if (newType) {
    const t = newType.toUpperCase();
    const supportsAI = t === 'INT' || t === 'BIGINT' || t === 'INTEGER' || t === 'SMALLINT' || t === 'SERIAL' || t === 'BIGSERIAL';
    if (!supportsAI && colForm.value.is_auto_increment) {
      colForm.value.is_auto_increment = false;
      updateColumn();
    }
  }
});

const hasOtherPrimaryKey = computed(() => {
  if (!selectedColumn.value) return false;
  return props.columns.some(c => 
    c.table_id === selectedColumn.value.table_id && 
    c.id !== selectedColumn.value.id && 
    c.is_primary === 1
  );
});

const columnRelation = computed(() => {
  if (!selectedColumn.value) return null;
  return props.relations.find(r => 
    r.source_column_id === selectedColumn.value.id || 
    r.target_column_id === selectedColumn.value.id
  );
});

// Foreign Key Creator fields
const fkTargetTableId = ref('');
const fkTargetColumnId = ref('');

const otherTables = computed(() => {
  if (!selectedColumn.value) return [];
  return props.tables.filter(t => t.id !== selectedColumn.value.table_id);
});

watch(selectedColumn, () => {
  fkTargetTableId.value = '';
  fkTargetColumnId.value = '';
});

const targetColumns = computed(() => {
  if (!fkTargetTableId.value) return [];
  return props.columns.filter(c => c.table_id === fkTargetTableId.value);
});

const createForeignKey = () => {
  if (!selectedColumn.value || !fkTargetTableId.value || !fkTargetColumnId.value) return;
  
  emit('add-relation', {
    id: crypto.randomUUID(),
    source_table_id: selectedColumn.value.table_id,
    source_column_id: selectedColumn.value.id,
    target_table_id: fkTargetTableId.value,
    target_column_id: fkTargetColumnId.value,
    type: '1:N',
    on_delete: 'CASCADE',
    on_update: 'CASCADE'
  });
  
  fkTargetTableId.value = '';
  fkTargetColumnId.value = '';
};

// 3. Relation references
const selectedRelation = computed(() => 
  props.relations.find(r => r.id === props.selectedRelationId)
);

const relationTypeLocal = ref('1:N');
const relationOnDeleteLocal = ref('CASCADE');
const relationOnUpdateLocal = ref('CASCADE');

watch(selectedRelation, (newVal) => {
  if (newVal) {
    relationTypeLocal.value = newVal.type;
    relationOnDeleteLocal.value = newVal.on_delete;
    relationOnUpdateLocal.value = newVal.on_update;
  }
}, { immediate: true });

const updateRelation = () => {
  if (!selectedRelation.value) return;
  emit('update-relation', {
    relationId: selectedRelation.value.id,
    type: relationTypeLocal.value,
    on_delete: relationOnDeleteLocal.value,
    on_update: relationOnUpdateLocal.value
  });
};

const getTableName = (tableId) => {
  return props.tables.find(t => t.id === tableId)?.name || 'UnknownTable';
};

const getColumnName = (colId) => {
  return props.columns.find(c => c.id === colId)?.name || 'UnknownCol';
};
</script>

<style scoped>
.sidebar-right {
  width: 280px;
  height: calc(100vh - 60px);
  position: absolute;
  right: 0;
  top: 60px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  border-right: none;
  border-top: none;
  border-bottom: none;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  background: hsla(224, 25%, 10%, 0.85);
  overflow: hidden;
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.sidebar-right.is-collapsed {
  transform: translateX(290px);
}

.inspector-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 1.25rem 1rem;
  overflow: hidden;
}

.inspector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.25rem;
}

.inspector-title {
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.border-bottom-title {
  border-bottom: 1px solid hsl(var(--border));
  padding-bottom: 0.5rem;
  margin-bottom: 1.25rem;
}

.back-link-btn {
  background: transparent;
  border: none;
  color: hsl(var(--primary));
  font-size: 0.775rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.back-arrow {
  width: 14px;
  height: 14px;
}

.delete-btn {
  background-color: transparent;
  color: hsl(var(--muted-foreground));
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: var(--radius-sm);
  transition: all 0.15s ease;
}

.delete-btn:hover {
  color: hsl(var(--destructive));
  background-color: hsl(var(--destructive) / 0.1);
}

.trash-icon {
  width: 16px;
  height: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  margin-bottom: 1.25rem;
}

.form-group label {
  font-size: 0.75rem;
  font-weight: 700;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.select-field {
  appearance: none;
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23a1a1aa' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
  background-position: right 0.5rem center;
  background-repeat: no-repeat;
  background-size: 1.25em 1.25em;
  padding-right: 2rem;
}

/* Color Presets Toggles Grid */
.color-presets-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
}

.color-dot-btn {
  aspect-ratio: 1;
  border-radius: 50%;
  border: 2px solid hsl(var(--border));
  background-color: hsl(var(--table-accent));
  cursor: pointer;
  transition: all 0.15s ease;
}

.color-dot-btn:hover {
  transform: scale(1.15);
}

.color-dot-btn.is-active {
  border-color: #fff;
  transform: scale(1.2);
  box-shadow: 0 0 8px hsl(var(--table-accent));
}

.border-top {
  border-top: 1px solid hsl(var(--border));
  padding-top: 1.25rem;
}

/* Table columns selection quicklist */
.columns-actions {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.columns-actions-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.action-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
}

.btn-xs {
  padding: 0.35rem 0.65rem;
  font-size: 0.75rem;
  border-radius: var(--radius-sm);
}

.inspector-cols-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.cols-list-item {
  display: flex;
  align-items: center;
  padding: 0.5rem;
  background-color: hsl(var(--input));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s ease;
}

.cols-list-item:hover {
  background-color: hsl(var(--card-hover));
  border-color: hsl(var(--muted-foreground) / 0.3);
}

.primary-key-bullet {
  font-size: 0.65rem;
  margin-right: 0.35rem;
}

.col-list-name {
  font-size: 0.75rem;
  font-weight: 600;
  flex: 1;
  text-overflow: ellipsis;
  overflow: hidden;
}

.col-list-name.is-nullable {
  color: hsl(var(--muted-foreground));
  font-style: italic;
}

.col-list-type {
  font-size: 0.65rem;
  color: hsl(var(--muted-foreground));
}

/* Scrollable forms for columns edit */
.form-scroll {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  overflow-y: auto;
  padding-right: 2px;
}

.scrollable {
  overflow-y: auto;
}

.border-top-form {
  border-top: 1px solid hsl(var(--border) / 0.5);
  padding-top: 1.1rem;
}

.border-top-form label {
  margin-bottom: 0.25rem;
}

/* Attribute Checkbox Grid options */
.checkbox-options-panel {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin: 0.25rem 0;
}

.checkbox-option {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  cursor: pointer;
  user-select: none;
}

.checkbox-option input[type="checkbox"] {
  width: 15px;
  height: 15px;
  border-radius: var(--radius-sm);
  background-color: hsl(var(--input));
  border: 1px solid hsl(var(--border));
  margin-top: 2px;
  accent-color: hsl(var(--primary));
}

.checkbox-label-block {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.checkbox-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.checkbox-desc {
  font-size: 0.675rem;
  color: hsl(var(--muted-foreground));
}

.disabled-check {
  opacity: 0.5;
  cursor: not-allowed;
}

.textarea-field {
  resize: vertical;
}

/* Relation inspector mapping design */
.relation-mapping-box {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background-color: hsl(var(--input));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  padding: 0.85rem;
  margin-bottom: 1.25rem;
}

.mapping-node {
  display: flex;
  flex-direction: column;
}

.mapping-title {
  font-size: 0.65rem;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  font-weight: 700;
}

.mapping-table-col {
  font-size: 0.8rem;
  font-weight: 700;
  color: #fff;
}

.mapping-divider {
  font-size: 0.7rem;
  color: hsl(var(--warning));
  font-weight: 600;
  text-align: center;
}

/* Empty default Panel view */
.empty-inspector {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2.5rem 1rem;
  height: 100%;
}

.compass-icon {
  font-size: 2rem;
  margin-bottom: 1rem;
}

.empty-inspector h3 {
  font-size: 0.95rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.empty-inspector p {
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
  max-width: 220px;
  line-height: 1.4;
  margin-bottom: 2rem;
}

.tips-box {
  background-color: hsl(var(--input));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-md);
  padding: 0.85rem;
  text-align: left;
}

.tip-header {
  font-size: 0.725rem;
  font-weight: 700;
  color: hsl(var(--warning));
  text-transform: uppercase;
  margin-bottom: 0.35rem;
  display: block;
}

.tips-box ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.tips-box li {
  font-size: 0.675rem;
  color: hsl(var(--muted-foreground));
  position: relative;
  padding-left: 8px;
  line-height: 1.3;
}

.tips-box li::before {
  content: '•';
  position: absolute;
  left: 0;
  color: hsl(var(--primary));
}
</style>
