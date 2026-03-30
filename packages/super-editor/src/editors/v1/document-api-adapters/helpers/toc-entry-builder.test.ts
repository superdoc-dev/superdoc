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

describe('buildTocEntryParagraphs', () => {
  describe('hyperlink anchors', () => {
    it('uses a _Toc bookmark name as the hyperlink anchor, not the raw sdBlockId', () => {
      const paragraphs = buildTocEntryParagraphs([BASE_SOURCE], makeConfig({ hyperlinks: true }));
      const textNode = paragraphs[0]!.content[0] as { marks?: Array<{ type: string; attrs: Record<string, unknown> }> };
      const linkMark = textNode.marks?.find((m) => m.type === 'link');

      expect(linkMark).toBeDefined();
      expect(linkMark!.attrs.anchor).toMatch(/^_Toc[a-zA-Z0-9_]+$/);
      expect(linkMark!.attrs.anchor).toBe(generateTocBookmarkName(BASE_SOURCE.sdBlockId));
      expect(linkMark!.attrs.anchor).not.toBe(BASE_SOURCE.sdBlockId);
    });

    it('produces the same anchor for the same sdBlockId across calls', () => {
      const first = buildTocEntryParagraphs([BASE_SOURCE], makeConfig({ hyperlinks: true }));
      const second = buildTocEntryParagraphs([BASE_SOURCE], makeConfig({ hyperlinks: true }));

      const getAnchor = (paragraphs: typeof first) => {
        const node = paragraphs[0]!.content[0] as { marks?: Array<{ attrs: Record<string, unknown> }> };
        return node.marks?.[0]?.attrs.anchor;
      };

      expect(getAnchor(first)).toBe(getAnchor(second));
    });

    it('does not add link mark when hyperlinks display option is false', () => {
      const paragraphs = buildTocEntryParagraphs([BASE_SOURCE], makeConfig({ hyperlinks: false }));
      const textNode = paragraphs[0]!.content[0] as { marks?: unknown[] };
      expect(textNode.marks).toBeUndefined();
    });
  });

  describe('rightAlignPageNumbers', () => {
    it('adds a right-aligned tab stop when rightAlignPageNumbers is true', () => {
      const paragraphs = buildTocEntryParagraphs([BASE_SOURCE], makeConfig({ rightAlignPageNumbers: true }));
      const tabStops = paragraphs[0]!.attrs.paragraphProperties as Record<string, unknown>;
      expect(tabStops.tabStops).toEqual([{ tab: { tabType: 'right', pos: 9350 } }]);
    });

    it('adds a right-aligned tab stop by default (undefined)', () => {
      const paragraphs = buildTocEntryParagraphs([BASE_SOURCE], makeConfig());
      const tabStops = paragraphs[0]!.attrs.paragraphProperties as Record<string, unknown>;
      expect(tabStops.tabStops).toEqual([{ tab: { tabType: 'right', pos: 9350 } }]);
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
  });
});

// ---------------------------------------------------------------------------
// collectTocSources — mock doc helper
// ---------------------------------------------------------------------------

interface MockParagraph {
  sdBlockId: string;
  text: string;
  styleId?: string;
  outlineLevel?: number;
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
});
