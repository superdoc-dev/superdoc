import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import FloatingComments from './FloatingComments.vue';
import useComment from './use-comment.js';
import { useCommentsStore } from '../../stores/comments-store.js';
import { useSuperdocStore } from '../../stores/superdoc-store.js';

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const makeRect = (top, height = 110) => ({
  x: 0,
  y: top,
  top,
  left: 0,
  right: 300,
  bottom: top + height,
  width: 300,
  height,
  toJSON: () => ({}),
});

const readTranslateY = (element) => {
  const match = element?.style?.transform?.match(/translateY\((-?[\d.]+)px\)/);
  return match ? Number(match[1]) : 0;
};

const makeTrackedChange = (id) =>
  useComment({
    commentId: id,
    fileId: 'doc-1',
    commentText: '',
    trackedChange: true,
    trackedChangeText: id,
    trackedChangeType: 'delete',
    trackedChangeDisplayType: 'delete',
    trackedChangeCanonicalId: id,
    trackedChangeAnchorKey: `tc::body::${id}`,
  });

const makeComment = (id) =>
  useComment({
    commentId: id,
    fileId: 'doc-1',
    commentText: id,
  });

const makePosition = (id, top) => ({
  key: id,
  threadId: id,
  kind: 'trackedChange',
  storyKey: 'body',
  bounds: { top, bottom: top + 20, left: 0, right: 100 },
  rects: [{ top, bottom: top + 20, left: 0, right: 100 }],
});

const settleLayout = async () => {
  await nextTick();
  await flushPromises();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await nextTick();
  await flushPromises();
};

