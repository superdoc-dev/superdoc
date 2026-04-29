/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import {
  elementsToRangeRects,
  findRenderedCommentElements,
  findRenderedTrackedChangeElementsStrict,
} from './EntityRectFinder.js';

const BODY_STORY_KEY = 'body';

function makeHost(): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host;
}

function paintCommentRun(host: HTMLElement, ids: string, opts: { storyKey?: string; pageIndex?: number } = {}) {
  const page = document.createElement('div');
  page.className = 'superdoc-page';
  page.dataset.pageIndex = String(opts.pageIndex ?? 0);
  const run = document.createElement('span');
  run.dataset.commentIds = ids;
  if (opts.storyKey != null) {
    run.dataset.storyKey = opts.storyKey;
  }
  page.appendChild(run);
  host.appendChild(page);
  return run;
}

describe('findRenderedCommentElements', () => {
  it('returns runs that include the comment id as an exact comma-separated token', () => {
    const host = makeHost();
    const a = paintCommentRun(host, 'c1');
    const b = paintCommentRun(host, 'c2');
    const ab = paintCommentRun(host, 'c1,c2');

    const matches = findRenderedCommentElements(host, 'c1');
    expect(matches).toHaveLength(2);
    expect(matches).toContain(a);
    expect(matches).toContain(ab);
    expect(matches).not.toContain(b);
  });

  it('does NOT partial-match overlapping ids (c1 must not match c12)', () => {
    const host = makeHost();
    const c12 = paintCommentRun(host, 'c12');
    const c123 = paintCommentRun(host, 'c12,c123');

    const matches = findRenderedCommentElements(host, 'c1');
    expect(matches).toHaveLength(0);
    expect(matches).not.toContain(c12);
    expect(matches).not.toContain(c123);

    const c12Matches = findRenderedCommentElements(host, 'c12');
    expect(c12Matches).toContain(c12);
    expect(c12Matches).toContain(c123);
  });

  it('tolerates whitespace around comma-separated tokens', () => {
    const host = makeHost();
    const run = paintCommentRun(host, 'c1, c2 , c3');
    expect(findRenderedCommentElements(host, 'c2')).toContain(run);
    expect(findRenderedCommentElements(host, 'c3')).toContain(run);
  });

  it('returns [] when host or commentId is empty', () => {
    expect(findRenderedCommentElements(null as unknown as HTMLElement, 'c1')).toEqual([]);
    expect(findRenderedCommentElements(makeHost(), '')).toEqual([]);
  });

  it('filters by story key when provided', () => {
    const host = makeHost();
    const bodyRun = paintCommentRun(host, 'c1', { storyKey: BODY_STORY_KEY });
    const headerRun = paintCommentRun(host, 'c1', { storyKey: 'story:headerFooterPart:rId1' });

    const bodyOnly = findRenderedCommentElements(host, 'c1', BODY_STORY_KEY);
    expect(bodyOnly).toContain(bodyRun);
    expect(bodyOnly).not.toContain(headerRun);

    const headerOnly = findRenderedCommentElements(host, 'c1', 'story:headerFooterPart:rId1');
    expect(headerOnly).toContain(headerRun);
    expect(headerOnly).not.toContain(bodyRun);
  });

  it('matches body-targeted lookups against runs whose data-story-key is missing', () => {
    const host = makeHost();
    const legacyRun = paintCommentRun(host, 'c1'); // no data-story-key
    expect(findRenderedCommentElements(host, 'c1', BODY_STORY_KEY)).toContain(legacyRun);
  });

  it('returns runs across all stories when storyKey is omitted', () => {
    const host = makeHost();
    const bodyRun = paintCommentRun(host, 'c1', { storyKey: BODY_STORY_KEY });
    const headerRun = paintCommentRun(host, 'c1', { storyKey: 'story:headerFooterPart:rId1' });

    const all = findRenderedCommentElements(host, 'c1');
    expect(all).toContain(bodyRun);
    expect(all).toContain(headerRun);
  });
});

