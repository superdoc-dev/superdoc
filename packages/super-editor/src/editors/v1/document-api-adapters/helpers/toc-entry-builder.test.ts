import { describe, expect, it } from 'vitest';
import { buildTocEntryParagraphs, collectTocSources, type TocSource } from './toc-entry-builder.js';
import { generateTocBookmarkName } from './toc-bookmark-sync.js';
import type { TocSwitchConfig } from '@superdoc/document-api';
import type { Node as ProseMirrorNode } from 'prosemirror-model';

const BASE_SOURCE: TocSource = {
  text: 'Chapter One',
  level: 1,
  sdBlockId: 'h-1',
  kind: 'heading',
};

function makeConfig(display: TocSwitchConfig['display'] = {}): TocSwitchConfig {
  return {
    source: { outlineLevels: { from: 1, to: 3 } },
    display: { hyperlinks: true, ...display },
    preserved: {},
  };
}

type TextLike = { type?: string; text?: string; marks?: Array<{ type: string; attrs?: Record<string, unknown> }> };

/** Pull the title text node out of a run wrapper. */
function titleTextOf(paragraphs: ReturnType<typeof buildTocEntryParagraphs>): TextLike {
  const titleRun = paragraphs[0]!.content[0] as { content?: TextLike[] };
  return titleRun.content?.[0] ?? {};
}

/**
 * Find the page-number text inside the entry's `pageReference` node — the
 * builder now emits a real PAGEREF field instead of a `tocPageNumber` mark.
 */
function pageNumberTextOf(paragraphs: ReturnType<typeof buildTocEntryParagraphs>): TextLike {
  const nodes = paragraphs[0]!.content as Array<{ type?: string; content?: TextLike[] }>;
  for (const node of nodes) {
    if (node.type !== 'pageReference') continue;
    const innerRuns = (node.content ?? []) as Array<{ content?: TextLike[] }>;
    for (const run of innerRuns) {
      const text = run.content?.find((c) => c.type === 'text');
      if (text) return text;
    }
  }
  return {};
}

