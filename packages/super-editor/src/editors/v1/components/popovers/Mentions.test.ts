import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import Mentions from './Mentions.vue';

describe('Mentions.vue rendering', () => {
  let wrapper: ReturnType<typeof mount> | undefined;
  let documentMousedown: ReturnType<typeof vi.fn> | undefined;

  afterEach(() => {
    wrapper?.unmount();
    if (documentMousedown) document.removeEventListener('mousedown', documentMousedown);
  });

  it('keeps the user row mounted through the first click', () => {
    const user = { name: 'Alice', email: 'alice@example.com', role: 'editor' };
    const insertMention = vi.fn();
    documentMousedown = vi.fn();
    document.addEventListener('mousedown', documentMousedown);

    wrapper = mount(Mentions, {
      attachTo: document.body,
      props: {
        users: [user],
        insertMention,
      },
    });

    const row = wrapper.get('.user-row');
    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    row.element.dispatchEvent(mousedown);

    expect(mousedown.defaultPrevented).toBe(true);
    expect(documentMousedown).not.toHaveBeenCalled();

    row.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(insertMention).toHaveBeenCalledOnce();
    expect(insertMention).toHaveBeenCalledWith(user);
  });
});
