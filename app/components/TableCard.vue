<template>
  <div 
    class="table-card glass-panel"
    :class="[
      table.color, 
      { 
        'is-selected': isSelected,
        'is-read-only': readOnly
      }
    ]"
    :style="{
      transform: `translate(${table.x}px, ${table.y}px)`,
      width: `${TABLE_WIDTH}px`
    }"
    @mousedown.stop="onMouseDown"
    @click.stop="$emit('select')"
  >
    <!-- Table Header -->
    <div class="table-header">
      <span class="table-name-text">{{ table.name }}</span>
      <div class="table-dots">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
    </div>

    <!-- Columns List -->
    <div class="table-columns">
      <div 
        v-for="(col, index) in columns" 
        :key="col.id"
        class="column-row"
        :class="{ 'is-selected-col': selectedColumnId === col.id }"
        @click.stop="$emit('select-column', col.id)"
      >
        <!-- Left Link Handle Port -->
        <div 
          class="port port-left"
          @mousedown.stop="onPortMouseDown($event, col, 'left', index)"
        ></div>

        <!-- Column Meta Details -->
        <div class="column-meta">
          <span v-if="col.is_primary" class="key-icon">🔑</span>
          <span 
            class="column-name" 
            :class="{ 'is-nullable': col.is_nullable }"
          >
            {{ col.name }}
          </span>
        </div>

        <div class="column-type-container">
          <span class="column-type">{{ col.type }}{{ col.length ? `(${col.length})` : '' }}</span>
        </div>

        <!-- Right Link Handle Port -->
        <div 
          class="port port-right"
          @mousedown.stop="onPortMouseDown($event, col, 'right', index)"
        ></div>
      </div>
      
      <!-- Empty Columns State -->
      <div v-if="columns.length === 0" class="empty-columns">
        No columns yet
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const TABLE_WIDTH = 220;
const HEADER_HEIGHT = 44;
const ROW_HEIGHT = 32;

const props = defineProps({
  table: { type: Object, required: true },
  columns: { type: Array, required: true },
  isSelected: { type: Boolean, default: false },
  selectedColumnId: { type: String, default: '' },
  zoom: { type: Number, default: 1 },
  readOnly: { type: Boolean, default: false }
});

const emit = defineEmits([
  'select', 'select-column', 'drag', 'drag-end', 'start-relation-drag'
]);

const dragStart = ref({ x: 0, y: 0 });
const hasDragged = ref(false);

const onMouseDown = (e) => {
  if (props.readOnly) return;
  // Only drag on left click
  if (e.button !== 0) return;
  
  dragStart.value = {
    x: e.clientX - props.table.x * props.zoom,
    y: e.clientY - props.table.y * props.zoom
  };
  
  hasDragged.value = false;
  
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
};

const onMouseMove = (e) => {
  hasDragged.value = true;
  
  // Account for scale/zoom when dragging
  const newX = Math.round((e.clientX - dragStart.value.x) / props.zoom);
  const newY = Math.round((e.clientY - dragStart.value.y) / props.zoom);
  
  emit('drag', {
    tableId: props.table.id,
    x: newX,
    y: newY
  });
};

const onMouseUp = (e) => {
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
  
  if (hasDragged.value) {
    emit('drag-end', {
      tableId: props.table.id,
      x: props.table.x,
      y: props.table.y
    });
  }
};

const onPortMouseDown = (e, column, side, index) => {
  if (props.readOnly) return;
  e.preventDefault();
  
  // Calculate exact absolute source port position
  const portY = props.table.y + HEADER_HEIGHT + (index * ROW_HEIGHT) + (ROW_HEIGHT / 2);
  const portX = side === 'left' ? props.table.x : props.table.x + TABLE_WIDTH;
  
  emit('start-relation-drag', {
    e,
    sourceTableId: props.table.id,
    sourceColumnId: column.id,
    portX,
    portY
  });
};
</script>

<style scoped>
.table-card {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: var(--radius-lg);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
  cursor: grab;
  user-select: none;
  z-index: 10;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
  overflow: visible; /* Need ports to overflow card edge */
}

.table-card.is-read-only {
  cursor: default !important;
}

.table-card.is-read-only .port {
  display: none !important;
}

.table-card:active {
  cursor: grabbing;
}

.table-card.is-read-only:active {
  cursor: default !important;
}

.table-card.is-selected {
  border-color: hsl(var(--table-accent, var(--primary)));
  box-shadow: 0 0 16px 2px hsla(var(--table-accent, var(--primary)), 0.35);
  z-index: 20;
}

/* Custom Table Theme Header Accents */
.table-header {
  height: 44px;
  background: linear-gradient(to bottom, hsl(var(--table-accent) / 0.2) 0%, transparent 100%), hsl(var(--card));
  border-top: 3px solid hsl(var(--table-accent, var(--primary)));
  border-bottom: 1px solid hsl(var(--border));
  border-top-left-radius: inherit;
  border-top-right-radius: inherit;
  padding: 0 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.table-name-text {
  font-size: 0.875rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.01em;
}

.table-dots {
  display: flex;
  gap: 3px;
}

.table-dots .dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: hsl(var(--muted-foreground) / 0.7);
}

.table-columns {
  background-color: hsl(var(--card) / 0.6);
  border-bottom-left-radius: inherit;
  border-bottom-right-radius: inherit;
}

.column-row {
  position: relative;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  border-bottom: 1px solid hsl(var(--border) / 0.5);
  cursor: pointer;
  transition: all 0.15s ease;
}

.column-row:last-child {
  border-bottom: none;
  border-bottom-left-radius: inherit;
  border-bottom-right-radius: inherit;
}

.column-row:hover {
  background-color: hsl(var(--card-hover));
}

.column-row.is-selected-col {
  background-color: hsl(var(--primary) / 0.08);
}

.column-meta {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  max-width: 55%;
  overflow: hidden;
}

.key-icon {
  font-size: 0.7rem;
}

.column-name {
  font-size: 0.8rem;
  font-weight: 600;
  color: hsl(var(--foreground));
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.column-name.is-nullable {
  color: hsl(var(--muted-foreground));
  font-style: italic;
}

.column-type-container {
  max-width: 40%;
  overflow: hidden;
}

.column-type {
  font-size: 0.7rem;
  color: hsl(var(--muted-foreground));
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

/* Ports Visual Handles */
.port {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: hsl(var(--card));
  border: 2.5px solid hsl(var(--muted-foreground) / 0.7);
  z-index: 100;
  cursor: crosshair;
  opacity: 0;
  transition: opacity 0.15s, background-color 0.15s, border-color 0.15s;
}

.port-left {
  left: -5px;
}

.port-right {
  right: -5px;
}

.column-row:hover .port,
.port:hover {
  opacity: 1;
}

.port:hover {
  background-color: hsl(var(--warning));
  border-color: #fff;
  box-shadow: 0 0 6px hsl(var(--warning));
}

.empty-columns {
  text-align: center;
  padding: 1.25rem;
  color: hsl(var(--muted-foreground));
  font-size: 0.75rem;
  font-style: italic;
}
</style>
