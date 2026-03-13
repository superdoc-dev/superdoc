import { describe, expect, it } from 'vitest';
import { buildTocEntryParagraphs, type TocSource } from './toc-entry-builder.js';
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
