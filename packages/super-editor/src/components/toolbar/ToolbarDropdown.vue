<script setup>
import { computed, defineComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps({
  options: {
    type: Array,
    default: () => [],
  },
  show: {
    type: Boolean,
    required: true,
  },
  placement: {
    type: String,
    default: 'bottom-start',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  contentStyle: {
    type: Object,
    default: () => ({}),
  },
  menuProps: {
    type: Function,
    default: null,
  },
  nodeProps: {
    type: Function,
    default: null,
  },
});

const emit = defineEmits(['update:show', 'select']);

const triggerRef = ref(null);
const menuRef = ref(null);
const menuPosition = ref({ top: '0px', left: '0px' });
const optionRefs = ref([]);
const keyboardIndex = ref(-1);

const isOpen = computed(() => Boolean(props.show));
const hasRenderOptions = computed(() => props.options.some((option) => option?.type === 'render'));

const computedMenuProps = computed(() => {
  if (typeof props.menuProps !== 'function') return {};
  return props.menuProps() || {};
});

const computedMenuAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = computedMenuProps.value;
  return rest;
});

const mergedMenuClass = computed(() => {
  const fromProps = computedMenuProps.value.class;
  const onlyRenderOptions =
    props.options.length > 0 && props.options.every((option) => option && option.type === 'render');
  return ['toolbar-dropdown-menu', fromProps, { 'toolbar-dropdown-menu--render-only': onlyRenderOptions }];
});

const mergedMenuStyle = computed(() => {
  const fromProps = computedMenuProps.value.style || {};
  return { ...props.contentStyle, ...fromProps };
});

const menuStyle = computed(() => {
  return {
    ...mergedMenuStyle.value,
    position: 'fixed',
    top: menuPosition.value.top,
    left: menuPosition.value.left,
    zIndex: 2000,
  };
});

const setOpen = (value) => {
  emit('update:show', value);
};

const close = () => {
  if (!isOpen.value) return;
  setOpen(false);
};

const updateMenuPosition = () => {
  if (!triggerRef.value) return;
  const rect = triggerRef.value.getBoundingClientRect();
  const menuEl = menuRef.value;
  const menuWidth = menuEl?.offsetWidth ?? 0;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const gutter = 8;
  let left = rect.left;

  if (props.placement === 'bottom-end') {
    left = rect.right - menuWidth;
  }

  // Prevent horizontal overflow outside viewport.
  const maxLeft = Math.max(gutter, viewportWidth - menuWidth - gutter);
  left = Math.min(Math.max(gutter, left), maxLeft);

  menuPosition.value = {
    top: `${rect.bottom + 4}px`,
    left: `${left}px`,
  };
};

const onTriggerClick = () => {
  if (props.disabled) return;
  setOpen(!isOpen.value);
};

const getNodeProps = (option) => {
  if (typeof props.nodeProps !== 'function') return {};
  return props.nodeProps(option) || {};
};

const onOptionClick = (option) => {
  if (option?.disabled) return;
  if (option?.type === 'render') return;
  emit('select', option?.key, option);
  close();
};

const isRenderOption = (option) => option?.type === 'render';
const isOptionNavigable = (option) => !option?.disabled && option?.type !== 'render';
const hasIcon = (option) => typeof option?.icon === 'function' || Boolean(option?.icon);
const renderIcon = (option) => {
  if (typeof option?.icon === 'function') return option.icon(option);
  return option?.icon || null;
};

const classHasSelected = (value) => {
  if (!value) return false;
  if (typeof value === 'string') {
    return value.split(/\s+/).includes('selected');
  }
  if (Array.isArray(value)) {
    return value.some(classHasSelected);
  }
  if (typeof value === 'object') {
    return Boolean(value.selected);
  }
  return false;
};

const isOptionSelected = (option) => {
  return classHasSelected(option?.props?.class) || classHasSelected(option?.class);
};

