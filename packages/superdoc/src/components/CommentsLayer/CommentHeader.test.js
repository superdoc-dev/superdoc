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

  describe('tracked-change own vs other permissions (SD-3845)', () => {
    const denyOwnAllowOtherResolver = (permission) =>
      permission === PERMISSIONS.RESOLVE_OTHER || permission === PERMISSIONS.REJECT_OTHER;

    const otherUserTrackedChange = () =>
      makeComment({
        trackedChange: true,
        trackedChangeType: 'trackInsert',
        creatorId: 'alice-id',
        creatorEmail: 'alice@other.test',
        creatorName: 'Alice',
        getCommentUser: () => ({ id: 'alice-id', name: 'Alice', email: 'alice@other.test' }),
      });

    const ownTrackedChange = () =>
      makeComment({
        trackedChange: true,
        trackedChangeType: 'trackInsert',
      });

    it('requests OTHER permissions and shows Accept and Reject for another user tracked change', () => {
      isAllowedMock = vi.fn(denyOwnAllowOtherResolver);
      const wrapper = mountHeader({
        currentUser: { id: 'bob-id', email: 'bob@example.com', name: 'Bob' },
        comment: otherUserTrackedChange(),
      });

      expect(isAllowedMock).toHaveBeenCalledWith(
        PERMISSIONS.RESOLVE_OTHER,
        'editor',
        false,
        expect.objectContaining({ comment: expect.objectContaining({ trackedChange: true }) }),
      );
      expect(isAllowedMock).toHaveBeenCalledWith(
        PERMISSIONS.REJECT_OTHER,
        'editor',
        false,
        expect.objectContaining({ comment: expect.objectContaining({ trackedChange: true }) }),
      );
      expect(wrapper.find('[data-comment-action="resolve"]').exists()).toBe(true);
      expect(wrapper.find('[data-comment-action="reject"]').exists()).toBe(true);
    });

    it('hides Accept and Reject for the current user tracked change when OWN is denied', () => {
      isAllowedMock = vi.fn(denyOwnAllowOtherResolver);
      const wrapper = mountHeader({
        currentUser: { id: 'alice-id', email: 'shared@example.com', name: 'Alice' },
        comment: ownTrackedChange(),
      });

      expect(isAllowedMock).toHaveBeenCalledWith(PERMISSIONS.RESOLVE_OWN, 'editor', false, expect.any(Object));
      expect(isAllowedMock).toHaveBeenCalledWith(PERMISSIONS.REJECT_OWN, 'editor', false, expect.any(Object));
      expect(wrapper.find('[data-comment-action="resolve"]').exists()).toBe(false);
      expect(wrapper.find('[data-comment-action="reject"]').exists()).toBe(false);
    });

    it('hides Reject for another user tracked change when REJECT_OTHER is denied', () => {
      isAllowedMock = vi.fn((permission) => permission === PERMISSIONS.RESOLVE_OTHER);
      const wrapper = mountHeader({
        currentUser: { id: 'bob-id', email: 'bob@example.com', name: 'Bob' },
        comment: otherUserTrackedChange(),
      });

      expect(wrapper.find('[data-comment-action="resolve"]').exists()).toBe(true);
      expect(wrapper.find('[data-comment-action="reject"]').exists()).toBe(false);
      expect(isAllowedMock).toHaveBeenCalledWith(
        PERMISSIONS.RESOLVE_OTHER,
        'editor',
        false,
        expect.objectContaining({ comment: expect.objectContaining({ trackedChange: true }) }),
      );
      expect(isAllowedMock).toHaveBeenCalledWith(
        PERMISSIONS.REJECT_OTHER,
        'editor',
        false,
        expect.objectContaining({ comment: expect.objectContaining({ trackedChange: true }) }),
      );
    });

    it('classifies an unattributed tracked change as OTHER when identity is unavailable', () => {
      isAllowedMock = vi.fn(denyOwnAllowOtherResolver);
      const wrapper = mountHeader({
        currentUser: { id: null, email: null, name: 'Alice' },
        comment: makeComment({
          trackedChange: true,
          trackedChangeType: 'trackInsert',
          creatorId: null,
          creatorEmail: null,
          creatorName: null,
          getCommentUser: () => ({ id: null, name: null, email: null }),
        }),
      });

      expect(isAllowedMock).toHaveBeenCalledWith(PERMISSIONS.RESOLVE_OTHER, 'editor', false, expect.any(Object));
      expect(isAllowedMock).toHaveBeenCalledWith(PERMISSIONS.REJECT_OTHER, 'editor', false, expect.any(Object));
      expect(wrapper.find('[data-comment-action="resolve"]').exists()).toBe(true);
      expect(wrapper.find('[data-comment-action="reject"]').exists()).toBe(true);
    });

    it('classifies case-mismatched actor ids as OTHER, matching classifyOwnership', () => {
      isAllowedMock = vi.fn(
        (permission) => permission === PERMISSIONS.RESOLVE_OWN || permission === PERMISSIONS.REJECT_OWN,
      );
      const wrapper = mountHeader({
        currentUser: { id: 'USER-42', email: 'alice@test.com', name: 'Alice' },
        comment: makeComment({
          trackedChange: true,
          trackedChangeType: 'trackInsert',
          creatorId: 'user-42',
          creatorEmail: 'alice@test.com',
          creatorName: 'Alice',
          getCommentUser: () => ({ id: 'user-42', name: 'Alice', email: 'alice@test.com' }),
        }),
      });

      expect(isAllowedMock).toHaveBeenCalledWith(PERMISSIONS.RESOLVE_OTHER, 'editor', false, expect.any(Object));
      expect(isAllowedMock).toHaveBeenCalledWith(PERMISSIONS.REJECT_OTHER, 'editor', false, expect.any(Object));
      expect(wrapper.find('[data-comment-action="resolve"]').exists()).toBe(false);
      expect(wrapper.find('[data-comment-action="reject"]').exists()).toBe(false);
    });

    it('classifies matching ids with conflicting imported-author provenance as OTHER', () => {
      isAllowedMock = vi.fn(
        (permission) => permission === PERMISSIONS.RESOLVE_OWN || permission === PERMISSIONS.REJECT_OWN,
      );
      const wrapper = mountHeader({
        currentUser: { id: 'alice-id', email: 'alice@example.com', name: 'Alice Current' },
        comment: makeComment({
          trackedChange: true,
          trackedChangeType: 'trackInsert',
          creatorId: 'alice-id',
          creatorEmail: 'alice@example.com',
          creatorName: 'Reconciled Author',
          importedAuthor: { name: 'Bob Imported' },
          getCommentUser: () => ({ id: 'alice-id', name: 'Reconciled Author', email: 'alice@example.com' }),
        }),
      });

      expect(isAllowedMock).toHaveBeenCalledWith(PERMISSIONS.RESOLVE_OTHER, 'editor', false, expect.any(Object));
      expect(isAllowedMock).toHaveBeenCalledWith(PERMISSIONS.REJECT_OTHER, 'editor', false, expect.any(Object));
      expect(wrapper.find('[data-comment-action="resolve"]').exists()).toBe(false);
      expect(wrapper.find('[data-comment-action="reject"]').exists()).toBe(false);
    });

    it('classifies a name-only imported tracked change as OTHER', () => {
      isAllowedMock = vi.fn(denyOwnAllowOtherResolver);
      const wrapper = mountHeader({
        currentUser: { id: null, email: null, name: 'Alice Owner' },
        comment: makeComment({
          trackedChange: true,
          trackedChangeType: 'trackInsert',
          creatorId: null,
          creatorEmail: null,
          creatorName: 'Alice Owner',
          origin: 'word',
          importedAuthor: { name: 'Alice Owner' },
          getCommentUser: () => ({ id: null, name: 'Alice Owner', email: null }),
        }),
      });

      expect(isAllowedMock).toHaveBeenCalledWith(PERMISSIONS.RESOLVE_OTHER, 'editor', false, expect.any(Object));
      expect(isAllowedMock).toHaveBeenCalledWith(PERMISSIONS.REJECT_OTHER, 'editor', false, expect.any(Object));
      expect(wrapper.find('[data-comment-action="resolve"]').exists()).toBe(true);
      expect(wrapper.find('[data-comment-action="reject"]').exists()).toBe(true);
    });
  });
});
