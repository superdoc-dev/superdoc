import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import CommentInputSource from './CommentInput.vue?raw';
import CommentInput from './CommentInput.vue';
import { useCommentsStore } from '../../stores/comments-store.js';

describe('CommentInput.vue', () => {
  let commentsStore;

  const mountInput = () =>
    mount(CommentInput, {
      props: {
        users: [],
        config: { readOnly: false },
        includeHeader: false,
        comment: {},
      },
    });

  beforeEach(() => {
    setActivePinia(createPinia());
    commentsStore = useCommentsStore();
    commentsStore.currentCommentText = '';
  });

  it('renders the native composer as a compact non-resizable field', () => {
    const wrapper = mountInput();
    const textarea = wrapper.find('textarea.superdoc-field');

    expect(textarea.exists()).toBe(true);
    expect(textarea.attributes('rows')).toBe('1');
    expect(CommentInputSource).toContain('resize: none;');
    expect(CommentInputSource).toContain('min-height: 28px;');
  });

  it('round-trips textarea text through the rich HTML comment draft', async () => {
    commentsStore.currentCommentText = '<p>Existing</p>';
    const wrapper = mountInput();
    const textarea = wrapper.find('textarea.superdoc-field');

    expect(textarea.element.value).toBe('Existing');

    await textarea.setValue('Line one\nLine two');

    expect(commentsStore.currentCommentText).toBe('<p>Line one<br>Line two</p>');
  });
});
