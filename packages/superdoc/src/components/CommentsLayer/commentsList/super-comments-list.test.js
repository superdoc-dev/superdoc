import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { createPinia } from 'pinia';

vi.mock('./commentsList.vue', () => ({
  default: defineComponent({
    name: 'CommentsListStub',
    setup() {
      return () => h('div', { class: 'comments-list-stub' });
    },
  }),
}));

vi.mock('@superdoc/common', () => ({
  vClickOutside: { mounted: vi.fn(), unmounted: vi.fn() },
}));

import { SuperComments } from './super-comments-list.js';

describe('SuperComments', () => {
  let element;
  const superdocStub = { id: 'sd-1' };

  beforeEach(() => {
    element = document.createElement('div');
    document.body.appendChild(element);
  });

  it('mounts the Vue app into the provided element on construction', () => {
    const instance = new SuperComments({ element, comments: [] }, superdocStub);
    expect(instance.app).not.toBeNull();
    expect(instance.element).toBe(element);
    expect(element.querySelector('.comments-list-stub')).not.toBeNull();
  });

  it('exposes the merged config', () => {
    const comments = [{ id: 'c-1' }];
    const instance = new SuperComments({ element, comments }, superdocStub);
    expect(instance.config.comments).toBe(comments);
    expect(instance.config.element).toBe(element);
  });

  it('exposes the superdoc reference as $superdoc on the Vue app', () => {
    const instance = new SuperComments({ element }, superdocStub);
    expect(instance.app.config.globalProperties.$superdoc).toBe(superdocStub);
  });

  it('reuses the parent SuperDoc pinia instance when available', () => {
    const pinia = createPinia();
    const instance = new SuperComments({ element }, { ...superdocStub, pinia });
    expect(instance.app.config.globalProperties.$pinia).toBe(pinia);
  });

  it('inherits parent app provides when mounting inside an existing SuperDoc app', () => {
    const parentProvides = { theme: 'shared-theme' };
    const instance = new SuperComments(
      { element },
      {
        ...superdocStub,
        app: {
          _context: {
            provides: parentProvides,
          },
        },
      },
    );

    expect(Object.getPrototypeOf(instance.app._context.provides)).toBe(parentProvides);
  });

  it('resolves element via selector when no element is provided', () => {
    const el = document.createElement('div');
    el.id = 'my-comments-host';
    document.body.appendChild(el);
    const instance = new SuperComments({ selector: 'my-comments-host' }, superdocStub);
    expect(instance.element).toBe(el);
  });

  it('close() unmounts the app and clears refs', () => {
    const instance = new SuperComments({ element }, superdocStub);
    instance.close();
    expect(instance.app).toBeNull();
    expect(instance.container).toBeNull();
    expect(instance.element).toBeNull();
  });

  it('close() is a no-op when there is no app', () => {
    const instance = new SuperComments({ element }, superdocStub);
    instance.close();
    expect(() => instance.close()).not.toThrow();
  });

  it('open() re-creates the app after close', () => {
    const instance = new SuperComments({ element }, superdocStub);
    instance.close();
    // Re-provide element and re-open
    instance.element = document.body.appendChild(document.createElement('div'));
    instance.open();
    expect(instance.app).not.toBeNull();
  });
});
