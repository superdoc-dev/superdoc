/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import {
  elementsToRangeRects,
  findRenderedCommentElements,
  findRenderedContentControlElements,
  findRenderedTrackedChangeElementsStrict,
} from './EntityRectFinder.js';
import { DOM_CLASS_NAMES } from '@superdoc/dom-contract';

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

// ---------------------------------------------------------------------------
// findRenderedContentControlElements
// ---------------------------------------------------------------------------

function escapeAttr(value: string): string {
  // Test stub mirroring the shape of `CSS.escape` for attribute selectors;
  // production code passes the platform shim owned by PresentationEditor.
  return value.replace(/(["\\])/g, '\\$1');
}

function paintSdtWrapper(
  host: HTMLElement,
  id: string,
  opts: { type?: string; scope?: 'block' | 'inline'; pageIndex?: number; className?: string | null } = {},
): HTMLElement {
  const page = document.createElement('div');
  page.className = 'superdoc-page';
  page.dataset.pageIndex = String(opts.pageIndex ?? 0);
  const wrapper = document.createElement('span');
  // Mirror the painter: inline SDT wrappers carry the
  // INLINE_SDT_WRAPPER class, block SDT wrappers carry BLOCK_SDT.
  // Tests that intentionally exercise the "wrapper missing class"
  // path can pass className: null to skip this.
  if (opts.className !== null) {
    // Drive the helper from the shared dom-contract constants so a
    // future rename of INLINE_SDT_WRAPPER / BLOCK_SDT can't silently
    // de-sync the test from production. (Mixed convention elsewhere
    // in the painter tests: see painters/dom/src/index.test.ts which
    // hardcodes these strings. Prefer the constant here.)
    wrapper.className =
      opts.className ??
      (opts.scope === 'block' ? DOM_CLASS_NAMES.BLOCK_SDT : DOM_CLASS_NAMES.INLINE_SDT_WRAPPER);
  }
  wrapper.dataset.sdtId = id;
  wrapper.dataset.sdtType = opts.type ?? 'structuredContent';
  if (opts.scope) wrapper.dataset.sdtScope = opts.scope;
  page.appendChild(wrapper);
  host.appendChild(page);
  return wrapper;
}

describe('findRenderedContentControlElements', () => {
  it('returns the painted wrapper whose data-sdt-id matches', () => {
    const host = makeHost();
    const a = paintSdtWrapper(host, 'sdt-1', { scope: 'inline' });
    const b = paintSdtWrapper(host, 'sdt-2', { scope: 'inline' });

    const matches = findRenderedContentControlElements(host, 'sdt-1', escapeAttr);
    expect(matches).toEqual([a]);
    expect(matches).not.toContain(b);
  });

  it('returns multiple wrappers when a block SDT spans pages', () => {
    const host = makeHost();
    const fragment1 = paintSdtWrapper(host, 'sdt-block', { scope: 'block', pageIndex: 0 });
    const fragment2 = paintSdtWrapper(host, 'sdt-block', { scope: 'block', pageIndex: 1 });

    const matches = findRenderedContentControlElements(host, 'sdt-block', escapeAttr);
    expect(matches).toHaveLength(2);
    expect(matches).toContain(fragment1);
    expect(matches).toContain(fragment2);
  });

  it('ignores SDT wrappers whose data-sdt-type is not structuredContent', () => {
    const host = makeHost();
    paintSdtWrapper(host, 'sdt-3', { type: 'fieldAnnotation' });
    paintSdtWrapper(host, 'sdt-3', { type: 'documentSection' });
    paintSdtWrapper(host, 'sdt-3', { type: 'docPartObject' });

    expect(findRenderedContentControlElements(host, 'sdt-3', escapeAttr)).toEqual([]);
  });

  it('returns [] when the host or id is empty', () => {
    expect(findRenderedContentControlElements(null as unknown as HTMLElement, 'sdt-1', escapeAttr)).toEqual([]);
    expect(findRenderedContentControlElements(makeHost(), '', escapeAttr)).toEqual([]);
  });

  it('escapes attribute-special characters in the id', () => {
    const host = makeHost();
    const tricky = paintSdtWrapper(host, 'sdt"with"quotes', { scope: 'inline' });
    expect(findRenderedContentControlElements(host, 'sdt"with"quotes', escapeAttr)).toEqual([tricky]);
  });

  it('ignores SDT-tagged elements that lack the wrapper class', () => {
    // Defensive: a plain text-run span gets `data-sdt-id` /
    // `data-sdt-type` stamped by the painter too, but it does NOT get
    // a wrapper class. The finder must reject it so child runs don't
    // surface as their own painted occurrence.
    const host = makeHost();
    paintSdtWrapper(host, 'sdt-classless', { scope: 'inline', className: null });

    expect(findRenderedContentControlElements(host, 'sdt-classless', escapeAttr)).toEqual([]);
  });

  it('matches across stories when the same id is painted in body and header (v1 deferred behavior)', () => {
    // Codifies the documented v1 limitation: SDT wrappers don't stamp
    // `data-story-key` today, so a content control with the same id
    // painted in both body and header will surface as two matches even
    // when the caller passes a body-only storyKey. The fix (strict
    // story filtering for content controls) lands when the painter
    // adds `data-story-key` to SDT wrappers — see the JSDoc on
    // `findRenderedContentControlElements`. This test exists so a
    // future change can't silently *narrow* the helper (e.g. by adding
    // a strict story filter that breaks consumers who relied on the
    // cross-story match) without a deliberate test update.
    const host = makeHost();
    // Two pages: one in body, one whose ancestor declares
    // data-story-key="story:headerFooterPart:rId1". Body wrapper has
    // no story marker (legacy / default).
    const bodyWrapper = paintSdtWrapper(host, 'sdt-shared', { scope: 'inline', pageIndex: 0 });
    const headerArea = document.createElement('div');
    headerArea.dataset.storyKey = 'story:headerFooterPart:rId1';
    const headerPage = document.createElement('div');
    headerPage.className = 'superdoc-page';
    headerPage.dataset.pageIndex = '1';
    const headerWrapper = document.createElement('span');
    headerWrapper.className = DOM_CLASS_NAMES.INLINE_SDT_WRAPPER;
    headerWrapper.dataset.sdtId = 'sdt-shared';
    headerWrapper.dataset.sdtType = 'structuredContent';
    headerWrapper.dataset.sdtScope = 'inline';
    headerPage.appendChild(headerWrapper);
    headerArea.appendChild(headerPage);
    host.appendChild(headerArea);

    // No storyKey → both match (the only mode the helper supports today).
    const allMatches = findRenderedContentControlElements(host, 'sdt-shared', escapeAttr);
    expect(allMatches).toHaveLength(2);
    expect(allMatches).toContain(bodyWrapper);
    expect(allMatches).toContain(headerWrapper);

    // storyKey supplied → ignored, both still match. This is the
    // deferred behavior: signature parity with comment / tracked-change
    // finders, but the filter is a no-op until the painter stamps
    // `data-story-key`.
    const bodyOnly = findRenderedContentControlElements(host, 'sdt-shared', escapeAttr, BODY_STORY_KEY);
    expect(bodyOnly).toHaveLength(2);
    expect(bodyOnly).toContain(bodyWrapper);
    expect(bodyOnly).toContain(headerWrapper);
  });

  it('returns only the wrapper when child runs also carry the SDT metadata attrs', () => {
    // Regression: applySdtDataset in the painter stamps `data-sdt-id` /
    // `data-sdt-type` on the inline wrapper AND on every child text-run
    // element. A naive `[data-sdt-id][data-sdt-type=structuredContent]`
    // selector matches wrapper + every run, polluting the
    // single-wrapper-per-occurrence contract `rects` promises.
    const host = makeHost();
    const page = document.createElement('div');
    page.className = 'superdoc-page';
    page.dataset.pageIndex = '0';
    const wrapper = document.createElement('span');
    wrapper.className = 'superdoc-structured-content-inline';
    wrapper.dataset.sdtId = 'sdt-with-children';
    wrapper.dataset.sdtType = 'structuredContent';
    wrapper.dataset.sdtScope = 'inline';
    // Two child text runs that the painter also stamps the SDT metadata on.
    const run1 = document.createElement('span');
    run1.dataset.sdtId = 'sdt-with-children';
    run1.dataset.sdtType = 'structuredContent';
    const run2 = document.createElement('span');
    run2.dataset.sdtId = 'sdt-with-children';
    run2.dataset.sdtType = 'structuredContent';
    wrapper.appendChild(run1);
    wrapper.appendChild(run2);
    page.appendChild(wrapper);
    host.appendChild(page);

    const matches = findRenderedContentControlElements(host, 'sdt-with-children', escapeAttr);
    expect(matches).toEqual([wrapper]);
    expect(matches).not.toContain(run1);
    expect(matches).not.toContain(run2);
  });
});
