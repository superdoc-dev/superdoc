import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

let commentsStoreStub;
let isAllowedMock;

const { PERMISSIONS } = vi.hoisted(() => ({
  PERMISSIONS: {
    RESOLVE_OWN: 'RESOLVE_OWN',
    RESOLVE_OTHER: 'RESOLVE_OTHER',
    REJECT_OWN: 'REJECT_OWN',
    REJECT_OTHER: 'REJECT_OTHER',
    COMMENTS_DELETE_OWN: 'COMMENTS_DELETE_OWN',
    COMMENTS_DELETE_OTHER: 'COMMENTS_DELETE_OTHER',
  },
}));

vi.mock('@superdoc/stores/comments-store', () => ({
  useCommentsStore: () => commentsStoreStub,
}));

vi.mock('@superdoc/core/collaboration/permissions.js', () => ({
  PERMISSIONS,
  isAllowed: (...args) => isAllowedMock(...args),
}));

vi.mock('@superdoc/composables/useUiFontFamily.js', () => ({
  useUiFontFamily: () => ({ uiFontFamily: 'Test Sans' }),
}));

vi.mock('@superdoc/components/general/Avatar.vue', () => ({
  default: defineComponent({
    name: 'AvatarStub',
    props: ['user'],
    setup(props) {
      return () => h('div', { class: 'avatar-stub' }, props.user?.name ?? '');
    },
  }),
}));

vi.mock('./CommentsDropdown.vue', () => ({
  default: defineComponent({
    name: 'CommentsDropdownStub',
    props: ['options'],
    setup(props, { slots }) {
      return () =>
        h('div', { class: 'comments-dropdown-stub' }, [
          h('span', { class: 'options-labels' }, (props.options ?? []).map((option) => option.label).join(',')),
          slots.default?.(),
        ]);
    },
  }),
}));

import CommentHeader from './CommentHeader.vue';

const makeComment = (overrides = {}) => ({
  creatorId: 'alice-id',
  creatorEmail: 'shared@example.com',
  creatorName: 'Alice',
  createdTime: Date.now(),
  resolvedTime: null,
  trackedChange: false,
  parentCommentId: null,
  trackedChangeParentId: null,
  origin: null,
  importedAuthor: null,
  getCommentUser: () => ({ id: 'alice-id', name: 'Alice', email: 'shared@example.com' }),
  ...overrides,
});

const mountHeader = ({ currentUser, comment, config = { readOnly: false } }) =>
  mount(CommentHeader, {
    props: {
      config,
      comment,
      isActive: true,
    },
    global: {
      config: {
        globalProperties: {
          $superdoc: {
            config: {
              role: 'editor',
              isInternal: false,
              user: currentUser,
            },
          },
        },
      },
    },
  });

describe('CommentHeader.vue', () => {
  beforeEach(() => {
    commentsStoreStub = {
      pendingComment: null,
    };
    isAllowedMock = vi.fn((permission) => permission === PERMISSIONS.COMMENTS_DELETE_OWN);
  });

  it('does not treat same-email different-id comments as own comments', () => {
    const wrapper = mountHeader({
      currentUser: { id: 'bob-id', email: 'shared@example.com', name: 'Bob' },
      comment: makeComment(),
    });

    expect(wrapper.find('.comments-dropdown-stub').exists()).toBe(false);
    expect(isAllowedMock).toHaveBeenCalledWith(
      PERMISSIONS.COMMENTS_DELETE_OTHER,
      'editor',
      false,
      expect.objectContaining({ comment: expect.any(Object) }),
    );
  });

  it('allows the anonymous default user to edit comments created in the same session', () => {
    const wrapper = mountHeader({
      currentUser: { id: null, email: null, name: 'Default SuperDoc user' },
      comment: makeComment({
        creatorId: null,
        creatorEmail: null,
        creatorName: 'Default SuperDoc user',
        getCommentUser: () => ({ id: null, name: 'Default SuperDoc user', email: null }),
      }),
    });

    expect(wrapper.find('.options-labels').text()).toContain('Edit');
  });

  it('keeps the imported tag for a different actor even when emails match', () => {
    const wrapper = mountHeader({
      currentUser: { id: 'bob-id', email: 'shared@example.com', name: 'Bob' },
      comment: makeComment({ origin: 'word' }),
    });

    expect(wrapper.find('.imported-tag').exists()).toBe(true);
  });
});
