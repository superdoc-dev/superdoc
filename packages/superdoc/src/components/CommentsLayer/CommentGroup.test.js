import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';

let commentsStoreStub;

vi.mock('@superdoc/stores/comments-store', () => ({
  useCommentsStore: () => commentsStoreStub,
}));

vi.mock('@superdoc/components/CommentsLayer/CommentDialog.vue', () => ({
  default: defineComponent({
    name: 'CommentDialogStub',
    props: ['data', 'user', 'currentDocument', 'showGrouped'],
    setup(props) {
      return () =>
        h('div', {
          class: 'comment-dialog-stub',
          'data-id': props.data.conversationId,
        });
    },
  }),
}));

import CommentGroup from './CommentGroup.vue';

const clickOutsideDirective = { mounted: () => {}, unmounted: () => {} };

const makeConvo = (overrides = {}) => ({
  conversationId: 'c-1',
  selection: { documentId: 'doc-1' },
  isFocused: false,
  ...overrides,
});

const mountGroup = (props = {}) =>
  mount(CommentGroup, {
    props: {
      data: [makeConvo()],
      currentDocument: { id: 'doc-1' },
      parent: document.createElement('div'),
      ...props,
    },
    global: {
      directives: { 'click-outside': clickOutsideDirective },
    },
  });

describe('CommentGroup.vue', () => {
  beforeEach(() => {
    commentsStoreStub = {
      getCommentLocation: vi.fn(() => ({ top: 100, left: 20 })),
      activeComment: ref(null),
    };
  });

  it('renders the collapsed badge with the group count when no comment is active', () => {
    const wrapper = mountGroup({
      data: [makeConvo({ conversationId: 'c-1' }), makeConvo({ conversationId: 'c-2' })],
    });
    const bubble = wrapper.find('.number-bubble');
    expect(bubble.exists()).toBe(true);
    expect(bubble.text()).toBe('2');
  });

  it('applies the computed top style based on comment location', () => {
    const wrapper = mountGroup();
    const group = wrapper.find('.comments-group');
    expect(group.attributes('style')).toMatch(/top:\s*90px/);
  });

  it('renders empty style when getCommentLocation returns null', () => {
    commentsStoreStub.getCommentLocation.mockReturnValueOnce(null);
    const wrapper = mountGroup();
    // no top declared
    expect(wrapper.find('.comments-group').attributes('style') || '').not.toMatch(/top:/);
  });

  it('renders nothing-style (no attr) when data is empty', () => {
    const wrapper = mountGroup({ data: [] });
    const style = wrapper.find('.comments-group').attributes('style');
    expect(style === undefined || style === '').toBe(true);
  });

  it('expands and renders CommentDialogs when clicked', async () => {
    const wrapper = mountGroup({
      data: [makeConvo({ conversationId: 'c-1' }), makeConvo({ conversationId: 'c-2' })],
    });
    await wrapper.find('.comments-group').trigger('click');
    expect(wrapper.find('.comments-group.expanded').exists()).toBe(true);
    expect(wrapper.findAll('.comment-dialog-stub')).toHaveLength(2);
  });

  it('expands by default when the group contains the active comment', () => {
    commentsStoreStub.activeComment.value = 'c-2';
    const wrapper = mountGroup({
      data: [makeConvo({ conversationId: 'c-1' }), makeConvo({ conversationId: 'c-2' })],
    });
    // when active, the collapsed node is suppressed and expanded renders only active convo
    expect(wrapper.find('.comments-group.expanded').exists()).toBe(true);
    const dialogs = wrapper.findAll('.comment-dialog-stub');
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0].attributes('data-id')).toBe('c-2');
  });

  it('resolves getCommentLocation with the active convo selection first', () => {
    commentsStoreStub.activeComment.value = 'c-2';
    const data = [
      makeConvo({ conversationId: 'c-1', selection: { documentId: 'doc-1', page: 1 } }),
      makeConvo({ conversationId: 'c-2', selection: { documentId: 'doc-1', page: 9 } }),
    ];
    mountGroup({ data });
    expect(commentsStoreStub.getCommentLocation).toHaveBeenCalledWith(data[1].selection, expect.any(Object));
  });
});
