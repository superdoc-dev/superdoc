<script setup>
import { onMounted, onBeforeUnmount, markRaw } from 'vue';
import { TextSelection } from 'prosemirror-state';
import { getEditorSurfaceElement } from '../../core/helpers/editorSurface.js';
import { moveCursorToMouseEvent, selectionHasNodeOrMark } from '../cursor-helpers.js';
import LinkInput from '../toolbar/LinkInput.vue';

const props = defineProps({
  editor: {
    type: Object,
    required: true,
  },
  openPopover: {
    type: Function,
    required: true,
  },
  closePopover: {
    type: Function,
    required: true,
  },
  popoverVisible: {
    type: Boolean,
    default: false,
  },
  linkPopoverResolver: {
    type: Function,
    default: undefined,
  },
});

// ─── Constants ──────────────────────────────────────────────────────────────

let lastLinkClickTime = 0;

/** Prevents double-handling when both pointerdown and click dispatch the event */
const LINK_CLICK_DEBOUNCE_MS = 300;

/** Delay for editor state to settle after cursor movement */
const CURSOR_UPDATE_TIMEOUT_MS = 10;

/** Offset below the click point where the popover appears */
const POPOVER_VERTICAL_OFFSET_PX = 15;

/** Matches GenericPopover's visual treatment so external popovers look native */
const EXTERNAL_POPOVER_STYLES = {
  position: 'absolute',
  zIndex: 'var(--sd-external-link-popover-z-index, var(--sd-popover-z-index, 1000))',
  borderRadius: 'var(--sd-external-link-popover-radius, var(--sd-popover-radius, 6px))',
  boxShadow:
    'var(--sd-external-link-popover-shadow, var(--sd-popover-shadow, 0 0 0 1px rgba(0, 0, 0, 0.05), 0px 10px 20px rgba(0, 0, 0, 0.1)))',
  minWidth: 'var(--sd-external-link-popover-min-width, var(--sd-popover-min-width, 120px))',
  minHeight: 'var(--sd-external-link-popover-min-height, var(--sd-popover-min-height, 40px))',
  backgroundColor: 'var(--sd-external-link-popover-bg, var(--sd-popover-bg, white))',
};

// ─── External popover lifecycle ─────────────────────────────────────────────

/**
 * Tracks the currently active external (framework-agnostic) popover.
 * Null when no external popover is open.
 *
 * @type {{ container: HTMLElement, destroyFn: Function|null, onPointerDown: Function, onKeyDown: Function } | null}
 */
let activeExternalPopover = null;

/**
 * Tear down the active external popover: call the customer's destroy(),
 * remove the container from the DOM, detach global listeners, and
 * return focus to the editor.
 */
const cleanupExternalPopover = () => {
  if (!activeExternalPopover) return;

  const { container, destroyFn, onPointerDown, onKeyDown } = activeExternalPopover;
  activeExternalPopover = null;

  try {
    destroyFn?.();
  } catch {
    // Swallow cleanup errors — the customer's destroy() should not break the editor
  }

  container.remove();
  document.removeEventListener('pointerdown', onPointerDown);
  document.removeEventListener('keydown', onKeyDown);
  props.editor?.view?.focus();
};

// ─── Position computation ───────────────────────────────────────────────────

/**
 * Compute popover coordinates relative to the editor surface.
 *
 * @param {{ clientX: number, clientY: number }} detail - Click coordinates
 * @param {HTMLElement} surface - Editor surface element
 * @returns {{ left: string, top: string } | null}
 */
const computePopoverPosition = (detail, surface) => {
  const rect = surface.getBoundingClientRect();
  if (!rect) return null;

  return {
    left: `${detail.clientX - rect.left}px`,
    top: `${detail.clientY - rect.top + POPOVER_VERTICAL_OFFSET_PX}px`,
  };
};

// ─── Popover openers ────────────────────────────────────────────────────────

/**
 * Open the built-in LinkInput popover (default path).
 *
 * @param {{ left: string, top: string }} position
 */
const openDefaultPopover = (position) => {
  props.openPopover(
    markRaw(LinkInput),
    {
      showInput: true,
      editor: props.editor,
      closePopover: props.closePopover,
    },
    position,
  );
};

/**
 * Open a customer-supplied Vue component inside GenericPopover.
 *
 * @param {{ component: unknown, props?: Record<string, unknown> }} resolution
 * @param {{ left: string, top: string }} position
 */
const openCustomPopover = (resolution, position) => {
  props.openPopover(
    markRaw(resolution.component),
    {
      editor: props.editor,
      closePopover: props.closePopover,
      ...(resolution.props || {}),
    },
    position,
  );
};

