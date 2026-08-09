import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import CommentDialogSource from './CommentDialog.vue?raw';
import CommentDialog from './CommentDialog.vue';
import useComment from './use-comment.js';
import { useCommentsStore } from '../../stores/comments-store.js';
import { useSuperdocStore } from '../../stores/superdoc-store.js';

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const COMMENT_DIALOG_SOURCE = CommentDialogSource;
const ONE_BY_ONE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+KD0aVQAAAABJRU5ErkJggg==';

describe('CommentDialog', () => {
  let commentsStore;
  let superdocStore;
  let superdocStub;

  const mountDialog = (comment) =>
    mount(CommentDialog, {
      attachTo: document.body,
      props: { comment },
      global: {
        config: {
          globalProperties: {
            $superdoc: superdocStub,
          },
        },
        directives: {
          'click-outside': {},
        },
        stubs: {
          CommentHeader: true,
          CommentInput: true,
          InternalDropdown: true,
          Avatar: true,
        },
      },
    });

  beforeEach(() => {
    setActivePinia(createPinia());
    commentsStore = useCommentsStore();
    superdocStore = useSuperdocStore();
    superdocStore.documents = [{ id: 'doc-1', type: DOCX_TYPE }];
    superdocStore.user = { id: 'user-1', email: 'user@example.com', name: 'User', image: null };
    superdocStub = {
      activeEditor: {
        editorVersion: 1,
        commands: {
          setCursorById: vi.fn(),
          setActiveComment: vi.fn(),
        },
      },
      users: [],
      emit: vi.fn(),
      focus: vi.fn(),
      canPerformPermission: vi.fn(() => true),
      config: {
        role: 'editor',
        isInternal: false,
        user: superdocStore.user,
      },
    };
  });

  describe('read-only mutation defense (SD-3164)', () => {
    it('rejects stale tracked-change resolve/reject events before the store', async () => {
      commentsStore.init({ readOnly: true });
      superdocStub.activeEditor.editorVersion = 2;
      superdocStub.activeEditor.v2TrackedChanges = {
        getCapabilityState: vi.fn(() => ({ canDecide: true })),
      };
      const comment = useComment({
        commentId: 'tc-read-only',
        fileId: 'doc-1',
        commentText: '',
        trackedChange: true,
      });
      commentsStore.commentsList = [comment];
      const decide = vi.spyOn(commentsStore, 'decideTrackedChangeFromSidebar');

      const wrapper = mountDialog(comment);
      try {
        const header = wrapper.findComponent({ name: 'CommentHeader' });
        header.vm.$emit('resolve');
        header.vm.$emit('reject');
        await flushPromises();

        expect(decide).not.toHaveBeenCalled();
        expect(superdocStub.focus).not.toHaveBeenCalled();
      } finally {
        wrapper.unmount();
      }
    });

    it('rejects stale ordinary resolve/reopen/delete/edit events before the store', async () => {
      commentsStore.init({ readOnly: true, allowResolve: true });
      superdocStub.activeEditor.editorVersion = 2;
      superdocStub.activeEditor.v2Comments = {
        getCapabilityState: vi.fn(() => ({ canWrite: true })),
      };
      const comment = useComment({
        commentId: 'comment-read-only',
        fileId: 'doc-1',
        commentText: 'Keep this comment',
      });
      commentsStore.commentsList = [comment];
      const resolve = vi.spyOn(commentsStore, 'resolveCommentV2');
      const reopen = vi.spyOn(commentsStore, 'reopenCommentV2');
      const remove = vi.spyOn(commentsStore, 'deleteComment');

      const wrapper = mountDialog(comment);
      try {
        const header = wrapper.findComponent({ name: 'CommentHeader' });
        header.vm.$emit('resolve');
        header.vm.$emit('reopen');
        header.vm.$emit('overflow-select', 'delete');
        header.vm.$emit('overflow-select', 'edit');
        await flushPromises();

        expect(resolve).not.toHaveBeenCalled();
        expect(reopen).not.toHaveBeenCalled();
        expect(remove).not.toHaveBeenCalled();
        expect(commentsStore.editingCommentId).toBeNull();
      } finally {
        wrapper.unmount();
      }
    });

    it('closes reply and edit surfaces when config flips to read-only', async () => {
      commentsStore.init({ readOnly: false, allowResolve: true });
      const comment = useComment({
        commentId: 'comment-config-flip',
        fileId: 'doc-1',
        commentText: 'Config flip comment',
      });
      commentsStore.commentsList = [comment];
      commentsStore.activeComment = comment.commentId;

      const wrapper = mountDialog(comment);
      try {
        await wrapper.find('.reply-pill').trigger('click');
        expect(wrapper.find('.reply-expanded').exists()).toBe(true);

        commentsStore.init({ readOnly: true });
        await flushPromises();

        expect(wrapper.find('.reply-pill').exists()).toBe(false);
        expect(wrapper.find('.reply-expanded').exists()).toBe(false);
        expect(commentsStore.editingCommentId).toBeNull();
      } finally {
        wrapper.unmount();
      }
    });

    it('closes an active edit surface when config flips to read-only', async () => {
      commentsStore.init({ readOnly: false, allowResolve: true });
      const comment = useComment({
        commentId: 'comment-edit-config-flip',
        fileId: 'doc-1',
        commentText: 'Editing before config flip',
      });
      commentsStore.commentsList = [comment];
      commentsStore.activeComment = comment.commentId;

      const wrapper = mountDialog(comment);
      try {
        wrapper.findComponent({ name: 'CommentHeader' }).vm.$emit('overflow-select', 'edit');
        await flushPromises();
        expect(commentsStore.editingCommentId).toBe(comment.commentId);
        expect(wrapper.find('.reply-expanded').exists()).toBe(true);

        commentsStore.init({ readOnly: true });
        await flushPromises();

        expect(commentsStore.editingCommentId).toBeNull();
        expect(wrapper.find('.reply-expanded').exists()).toBe(false);
      } finally {
        wrapper.unmount();
      }
    });

    it('hides the internal/external mutation control in read-only mode', () => {
      commentsStore.init({ readOnly: true });
      commentsStore.suppressInternalExternal = false;
      superdocStub.config.isInternal = true;
      const comment = useComment({
        commentId: 'comment-internal-read-only',
        fileId: 'doc-1',
        commentText: 'Internal comment',
        isInternal: true,
      });
      commentsStore.commentsList = [comment];

      const wrapper = mountDialog(comment);
      try {
        expect(wrapper.find('.existing-internal-input').exists()).toBe(false);
      } finally {
        wrapper.unmount();
      }
    });

    it('honors allowResolve in stale ordinary-comment handler events', async () => {
      commentsStore.init({ readOnly: false, allowResolve: false });
      superdocStub.activeEditor.editorVersion = 2;
      superdocStub.activeEditor.v2Comments = {
        getCapabilityState: vi.fn(() => ({ canWrite: true })),
      };
      const comment = useComment({ commentId: 'comment-no-resolve', fileId: 'doc-1', commentText: 'Open' });
      commentsStore.commentsList = [comment];
      const resolve = vi.spyOn(commentsStore, 'resolveCommentV2');

      const wrapper = mountDialog(comment);
      try {
        wrapper.findComponent({ name: 'CommentHeader' }).vm.$emit('resolve');
        await flushPromises();
        expect(resolve).not.toHaveBeenCalled();
      } finally {
        wrapper.unmount();
      }
    });
  });

  it.each([
    ['resolve', 'accept'],
    ['reject', 'reject'],
  ])('restores document focus after a committed v2 tracked-change %s', async (eventName, decision) => {
    superdocStub.activeEditor.editorVersion = 2;
    superdocStub.activeEditor.v2TrackedChanges = {
      getCapabilityState: vi.fn(() => ({ canDecide: true })),
    };
    const comment = useComment({
      commentId: `tc-${decision}`,
      fileId: 'doc-1',
      commentText: '',
      trackedChange: true,
    });
    commentsStore.commentsList = [comment];
    const decide = vi
      .spyOn(commentsStore, 'decideTrackedChangeFromSidebar')
      .mockResolvedValue({ ok: true, success: true });

    const wrapper = mountDialog(comment);
    try {
      wrapper.findComponent({ name: 'CommentHeader' }).vm.$emit(eventName);
      await flushPromises();

      expect(decide).toHaveBeenCalledWith({
        superdoc: superdocStub,
        comment,
        decision,
      });
      expect(superdocStub.focus).toHaveBeenCalledWith({ preventScroll: true });
    } finally {
      wrapper.unmount();
    }
  });

  it('keeps focus unchanged when the v2 tracked-change decision is rejected', async () => {
    superdocStub.activeEditor.editorVersion = 2;
    superdocStub.activeEditor.v2TrackedChanges = {
      getCapabilityState: vi.fn(() => ({ canDecide: true })),
    };
    const comment = useComment({
      commentId: 'tc-rejected',
      fileId: 'doc-1',
      commentText: '',
      trackedChange: true,
    });
    commentsStore.commentsList = [comment];
    vi.spyOn(commentsStore, 'decideTrackedChangeFromSidebar').mockResolvedValue({ ok: false, success: false });

    const wrapper = mountDialog(comment);
    try {
      wrapper.findComponent({ name: 'CommentHeader' }).vm.$emit('resolve');
      await flushPromises();

      expect(superdocStub.focus).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
    }
  });

  it('shows a retryable alert when a tracked-change decision returns a stale-catalog failure', async () => {
    superdocStub.activeEditor.editorVersion = 2;
    superdocStub.activeEditor.v2TrackedChanges = {
      getCapabilityState: vi.fn(() => ({ canDecide: true })),
    };
    const comment = useComment({
      commentId: 'tc-stale-catalog',
      fileId: 'doc-1',
      commentText: '',
      trackedChange: true,
    });
    commentsStore.commentsList = [comment];
    vi.spyOn(commentsStore, 'decideTrackedChangeFromSidebar').mockResolvedValue({
      ok: false,
      success: false,
      reason: 'stale-catalog',
    });

    const wrapper = mountDialog(comment);
    try {
      wrapper.findComponent({ name: 'CommentHeader' }).vm.$emit('resolve');
      await flushPromises();

      const alert = wrapper.find('[role="alert"]');
      expect(alert.exists()).toBe(true);
      expect(alert.text()).toMatch(/stale|retry/i);
      expect(commentsStore.commentsList.map((row) => row.commentId)).toContain(comment.commentId);
      expect(superdocStub.focus).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
    }
  });

  it.each([
    [
      'move-to',
      {
        trackedChangeText: 'moved destination',
        trackedChangeType: 'insert',
        trackedChangeDisplayType: 'insert',
        semanticColorKey: 'move-to',
        semanticColor: '#00853d',
      },
      '.tracked-change-text.is-inserted',
      '"moved destination"',
    ],
    [
      'move-from',
      {
        deletedText: 'moved source',
        trackedChangeType: 'delete',
        trackedChangeDisplayType: 'delete',
        semanticColorKey: 'move-from',
        semanticColor: '#00853d',
      },
      '.tracked-change-text.is-deleted',
      '"moved source"',
    ],
  ])(
    'renders the semantic hook and existing tracked-change variant for %s rows',
    (semanticColorKey, trackedChangeFields, selector, expectedText) => {
      const comment = useComment({
        commentId: `tc-${semanticColorKey}`,
        fileId: 'doc-1',
        commentText: '',
        trackedChange: true,
        ...trackedChangeFields,
      });
      commentsStore.commentsList = [comment];

      const wrapper = mountDialog(comment);
      try {
        const trackedChange = wrapper.find('.tracked-change');
        expect(trackedChange.attributes('data-track-change-semantic-color-key')).toBe(semanticColorKey);
        expect(wrapper.find(selector).text()).toBe(expectedText);
      } finally {
        wrapper.unmount();
      }
    },
  );

  it('declares move-specific review color rules in the component stylesheet', () => {
    expect(COMMENT_DIALOG_SOURCE).toContain(
      ".tracked-change[data-track-change-semantic-color-key='move-from'] .tracked-change-text.is-deleted",
    );
    expect(COMMENT_DIALOG_SOURCE).toContain('var(--sd-ui-comments-move-from-text, #00853d)');
    expect(COMMENT_DIALOG_SOURCE).toContain(
      ".tracked-change[data-track-change-semantic-color-key='move-to'] .tracked-change-text.is-inserted",
    );
    expect(COMMENT_DIALOG_SOURCE).toContain('var(--sd-ui-comments-move-to-text, #00853d)');
  });

  it('renders paragraph split tracked changes as added new line rows', () => {
    const comment = useComment({
      commentId: 'tc-paragraph-split',
      fileId: 'doc-1',
      commentText: '',
      trackedChange: true,
      trackedChangeText: '',
      trackedChangeType: 'trackInsert',
      trackedChangeDisplayType: 'paragraphSplit',
    });
    commentsStore.commentsList = [comment];

    const wrapper = mountDialog(comment);
    try {
      expect(wrapper.find('.tracked-change').text()).toBe('Added new line');
    } finally {
      wrapper.unmount();
    }
  });

  // TCS-LIST-005: a signed `trackedChangeLabel` replaces every hardcoded
  // variant copy; optional detail lines render under the summary; label-less
  // rows keep the legacy copy byte-identical.
  it('renders the signed trackedChangeLabel instead of the trackFormat "Format: " prefix', () => {
    const comment = useComment({
      commentId: 'tc-list-add',
      fileId: 'doc-1',
      commentText: '',
      trackedChange: true,
      trackedChangeText: '',
      trackedChangeType: 'trackFormat',
      trackedChangeDisplayType: 'format',
      trackedChangeLabel: 'Added 3 items to a list',
    });
    commentsStore.commentsList = [comment];

    const wrapper = mountDialog(comment);
    try {
      const trackedChange = wrapper.find('.tracked-change');
      expect(trackedChange.text()).toBe('Added 3 items to a list');
      expect(trackedChange.text()).not.toContain('Format:');
    } finally {
      wrapper.unmount();
    }
  });

  it('renders a small image preview for image tracked-change rows', () => {
    const comment = useComment({
      commentId: 'tc-image-delete',
      fileId: 'doc-1',
      commentText: '',
      trackedChange: true,
      trackedChangeText: '',
      trackedChangeType: 'trackDelete',
      trackedChangeDisplayType: 'tableDelete',
      trackedChangeLabel: 'Deleted image',
      trackedChangeImagePreview: {
        src: ONE_BY_ONE_PNG,
        contentType: 'image/png',
        role: 'deleted',
        width: 96,
        height: 96,
        alt: 'Deleted preview',
      },
    });
    commentsStore.commentsList = [comment];

    const wrapper = mountDialog(comment);
    try {
      expect(wrapper.find('.tracked-change').text()).toContain('Deleted image');
      const preview = wrapper.find('.tracked-change-image-preview');
      expect(preview.exists()).toBe(true);
      expect(preview.attributes('data-track-change-image-preview-role')).toBe('deleted');
      const image = wrapper.find('.tracked-change-image-preview__image');
      expect(image.attributes('src')).toBe(ONE_BY_ONE_PNG);
      expect(image.attributes('alt')).toBe('Deleted preview');
      expect(image.attributes('style')).toContain('width: 90px');
      expect(image.attributes('style')).toContain('height: 90px');
    } finally {
      wrapper.unmount();
    }
  });

  it('renders the signed label over the paragraphSplit copy for in-list splits', () => {
    const comment = useComment({
      commentId: 'tc-split-list',
      fileId: 'doc-1',
      commentText: '',
      trackedChange: true,
      trackedChangeText: '',
      trackedChangeType: 'trackInsert',
      trackedChangeDisplayType: 'paragraphSplit',
      trackedChangeLabel: 'Split list item',
    });
    commentsStore.commentsList = [comment];

    const wrapper = mountDialog(comment);
    try {
      expect(wrapper.find('.tracked-change').text()).toBe('Split list item');
    } finally {
      wrapper.unmount();
    }
  });

  it('renders the signed label over the deletion phrasing for merge rows', () => {
    const comment = useComment({
      commentId: 'tc-merge',
      fileId: 'doc-1',
      commentText: '',
      trackedChange: true,
      trackedChangeType: 'delete',
      trackedChangeDisplayType: 'delete',
      deletedText: 'second item',
      trackedChangeLabel: 'Merged list items',
    });
    commentsStore.commentsList = [comment];

    const wrapper = mountDialog(comment);
    try {
      const text = wrapper.find('.tracked-change').text();
      expect(text).toBe('Merged list items');
      expect(text).not.toContain('Deleted');
    } finally {
      wrapper.unmount();
    }
  });

  it('renders per-member detail lines under the heterogeneous summary label', () => {
    const comment = useComment({
      commentId: 'tc-mixed',
      fileId: 'doc-1',
      commentText: '',
      trackedChange: true,
      trackedChangeText: '',
      trackedChangeType: 'trackFormat',
      trackedChangeDisplayType: 'format',
      trackedChangeLabel: 'Changed list formatting (2 items)',
      trackedChangeDetailLines: [
        { excerpt: 'Second existing item', label: 'Changed list style' },
        { excerpt: 'New plain paragraph', label: 'Added to list' },
      ],
    });
    commentsStore.commentsList = [comment];

    const wrapper = mountDialog(comment);
    try {
      const lines = wrapper.findAll('.tracked-change-detail-line');
      expect(lines).toHaveLength(2);
      expect(lines[0].text()).toBe('"Second existing item" — Changed list style');
      expect(lines[1].text()).toBe('"New plain paragraph" — Added to list');
      expect(wrapper.find('.tracked-change').text()).toContain('Changed list formatting (2 items)');
    } finally {
      wrapper.unmount();
    }
  });

  it('shows a scrollable expanded state for overflowing tracked-change details', async () => {
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    const clientHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.classList?.contains('tracked-change') ? 120 : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return this.classList?.contains('tracked-change') ? 42 : 0;
      },
    });

    const comment = useComment({
      commentId: 'tc-row-details',
      fileId: 'doc-1',
      commentText: '',
      trackedChange: true,
      trackedChangeText: '',
      trackedChangeType: 'trackInsert',
      trackedChangeDisplayType: 'tableInsert',
      trackedChangeLabel: 'Added row',
      trackedChangeDetailLines: [
        { excerpt: 'First inserted cell text', label: 'Added text' },
        { excerpt: 'Second inserted cell text', label: 'Added text' },
        { excerpt: 'Third inserted cell text', label: 'Added text' },
        { excerpt: 'Fourth inserted cell text', label: 'Added text' },
      ],
    });
    commentsStore.commentsList = [comment];

    const wrapper = mountDialog(comment);
    try {
      await flushPromises();
      expect(wrapper.find('.show-more-toggle').text()).toBe('Show more');

      await wrapper.find('.show-more-toggle').trigger('click');
      expect(wrapper.find('.tracked-change').classes()).toContain('is-scrollable');
      expect(wrapper.find('.show-more-toggle').text()).toBe('Show less');
    } finally {
      wrapper.unmount();
      if (scrollHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor);
      } else {
        delete HTMLElement.prototype.scrollHeight;
      }
      if (clientHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor);
      } else {
        delete HTMLElement.prototype.clientHeight;
      }
    }
  });

  it('shows the truncation toggle when tracked-change details hydrate after mount', async () => {
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    const clientHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.querySelector?.('.tracked-change-detail-lines') ? 120 : 42;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return 42;
      },
    });

    const comment = useComment({
      commentId: 'tc-row-hydrates-details',
      fileId: 'doc-1',
      commentText: '',
      trackedChange: true,
      trackedChangeText: '',
      trackedChangeType: 'trackInsert',
      trackedChangeDisplayType: 'tableInsert',
      trackedChangeLabel: 'Added row',
    });
    commentsStore.commentsList = [comment];

    const wrapper = mountDialog(comment);
    try {
      await flushPromises();
      expect(wrapper.find('.show-more-toggle').exists()).toBe(false);

      commentsStore.commentsList[0].trackedChangeDetailLines = [
        { excerpt: 'First inserted cell text', label: 'Added text' },
        { excerpt: 'Second inserted cell text', label: 'Added text' },
        { excerpt: 'Third inserted cell text', label: 'Added text' },
        { excerpt: 'Fourth inserted cell text', label: 'Added text' },
      ];
      await flushPromises();

      expect(wrapper.find('.show-more-toggle').text()).toBe('Show more');
    } finally {
      wrapper.unmount();
      if (scrollHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor);
      } else {
        delete HTMLElement.prototype.scrollHeight;
      }
      if (clientHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor);
      } else {
        delete HTMLElement.prototype.clientHeight;
      }
    }
  });

  it('keeps label-less legacy variants byte-identical (trackFormat prefix and split copy unchanged)', () => {
    const formatComment = useComment({
      commentId: 'tc-fmt-legacy',
      fileId: 'doc-1',
      commentText: '',
      trackedChange: true,
      trackedChangeText: 'bold',
      trackedChangeType: 'trackFormat',
      trackedChangeDisplayType: 'format',
    });
    commentsStore.commentsList = [formatComment];
    const formatWrapper = mountDialog(formatComment);
    try {
      expect(formatWrapper.find('.tracked-change').text()).toBe('Format: bold');
      expect(formatWrapper.find('.tracked-change-detail-lines').exists()).toBe(false);
    } finally {
      formatWrapper.unmount();
    }
  });

  it('reactively disables v2 tracked-change decisions when document mode switches to viewing', async () => {
    superdocStub.activeEditor.editorVersion = 2;
    superdocStub.activeEditor.v2TrackedChanges = {
      getCapabilityState: vi.fn(() => ({ canDecide: true })),
    };
    const trackedChange = useComment({
      commentId: 'tc-viewing-mode',
      fileId: 'doc-1',
      commentText: '',
      trackedChange: true,
      trackedChangeType: 'insert',
      trackedChangeDisplayType: 'insert',
      trackedChangeText: 'viewing mode revision',
    });
    commentsStore.commentsList = [trackedChange];
    commentsStore.setViewingVisibility({
      documentMode: 'editing',
      commentsVisible: true,
      trackChangesVisible: true,
    });

    const wrapper = mountDialog(trackedChange);
    try {
      const header = wrapper.findComponent({ name: 'CommentHeader' });
      expect(header.props('resolveDisabledReason')).toBeNull();
      expect(header.props('rejectDisabledReason')).toBeNull();

      commentsStore.setViewingVisibility({ documentMode: 'viewing' });
      await flushPromises();

      expect(header.props('resolveDisabledReason')).toBe('review-surface-read-only');
      expect(header.props('rejectDisabledReason')).toBe('review-surface-read-only');
    } finally {
      wrapper.unmount();
    }
  });

  it('focuses a linked tracked-change carrier from an ordinary v2 comment while keeping the comment active', async () => {
    const focusComment = vi.fn().mockResolvedValue({ ok: true });
    const focusTrackedChange = vi.fn().mockResolvedValue({ ok: true });
    superdocStub.activeEditor.editorVersion = 2;
    superdocStub.activeEditor.v2Comments = { focusComment };
    superdocStub.activeEditor.v2TrackedChanges = { focusTrackedChange };
    const comment = useComment({
      commentId: 'comment-linked-to-change',
      fileId: 'doc-1',
      commentText: 'Linked comment',
      trackedChangeParentId: 'canonical-change-id',
    });
    commentsStore.commentsList = [comment];

    const wrapper = mountDialog(comment);
    try {
      await wrapper.find('.comments-dialog').trigger('click');
      await flushPromises();

      expect(focusTrackedChange).toHaveBeenCalledWith('canonical-change-id');
      expect(focusComment).not.toHaveBeenCalled();
      expect(commentsStore.activeComment).toBe('comment-linked-to-change');
    } finally {
      wrapper.unmount();
    }
  });

  it('routes a resolved linked ordinary v2 comment through resolved-comment focus suppression', async () => {
    const focusComment = vi.fn().mockResolvedValue({ ok: false, reason: 'resolved-comment' });
    const focusTrackedChange = vi.fn().mockResolvedValue({ ok: true });
    superdocStub.activeEditor.editorVersion = 2;
    superdocStub.activeEditor.v2Comments = { focusComment };
    superdocStub.activeEditor.v2TrackedChanges = { focusTrackedChange };
    const comment = useComment({
      commentId: 'resolved-comment-linked-to-change',
      fileId: 'doc-1',
      commentText: 'Resolved linked comment',
      trackedChangeParentId: 'canonical-change-id',
      resolvedTime: Date.now(),
    });
    commentsStore.commentsList = [comment];

    const wrapper = mountDialog(comment);
    try {
      await wrapper.find('.comments-dialog').trigger('click');
      await flushPromises();

      expect(focusComment).toHaveBeenCalledWith(comment);
      expect(focusTrackedChange).not.toHaveBeenCalled();
      expect(commentsStore.activeComment).not.toBe('resolved-comment-linked-to-change');
    } finally {
      wrapper.unmount();
    }
  });

  it('preserves the tracked-change story when focusing from a linked ordinary v2 comment', async () => {
    const focusComment = vi.fn().mockResolvedValue({ ok: true });
    const focusTrackedChange = vi.fn().mockResolvedValue({ ok: true });
    superdocStub.activeEditor.editorVersion = 2;
    superdocStub.activeEditor.v2Comments = { focusComment };
    superdocStub.activeEditor.v2TrackedChanges = { focusTrackedChange };
    const trackedChange = useComment({
      commentId: 'footnote-change-id',
      fileId: 'doc-1',
      trackedChange: true,
      trackedChangeStory: { kind: 'story', storyType: 'footnote', noteId: '1' },
      trackedChangeAnchorKey: 'tc::fn:1::footnote-change-id',
    });
    const comment = useComment({
      commentId: 'comment-linked-to-footnote-change',
      fileId: 'doc-1',
      commentText: 'Linked footnote comment',
      trackedChangeParentId: 'footnote-change-id',
    });
    commentsStore.commentsList = [trackedChange, comment];

    const wrapper = mountDialog(comment);
    try {
      await wrapper.find('.comments-dialog').trigger('click');
      await flushPromises();

      expect(focusTrackedChange).toHaveBeenCalledWith(trackedChange);
      expect(focusComment).not.toHaveBeenCalled();
      expect(commentsStore.activeComment).toBe('comment-linked-to-footnote-change');
    } finally {
      wrapper.unmount();
    }
  });

  it('falls back to focusing an ordinary v2 comment when its linked tracked-change carrier is unavailable', async () => {
    const focusComment = vi.fn().mockResolvedValue({ ok: true });
    const focusTrackedChange = vi.fn().mockResolvedValue({ ok: false, reason: 'tracked-change-anchor-not-found' });
    superdocStub.activeEditor.editorVersion = 2;
    superdocStub.activeEditor.v2Comments = { focusComment };
    superdocStub.activeEditor.v2TrackedChanges = { focusTrackedChange };
    const comment = useComment({
      commentId: 'comment-with-hidden-change',
      fileId: 'doc-1',
      commentText: 'Comment with hidden change',
      trackedChangeParentId: 'hidden-change-id',
    });
    commentsStore.commentsList = [comment];

    const wrapper = mountDialog(comment);
    try {
      await wrapper.find('.comments-dialog').trigger('click');
      await flushPromises();

      expect(focusTrackedChange).toHaveBeenCalledWith('hidden-change-id');
      expect(focusComment).toHaveBeenCalledWith(comment);
      expect(commentsStore.activeComment).toBe('comment-with-hidden-change');
    } finally {
      wrapper.unmount();
    }
  });

  it('focuses an unlinked ordinary v2 comment through the comments adapter', async () => {
    const focusComment = vi.fn().mockResolvedValue({ ok: true });
    const focusTrackedChange = vi.fn().mockResolvedValue({ ok: true });
    superdocStub.activeEditor.editorVersion = 2;
    superdocStub.activeEditor.v2Comments = { focusComment };
    superdocStub.activeEditor.v2TrackedChanges = { focusTrackedChange };
    const comment = useComment({
      commentId: 'comment-without-change',
      fileId: 'doc-1',
      commentText: 'Unlinked comment',
    });
    commentsStore.commentsList = [comment];

    const wrapper = mountDialog(comment);
    try {
      await wrapper.find('.comments-dialog').trigger('click');
      await flushPromises();

      expect(focusComment).toHaveBeenCalledWith(comment);
      expect(focusTrackedChange).not.toHaveBeenCalled();
      expect(commentsStore.activeComment).toBe('comment-without-change');
    } finally {
      wrapper.unmount();
    }
  });

  it('reactively disables the v2 reply affordance when document mode switches to viewing (SD-3867)', async () => {
    superdocStub.activeEditor.editorVersion = 2;
    superdocStub.activeEditor.v2Comments = {
      getCapabilityState: vi.fn(() => ({ canWrite: true })),
    };
    const comment = useComment({
      commentId: 'comment-viewing-mode',
      fileId: 'doc-1',
      commentText: 'Viewing mode comment',
    });
    commentsStore.commentsList = [comment];
    commentsStore.activeComment = comment.commentId;
    commentsStore.setViewingVisibility({
      documentMode: 'editing',
      commentsVisible: true,
      trackChangesVisible: true,
    });

    const wrapper = mountDialog(comment);
    try {
      expect(wrapper.find('.reply-pill').attributes('disabled')).toBeUndefined();

      commentsStore.setViewingVisibility({ documentMode: 'viewing' });
      await flushPromises();

      const replyPill = wrapper.find('.reply-pill');
      expect(replyPill.attributes('disabled')).toBeDefined();
      expect(replyPill.attributes('data-disabled-reason')).toBe('review-surface-read-only');
      await replyPill.trigger('click');
      expect(wrapper.find('.reply-expanded').exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  it('coalesces rapid v2 reply clicks while the first submission is pending (SD-3867)', async () => {
    superdocStub.activeEditor.editorVersion = 2;
    superdocStub.activeEditor.v2Comments = {
      getCapabilityState: vi.fn(() => ({ canWrite: true })),
    };
    const comment = useComment({
      commentId: 'comment-delayed-reply',
      fileId: 'doc-1',
      commentText: 'Delayed reply parent',
    });
    commentsStore.commentsList = [comment];
    commentsStore.activeComment = comment.commentId;
    commentsStore.currentCommentText = '<p>one delayed reply</p>';

    let settleReply;
    const pendingReply = new Promise((resolve) => {
      settleReply = resolve;
    });
    const replyCommentV2 = vi.spyOn(commentsStore, 'replyCommentV2').mockReturnValue(pendingReply);

    const wrapper = mountDialog(comment);
    try {
      await wrapper.find('.reply-pill').trigger('click');
      const replyButton = wrapper.find('button.reply-btn-primary');

      await replyButton.trigger('click');
      await replyButton.trigger('click');
      await replyButton.trigger('click');

      expect(replyCommentV2).toHaveBeenCalledTimes(1);
      expect(replyButton.attributes('disabled')).toBeDefined();

      settleReply({ ok: true });
      await flushPromises();
      expect(wrapper.find('.reply-expanded').exists()).toBe(false);
    } finally {
      settleReply?.({ ok: true });
      wrapper.unmount();
    }
  });

  it('routes v2 tracked-change replies through the sidecar parent when an unrelated pending comment exists', async () => {
    superdocStub.activeEditor.editorVersion = 2;
    superdocStub.activeEditor.v2Comments = {};
    const trackedChange = useComment({
      commentId:
        'tc|main%3A%2Fword%2Fdocument.xml|del|sd%3Amain%3A%2Fword%2Fdocument.xml%7Cdel%7CSuperdoc%20User%7C2024-12-20T04%3A20%3A00Z%7C0%7CwId%3A0',
      importedId: '0',
      fileId: 'doc-1',
      commentText: '',
      trackedChange: true,
      trackedChangeType: 'delete',
      trackedChangeDisplayType: 'delete',
      deletedText: ' DOCX',
    });
    commentsStore.commentsList = [trackedChange];
    commentsStore.activeComment = trackedChange.commentId;
    commentsStore.pendingComment = useComment({
      commentId: 'pending-new-comment',
      fileId: 'doc-1',
      commentText: '',
    });
    commentsStore.currentCommentText = '<p>tracked-change sidecar reply proof</p>';
    const replyCommentV2 = vi.spyOn(commentsStore, 'replyCommentV2').mockResolvedValue({ ok: true });
    const addComment = vi.spyOn(commentsStore, 'addComment').mockResolvedValue({ ok: true });

    const wrapper = mountDialog(trackedChange);
    try {
      await wrapper.find('.reply-pill').trigger('click');
      await wrapper.find('button.reply-btn-primary').trigger('click');
      await flushPromises();

      expect(replyCommentV2).toHaveBeenCalledTimes(1);
      expect(replyCommentV2).toHaveBeenCalledWith({
        superdoc: superdocStub,
        parentCommentId: '0',
        text: '<p>tracked-change sidecar reply proof</p>',
      });
      expect(addComment).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
    }
  });

  it('keeps ordinary v2 replies addressed to the visible comment root id', async () => {
    superdocStub.activeEditor.editorVersion = 2;
    superdocStub.activeEditor.v2Comments = {};
    const comment = useComment({
      commentId: 'comment-root',
      importedId: 'imported-docx-id',
      fileId: 'doc-1',
      commentText: '<p>Root comment</p>',
    });
    commentsStore.commentsList = [comment];
    commentsStore.activeComment = comment.commentId;
    commentsStore.currentCommentText = '<p>ordinary reply</p>';
    const replyCommentV2 = vi.spyOn(commentsStore, 'replyCommentV2').mockResolvedValue({ ok: true });
    const addComment = vi.spyOn(commentsStore, 'addComment').mockResolvedValue({ ok: true });

    const wrapper = mountDialog(comment);
    try {
      await wrapper.find('.reply-pill').trigger('click');
      await wrapper.find('button.reply-btn-primary').trigger('click');
      await flushPromises();

      expect(replyCommentV2).toHaveBeenCalledTimes(1);
      expect(replyCommentV2).toHaveBeenCalledWith({
        superdoc: superdocStub,
        parentCommentId: 'comment-root',
        text: '<p>ordinary reply</p>',
      });
      expect(addComment).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
    }
  });
});