describe('findRenderedTrackedChangeElementsStrict', () => {
  function paintTrackedChangeRun(host: HTMLElement, id: string, opts: { storyKey?: string; pageIndex?: number } = {}) {
    const page = document.createElement('div');
    page.className = 'superdoc-page';
    page.dataset.pageIndex = String(opts.pageIndex ?? 0);
    const run = document.createElement('span');
    run.dataset.trackChangeId = id;
    if (opts.storyKey != null) run.dataset.storyKey = opts.storyKey;
    page.appendChild(run);
    host.appendChild(page);
    return run;
  }

  const escape = (value: string) => value.replace(/["\\]/g, (c) => `\\${c}`);

  it('returns only exact-story matches when a storyKey is provided (strict, no fallback)', () => {
    const host = makeHost();
    const bodyRun = paintTrackedChangeRun(host, 'tc1', { storyKey: 'body' });
    const headerRun = paintTrackedChangeRun(host, 'tc1', { storyKey: 'story:headerFooterPart:rId1' });

    const headerOnly = findRenderedTrackedChangeElementsStrict(host, 'tc1', escape, 'story:headerFooterPart:rId1');
    expect(headerOnly).toEqual([headerRun]);
    expect(headerOnly).not.toContain(bodyRun);
  });

  it('returns [] when the requested story has no painted copy (strict, no cross-story fallback)', () => {
    const host = makeHost();
    paintTrackedChangeRun(host, 'tc1', { storyKey: 'body' });
    paintTrackedChangeRun(host, 'tc1', { storyKey: 'story:footerPart:rId2' });

    // Asking for a header copy must NOT fall back to body or footer rects
    // — a sticky card asked to anchor a header tracked change would
    // otherwise silently anchor to the wrong story.
    const headerOnly = findRenderedTrackedChangeElementsStrict(host, 'tc1', escape, 'story:headerFooterPart:rId1');
    expect(headerOnly).toEqual([]);
  });

  it('returns every painted copy across stories when no storyKey is provided', () => {
    const host = makeHost();
    const a = paintTrackedChangeRun(host, 'tc1', { storyKey: 'body' });
    const b = paintTrackedChangeRun(host, 'tc1', { storyKey: 'story:headerFooterPart:rId1' });
    const all = findRenderedTrackedChangeElementsStrict(host, 'tc1', escape);
    expect(all).toContain(a);
    expect(all).toContain(b);
  });

  it('escapes ids that contain CSS-special characters', () => {
    const host = makeHost();
    const run = paintTrackedChangeRun(host, 'tc"with"quotes');
    const cssEscape = (value: string) =>
      typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, (c) => `\\${c}`);
    const matches = findRenderedTrackedChangeElementsStrict(host, 'tc"with"quotes', cssEscape);
    expect(matches).toContain(run);
  });
});

describe('elementsToRangeRects', () => {
  it('emits plain value rects (not live DOMRect) with pageIndex from enclosing .superdoc-page', () => {
    const host = makeHost();
    const run = paintCommentRun(host, 'c1', { pageIndex: 3 });
    // jsdom returns zero-rects but they're finite, so the helper accepts them.
    const [rect] = elementsToRangeRects([run]);
    expect(rect).toBeDefined();
    expect(rect).toMatchObject({
      pageIndex: 3,
      left: expect.any(Number),
      top: expect.any(Number),
      right: expect.any(Number),
      bottom: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
    });
    // The result must be a plain value object, not a DOMRect.
    expect(typeof DOMRect !== 'undefined' ? rect instanceof DOMRect : false).toBe(false);
  });

  it('drops elements whose getBoundingClientRect returns non-finite numbers', () => {
    const host = makeHost();
    const run = paintCommentRun(host, 'c1');
    const original = run.getBoundingClientRect.bind(run);
    run.getBoundingClientRect = () =>
      ({
        top: NaN,
        left: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    expect(elementsToRangeRects([run])).toEqual([]);
    run.getBoundingClientRect = original;
  });

  it('defaults to pageIndex=0 when no .superdoc-page wrapper is present', () => {
    const host = makeHost();
    const run = document.createElement('span');
    run.dataset.commentIds = 'c1';
    host.appendChild(run); // no .superdoc-page wrapper

    const [rect] = elementsToRangeRects([run]);
    expect(rect.pageIndex).toBe(0);
  });
});
