import { describe, expect, it } from 'vitest';
import { buildTocEntryParagraphs, type TocSource } from './toc-entry-builder.js';
import { generateTocBookmarkName } from './toc-bookmark-sync.js';
import type { TocSwitchConfig } from '@superdoc/document-api';

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
