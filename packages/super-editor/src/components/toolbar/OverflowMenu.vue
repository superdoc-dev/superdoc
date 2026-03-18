<script setup>
import { getCurrentInstance, ref, computed, onMounted, onBeforeUnmount } from 'vue';
import ToolbarButton from './ToolbarButton.vue';
import ButtonGroup from './ButtonGroup.vue';

const { proxy } = getCurrentInstance();

const emit = defineEmits(['buttonClick', 'close']);

const props = defineProps({
  toolbarItem: {
    type: Object,
    required: true,
  },
  overflowItems: {
    type: Array,
    required: true,
  },
});

const isOverflowMenuOpened = computed(() => props.toolbarItem.expand.value);
const hasOpenDropdown = ref(false);

const overflowToolbarItem = computed(() => ({
  ...props.toolbarItem,
  active: isOverflowMenuOpened.value,
}));

const toggleOverflowMenu = () => {
  emit('buttonClick', props.toolbarItem);
};

const handleCommand = ({ item, argument }) => {
  proxy.$toolbar.emitCommand({ item, argument });
};

const handleKeyDown = (e) => {
  if (e.key === 'Escape') {
    if (isOverflowMenuOpened.value && !hasOpenDropdown.value) {
      e.preventDefault();
      emit('close');
    }
  }
};

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown, true);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeyDown, true);
});
</script>

<template>
  <div class="overflow-menu">
    <div class="overflow-menu-trigger">
      <ToolbarButton :toolbar-item="overflowToolbarItem" @buttonClick="toggleOverflowMenu" />
    </div>
    <div v-if="isOverflowMenuOpened" class="overflow-menu_items" role="group">
      <ButtonGroup
        class="superdoc-toolbar-overflow"
        :toolbar-items="overflowItems"
        from-overflow
        @command="handleCommand"
        @dropdown-update-show="hasOpenDropdown = $event"
      />
    </div>
  </div>
</template>

<style lang="postcss" scoped>
.overflow-menu {
  position: relative;

  &_items {
    position: absolute;
    width: 200px;
    top: calc(100% + 3px);
    right: 0;
    padding: 4px 8px;
    background-color: var(--sd-ui-dropdown-bg, #fff);
    border-radius: var(--sd-ui-radius, 6px);
    z-index: 100;
    box-shadow: var(--sd-ui-dropdown-shadow, 0 8px 24px rgba(0, 0, 0, 0.16));
    box-sizing: border-box;
  }
}

.superdoc-toolbar-overflow {
  min-width: auto !important;
  max-width: 200px;
  flex-wrap: wrap;
}

@media (max-width: 300px) {
  .overflow-menu_items {
    right: auto;
    left: 0;
    transform: translateX(-50%);
  }
}
</style>
