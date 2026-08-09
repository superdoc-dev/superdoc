<script setup>
import ToolbarComboBox from './ToolbarComboBox.vue';
import { normalizeCustomFontSize } from './font-typeahead.js';

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
  uiFontFamily: {
    type: String,
    default: 'Arial, Helvetica, sans-serif',
  },
});

// Re-emit (rather than rely on attribute fallthrough) so this wrapper's own
// emitted-event surface stays intact for `item`-driven consumers and tests.
const emit = defineEmits(['command', 'item-clicked', 'tab-out', 'editor-handoff']);
</script>

<template>
  <ToolbarComboBox
    :item="props.item"
    :ui-font-family="props.uiFontFamily"
    :show-preview="false"
    :normalize-value="normalizeCustomFontSize"
    @command="emit('command', $event)"
    @item-clicked="emit('item-clicked')"
    @tab-out="emit('tab-out', $event)"
    @editor-handoff="emit('editor-handoff')"
  />
</template>
