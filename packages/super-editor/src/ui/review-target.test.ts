import { afterEach, describe, expect, it } from 'vitest';

import { buildStoryKey } from '../editors/v1/document-api-adapters/story-runtime/story-key.js';
import { COMMENT_THREAD_HIT_SAMPLE_OFFSETS } from '../editors/v1/core/presentation-editor/pointer-events/comment-thread-hit-samples.js';
import {
  REVIEW_TARGET_PAINTED_ATTRS,
  collectReviewTargetCandidatesFromChain,
  matchReviewTargetAgainstReceipt,
  readCurrentReviewLayoutEpoch,
  resolveReviewTargetAtPoint,
  resolveReviewTargetReverse,
} from './review-target.js';

const A = REVIEW_TARGET_PAINTED_ATTRS;

function stubPointApis(pointMap: Map<string, HTMLElement[]>): void {
  const key = (x: number, y: number) => `${Math.round(x)}:${Math.round(y)}`;
  (document as unknown as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint = (
    x: number,
    y: number,
  ) => {
    const stack = pointMap.get(key(x, y));
    return stack?.[0] ?? null;
  };
  (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = (
    x: number,
    y: number,
  ) => {
    return [...(pointMap.get(key(x, y)) ?? [])];
  };
}

function createHost(): {
  host: HTMLElement;
  page: HTMLElement;
  setPoint: (x: number, y: number, elements: HTMLElement[]) => void;
  withPointApis: () => void;
} {
  const host = document.createElement('div');
  const page = document.createElement('div');
  page.className = 'superdoc-page';
  page.setAttribute(A.LAYOUT_EPOCH, '4');
  host.appendChild(page);
  document.body.appendChild(host);

  const pointMap = new Map<string, HTMLElement[]>();
  const setPoint = (x: number, y: number, elements: HTMLElement[]) => {
    pointMap.set(`${Math.round(x)}:${Math.round(y)}`, elements);
  };

  return {
    host,
    page,
    setPoint,
    withPointApis: () => stubPointApis(pointMap),
  };
}

function paintRun(page: HTMLElement, attrs: Record<string, string>): HTMLElement {
  const run = document.createElement('span');
  for (const [name, value] of Object.entries(attrs)) {
    run.setAttribute(name, value);
  }
  page.appendChild(run);
  return run;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('collectReviewTargetCandidatesFromChain', () => {
  it('keeps tracked-change, comment, and content-control ordering from the painted DOM chain', () => {
    const { host, page } = createHost();
    const outer = paintRun(page, {
      [A.COMMENT_IDS]: 'c-1',
      [A.LAYOUT_EPOCH]: '4',
    });
    const middle = document.createElement('span');
    middle.setAttribute(A.SDT_ID, 'sdt-1');
    middle.setAttribute(A.SDT_TYPE, 'structuredContent');
    middle.setAttribute(A.SDT_SCOPE, 'inline');
    middle.setAttribute(A.LAYOUT_EPOCH, '4');
    outer.appendChild(middle);
    const inner = document.createElement('span');
    inner.setAttribute(A.TRACK_CHANGE_ID, 'tc-1');
    inner.setAttribute(A.STORY_KEY, 'body');
    inner.setAttribute(A.LAYOUT_EPOCH, '4');
    middle.appendChild(inner);

    expect(collectReviewTargetCandidatesFromChain(inner, host)).toEqual([
      { type: 'trackedChange', id: 'tc-1', storyKey: 'body', layoutEpoch: 4 },
      { type: 'contentControl', id: 'sdt-1', scope: 'inline', layoutEpoch: 4 },
      { type: 'comment', id: 'c-1', layoutEpoch: 4 },
    ]);
  });
});

describe('resolveReviewTargetAtPoint', () => {
  it('resolves a body comment hit to a canonical comment address', () => {
    const { host, page, setPoint, withPointApis } = createHost();
    const run = paintRun(page, { [A.COMMENT_IDS]: 'c-1', [A.LAYOUT_EPOCH]: '4' });
    setPoint(10, 10, [run, page]);
    withPointApis();

    expect(
      resolveReviewTargetAtPoint({
        host,
        clientX: 10,
        clientY: 10,
      }),
    ).toEqual({
      status: 'resolved',
      candidates: [{ type: 'comment', id: 'c-1', layoutEpoch: 4 }],
      target: { kind: 'entity', entityType: 'comment', entityId: 'c-1' },
    });
  });

  it('accepts layout epoch 0 as a valid painted epoch', () => {
    const { host, page, setPoint, withPointApis } = createHost();
    page.setAttribute(A.LAYOUT_EPOCH, '0');
    const run = paintRun(page, { [A.COMMENT_IDS]: 'c-zero', [A.LAYOUT_EPOCH]: '0' });
    setPoint(11, 11, [run, page]);
    withPointApis();

    expect(
      resolveReviewTargetAtPoint({
        host,
        clientX: 11,
        clientY: 11,
      }),
    ).toEqual({
      status: 'resolved',
      candidates: [{ type: 'comment', id: 'c-zero', layoutEpoch: 0 }],
      target: { kind: 'entity', entityType: 'comment', entityId: 'c-zero' },
    });
  });

  it('rejects stale layouts when the host epoch is newer than the captured hit', () => {
    const { host, page, setPoint, withPointApis } = createHost();
    const run = paintRun(page, { [A.COMMENT_IDS]: 'c-stale', [A.LAYOUT_EPOCH]: '4' });
    setPoint(12, 12, [run, page]);
    withPointApis();

    const result = resolveReviewTargetAtPoint({ host, clientX: 12, clientY: 12, currentLayoutEpoch: 5 });
    expect(result.status).toBe('rejected');
    expect(result.diagnostics).toEqual([{ code: 'review-target-stale-layout', detail: 'captured=4;current=5' }]);
  });

  it('rejects non-body tracked-change hits instead of rewriting them to body', () => {
    const { host, page, setPoint, withPointApis } = createHost();
    const storyKey = buildStoryKey({ kind: 'story', storyType: 'headerFooterPart', refId: 'rId1' });
    const run = paintRun(page, {
      [A.TRACK_CHANGE_ID]: 'tc-header',
      [A.STORY_KEY]: storyKey,
      [A.LAYOUT_EPOCH]: '4',
    });
    setPoint(13, 13, [run, page]);
    withPointApis();

    const result = resolveReviewTargetAtPoint({ host, clientX: 13, clientY: 13 });
    expect(result.status).toBe('rejected');
    expect(result.diagnostics).toEqual([{ code: 'review-target-unsupported', detail: `story:${storyKey}` }]);
  });

  it('rejects overlapping supported review hits as ambiguous', () => {
    const { host, page, setPoint, withPointApis } = createHost();
    const outer = paintRun(page, { [A.COMMENT_IDS]: 'c-outer', [A.LAYOUT_EPOCH]: '4' });
    const inner = document.createElement('span');
    inner.setAttribute(A.TRACK_CHANGE_ID, 'tc-1');
    inner.setAttribute(A.STORY_KEY, 'body');
    inner.setAttribute(A.LAYOUT_EPOCH, '4');
    outer.appendChild(inner);
    setPoint(14, 14, [inner, outer, page]);
    withPointApis();

    const result = resolveReviewTargetAtPoint({ host, clientX: 14, clientY: 14 });
    expect(result.status).toBe('rejected');
    expect(result.diagnostics?.[0]?.code).toBe('review-target-ambiguous-overlap');
    expect(result.candidates).toEqual([
      { type: 'trackedChange', id: 'tc-1', storyKey: 'body', layoutEpoch: 4 },
      { type: 'comment', id: 'c-outer', layoutEpoch: 4 },
    ]);
  });

  it('rejects overlapping sibling/cousin targets that share a z-stack but no parent chain', () => {
    // Two reviewable elements that share a coordinate (e.g. floating chrome
    // overlay over the body) but are NOT in each other's parent chain. The
    // direct elementFromPoint hit can only return one; the elementsFromPoint
    // stack must surface BOTH so the resolver can fail closed as ambiguous.
    const { host, page, setPoint, withPointApis } = createHost();
    const commentRun = paintRun(page, { [A.COMMENT_IDS]: 'c-overlay', [A.LAYOUT_EPOCH]: '4' });
    const trackedRun = paintRun(page, {
      [A.TRACK_CHANGE_ID]: 'tc-overlay',
      [A.STORY_KEY]: 'body',
      [A.LAYOUT_EPOCH]: '4',
    });
    // Both live as siblings under `page` — neither contains the other.
    setPoint(50, 50, [commentRun, trackedRun, page]);
    withPointApis();

    const result = resolveReviewTargetAtPoint({ host, clientX: 50, clientY: 50 });
    expect(result.status).toBe('rejected');
    expect(result.diagnostics?.[0]?.code).toBe('review-target-ambiguous-overlap');
  });

  it('does not collapse same-id stacked tracked-change candidates from different stories', () => {
    const { host, page, setPoint, withPointApis } = createHost();
    const headerStoryKey = buildStoryKey({
      kind: 'story',
      storyType: 'headerFooterPart',
      refId: 'rIdHeader',
    });
    const headerRun = paintRun(page, {
      [A.TRACK_CHANGE_ID]: 'tc-same-id',
      [A.STORY_KEY]: headerStoryKey,
      [A.LAYOUT_EPOCH]: '4',
    });
    const bodyRun = paintRun(page, {
      [A.TRACK_CHANGE_ID]: 'tc-same-id',
      [A.STORY_KEY]: 'body',
      [A.LAYOUT_EPOCH]: '4',
    });
    setPoint(51, 51, [headerRun, bodyRun, page]);
    withPointApis();

    const result = resolveReviewTargetAtPoint({ host, clientX: 51, clientY: 51 });
    expect(result.status).toBe('rejected');
    expect(result.diagnostics?.[0]?.code).toBe('review-target-ambiguous-overlap');
    expect(result.candidates).toEqual([
      { type: 'trackedChange', id: 'tc-same-id', storyKey: headerStoryKey, layoutEpoch: 4 },
      { type: 'trackedChange', id: 'tc-same-id', storyKey: 'body', layoutEpoch: 4 },
    ]);
  });

  it('ignores non-host transparent overlays when a lower stack entry has a review target', () => {
    const { host, page, setPoint, withPointApis } = createHost();
    const overlay = document.createElement('div');
    document.body.appendChild(overlay);
    const comment = paintRun(page, { [A.COMMENT_IDS]: 'c-underlay', [A.LAYOUT_EPOCH]: '4' });
    setPoint(60, 60, [overlay, comment, page]);
    withPointApis();

    const result = resolveReviewTargetAtPoint({ host, clientX: 60, clientY: 60 });
    expect(result.status).toBe('resolved');
    expect(result.status === 'resolved' ? result.target.entityId : null).toBe('c-underlay');
  });

  it('rejects placeholder-only hits as unsupported', () => {
    const { host, page, setPoint, withPointApis } = createHost();
    const placeholder = paintRun(page, {
      [A.REVIEW_TARGET_KIND]: 'placeholder',
      [A.PLACEHOLDER_ID]: 'ph-1',
      [A.PLACEHOLDER_REASON]: 'secondary-story-deferred',
      [A.LAYOUT_EPOCH]: '4',
    });
    setPoint(15, 15, [placeholder, page]);
    withPointApis();

    const result = resolveReviewTargetAtPoint({ host, clientX: 15, clientY: 15 });
    expect(result.status).toBe('rejected');
    expect(result.diagnostics).toEqual([
      { code: 'review-target-unsupported', detail: 'placeholder:secondary-story-deferred' },
    ]);
  });

  it('resolves mixed content-control plus one supported review hit to the supported review target', () => {
    const { host, page, setPoint, withPointApis } = createHost();
    const wrapper = paintRun(page, {
      [A.SDT_ID]: 'sdt-1',
      [A.SDT_TYPE]: 'structuredContent',
      [A.SDT_SCOPE]: 'inline',
      [A.LAYOUT_EPOCH]: '4',
    });
    const comment = document.createElement('span');
    comment.setAttribute(A.COMMENT_IDS, 'c-2');
    comment.setAttribute(A.LAYOUT_EPOCH, '4');
    wrapper.appendChild(comment);
    setPoint(16, 16, [comment, wrapper, page]);
    withPointApis();

    expect(resolveReviewTargetAtPoint({ host, clientX: 16, clientY: 16 })).toEqual({
      status: 'resolved',
      candidates: [
        { type: 'comment', id: 'c-2', layoutEpoch: 4 },
        { type: 'contentControl', id: 'sdt-1', scope: 'inline', layoutEpoch: 4 },
      ],
      target: { kind: 'entity', entityType: 'comment', entityId: 'c-2' },
    });
  });

  it('returns no-target for plain text with no review metadata', () => {
    const { host, page, setPoint, withPointApis } = createHost();
    const plain = paintRun(page, { [A.LAYOUT_EPOCH]: '4' });
    setPoint(17, 17, [plain, page]);
    withPointApis();

    expect(resolveReviewTargetAtPoint({ host, clientX: 17, clientY: 17 })).toEqual({
      status: 'no-target',
      candidates: [],
    });
  });

  it('uses the shared v1 sample offsets for split-run gap fallback', () => {
    const { host, page, setPoint, withPointApis } = createHost();
    const gap = paintRun(page, { [A.LAYOUT_EPOCH]: '4' });
    const comment = paintRun(page, { [A.COMMENT_IDS]: 'c-gap', [A.LAYOUT_EPOCH]: '4' });
    setPoint(20, 20, [gap, page]);
    for (const [offsetX, offsetY] of COMMENT_THREAD_HIT_SAMPLE_OFFSETS) {
      if (offsetX === 0 && offsetY === 0) {
        continue;
      }
      setPoint(20 + offsetX, 20 + offsetY, [comment, page]);
    }
    withPointApis();

    expect(resolveReviewTargetAtPoint({ host, clientX: 20, clientY: 20 })).toEqual({
      status: 'resolved',
      candidates: [{ type: 'comment', id: 'c-gap', layoutEpoch: 4 }],
      target: { kind: 'entity', entityType: 'comment', entityId: 'c-gap' },
    });
  });

  it('rejects ambiguous nearby overlap from the shared gap sample window', () => {
    const { host, page, setPoint, withPointApis } = createHost();
    const gap = paintRun(page, { [A.LAYOUT_EPOCH]: '4' });
    const first = paintRun(page, { [A.COMMENT_IDS]: 'c-1', [A.LAYOUT_EPOCH]: '4' });
    const second = paintRun(page, { [A.COMMENT_IDS]: 'c-2', [A.LAYOUT_EPOCH]: '4' });
    setPoint(30, 30, [gap, page]);
    setPoint(27, 30, [first, page]);
    setPoint(33, 30, [second, page]);
    withPointApis();

    const result = resolveReviewTargetAtPoint({ host, clientX: 30, clientY: 30 });
    expect(result.status).toBe('rejected');
    expect(result.diagnostics).toEqual([
      { code: 'review-target-ambiguous-overlap', detail: 'gap:comment:c-1,comment:c-2' },
    ]);
  });

  it('does not resolve gap candidates when the direct hit is outside the host', () => {
    const { host, page, setPoint, withPointApis } = createHost();
    const outside = document.createElement('span');
    document.body.appendChild(outside);
    const nearby = paintRun(page, { [A.COMMENT_IDS]: 'c-near', [A.LAYOUT_EPOCH]: '4' });
    setPoint(40, 40, [outside]);
    setPoint(37, 40, [nearby, page]);
    withPointApis();

    expect(resolveReviewTargetAtPoint({ host, clientX: 40, clientY: 40 })).toEqual({
      status: 'no-target',
      candidates: [],
    });
  });
});

describe('resolveReviewTargetReverse', () => {
  it('returns painted body comment elements for a direct comment target', () => {
    const { host, page } = createHost();
    const run = paintRun(page, { [A.COMMENT_IDS]: 'c-3', [A.LAYOUT_EPOCH]: '4' });

    expect(
      resolveReviewTargetReverse({
        host,
        target: { kind: 'entity', entityType: 'comment', entityId: 'c-3' },
      }),
    ).toEqual({
      status: 'resolved',
      target: { kind: 'entity', entityType: 'comment', entityId: 'c-3' },
      elements: [run],
      storyKey: 'body',
    });
  });

  it('escalates reply-only comment ids to the nearest anchored parent', () => {
    const { host, page } = createHost();
    const parent = paintRun(page, { [A.COMMENT_IDS]: 'c-parent', [A.LAYOUT_EPOCH]: '4' });

    const result = resolveReviewTargetReverse({
      host,
      target: { kind: 'entity', entityType: 'comment', entityId: 'c-reply' },
      resolveParentCommentId: (commentId) => (commentId === 'c-reply' ? 'c-parent' : null),
    });

    expect(result).toEqual({
      status: 'resolved',
      target: { kind: 'entity', entityType: 'comment', entityId: 'c-parent' },
      elements: [parent],
      storyKey: 'body',
    });
  });

  it('uses strict story-key lookup for tracked changes', () => {
    const { host, page } = createHost();
    const storyKey = buildStoryKey({ kind: 'story', storyType: 'headerFooterPart', refId: 'rId1' });
    const run = paintRun(page, {
      [A.TRACK_CHANGE_ID]: 'tc-header',
      [A.STORY_KEY]: storyKey,
      [A.LAYOUT_EPOCH]: '4',
    });

    expect(
      resolveReviewTargetReverse({
        host,
        target: {
          kind: 'entity',
          entityType: 'trackedChange',
          entityId: 'tc-header',
          story: { kind: 'story', storyType: 'headerFooterPart', refId: 'rId1' },
        },
      }),
    ).toEqual({
      status: 'resolved',
      target: {
        kind: 'entity',
        entityType: 'trackedChange',
        entityId: 'tc-header',
        story: { kind: 'story', storyType: 'headerFooterPart', refId: 'rId1' },
      },
      elements: [run],
      storyKey,
    });
  });
});

describe('matchReviewTargetAgainstReceipt', () => {
  it('matches entity invalidations by entityType and entityId', () => {
    expect(
      matchReviewTargetAgainstReceipt({
        target: { kind: 'entity', entityType: 'comment', entityId: 'c-1' },
        invalidatedRefs: [
          { kind: 'text', blockId: 'b1', range: { start: 0, end: 2 } },
          { kind: 'entity', entityType: 'comment', entityId: 'c-1' },
        ],
      }),
    ).toEqual({
      kind: 'invalidated',
      matchedRef: { kind: 'entity', entityType: 'comment', entityId: 'c-1' },
    });
  });

  it('remaps only explicit entity remaps and otherwise preserves', () => {
    expect(
      matchReviewTargetAgainstReceipt({
        target: {
          kind: 'entity',
          entityType: 'trackedChange',
          entityId: 'tc-1',
          story: { kind: 'story', storyType: 'body' },
        },
        remappedRefs: [
          {
            from: {
              kind: 'entity',
              entityType: 'trackedChange',
              entityId: 'tc-1',
              story: { kind: 'story', storyType: 'body' },
            },
            to: {
              kind: 'entity',
              entityType: 'trackedChange',
              entityId: 'tc-2',
              story: { kind: 'story', storyType: 'body' },
            },
          },
        ],
      }),
    ).toEqual({
      kind: 'remapped',
      from: {
        kind: 'entity',
        entityType: 'trackedChange',
        entityId: 'tc-1',
        story: { kind: 'story', storyType: 'body' },
      },
      to: {
        kind: 'entity',
        entityType: 'trackedChange',
        entityId: 'tc-2',
        story: { kind: 'story', storyType: 'body' },
      },
    });
  });
});

describe('readCurrentReviewLayoutEpoch', () => {
  it('reads the max painted page epoch from the current host', () => {
    const { host, page } = createHost();
    const secondPage = document.createElement('div');
    secondPage.className = 'superdoc-page';
    secondPage.setAttribute(A.LAYOUT_EPOCH, '7');
    host.appendChild(secondPage);
    page.setAttribute(A.LAYOUT_EPOCH, '2');

    expect(readCurrentReviewLayoutEpoch(host)).toBe(7);
  });
});