/**
 * Mount a framework-agnostic popover by creating a positioned DOM container
 * and handing it to the customer's render() function.
 *
 * Lifecycle mirrors GenericPopover: click-outside (pointerdown) and Escape close
 * the popover. The customer's optional destroy() callback is invoked on close.
 *
 * @param {{ render: Function }} resolution
 * @param {{ left: string, top: string }} position
 * @param {Object} detail - Original event detail (href, etc.)
 * @param {HTMLElement} surface - Editor surface element
 */
const openExternalPopover = (resolution, position, detail, surface) => {
  cleanupExternalPopover();

  // Create container with the same visual treatment as GenericPopover
  const container = document.createElement('div');
  container.classList.add('sd-external-link-popover');
  Object.assign(container.style, EXTERNAL_POPOVER_STYLES, {
    left: position.left,
    top: position.top,
  });

  // Stop events inside the popover from triggering click-outside
  container.addEventListener('pointerdown', (e) => e.stopPropagation());
  container.addEventListener('click', (e) => e.stopPropagation());

  // Mount into the same coordinate-space parent that GenericPopover uses.
  // GenericPopover renders as a child of .super-editor-container (outside .super-editor).
  // We must mount here too, because .super-editor has overflow:hidden which clips popovers.
  const mountTarget = surface.closest('.super-editor-container') ?? surface.parentElement;
  if (!mountTarget) return;
  mountTarget.appendChild(container);

  // Hand the container to the customer
  let renderResult;
  try {
    renderResult = resolution.render({
      container,
      closePopover: cleanupExternalPopover,
      editor: props.editor,
      href: detail.href ?? '',
    });
  } catch (error) {
    container.remove();
    props.editor.options?.onException?.({ error, editor: props.editor });
    openDefaultPopover(position);
    return;
  }

  // Click-outside and Escape handlers (same pattern as GenericPopover)
  const onPointerDown = (event) => {
    if (!container.contains(event.target)) cleanupExternalPopover();
  };
  const onKeyDown = (event) => {
    if (event.key === 'Escape') cleanupExternalPopover();
  };

  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('keydown', onKeyDown);

  activeExternalPopover = {
    container,
    destroyFn: typeof renderResult?.destroy === 'function' ? renderResult.destroy : null,
    onPointerDown,
    onKeyDown,
  };
};

// ─── Resolver dispatch ──────────────────────────────────────────────────────

/**
 * Determine which popover to open based on the linkPopoverResolver config.
 * Falls back to the default LinkInput popover for:
 * - No resolver configured
 * - null / undefined / { type: 'default' }
 * - Resolver throws (also calls onException)
 * - { type: 'custom' } with missing component
 * - { type: 'external' } with missing render function
 * - Unknown resolution type
 *
 * @param {Object} detail - Event detail from superdoc-link-click
 * @param {HTMLElement} surface - Editor surface element
 */
const resolveAndOpenPopover = (detail, surface) => {
  const position = computePopoverPosition(detail, surface);
  if (!position) return;

  // No resolver → open default
  if (typeof props.linkPopoverResolver !== 'function') {
    openDefaultPopover(position);
    return;
  }

  // Build resolver context
  const href = detail.href ?? '';

  /** @type {import('../../core/types/EditorConfig.js').LinkPopoverContext} */
  const ctx = {
    editor: props.editor,
    href,
    target: detail.target ?? null,
    rel: detail.rel ?? null,
    tooltip: detail.tooltip ?? null,
    element: detail.element,
    clientX: detail.clientX,
    clientY: detail.clientY,
    isAnchorLink: href.startsWith('#') && href.length > 1,
    documentMode: props.editor.options?.documentMode ?? 'editing',
    position,
    closePopover: props.closePopover,
  };

  // Call resolver with error boundary
  let resolution;
  try {
    resolution = props.linkPopoverResolver(ctx);
  } catch (error) {
    props.editor.options?.onException?.({ error, editor: props.editor });
    openDefaultPopover(position);
    return;
  }

  // Dispatch on resolution type
  if (!resolution || resolution.type === 'default') {
    openDefaultPopover(position);
    return;
  }

  if (resolution.type === 'none') {
    return;
  }

  if (resolution.type === 'custom') {
    if (!resolution.component) {
      openDefaultPopover(position);
      return;
    }
    openCustomPopover(resolution, position);
    return;
  }

  if (resolution.type === 'external') {
    if (typeof resolution.render !== 'function') {
      openDefaultPopover(position);
      return;
    }
    openExternalPopover(resolution, position, detail, surface);
    return;
  }

  // Unknown resolution type
  openDefaultPopover(position);
};