describe('buildTocEntryParagraphs', () => {
  describe('hyperlink anchors', () => {
    it('uses a _Toc bookmark name as the hyperlink anchor, not the raw sdBlockId', () => {
      const paragraphs = buildTocEntryParagraphs([BASE_SOURCE], makeConfig({ hyperlinks: true }));
      const textNode = titleTextOf(paragraphs);
      const linkMark = textNode.marks?.find((m) => m.type === 'link');

      expect(linkMark).toBeDefined();
      expect(linkMark!.attrs!.anchor).toMatch(/^_Toc[a-zA-Z0-9_]+$/);
      expect(linkMark!.attrs!.anchor).toBe(generateTocBookmarkName(BASE_SOURCE.sdBlockId));
      expect(linkMark!.attrs!.anchor).not.toBe(BASE_SOURCE.sdBlockId);
    });

    it('produces the same anchor for the same sdBlockId across calls', () => {
      const first = buildTocEntryParagraphs([BASE_SOURCE], makeConfig({ hyperlinks: true }));
      const second = buildTocEntryParagraphs([BASE_SOURCE], makeConfig({ hyperlinks: true }));
      const getAnchor = (paragraphs: typeof first) => titleTextOf(paragraphs).marks?.[0]?.attrs?.anchor;
      expect(getAnchor(first)).toBe(getAnchor(second));
    });

    it('does not add link mark when hyperlinks display option is false', () => {
      const paragraphs = buildTocEntryParagraphs([BASE_SOURCE], makeConfig({ hyperlinks: false }));
      expect(titleTextOf(paragraphs).marks).toBeUndefined();
    });
  });

  describe('rightAlignPageNumbers', () => {
    it('adds a right-aligned tab stop with default dot leader', () => {
      const paragraphs = buildTocEntryParagraphs([BASE_SOURCE], makeConfig());
      const tabStops = paragraphs[0]!.attrs.paragraphProperties as Record<string, unknown>;
      expect(tabStops.tabStops).toEqual([{ tab: { tabType: 'right', pos: 9350, leader: 'dot' } }]);
    });

    it('omits tab stop when rightAlignPageNumbers is false', () => {
      const paragraphs = buildTocEntryParagraphs([BASE_SOURCE], makeConfig({ rightAlignPageNumbers: false }));
      const props = paragraphs[0]!.attrs.paragraphProperties as Record<string, unknown>;
      expect(props.tabStops).toBeUndefined();
    });

    it('includes dot leader when tabLeader is dot', () => {
      const paragraphs = buildTocEntryParagraphs(
        [BASE_SOURCE],
        makeConfig({ rightAlignPageNumbers: true, tabLeader: 'dot' }),
      );
      const props = paragraphs[0]!.attrs.paragraphProperties as Record<string, unknown>;
      expect(props.tabStops).toEqual([{ tab: { tabType: 'right', pos: 9350, leader: 'dot' } }]);
    });

    it('omits leader when tabLeader is none', () => {
      const paragraphs = buildTocEntryParagraphs(
        [BASE_SOURCE],
        makeConfig({ rightAlignPageNumbers: true, tabLeader: 'none' }),
      );
      const props = paragraphs[0]!.attrs.paragraphProperties as Record<string, unknown>;
      expect(props.tabStops).toEqual([{ tab: { tabType: 'right', pos: 9350 } }]);
    });

    it('does not add tab stop when page numbers are omitted', () => {
      const paragraphs = buildTocEntryParagraphs(
        [BASE_SOURCE],
        makeConfig({ rightAlignPageNumbers: true, omitPageNumberLevels: { from: 1, to: 9 } }),
      );
      const props = paragraphs[0]!.attrs.paragraphProperties as Record<string, unknown>;
      expect(props.tabStops).toBeUndefined();
    });

    it('honours options.tabPos when provided', () => {
      const paragraphs = buildTocEntryParagraphs([BASE_SOURCE], makeConfig({ rightAlignPageNumbers: true }), {
        tabPos: 12345,
      });
      const props = paragraphs[0]!.attrs.paragraphProperties as Record<string, unknown>;
      expect(props.tabStops).toEqual([{ tab: { tabType: 'right', pos: 12345, leader: 'dot' } }]);
    });
  });

  describe('entry formatting (SD-2664)', () => {
    it('emits only the link mark on the title text — Word rebuilds run formatting from the linked TOC{n} paragraph styles', () => {
      const paragraphs = buildTocEntryParagraphs([BASE_SOURCE], makeConfig({ hyperlinks: true }));
      const text = titleTextOf(paragraphs);
      expect(text.marks!.map((m) => m.type)).toEqual(['link']);
    });

    it('the rebuilt link uses the source bookmark anchor', () => {
      const paragraphs = buildTocEntryParagraphs([BASE_SOURCE], makeConfig({ hyperlinks: true }));
      const linkMark = titleTextOf(paragraphs).marks?.find((m) => m.type === 'link');
      expect(linkMark?.attrs?.anchor).toBe(generateTocBookmarkName(BASE_SOURCE.sdBlockId));
    });

    it('wraps text in `run` nodes and emits a real pageReference for the page number', () => {
      const paragraphs = buildTocEntryParagraphs([BASE_SOURCE], makeConfig({ hyperlinks: true }));
      const nodes = paragraphs[0]!.content as Array<{ type: string }>;
      // Title run + tab run + pageReference node = 3 children.
      expect(nodes.map((n) => n.type)).toEqual(['run', 'run', 'pageReference']);
    });

    it("does not propagate the heading paragraph's character marks into the rebuilt entry (SD-3229)", () => {
      // Per ECMA-376 §17.16.5.68, Word rebuilds heading-driven TOC entries
      // (\o / \u / \t) from the heading text plus the linked TOC{n} style's
      // typography. The heading's own bold/underline/font marks must NOT
      // bleed through — otherwise the entry shows "ARTICLE 1 BASIC
      // INFORMATION" in Heading1's bold/Times-New-Roman-Bold instead of the
      // TOC1 style's lighter weight.
      const sourceWithMarks: TocSource = {
        ...BASE_SOURCE,
        segments: [
          {
            text: 'Heading',
            marks: [
              { type: 'textStyle', attrs: { fontFamily: 'Aptos', fontSize: '24pt' } },
              { type: 'bold' },
              { type: 'italic' },
              { type: 'underline' },
              { type: 'color', attrs: { color: '#ff0000' } },
              { type: 'highlight', attrs: { color: '#ffff00' } },
              { type: 'fontFamily', attrs: { fontFamily: 'Calibri' } },
            ],
          },
        ],
      };
      const paragraphs = buildTocEntryParagraphs([sourceWithMarks], makeConfig({ hyperlinks: true }));
      const text = titleTextOf(paragraphs);
      expect(text.marks!.map((m) => m.type)).toEqual(['link']);
    });

    it('only the link mark is attached to heading-source title runs', () => {
      const sourceWithDisallowed: TocSource = {
        ...BASE_SOURCE,
        segments: [
          {
            text: 'Heading',
            marks: [
              { type: 'bold' },
              { type: 'fontSize', attrs: { fontSize: '24pt' } },
              { type: 'strike' },
              { type: 'link', attrs: { href: 'https://example.com' } },
              { type: 'commentMark', attrs: { commentId: 'c1' } },
              { type: 'trackInsert' },
              { type: 'tocPageNumber' },
            ],
          },
        ],
      };
      const paragraphs = buildTocEntryParagraphs([sourceWithDisallowed], makeConfig({ hyperlinks: true }));
      const text = titleTextOf(paragraphs);
      expect(text.marks!.map((m) => m.type)).toEqual(['link']);
      const linkMark = text.marks!.find((m) => m.type === 'link');
      expect(linkMark!.attrs!.anchor).toBe(generateTocBookmarkName(BASE_SOURCE.sdBlockId));
      // The rebuilt link points at the synthetic in-document anchor; the source's
      // `href: "https://example.com"` is dropped (we route through the anchor).
      expect(linkMark!.attrs!.href).toBe(`#${generateTocBookmarkName(BASE_SOURCE.sdBlockId)}`);
    });

    it('TC-field entries carry bold/italic/underline (but not textStyle) from the surrounding Heading2 (SD-3229)', () => {
      // Word's update-field inherits character formatting from the body run
      // that surrounds the TC field's title — but only the visible style
      // marks (bold/italic/underline). Inheriting `textStyle` overrides the
      // TOC2 paragraph style's font, which is wrong.
      const tcSource: TocSource = {
        text: 'Section 1.1\tCertain Basic Terms',
        level: 2,
        sdBlockId: 'h2-1',
        kind: 'tcField',
        titleMarks: [
          { type: 'bold' },
          { type: 'underline' },
          { type: 'textStyle', attrs: { fontFamily: 'Times New Roman, serif' } },
        ],
      };
      const paragraphs = buildTocEntryParagraphs([tcSource], makeConfig({ hyperlinks: true }));
      // Section-number run (first run) — plain link only, no inherited marks.
      const numberRun = paragraphs[0]!.content[0] as { content?: TextLike[] };
      expect(numberRun.content?.[0]?.marks?.map((m) => m.type)).toEqual(['link']);
      // Title run (third run, after number / tab) — bold + underline survive,
      // textStyle is dropped so the TOC2 style picks the font.
      const titleRun = paragraphs[0]!.content[2] as { content?: TextLike[] };
      expect(titleRun.content?.[0]?.marks?.map((m) => m.type)).toEqual(['bold', 'underline', 'link']);
    });
  });

  describe('page numbers (SD-2664)', () => {
    it('substitutes page numbers from options.pageMap when present', () => {
      const pageMap = new Map<string, number>([['h-1', 7]]);
      const paragraphs = buildTocEntryParagraphs([BASE_SOURCE], makeConfig({ hyperlinks: true }), { pageMap });
      expect(pageNumberTextOf(paragraphs).text).toBe('7');
    });

    it('falls back to "0" placeholder when the source is not in the page map', () => {
      const pageMap = new Map<string, number>(); // empty
      const paragraphs = buildTocEntryParagraphs([BASE_SOURCE], makeConfig({ hyperlinks: true }), { pageMap });
      expect(pageNumberTextOf(paragraphs).text).toBe('0');
    });
  });
});

