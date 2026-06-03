import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import {
  DEFAULT_COMMENTS_MIN_GUTTER_PX,
  DEFAULT_COMMENTS_SIDEBAR_LANE_PX,
  DEFAULT_DOCUMENT_VISIBLE_MIN_WIDTH_PX,
} from '../helpers/comment-small-screen.js';
import { useCommentSmallScreen } from './use-comment-small-screen.js';

const setClientWidth = (el, value) => {
  Object.defineProperty(el, 'clientWidth', {
    configurable: true,
    get: () => value,
  });
};

const setRectWidth = (el, value) => {
  el.getBoundingClientRect = vi.fn(() => ({ width: value }));
};

describe('useCommentSmallScreen', () => {
  let root;
  let parent;
  let layers;
  let commentsModuleConfig;

  const mountComposable = () => {
    let api;
    const Harness = defineComponent({
      setup() {
        api = useCommentSmallScreen({ commentsModuleConfig, superdocRoot: ref(root), layers: ref(layers) });
        return () => h('div');
      },
    });
    const wrapper = mount(Harness);
    return { api, wrapper };
  };

  const createMockResizeObserver = () => {
    const instances = [];
    const Original = window.ResizeObserver;
    window.ResizeObserver = vi.fn((cb) => {
      const instance = {
        observe: vi.fn(),
        disconnect: vi.fn(),
        _cb: cb,
      };
      instances.push(instance);
      return instance;
    });
    return {
      instances,
      restore: () => {
        window.ResizeObserver = Original;
      },
    };
  };

  beforeEach(() => {
    document.body.innerHTML = '';

    parent = document.createElement('div');
    root = document.createElement('div');
    layers = document.createElement('div');

    root.appendChild(layers);
    parent.appendChild(root);
    document.body.appendChild(parent);

    setClientWidth(parent, 1200);
    setClientWidth(root, 1000);
    setClientWidth(layers, 816);

    commentsModuleConfig = ref({ displayMode: 'auto' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('forces sidebar mode when displayMode is sidebar', () => {
    commentsModuleConfig.value = { displayMode: 'sidebar' };
    const { api: state, wrapper } = mountComposable();

    state.recalculateCompactCommentsMode();

    expect(state.isCompactCommentsMode.value).toBe(false);
    expect(state.superdocContainerWidth.value).toBe(1200);
    wrapper.unmount();
  });

  it('forces inline mode when displayMode is inline', () => {
    commentsModuleConfig.value = { displayMode: 'inline' };
    const { api: state, wrapper } = mountComposable();

    state.recalculateCompactCommentsMode();

    expect(state.isCompactCommentsMode.value).toBe(true);
    expect(state.superdocContainerWidth.value).toBe(1200);
    wrapper.unmount();
  });

  it('uses compactBreakpointPx when configured', () => {
    commentsModuleConfig.value = { displayMode: 'auto', compactBreakpointPx: 1100 };
    const { api: state, wrapper } = mountComposable();

    state.recalculateCompactCommentsMode();

    expect(state.superdocContainerWidth.value).toBe(1200);
    expect(state.isCompactCommentsMode.value).toBe(false);

    setClientWidth(parent, 900);
    state.recalculateCompactCommentsMode();
    expect(state.isCompactCommentsMode.value).toBe(true);
    wrapper.unmount();
  });

  it('uses measured document width formula when no explicit breakpoint', () => {
    commentsModuleConfig.value = { displayMode: 'auto' };
    const documentEl = document.createElement('div');
    documentEl.className = 'superdoc__document';
    root.appendChild(documentEl);
    setClientWidth(documentEl, 840);

    const { api: state, wrapper } = mountComposable();

    // required = docWidth + sidebar + gutter
    const required = 840 + DEFAULT_COMMENTS_SIDEBAR_LANE_PX + DEFAULT_COMMENTS_MIN_GUTTER_PX;
    setClientWidth(parent, required - 1);
    state.recalculateCompactCommentsMode();
    expect(state.isCompactCommentsMode.value).toBe(true);

    setClientWidth(parent, required + 1);
    state.recalculateCompactCommentsMode();
    expect(state.isCompactCommentsMode.value).toBe(false);
    wrapper.unmount();
  });

  it('falls back to default document width when document/layers width is unavailable', () => {
    commentsModuleConfig.value = { displayMode: 'auto' };
    setClientWidth(layers, 0);
    setRectWidth(layers, 0);

    const { api: state, wrapper } = mountComposable();

    const required =
      DEFAULT_DOCUMENT_VISIBLE_MIN_WIDTH_PX + DEFAULT_COMMENTS_SIDEBAR_LANE_PX + DEFAULT_COMMENTS_MIN_GUTTER_PX;
    setClientWidth(parent, required - 1);
    state.recalculateCompactCommentsMode();
    expect(state.isCompactCommentsMode.value).toBe(true);

    setClientWidth(parent, required + 1);
    state.recalculateCompactCommentsMode();
    expect(state.isCompactCommentsMode.value).toBe(false);
    wrapper.unmount();
  });

  it('uses compactMeasurementSelector when provided', () => {
    const shell = document.createElement('div');
    shell.id = 'measurement-shell';
    document.body.appendChild(shell);
    setClientWidth(shell, 777);

    commentsModuleConfig.value = {
      displayMode: 'sidebar',
      compactMeasurementSelector: '#measurement-shell',
    };

    const { api: state, wrapper } = mountComposable();
    state.recalculateCompactCommentsMode();

    expect(state.superdocContainerWidth.value).toBe(777);
    wrapper.unmount();
  });

  it('falls back to rect width when clientWidth is zero', () => {
    const selectorTarget = document.createElement('div');
    selectorTarget.id = 'rect-only';
    document.body.appendChild(selectorTarget);
    setClientWidth(selectorTarget, 0);
    setRectWidth(selectorTarget, 654);

    commentsModuleConfig.value = {
      displayMode: 'sidebar',
      compactMeasurementSelector: '#rect-only',
    };

    const { api: state, wrapper } = mountComposable();
    state.recalculateCompactCommentsMode();
    expect(state.superdocContainerWidth.value).toBe(654);
    wrapper.unmount();
  });

  it('falls back to layers width when document width is unavailable', () => {
    commentsModuleConfig.value = { displayMode: 'auto' };
    const documentEl = document.createElement('div');
    documentEl.className = 'superdoc__document';
    root.appendChild(documentEl);
    setClientWidth(documentEl, 0);
    setRectWidth(documentEl, 0);

    setClientWidth(layers, 700);

    const { api: state, wrapper } = mountComposable();
    const required = 700 + DEFAULT_COMMENTS_SIDEBAR_LANE_PX + DEFAULT_COMMENTS_MIN_GUTTER_PX;
    setClientWidth(parent, required - 1);
    state.recalculateCompactCommentsMode();
    expect(state.isCompactCommentsMode.value).toBe(true);
    wrapper.unmount();
  });

  it('calls recalculate from ResizeObserver callback', () => {
    const ro = createMockResizeObserver();
    const { api: state, wrapper } = mountComposable();

    state.ensureCompactMeasurementObserver();
    expect(ro.instances.length).toBeGreaterThan(0);
    expect(state.superdocContainerWidth.value).toBe(0);

    setClientWidth(parent, 432);
    ro.instances[0]._cb();

    expect(state.superdocContainerWidth.value).toBe(432);
    wrapper.unmount();
    ro.restore();
  });

  it('returns null measurement target when root is missing', () => {
    const detachedConfig = ref({ displayMode: 'auto' });
    let api;
    const Harness = defineComponent({
      setup() {
        api = useCommentSmallScreen({
          commentsModuleConfig: detachedConfig,
          superdocRoot: ref(null),
          layers: ref(null),
        });
        return () => h('div');
      },
    });
    const wrapper = mount(Harness);
    api.recalculateCompactCommentsMode();
    expect(api.superdocContainerWidth.value).toBe(0);
    wrapper.unmount();
  });

  it('does not throw when ResizeObserver is unavailable', () => {
    const originalResizeObserver = window.ResizeObserver;
    delete window.ResizeObserver;

    const { api: state, wrapper } = mountComposable();
    expect(() => state.ensureCompactMeasurementObserver()).not.toThrow();
    wrapper.unmount();

    window.ResizeObserver = originalResizeObserver;
  });

  it('disconnects ResizeObserver on unmount', () => {
    const disconnect = vi.fn();
    const observe = vi.fn();
    const originalResizeObserver = window.ResizeObserver;
    window.ResizeObserver = vi.fn(() => ({ observe, disconnect }));

    const { api, wrapper } = mountComposable();
    api.ensureCompactMeasurementObserver();

    expect(observe).toHaveBeenCalled();
    wrapper.unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);

    window.ResizeObserver = originalResizeObserver;
  });
});