const getNavigableIndexes = () => {
  return props.options.map((option, index) => (isOptionNavigable(option) ? index : -1)).filter((index) => index >= 0);
};

const getInitialKeyboardIndex = () => {
  const selectedIndex = props.options.findIndex((option) => isOptionNavigable(option) && isOptionSelected(option));
  if (selectedIndex >= 0) return selectedIndex;
  return getNavigableIndexes()[0] ?? -1;
};

const setOptionRef = (el, index) => {
  if (!el) {
    delete optionRefs.value[index];
    return;
  }
  optionRefs.value[index] = el;
};

const focusKeyboardIndex = () => {
  optionRefs.value.forEach((el, index) => {
    if (!el) return;
    el.setAttribute('tabindex', index === keyboardIndex.value ? '0' : '-1');
  });

  const target = optionRefs.value[keyboardIndex.value];
  if (target && typeof target.focus === 'function') {
    target.focus();
  }
};

const moveKeyboardIndex = (direction) => {
  const navigableIndexes = getNavigableIndexes();
  if (!navigableIndexes.length) {
    keyboardIndex.value = -1;
    return;
  }

  const currentPosition = navigableIndexes.indexOf(keyboardIndex.value);
  if (currentPosition < 0) {
    keyboardIndex.value = direction > 0 ? navigableIndexes[0] : navigableIndexes[navigableIndexes.length - 1];
    return;
  }

  const nextPosition = (currentPosition + direction + navigableIndexes.length) % navigableIndexes.length;
  keyboardIndex.value = navigableIndexes[nextPosition];
};

const selectKeyboardOption = () => {
  let option = props.options[keyboardIndex.value];
  if (!isOptionNavigable(option)) {
    const firstIndex = getNavigableIndexes()[0];
    option = firstIndex === undefined ? null : props.options[firstIndex];
  }
  if (!option) return;
  onOptionClick(option);
};

const RenderOption = defineComponent({
  name: 'ToolbarDropdownRenderOption',
  props: {
    option: {
      type: Object,
      required: true,
    },
  },
  setup(componentProps) {
    return () => {
      if (typeof componentProps.option.render !== 'function') return null;
      return componentProps.option.render();
    };
  },
});

const OptionIcon = defineComponent({
  name: 'ToolbarDropdownOptionIcon',
  props: {
    option: {
      type: Object,
      required: true,
    },
  },
  setup(componentProps) {
    return () => renderIcon(componentProps.option);
  },
});

const handlePointerDown = (event) => {
  if (!isOpen.value) return;

  const target = event.target;
  if (!(target instanceof Element)) return;

  const insideTrigger = triggerRef.value?.contains(target);
  const insideMenu = menuRef.value?.contains(target);
  if (insideTrigger || insideMenu) return;

  close();
};

const handleKeyDown = (event) => {
  if (!isOpen.value) return;

  const { key } = event;
  const supportedKeys = ['Escape', 'ArrowDown', 'ArrowUp', 'Enter'];
  if (!supportedKeys.includes(key)) return;

  if (key === 'Escape') {
    close();
    return;
  }

  if (hasRenderOptions.value) return;

  event.preventDefault();

  if (key === 'ArrowDown') {
    moveKeyboardIndex(1);
    focusKeyboardIndex();
    return;
  }

  if (key === 'ArrowUp') {
    moveKeyboardIndex(-1);
    focusKeyboardIndex();
    return;
  }

  if (key === 'Enter') {
    selectKeyboardOption();
  }
};

watch(
  isOpen,
  async (open) => {
    if (!open) {
      keyboardIndex.value = -1;
      optionRefs.value = [];
      return;
    }

    await nextTick();
    updateMenuPosition();

    if (hasRenderOptions.value) return;

    keyboardIndex.value = getInitialKeyboardIndex();
    focusKeyboardIndex();
  },
  { immediate: true },
);

