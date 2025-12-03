<script setup lang="ts">
import NodeRenderer from './NodeRenderer.vue';
import { createTable, createTableBorders } from '@harbour-enterprises/super-editor/extensions/table/tableHelpers';

const props = defineProps({
  rows: Number,
  columns: Number,
  tableAttrs: Object,
  cellAttrs: Object,
});

const defaultTableAttrs = {
  tableProperties: {
    tableWidth: {
      value: '100%',
      type: 'pct',
    },
  },
};

const createNode = (schema) => {
  const rows = Array.from({ length: props.rows }).map((_, rowIndex) => {
    const cells = Array.from({ length: props.columns }).map((_, colIndex) => {
      const cellContent = schema.nodes.paragraph.create(null, schema.text(`R${rowIndex}C${colIndex}`));
      return schema.nodes.tableCell.createChecked({ colwidth: null, ...props.cellAttrs }, cellContent);
    });
    return schema.nodes.tableRow.createChecked({}, cells);
  });

  const borders = createTableBorders();
  const table = schema.nodes.table.create({ borders, ...defaultTableAttrs, ...props.tableAttrs }, rows);
  return table;
};
</script>

<template>
  <NodeRenderer :createNode="createNode" />
</template>