describe('FloatingComments sidebar continuity', () => {
  let commentsStore;
  let superdocStore;
  let parent;
  let rectSpy;
  let outerScrollTop;

  beforeEach(() => {
    setActivePinia(createPinia());
    commentsStore = useCommentsStore();
    superdocStore = useSuperdocStore();
    superdocStore.documents = [{ id: 'doc-1', type: DOCX_TYPE }];

    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);
    parent = document.createElement('div');
    document.body.appendChild(parent);
    outerScrollTop = 0;

    rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this === parent || this.classList?.contains('section-wrapper')) return makeRect(-outerScrollTop, 600);
      const placeholder = this.classList?.contains('comment-placeholder')
        ? this
        : this.closest?.('.comment-placeholder');
      if (placeholder) {
        const layoutTop = Number.parseFloat(placeholder.style.top) || 0;
        return makeRect(layoutTop + readTranslateY(placeholder.closest('.sidebar-container')) - outerScrollTop);
      }
      return makeRect(0);
    });
  });

  afterEach(() => {
    rectSpy?.mockRestore();
    parent?.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const mountSidebar = async (rows, { tracked = true, commentDialogStub = true, attachTo = document.body } = {}) => {
    commentsStore.commentsList = rows.map(({ id }) => (tracked ? makeTrackedChange(id) : makeComment(id)));
    commentsStore.editorCommentPositions = Object.fromEntries(rows.map(({ id, top }) => [id, makePosition(id, top)]));

    const wrapper = mount(FloatingComments, {
      attachTo,
      props: {
        currentDocument: { id: 'doc-1', type: DOCX_TYPE },
        parent,
      },
      global: {
        stubs: { CommentDialog: commentDialogStub },
      },
    });
    await settleLayout();
    return wrapper;
  };

  const activateAt = async (id, targetClientY) => {
    commentsStore.requestInstantSidebarAlignment(targetClientY, id, id);
    commentsStore.activeFloatingCommentInstanceId = id;
    commentsStore.activeComment = id;
    await settleLayout();
  };

  const decideActiveChange = async (decision) => {
    const activeRow = commentsStore.getComment('tc-b');
    const trackedChangesAdapter = {
      documentId: 'doc-1',
      accept: vi.fn(async () => ({ ok: true, receipt: { success: true }, decidedId: 'tc-b', documentId: 'doc-1' })),
      reject: vi.fn(async () => ({ ok: true, receipt: { success: true }, decidedId: 'tc-b', documentId: 'doc-1' })),
      listTrackedChanges: vi.fn(async () => ({ ok: false, reason: 'test-background-reconcile-held' })),
      mapV2TrackedChangeToCommentParams: vi.fn(() => null),
      clearActiveTrackedChangeTargetIfMatches: vi.fn(),
    };
    const superdoc = {
      activeEditor: {
        editorVersion: 2,
        documentId: 'doc-1',
        v2TrackedChanges: trackedChangesAdapter,
      },
      emit: vi.fn(),
    };
    commentsStore.setV2TrackedChangesAdapter(trackedChangesAdapter);

    const result = await commentsStore.decideTrackedChangeFromSidebar({ superdoc, comment: activeRow, decision });
    await settleLayout();
    return { result, trackedChangesAdapter };
  };

  it('keeps geometry-free tracked changes logical-only until one is activated', async () => {
    commentsStore.commentsList = Array.from({ length: 81 }, (_, index) => makeTrackedChange(`term-change-${index}`));
    commentsStore.editorCommentPositions = {};

    const wrapper = mount(FloatingComments, {
      attachTo: document.body,
      props: {
        currentDocument: { id: 'doc-1', type: DOCX_TYPE },
        parent,
      },
      global: {
        stubs: { CommentDialog: true },
      },
    });
    try {
      await settleLayout();

      expect(commentsStore.commentsList).toHaveLength(81);
      expect(wrapper.findAll('[data-comment-id]')).toHaveLength(0);
    } finally {
      wrapper.unmount();
    }
  });

  it('mounts the first tracked-deletion dialog from RSID-only paint geometry', async () => {
    commentsStore.commentsList = [
      useComment({
        commentId: 'tc-canonical-delete',
        importedId: '2',
        fileId: 'doc-1',
        commentText: '',
        trackedChange: true,
        trackedChangeText: 'this is text',
        trackedChangeType: 'delete',
        trackedChangeDisplayType: 'delete',
        trackedChangeCanonicalId: 'tc-canonical-delete',
        trackedChangeAnchorKey: 'tc::body::tc-canonical-delete',
        trackedChangePositionAliases: ['00000029'],
      }),
    ];
    commentsStore.editorCommentPositions = {
      '00000029': makePosition('00000029', 100),
    };

    const wrapper = mount(FloatingComments, {
      attachTo: document.body,
      props: {
        currentDocument: { id: 'doc-1', type: DOCX_TYPE },
        parent,
      },
      global: {
        stubs: { CommentDialog: true },
      },
    });
    try {
      await settleLayout();

      expect(commentsStore.getFloatingCommentInstances).toHaveLength(1);
      expect(wrapper.findAll('[data-comment-id]')).toHaveLength(1);
      expect(wrapper.findAll('.floating-comment')).toHaveLength(1);
    } finally {
      wrapper.unmount();
    }
  });

  it('mounts distinct tracked-change placeholders when canonical rows share a story-scoped RSID', async () => {
    commentsStore.commentsList = ['tc-canonical-first', 'tc-canonical-second'].map((commentId) =>
      useComment({
        commentId,
        importedId: commentId,
        fileId: 'doc-1',
        commentText: '',
        trackedChange: true,
        trackedChangeText: commentId,
        trackedChangeType: 'delete',
        trackedChangeDisplayType: 'delete',
        trackedChangeAnchorKey: `tc::body::${commentId}`,
        trackedChangePositionAliases: ['00000029'],
      }),
    );
    commentsStore.editorCommentPositions = {
      '00000029': makePosition('00000029', 100),
      'tc::body::00000029': makePosition('tc::body::00000029', 100),
    };

    const wrapper = mount(FloatingComments, {
      attachTo: document.body,
      props: {
        currentDocument: { id: 'doc-1', type: DOCX_TYPE },
        parent,
      },
      global: {
        stubs: { CommentDialog: true },
      },
    });
    try {
      await settleLayout();

      expect(commentsStore.getFloatingCommentInstances.map((instance) => instance.id)).toEqual([
        'tc-canonical-first',
        'tc-canonical-second',
      ]);
      expect(
        wrapper.findAll('[data-comment-instance-id]').map((item) => item.attributes('data-comment-instance-id')),
      ).toEqual(['tc-canonical-first', 'tc-canonical-second']);
    } finally {
      wrapper.unmount();
    }
  });

  it('does not let the review-card collision stack extend the document scroll extent (SD-3852)', async () => {
    const documentExtent = 41_016;
    const rowCount = 1_316;
    Object.defineProperty(parent, 'scrollHeight', {
      configurable: true,
      get: () => documentExtent,
    });
    commentsStore.commentsList = Array.from({ length: rowCount }, (_, index) =>
      makeTrackedChange(`sd3852-tc-${index}`),
    );
    // Page-window rendering only exposes geometry for mounted pages. The
    // logical review rows remain complete, so almost every row is temporarily
    // geometry-free in the real failure.
    commentsStore.editorCommentPositions = {};
    const wrapper = mount(FloatingComments, {
      attachTo: document.body,
      props: {
        currentDocument: { id: 'doc-1', type: DOCX_TYPE },
        parent,
      },
      global: {
        stubs: { CommentDialog: true },
      },
    });
    await settleLayout();

    try {
      const wrapperMinHeight = Number.parseFloat(wrapper.get('.section-wrapper').element.style.minHeight);
      expect(wrapperMinHeight).toBe(documentExtent);
    } finally {
      wrapper.unmount();
    }
  }, 10_000);

  it('materializes only visible geometry plus one active logical row from 1,316 changes', async () => {
    const rowCount = 1_316;
    commentsStore.commentsList = Array.from({ length: rowCount }, (_, index) =>
      makeTrackedChange(`bounded-tc-${index}`),
    );
    commentsStore.editorCommentPositions = Object.fromEntries(
      Array.from({ length: 6 }, (_, index) => {
        const id = `bounded-tc-${index}`;
        return [id, makePosition(id, 40 + index * 70)];
      }),
    );
    commentsStore.activeComment = 'bounded-tc-700';
    commentsStore.activeFloatingCommentInstanceId = 'bounded-tc-700';

    const wrapper = mount(FloatingComments, {
      attachTo: document.body,
      props: {
        currentDocument: { id: 'doc-1', type: DOCX_TYPE },
        parent,
      },
      global: {
        stubs: { CommentDialog: true },
      },
    });
    await settleLayout();

    try {
      expect(commentsStore.commentsList).toHaveLength(rowCount);
      expect(wrapper.findAll('[data-comment-id]')).toHaveLength(7);
      expect(wrapper.findAll('.floating-comment')).toHaveLength(7);
    } finally {
      wrapper.unmount();
    }
  }, 10_000);

  it('hydrates a geometry-free header/footer move row without replacing its logical identity', async () => {
    const canonicalId = 'tc|move|1%7C101';
    const rowId = `${canonicalId}::move-to`;
    const positionKey = `tc::hf:part:rId-footer::${canonicalId}`;
    commentsStore.commentsList = [
      useComment({
        commentId: rowId,
        fileId: 'doc-1',
        commentText: '',
        trackedChange: true,
        trackedChangeText: 'moved destination',
        trackedChangeType: 'insert',
        trackedChangeDisplayType: 'insert',
        trackedChangeLabel: 'Moved (insertion)',
        trackedChangeCanonicalId: canonicalId,
        trackedChangeAnchorKey: positionKey,
        trackedChangeStory: { kind: 'story', storyType: 'headerFooterPart', refId: 'rId-footer' },
        trackedChangeStoryKind: 'headerFooterPart',
        semanticColorKey: 'move-to',
      }),
    ];
    commentsStore.editorCommentPositions = {
      [positionKey]: {
        key: positionKey,
        threadId: canonicalId,
        kind: 'trackedChange',
        storyKey: 'headerFooterPart:rId-footer',
        rects: undefined,
      },
    };

    const wrapper = mount(FloatingComments, {
      attachTo: document.body,
      props: {
        currentDocument: { id: 'doc-1', type: DOCX_TYPE },
        parent,
      },
      global: {
        stubs: { CommentDialog: true },
      },
    });
    try {
      await settleLayout();

      const [geometryFreeInstance] = commentsStore.getFloatingCommentInstances;
      expect(geometryFreeInstance).toMatchObject({
        id: rowId,
        threadId: rowId,
        pageIndex: null,
        isPrimary: true,
      });
      expect(wrapper.findAll('[data-comment-id]')).toHaveLength(0);

      commentsStore.activeComment = rowId;
      commentsStore.activeFloatingCommentInstanceId = rowId;
      commentsStore.editorCommentPositions = {
        [positionKey]: {
          key: positionKey,
          threadId: canonicalId,
          kind: 'trackedChange',
          storyKey: 'headerFooterPart:rId-footer',
          pageIndex: 1,
          rects: [
            { pageIndex: 0, top: 20, left: 12, right: 50, bottom: 40 },
            { pageIndex: 1, top: 120, left: 8, right: 72, bottom: 142 },
          ],
        },
      };
      await settleLayout();

      const hydratedInstances = commentsStore.getFloatingCommentInstances;
      expect(hydratedInstances).toHaveLength(2);
      expect(hydratedInstances.filter((instance) => instance.isPrimary)).toEqual([
        expect.objectContaining({ id: rowId, threadId: rowId, pageIndex: 1 }),
      ]);
      expect(new Set(hydratedInstances.map((instance) => instance.threadId))).toEqual(new Set([rowId]));
      expect(wrapper.findAll('[data-comment-id]')).toHaveLength(2);
      expect(commentsStore.activeComment).toBe(rowId);
      expect(commentsStore.activeFloatingCommentInstanceId).toBe(rowId);
    } finally {
      wrapper.unmount();
    }
  });

  it.each(['accept', 'reject'])(
    'keeps the next card stable after %s and later list reconciliation',
    async (decision) => {
      const wrapper = await mountSidebar([
        { id: 'tc-a', top: 100 },
        { id: 'tc-b', top: 200 },
        { id: 'tc-c', top: 300 },
      ]);

      try {
        await activateAt('tc-b', 150);
        const rail = wrapper.get('.sidebar-container').element;
        const nextCard = () => wrapper.get('[data-comment-id="tc-c"]').element;
        const nextCardTopBeforeDecision = nextCard().getBoundingClientRect().top;
        expect(readTranslateY(rail)).not.toBe(0);

        const { result, trackedChangesAdapter } = await decideActiveChange(decision);

        expect(result).toMatchObject({ ok: true, success: true });
        expect(trackedChangesAdapter[decision]).toHaveBeenCalledTimes(1);
        expect(commentsStore.activeComment).toBeNull();
        expect(wrapper.find('[data-comment-id="tc-b"]').exists()).toBe(false);
        expect(nextCard().getBoundingClientRect().top).toBeCloseTo(nextCardTopBeforeDecision, 5);
        expect(readTranslateY(rail)).not.toBe(0);

        const insertedRow = makeTrackedChange('tc-inserted');
        commentsStore.editorCommentPositions = {
          ...commentsStore.editorCommentPositions,
          'tc-inserted': makePosition('tc-inserted', 180),
        };
        commentsStore.commentsList = [commentsStore.getComment('tc-a'), insertedRow, commentsStore.getComment('tc-c')];
        await settleLayout();

        expect(nextCard().getBoundingClientRect().top).toBeCloseTo(nextCardTopBeforeDecision, 5);

        await activateAt('tc-c', 140);
        expect(nextCard().getBoundingClientRect().top).toBeCloseTo(140, 5);
      } finally {
        wrapper.unmount();
      }
    },
  );

  it.each(['accept', 'reject'])('keeps the next card stable after a direct inactive-card %s', async (decision) => {
    const wrapper = await mountSidebar([
      { id: 'tc-a', top: 100 },
      { id: 'tc-b', top: 200 },
      { id: 'tc-c', top: 300 },
    ]);

    try {
      const decidedCard = wrapper.get('[data-comment-id="tc-b"]');
      const nextCard = () => wrapper.get('[data-comment-id="tc-c"]').element;
      const nextCardTopBeforeDecision = nextCard().getBoundingClientRect().top;
      const action = document.createElement('button');
      action.dataset.commentAction = decision === 'accept' ? 'resolve' : 'reject';
      decidedCard.element.appendChild(action);

      expect(commentsStore.activeComment).toBeNull();
      action.click();
      const { result, trackedChangesAdapter } = await decideActiveChange(decision);

      expect(result).toMatchObject({ ok: true, success: true });
      expect(trackedChangesAdapter[decision]).toHaveBeenCalledTimes(1);
      expect(wrapper.find('[data-comment-id="tc-b"]').exists()).toBe(false);
      expect(nextCard().getBoundingClientRect().top).toBeCloseTo(nextCardTopBeforeDecision, 5);

      const insertedRow = makeTrackedChange('tc-inserted');
      commentsStore.editorCommentPositions = {
        ...commentsStore.editorCommentPositions,
        'tc-inserted': makePosition('tc-inserted', 180),
      };
      commentsStore.commentsList = [commentsStore.getComment('tc-a'), insertedRow, commentsStore.getComment('tc-c')];
      await settleLayout();

      expect(nextCard().getBoundingClientRect().top).toBeCloseTo(nextCardTopBeforeDecision, 5);
    } finally {
      wrapper.unmount();
    }
  });

  it.each(['accept', 'reject'])(
    'releases direct-decision continuity when the document owner scrolls after %s',
    async (decision) => {
      const outerScrollOwner = document.createElement('div');
      outerScrollOwner.style.overflowY = 'auto';
      outerScrollOwner.getBoundingClientRect = () => makeRect(0, 600);
      document.body.appendChild(outerScrollOwner);
      const wrapper = await mountSidebar(
        [
          { id: 'tc-a', top: 100 },
          { id: 'tc-b', top: 200 },
          { id: 'tc-c', top: 300 },
        ],
        { attachTo: outerScrollOwner },
      );

      try {
        const decidedCard = wrapper.get('[data-comment-id="tc-b"]');
        const nextCard = () => wrapper.get('[data-comment-id="tc-c"]').element;
        const action = document.createElement('button');
        action.dataset.commentAction = decision === 'accept' ? 'resolve' : 'reject';
        decidedCard.element.appendChild(action);

        action.click();
        const { result } = await decideActiveChange(decision);

        expect(result).toMatchObject({ ok: true, success: true });
        const rail = wrapper.get('.sidebar-container').element;
        expect(readTranslateY(rail)).not.toBe(0);

        outerScrollTop = 120;
        outerScrollOwner.dispatchEvent(new Event('scroll'));
        await settleLayout();

        expect(readTranslateY(rail)).toBe(0);
        expect(nextCard().getBoundingClientRect().top).toBeCloseTo(
          Number.parseFloat(nextCard().style.top) - outerScrollTop,
          5,
        );
      } finally {
        wrapper.unmount();
        outerScrollOwner.remove();
      }
    },
  );

  it('resets the translated rail for an ordinary deselection while the active row still exists', async () => {
    const wrapper = await mountSidebar([
      { id: 'tc-a', top: 100 },
      { id: 'tc-b', top: 200 },
      { id: 'tc-c', top: 300 },
    ]);

    try {
      await activateAt('tc-b', 150);
      const rail = wrapper.get('.sidebar-container').element;
      expect(readTranslateY(rail)).not.toBe(0);

      commentsStore.activeComment = null;
      commentsStore.activeFloatingCommentInstanceId = null;
      await settleLayout();

      expect(readTranslateY(rail)).toBe(0);
    } finally {
      wrapper.unmount();
    }
  });

  it('does not let restored offscreen review rows displace the first visible card', async () => {
    const viewportTop = 6_200;
    const offscreenPredecessors = Array.from({ length: 33 }, (_, index) => ({
      id: `offscreen-predecessor-${index}`,
      top: viewportTop - 600 + index * 18,
    }));
    const firstVisibleRow = { id: 'first-visible-row', top: viewportTop };

    // Reproduce the real windowed-scroll shape: the 600px overscan retains a
    // dense set of fully offscreen review anchors immediately before the first
    // viewport anchor.
    outerScrollTop = viewportTop;
    const baselineWrapper = await mountSidebar([firstVisibleRow]);
    let baselineTop;
    try {
      baselineTop = Number.parseFloat(
        baselineWrapper.get(`[data-comment-id="${firstVisibleRow.id}"]`).element.style.top,
      );
      expect(baselineTop).toBe(firstVisibleRow.top);
    } finally {
      baselineWrapper.unmount();
    }

    const wrapper = await mountSidebar([...offscreenPredecessors, firstVisibleRow]);

    try {
      expect(wrapper.findAll('.comment-placeholder')).toHaveLength(offscreenPredecessors.length + 1);

      // The existing offscreen-coupling requirement remains intact: the last
      // predecessor is restored above the viewport after collision layout.
      const lastOffscreenCard = wrapper.get(`[data-comment-id="${offscreenPredecessors.at(-1).id}"]`).element;
      expect(lastOffscreenCard.getBoundingClientRect().bottom).toBeLessThan(0);

      // Fully offscreen rows must not leave collision pressure behind after
      // they are restored. With no visible predecessor, this row owns its
      // canonical anchor at the top of the viewport.
      const firstVisibleCard = wrapper.get(`[data-comment-id="${firstVisibleRow.id}"]`).element;
      expect(Number.parseFloat(firstVisibleCard.style.top)).toBe(baselineTop);
      expect(firstVisibleCard.getBoundingClientRect().top).toBe(0);
    } finally {
      wrapper.unmount();
    }
  });

  it('moves an active card offscreen when its document anchor leaves the viewport', async () => {
    const wrapper = await mountSidebar([{ id: 'tc-a', top: 200 }]);

    try {
      await activateAt('tc-a', 200);
      const card = () => wrapper.get('[data-comment-id="tc-a"]').element;
      expect(card().getBoundingClientRect().top).toBeCloseTo(200, 5);

      commentsStore.editorCommentPositions = {
        'tc-a': makePosition('tc-a', -300),
      };
      parent.dispatchEvent(new Event('scroll'));
      await settleLayout();

      // Collision-floor normalization must not clamp the active review card
      // into view after the canonical document anchor has left the viewport.
      expect(card().getBoundingClientRect().bottom).toBeLessThan(0);

      commentsStore.editorCommentPositions = {
        'tc-a': makePosition('tc-a', 200),
      };
      parent.dispatchEvent(new Event('scroll'));
      await settleLayout();

      expect(card().getBoundingClientRect().top).toBeCloseTo(200, 5);
    } finally {
      wrapper.unmount();
    }
  });

  it('keeps a geometry-free active dialog in the viewport inside a deeply scrolled outer owner', async () => {
    outerScrollTop = 10_064;
    const staleEarlyRows = Array.from({ length: 40 }, (_, index) => ({
      id: `stale-${index}`,
      top: index * 20,
    }));
    commentsStore.commentsList = [
      ...staleEarlyRows.map(({ id }) => makeTrackedChange(id)),
      makeTrackedChange('tc-active'),
    ];
    commentsStore.editorCommentPositions = Object.fromEntries(
      staleEarlyRows.map(({ id, top }) => [id, makePosition(id, top)]),
    );
    const wrapper = mount(FloatingComments, {
      attachTo: document.body,
      props: {
        currentDocument: { id: 'doc-1', type: DOCX_TYPE },
        parent,
      },
      global: {
        stubs: {
          CommentDialog: {
            template:
              '<div class="comments-dialog is-active"><button data-comment-action="resolve">Accept</button></div>',
          },
        },
      },
    });

    try {
      await settleLayout();
      commentsStore.clearInstantSidebarAlignment();
      commentsStore.activeFloatingCommentInstanceId = null;
      commentsStore.activeComment = 'tc-active';
      await settleLayout();

      const action = () => wrapper.get('[data-comment-action="resolve"]').element;
      const bounds = action().getBoundingClientRect();
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight);
    } finally {
      wrapper.unmount();
    }
  });

  it('falls back to the previous card when the removed active row was last', async () => {
    const wrapper = await mountSidebar([
      { id: 'tc-a', top: 100 },
      { id: 'tc-b', top: 200 },
    ]);

    try {
      await activateAt('tc-b', 150);
      const previousCard = () => wrapper.get('[data-comment-id="tc-a"]').element;
      const previousTop = previousCard().getBoundingClientRect().top;

      await decideActiveChange('accept');

      expect(previousCard().getBoundingClientRect().top).toBeCloseTo(previousTop, 5);
    } finally {
      wrapper.unmount();
    }
  });

  it('resets safely when the removed active row has no surviving neighbor', async () => {
    const wrapper = await mountSidebar([{ id: 'tc-b', top: 200 }]);

    try {
      await activateAt('tc-b', 150);
      const rail = wrapper.get('.sidebar-container').element;
      expect(readTranslateY(rail)).not.toBe(0);

      await decideActiveChange('reject');

      expect(wrapper.findAll('.comment-placeholder')).toHaveLength(0);
      expect(readTranslateY(rail)).toBe(0);
    } finally {
      wrapper.unmount();
    }
  });

  it('keeps an active card fixed when windowed geometry drops an offscreen predecessor', async () => {
    const wrapper = await mountSidebar(
      [
        { id: 'far-before', top: -4738 },
        { id: 'near-before', top: -1154 },
        { id: 'active', top: 416 },
      ],
      { tracked: false },
    );

    try {
      const activeCard = () => wrapper.get('[data-comment-id="active"]').element;
      await activateAt('active', 416);
      const activeTopBeforeWindowChange = activeCard().getBoundingClientRect().top;

      commentsStore.commentsList = [commentsStore.getComment('near-before'), commentsStore.getComment('active')];
      commentsStore.editorCommentPositions = {
        'near-before': makePosition('near-before', -1154),
        active: makePosition('active', 416),
      };
      await settleLayout();

      expect(activeCard().getBoundingClientRect().top).toBeCloseTo(activeTopBeforeWindowChange, 5);
    } finally {
      wrapper.unmount();
    }
  });

  it('does not let restored offscreen review rows displace the first visible card', async () => {
    const viewportTop = 6_200;
    const offscreenPredecessors = Array.from({ length: 33 }, (_, index) => ({
      id: `offscreen-predecessor-${index}`,
      top: viewportTop - 600 + index * 18,
    }));
    const firstVisibleRow = { id: 'first-visible-row', top: viewportTop };

    // Reproduce the real windowed-scroll shape: the 600px overscan retains a
    // dense set of fully offscreen review anchors immediately before the first
    // viewport anchor.
    outerScrollTop = viewportTop;
    const baselineWrapper = await mountSidebar([firstVisibleRow]);
    let baselineTop;
    try {
      baselineTop = Number.parseFloat(
        baselineWrapper.get(`[data-comment-id="${firstVisibleRow.id}"]`).element.style.top,
      );
      expect(baselineTop).toBe(firstVisibleRow.top);
    } finally {
      baselineWrapper.unmount();
    }

    const wrapper = await mountSidebar([...offscreenPredecessors, firstVisibleRow]);

    try {
      expect(wrapper.findAll('.comment-placeholder')).toHaveLength(offscreenPredecessors.length + 1);

      // The existing offscreen-coupling requirement remains intact: the last
      // predecessor is restored above the viewport after collision layout.
      const lastOffscreenCard = wrapper.get(`[data-comment-id="${offscreenPredecessors.at(-1).id}"]`).element;
      expect(lastOffscreenCard.getBoundingClientRect().bottom).toBeLessThan(0);

      // Fully offscreen rows must not leave collision pressure behind after
      // they are restored. With no visible predecessor, this row owns its
      // canonical anchor at the top of the viewport.
      const firstVisibleCard = wrapper.get(`[data-comment-id="${firstVisibleRow.id}"]`).element;
      expect(Number.parseFloat(firstVisibleCard.style.top)).toBe(baselineTop);
      expect(firstVisibleCard.getBoundingClientRect().top).toBe(0);
    } finally {
      wrapper.unmount();
    }
  });
});