watch(
  isOpen,
  (open) => {
    if (open) {
      document.addEventListener('pointerdown', handlePointerDown, true);
      document.addEventListener('keydown', handleKeyDown, true);
      window.addEventListener('resize', updateMenuPosition);
      window.addEventListener('scroll', updateMenuPosition, true);
    } else {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handlePointerDown, true);
  document.removeEventListener('keydown', handleKeyDown, true);
  window.removeEventListener('resize', updateMenuPosition);
  window.removeEventListener('scroll', updateMenuPosition, true);
});
</script>

<template>
  <div class="toolbar-dropdown">
    <div ref="triggerRef" class="toolbar-dropdown-trigger" @click="onTriggerClick">
      <slot name="trigger" />
    </div>

    <Teleport to="body">
      <Transition name="fade-in-scale-up-transition">
        <div v-if="isOpen" ref="menuRef" :class="mergedMenuClass" :style="menuStyle" v-bind="computedMenuAttrs">
          <div
            v-for="(option, index) in options"
            :key="option.key"
            :ref="(el) => setOptionRef(el, index)"
            class="toolbar-dropdown-option"
            :class="[option.class, option.props?.class, { disabled: option.disabled, render: isRenderOption(option) }]"
            tabindex="-1"
            @click="onOptionClick(option)"
            v-bind="{ ...option.props, ...getNodeProps(option) }"
          >
            <RenderOption v-if="isRenderOption(option)" :option="option" />
            <template v-else>
              <span v-if="hasIcon(option)" class="toolbar-dropdown-option__icon">
                <OptionIcon :option="option" />
              </span>
              <span class="toolbar-dropdown-option__label">{{ option.label }}</span>
            </template>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.toolbar-dropdown {
  display: inline-flex;
}

.toolbar-dropdown-trigger {
  display: inline-flex;
}

.toolbar-dropdown-menu {
  min-width: 80px;
  padding: 4px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #e4e6eb;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  box-sizing: border-box;
}

.toolbar-dropdown-menu.toolbar-dropdown-menu--render-only {
  padding: 0;
}

.toolbar-dropdown-option {
  min-height: 34px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s ease-out;
  box-sizing: border-box;
}

.toolbar-dropdown-option__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  min-width: 14px;
  height: 14px;
  margin-right: 6px;
}

.toolbar-dropdown-option__icon :deep(.dropdown-select-icon) {
  display: flex;
  width: 12px;
  height: 12px;
}

.toolbar-dropdown-option:hover {
  background: #d8dee5;
}

.toolbar-dropdown-option.selected {
  background: #d8dee5;
}

.toolbar-dropdown-menu.high-contrast .toolbar-dropdown-option:not(.render):hover {
  background: #000;
  color: #fff;
}

.toolbar-dropdown-menu.high-contrast .toolbar-dropdown-option:not(.render).selected {
  background: #000;
  color: #fff;
}

.toolbar-dropdown-option.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toolbar-dropdown-option.render {
  padding: 0;
  cursor: default;
}

.toolbar-dropdown-option.render:hover {
  background: transparent;
  color: inherit;
}

.fade-in-scale-up-transition-enter-active,
.fade-in-scale-up-transition-leave-active {
  transform-origin: top left;
}

.fade-in-scale-up-transition-enter-active {
  transition:
    opacity 0.2s cubic-bezier(0, 0, 0.2, 1),
    transform 0.2s cubic-bezier(0, 0, 0.2, 1);
}

.fade-in-scale-up-transition-leave-active {
  transition:
    opacity 0.2s cubic-bezier(0.4, 0, 1, 1),
    transform 0.2s cubic-bezier(0.4, 0, 1, 1);
}

.fade-in-scale-up-transition-enter-from,
.fade-in-scale-up-transition-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

.fade-in-scale-up-transition-leave-from,
.fade-in-scale-up-transition-enter-to {
  opacity: 1;
  transform: scale(1);
}
</style>