// ---------------------------------------------------------------------------
// collectTocSources — mock doc helper
// ---------------------------------------------------------------------------

interface MockParagraph {
  sdBlockId: string | null;
  text: string;
  styleId?: string;
  outlineLevel?: number;
  listMarkerText?: string;
}

function mockDoc(paragraphs: MockParagraph[]) {
  const children = paragraphs.map((p) => {
    const textNode = {
      type: { name: 'text' },
      attrs: {},
      isText: true,
      text: p.text,
      descendants: () => {},
    };
    return {
      type: { name: 'paragraph' },
      attrs: {
        sdBlockId: p.sdBlockId,
        paragraphProperties: {
          ...(p.styleId ? { styleId: p.styleId } : {}),
          ...(p.outlineLevel !== undefined ? { outlineLevel: p.outlineLevel } : {}),
        },
        ...(p.listMarkerText !== undefined ? { listRendering: { markerText: p.listMarkerText } } : {}),
      },
      isText: false,
      descendants: (cb: (node: unknown, pos: number) => boolean | void) => {
        cb(textNode, 0);
      },
    };
  });

  return {
    type: { name: 'doc' },
    attrs: {},
    isText: false,
    descendants: (cb: (node: unknown, pos: number) => boolean | void) => {
      let pos = 0;
      for (const child of children) {
        const result = cb(child, pos);
        if (result !== false) {
          child.descendants((gc, gp) => cb(gc, pos + gp + 1));
        }
        pos += 10;
      }
    },
  } as unknown as ProseMirrorNode;
}

