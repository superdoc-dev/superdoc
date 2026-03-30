<script setup>
import IconGrid from '../toolbar/IconGrid.vue';
import { icons } from '../toolbar/color-dropdown-helpers.js';
import { isCellSelection } from '@extensions/table/tableHelpers/isCellSelection.js';
import { cellAround } from '@extensions/table/tableHelpers/cellAround.js';

const props = defineProps({
  editor: {
    type: Object,
    required: true,
  },
  closePopover: {
    type: Function,
    required: true,
  },
});

// Plain object with .value — IconGridRow expects a ref-like shape (accesses .value directly).
// A real ref() would be auto-unwrapped by Vue's template compiler before reaching IconGrid.
const activeColor = { value: null };

const ensureCellSelection = () => {
  const { state } = props.editor;
  if (isCellSelection(state.selection)) return;

  const $from = state.selection.$from;
  const cell = cellAround($from);
  if (cell) {
    props.editor.commands.setCellSelection({ anchorCell: cell.pos, headCell: cell.pos });
  }
};

const handleSelect = (color) => {
  ensureCellSelection();
  if (color === 'none') {
    props.editor.commands.setCellAttr('background', null);
  } else {
    props.editor.commands.setCellBackground(color);
  }
  props.closePopover();
};
</script>

<template>
  <IconGrid :icons="icons" :customIcons="[]" :activeColor="activeColor" :hasNoneIcon="true" @select="handleSelect" />
</template>
