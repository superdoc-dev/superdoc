<script setup>
import { computed, nextTick, onBeforeUnmount, ref, useAttrs, watch } from 'vue';

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

let closeTimeout = null;
let openTimeout = null;

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

const updatePosition = () => {
  if (!triggerRef.value || !contentRef.value) return;

  const triggerRect = triggerRef.value.getBoundingClientRect();
  const contentWidth = contentRef.value.offsetWidth;
  const contentHeight = contentRef.value.offsetHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const gutter = 8;

  let left = triggerRect.left + triggerRect.width / 2 - contentWidth / 2;
  left = Math.max(gutter, Math.min(left, viewportWidth - contentWidth - gutter));

  position.value = {
    top: `${triggerRect.top - contentHeight - 10}px`,
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
};

const close = () => {
  clearOpenTimeout();
  clearCloseTimeout();
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
        <span class="sd-tooltip-arrow" aria-hidden="true" />
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
  background-color: #262626;
  color: #fff;
  font-size: 14px;
  line-height: 1.3;
  border-radius: 6px;
  padding: 8px 14px;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.28);
  pointer-events: auto;
  white-space: nowrap;
}

.sd-tooltip-arrow {
  position: absolute;
  left: 50%;
  bottom: -5px;
  width: 10px;
  height: 10px;
  background-color: #262626;
  transform: translateX(-50%) rotate(45deg);
}

.fade-in-scale-up-transition-enter-active,
.fade-in-scale-up-transition-leave-active {
  transform-origin: bottom center;
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