/**
 * Open a hyperlink when the editor is in viewing mode.
 * Internal document anchors stay within the document; other URLs use browser navigation.
 *
 * @param {Object} detail - Event detail from superdoc-link-click
 */
const openLinkInViewingMode = (detail) => {
  const href = detail.href ?? '';
  if (!href) return;

  if (href.startsWith('#') && href.length > 1) {
    const presentationEditor = props.editor?.presentationEditor ?? null;
    presentationEditor?.goToAnchor?.(href);
    return;
  }

  const target = detail.target || '_self';
  const relTokens = String(detail.rel ?? '')
    .split(/\s+/)
    .filter(Boolean);
  const features = ['noopener', 'noreferrer'].filter((token) => relTokens.includes(token)).join(',');

  window.open(href, target, features || undefined);
};

const isImageLinkClick = (detail) =>
  detail.element instanceof HTMLElement && detail.element.querySelector('img') !== null;

// ─── Link click handler ─────────────────────────────────────────────────────

/**
 * Handle link click events from layout-engine rendered links.
 * Listens for the custom 'superdoc-link-click' event dispatched by
 * link elements in the DOM painter.
 *
 * @param {CustomEvent} event - Custom event with link metadata in event.detail
 */
const handleLinkClick = (event) => {
  const detail = event?.detail ?? {};
  const linkElement = detail.element;
  const now = Date.now();

  // Debounce to prevent double-handling (pointerdown + click both dispatch events)
  if (now - lastLinkClickTime < LINK_CLICK_DEBOUNCE_MS) {
    return;
  }
  lastLinkClickTime = now;

  // If any popover is already visible, close it and don't reopen.
  // This preserves the toggle-off behavior and runs BEFORE the resolver.
  if (props.popoverVisible || activeExternalPopover) {
    if (props.popoverVisible) props.closePopover();
    cleanupExternalPopover();
    return;
  }

  if (!props.editor || !props.editor.state) {
    return;
  }

  if (props.editor.options?.documentMode === 'viewing') {
    openLinkInViewingMode(detail);
    return;
  }

  if (isImageLinkClick(detail)) {
    openLinkInViewingMode(detail);
    return;
  }

  const surface = getEditorSurfaceElement(props.editor);
  if (!surface) {
    return;
  }

  // Move cursor to the clicked link position
  const pmStart = linkElement?.dataset?.pmStart;

  if (pmStart != null) {
    const pos = parseInt(pmStart, 10);
    const state = props.editor.state;
    const doc = state.doc;

    if (!isNaN(pos) && pos >= 0 && pos <= doc.content.size) {
      const tr = state.tr.setSelection(TextSelection.create(doc, pos));
      props.editor.dispatch(tr);
    } else {
      console.warn(`Invalid PM position from data-pm-start: ${pmStart}, falling back to coordinate-based positioning`);
      moveCursorToMouseEvent(detail, props.editor);
    }
  } else {
    moveCursorToMouseEvent(detail, props.editor);
  }

  // Wait for editor state to settle, then open popover if cursor landed on a link
  setTimeout(() => {
    const currentState = props.editor.state;
    const $from = currentState.selection.$from;
    const linkMarkType = currentState.schema.marks.link;

    const nodeAfter = $from.nodeAfter;
    const nodeBefore = $from.nodeBefore;
    const marksOnNodeAfter = nodeAfter?.marks || [];
    const marksOnNodeBefore = nodeBefore?.marks || [];

    const linkOnNodeAfter = linkMarkType && marksOnNodeAfter.some((m) => m.type === linkMarkType);
    const linkOnNodeBefore = linkMarkType && marksOnNodeBefore.some((m) => m.type === linkMarkType);
    const hasLinkAdjacent = linkOnNodeAfter || linkOnNodeBefore;
    const hasLink = selectionHasNodeOrMark(currentState, 'link', { requireEnds: true });

    if (hasLink || hasLinkAdjacent) {
      resolveAndOpenPopover(detail, surface);
    }
  }, CURSOR_UPDATE_TIMEOUT_MS);
};

// ─── Lifecycle ──────────────────────────────────────────────────────────────

/** @type {HTMLElement | null} */
let surfaceElement = null;

onMounted(() => {
  if (!props.editor) return;

  surfaceElement = getEditorSurfaceElement(props.editor);
  if (surfaceElement) {
    surfaceElement.addEventListener('superdoc-link-click', handleLinkClick);
  }
});

onBeforeUnmount(() => {
  if (surfaceElement) {
    surfaceElement.removeEventListener('superdoc-link-click', handleLinkClick);
  }
  cleanupExternalPopover();
});
</script>

<template>
  <!-- This component has no visual output - it only handles events -->
</template>