// ---------------------------------------------------------------------------
// collectTocSources
// ---------------------------------------------------------------------------

describe('collectTocSources', () => {
  const doc = mockDoc([
    { sdBlockId: 'p1', text: 'Normal paragraph', styleId: 'Normal' },
    { sdBlockId: 'p2', text: 'Abbreviations', styleId: 'Abbreviations', outlineLevel: 1 },
    { sdBlockId: 'p3', text: 'Definitions', styleId: 'Definitions', outlineLevel: 1 },
    { sdBlockId: 'p4', text: 'Introduction', styleId: 'Heading1' },
    { sdBlockId: 'p5', text: 'Sub-section', styleId: 'CustomSubheading', outlineLevel: 2 },
  ]);

  it('collects applied outline levels when \\u is set but \\o is absent (SD-2367)', () => {
    const config: TocSwitchConfig = {
      source: { useAppliedOutlineLevel: true },
      display: { hyperlinks: true, hideInWebView: true },
      preserved: {},
    };

    const sources = collectTocSources(doc, config);
    const applied = sources.filter((s) => s.kind === 'appliedOutline');

    expect(applied.length).toBe(3);
    expect(applied.map((s) => s.text)).toEqual(['Abbreviations', 'Definitions', 'Sub-section']);
    expect(applied.map((s) => s.level)).toEqual([2, 2, 3]);
  });

  it('collects both headings (\\o) and applied outline levels (\\u) together', () => {
    const config: TocSwitchConfig = {
      source: { outlineLevels: { from: 1, to: 9 }, useAppliedOutlineLevel: true },
      display: { hyperlinks: true },
      preserved: {},
    };

    const sources = collectTocSources(doc, config);
    const headings = sources.filter((s) => s.kind === 'heading');
    const applied = sources.filter((s) => s.kind === 'appliedOutline');

    expect(headings.length).toBe(1);
    expect(headings[0].text).toBe('Introduction');
    expect(applied.length).toBe(3);
  });

  it('picks up a freshly-pasted heading whose paraId/sdBlockId were stripped by the slice paste reset', () => {
    // Repro for "paste an existing heading, F9, new entry doesn't appear":
    // SUPERDOC_SLICE_PASTE_IDENTITY_RESETS clears paraId AND sdBlockId on a
    // pasted paragraph. Until the block-node plugin's appendTransaction runs
    // and assigns a UUID, the paragraph carries `sdBlockId: null` while still
    // having its heading styleId. The TOC scanner must fall back to a
    // synthetic id and still surface it as a TOC source.
    const docWithPastedHeading = mockDoc([
      { sdBlockId: 'p-existing', text: 'Conclusion 1', styleId: 'Heading2' },
      // Pasted heading, identity reset, plugin hasn't re-stamped yet
      { sdBlockId: null, text: 'Conclusion 2', styleId: 'Heading2' },
    ]);

    const config: TocSwitchConfig = {
      source: { outlineLevels: { from: 1, to: 3 } },
      display: { hyperlinks: true },
      preserved: {},
    };

    const sources = collectTocSources(docWithPastedHeading, config);
    expect(sources.map((s) => s.text)).toEqual(['Conclusion 1', 'Conclusion 2']);
    // The fallback must produce a non-empty sdBlockId so generateTocBookmarkName
    // can hash it into a stable anchor for the rebuilt entry.
    expect(sources[1].sdBlockId).toBeTruthy();
  });

  it('collects only headings when \\u is not set', () => {
    const config: TocSwitchConfig = {
      source: { outlineLevels: { from: 1, to: 3 } },
      display: { hyperlinks: true },
      preserved: {},
    };

    const sources = collectTocSources(doc, config);

    expect(sources.length).toBe(1);
    expect(sources[0].text).toBe('Introduction');
    expect(sources[0].kind).toBe('heading');
  });

  it('respects outline level range when \\u is set without \\o (defaults to 1-9)', () => {
    const docWithDeepLevel = mockDoc([{ sdBlockId: 'p1', text: 'Deep heading', styleId: 'Custom', outlineLevel: 8 }]);

    const config: TocSwitchConfig = {
      source: { useAppliedOutlineLevel: true },
      display: {},
      preserved: {},
    };

    const sources = collectTocSources(docWithDeepLevel, config);

    expect(sources.length).toBe(1);
    expect(sources[0].level).toBe(9); // outlineLevel 8 → tocLevel 9 (0-indexed + 1)
  });

  it('filters applied outline levels by narrow \\o range when both switches present', () => {
    const config: TocSwitchConfig = {
      source: { outlineLevels: { from: 3, to: 3 }, useAppliedOutlineLevel: true },
      display: {},
      preserved: {},
    };

    const sources = collectTocSources(doc, config);
    const applied = sources.filter((s) => s.kind === 'appliedOutline');

    // Only p5 (outlineLevel 2 → tocLevel 3) falls in range 3-3
    // p2, p3 (outlineLevel 1 → tocLevel 2) are excluded
    expect(applied.length).toBe(1);
    expect(applied[0].text).toBe('Sub-section');
    expect(applied[0].level).toBe(3);
  });

  it('returns empty when no switches match any paragraph', () => {
    const config: TocSwitchConfig = {
      source: {},
      display: {},
      preserved: {},
    };

    const sources = collectTocSources(doc, config);
    expect(sources.length).toBe(0);
  });

  it('skips heading-styled paragraphs whose visible text is empty (SD-2664)', () => {
    // Page-break / spacer paragraphs that inherit Heading1 must not produce
    // ghost TOC entries on rebuild.
    const docWithEmptyHeading = mockDoc([
      { sdBlockId: 'p1', text: 'Part 1', styleId: 'Heading1' },
      { sdBlockId: 'p2', text: '', styleId: 'Heading1' },
      { sdBlockId: 'p3', text: '   ', styleId: 'Heading1' },
      { sdBlockId: 'p4', text: 'Part 2', styleId: 'Heading1' },
    ]);

    const config: TocSwitchConfig = {
      source: { outlineLevels: { from: 1, to: 3 } },
      display: { hyperlinks: true },
      preserved: {},
    };

    const sources = collectTocSources(docWithEmptyHeading, config);
    expect(sources.map((s) => s.text)).toEqual(['Part 1', 'Part 2']);
  });

  it('collects pasted heading paragraphs that lack sdBlockId/paraId (SD-2664)', () => {
    // SuperDoc's slice paste resets paraId/sdBlockId to null on pasted paragraphs
    // (InputRule.js SUPERDOC_SLICE_PASTE_IDENTITY_RESETS) to avoid public-id
    // duplicates. The TOC rebuild must still pick those paragraphs up via a
    // synthetic deterministic id so toc.update mode 'all' reflects new entries.
    const docWithPastedHeading = mockDoc([
      { sdBlockId: 'p1', text: 'Part 3', styleId: 'Heading1' },
      { sdBlockId: null, text: 'Part 4', styleId: 'Heading1' },
    ]);

    const config: TocSwitchConfig = {
      source: { outlineLevels: { from: 1, to: 3 } },
      display: { hyperlinks: true },
      preserved: {},
    };

    const sources = collectTocSources(docWithPastedHeading, config);

    expect(sources.map((s) => s.text)).toEqual(['Part 3', 'Part 4']);
    expect(sources[1].sdBlockId).toMatch(/^para-auto-/);
  });

  describe('custom-style mapping (\\t)', () => {
    // SD-3229: a TOC whose instruction relies solely on \t (and \f with no
    // imported TC nodes) used to rebuild as the "No table of contents entries
    // found." placeholder because collectTocSources ignored \t mappings.
    it('collects paragraphs whose styleId matches a \\t custom-style mapping', () => {
      const doc = mockDoc([
        { sdBlockId: 'p1', text: 'Article 1', styleId: 'Heading1' },
        { sdBlockId: 'p2', text: 'Article 2', styleId: 'Heading1' },
        { sdBlockId: 'p3', text: 'Body', styleId: 'Normal' },
      ]);

      const config: TocSwitchConfig = {
        source: { tcFieldIdentifier: 'C' },
        display: { hyperlinks: true },
        // styleName "Heading 1" (with space) must match styleId "Heading1"
        preserved: { customStyles: [{ styleName: 'Heading 1', level: 1 }] },
      };

      const sources = collectTocSources(doc, config);
      expect(sources.map((s) => s.text)).toEqual(['Article 1', 'Article 2']);
      expect(sources.every((s) => s.kind === 'customStyle')).toBe(true);
      expect(sources.every((s) => s.level === 1)).toBe(true);
    });

    it('prefers \\o heading collection over \\t when both match the same paragraph', () => {
      const doc = mockDoc([{ sdBlockId: 'p1', text: 'Intro', styleId: 'Heading1' }]);

      const config: TocSwitchConfig = {
        source: { outlineLevels: { from: 1, to: 3 } },
        display: {},
        preserved: { customStyles: [{ styleName: 'Heading 1', level: 2 }] },
      };

      const sources = collectTocSources(doc, config);
      expect(sources).toHaveLength(1);
      expect(sources[0].kind).toBe('heading');
      expect(sources[0].level).toBe(1);
    });

    it('exposes the rendered list marker so the builder can emit it as its own run', () => {
      // SD-3229 PSA repro: Heading1 paragraphs only contain "BASIC INFORMATION"
      // / "PROPERTY" in their text content. The "ARTICLE 1" / "ARTICLE 2"
      // prefix is auto-numbered by the Heading1 style (lvlText "ARTICLE %1")
      // and surfaces on the paragraph as listRendering.markerText after layout.
      const doc = mockDoc([
        { sdBlockId: 'p1', text: 'BASIC INFORMATION', styleId: 'Heading1', listMarkerText: 'ARTICLE 1' },
        { sdBlockId: 'p2', text: 'PROPERTY', styleId: 'Heading1', listMarkerText: 'ARTICLE 2' },
      ]);

      const config: TocSwitchConfig = {
        source: { tcFieldIdentifier: 'C' },
        display: { hyperlinks: true },
        preserved: { customStyles: [{ styleName: 'Heading 1', level: 1 }] },
      };

      const sources = collectTocSources(doc, config);
      expect(sources.map((s) => s.text)).toEqual(['BASIC INFORMATION', 'PROPERTY']);
      // Marker is reported alongside the segments so the builder can wrap it
      // in its own run (matching Word's two-run TOC1 shape) instead of
      // smuggling the prefix into the heading text.
      expect(sources.map((s) => s.markerText)).toEqual(['ARTICLE 1', 'ARTICLE 2']);
    });

    it('respects an explicit \\o range when filtering \\t matches', () => {
      const doc = mockDoc([{ sdBlockId: 'p1', text: 'Article 1', styleId: 'CustomHeading' }]);

      const config: TocSwitchConfig = {
        source: { outlineLevels: { from: 1, to: 1 } },
        display: {},
        preserved: { customStyles: [{ styleName: 'CustomHeading', level: 2 }] },
      };

      // Mapping says level 2 but \o range is 1-1 → excluded.
      const sources = collectTocSources(doc, config);
      expect(sources).toHaveLength(0);
    });
  });
});
