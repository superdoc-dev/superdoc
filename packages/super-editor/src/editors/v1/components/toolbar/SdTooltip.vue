<script setup>
import { computed, nextTick, onBeforeUnmount, ref, useAttrs, watch } from 'vue';
import { getAnchoredPosition } from '../../utils/anchored-position';

defineOptions({
  inheritAttrs: false,
});

const props = defineProps({
  trigger: {
    type: String,
    default: 'hover',
  },
  delay: {
    type: Number,
    default: 100,
  },
  duration: {
    type: Number,
    default: 100,
  },
  autoHideDuration: {
    type: Number,
    default: 0,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  contentStyle: {
    type: Object,
    default: () => ({}),
  },
});

const attrs = useAttrs();

const isOpen = ref(false);
const triggerRef = ref(null);
const contentRef = ref(null);
const position = ref({ top: '0px', left: '0px' });
const placement = ref('top');

let closeTimeout = null;
let openTimeout = null;
let autoHideTimeout = null;

const mergedContentClass = computed(() => ['sd-tooltip-content', attrs.class]);
const contentStyle = computed(() => ({
  ...props.contentStyle,
  ...(attrs.style || {}),
  position: 'fixed',
  top: position.value.top,
  left: position.value.left,
  zIndex: 2100,
}));

const clearCloseTimeout = () => {
  if (closeTimeout) {
    window.clearTimeout(closeTimeout);
    closeTimeout = null;
  }
};

const clearOpenTimeout = () => {
  if (openTimeout) {
    window.clearTimeout(openTimeout);
    openTimeout = null;
  }
};

const clearAutoHideTimeout = () => {
  if (autoHideTimeout) {
    window.clearTimeout(autoHideTimeout);
    autoHideTimeout = null;
  }
};

const scheduleAutoHide = () => {
  clearAutoHideTimeout();
  if (props.autoHideDuration <= 0) return;
  autoHideTimeout = window.setTimeout(() => {
    autoHideTimeout = null;
    close();
  }, props.autoHideDuration);
};

const updatePosition = () => {
  if (!triggerRef.value || !contentRef.value) return;

  const { top, left, computedPlacement } = getAnchoredPosition(triggerRef.value, contentRef.value, {
    placement: 'top',
    offset: 10,
  });

  placement.value = computedPlacement;
  position.value = {
    top: `${top}px`,
    left: `${left}px`,
  };
};

const open = async () => {
  if (props.disabled) return;
  clearCloseTimeout();
  clearOpenTimeout();
  if (isOpen.value) return;
  isOpen.value = true;
  await nextTick();
  updatePosition();
  scheduleAutoHide();
};

const close = () => {
  clearOpenTimeout();
  clearCloseTimeout();
  clearAutoHideTimeout();
  if (!isOpen.value) return;
  isOpen.value = false;
};

const openWithDelay = () => {
  clearCloseTimeout();
  clearOpenTimeout();
  if (isOpen.value) return;
  if (props.delay === 0) {
    void open();
    return;
  }
  openTimeout = window.setTimeout(() => {
    openTimeout = null;
    void open();
  }, props.delay);
};

const closeWithDelay = () => {
  clearOpenTimeout();
  clearCloseTimeout();
  if (!isOpen.value) return;
  if (props.duration === 0) {
    close();
    return;
  }
  closeTimeout = window.setTimeout(() => {
    closeTimeout = null;
    close();
  }, props.duration);
};

const handleTriggerMouseEnter = () => {
  if (props.trigger !== 'hover') return;
  openWithDelay();
};

const handleTriggerMouseLeave = () => {
  if (props.trigger !== 'hover') return;
  closeWithDelay();
};

const handleContentMouseEnter = () => {
  clearOpenTimeout();
  clearCloseTimeout();
};
const handleContentMouseLeave = () => {
  closeWithDelay();
};

const handleEscape = (event) => {
  if (event.key === 'Escape') close();
};

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) close();
  },
);

watch(isOpen, (openState) => {
  if (openState) {
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('keydown', handleEscape, true);
  } else {
    window.removeEventListener('resize', updatePosition);
    window.removeEventListener('scroll', updatePosition, true);
    document.removeEventListener('keydown', handleEscape, true);
  }
});

onBeforeUnmount(() => {
  clearOpenTimeout();
  clearCloseTimeout();
  clearAutoHideTimeout();
  window.removeEventListener('resize', updatePosition);
  window.removeEventListener('scroll', updatePosition, true);
  document.removeEventListener('keydown', handleEscape, true);
});
</script>

<template>
  <span
    ref="triggerRef"
    class="sd-tooltip-trigger"
    @mouseenter="handleTriggerMouseEnter"
    @mouseleave="handleTriggerMouseLeave"
    @focusin="handleTriggerMouseEnter"
    @focusout="handleTriggerMouseLeave"
  >
    <slot name="trigger" />
  </span>

  <Teleport to="body">
    <Transition name="fade-in-scale-up-transition">
      <div
        v-if="isOpen && !disabled"
        ref="contentRef"
        :class="mergedContentClass"
        :style="contentStyle"
        @mouseenter="handleContentMouseEnter"
        @mouseleave="handleContentMouseLeave"
      >
        <span :class="`sd-tooltip-arrow sd-tooltip-arrow-${placement}`" aria-hidden="true" />
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sd-tooltip-trigger {
  display: inline-flex;
}

.sd-tooltip-content {
  background-color: var(--sd-ui-tooltip-bg, #262626);
  color: var(--sd-ui-tooltip-text, #fff);
  font-size: var(--sd-ui-font-size-400, 14px);
  line-height: 1.3;
  border-radius: var(--sd-ui-tooltip-radius, 6px);
  padding: 8px 14px;
  box-shadow: var(--sd-ui-tooltip-shadow, 0 3px 12px rgba(0, 0, 0, 0.28));
  pointer-events: auto;
  white-space: nowrap;
}

.sd-tooltip-arrow {
  position: absolute;
  left: 50%;
  width: 10px;
  height: 10px;
  background-color: var(--sd-ui-tooltip-bg, #262626);
  transform: translateX(-50%) rotate(45deg);
}

.sd-tooltip-arrow-top {
  bottom: -5px;
}

.sd-tooltip-arrow-bottom {
  top: -5px;
}

.fade-in-scale-up-transition-enter-active,
.fade-in-scale-up-transition-leave-active {
  transform-origin: center;
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
