/**
 * Comprehensive test suite for paragraph converter module
 *
 * Tests for:
 * - mergeAdjacentRuns() - Run merging optimization
 * - paragraphToFlowBlocks() - Main paragraph to FlowBlocks conversion
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  paragraphToFlowBlocks as baseParagraphToFlowBlocks,
  mergeAdjacentRuns,
  dataAttrsCompatible,
  commentsCompatible,
  isInlineImage,
  imageNodeToRun,
} from './paragraph.js';
import type {
  PMNode,
  BlockIdGenerator,
  PositionMap,
  TrackedChangesConfig,
  HyperlinkConfig,
  StyleContext,
  ThemeColorPalette,
  NestedConverters,
} from '../types.js';
import type { ConverterContext } from '../converter-context.js';
import type { Run, TextRun, FlowBlock, ParagraphBlock, TrackedChangeMeta, ImageRun } from '@superdoc/contracts';

// Mock external dependencies
vi.mock('./text-run.js', () => ({
  textNodeToRun: vi.fn(),
  tabNodeToRun: vi.fn(),
  tokenNodeToRun: vi.fn(),
}));

vi.mock('../attributes/index.js', () => ({
  computeParagraphAttrs: vi.fn(),
  cloneParagraphAttrs: vi.fn(),
  hasPageBreakBefore: vi.fn(),
  buildStyleNodeFromAttrs: vi.fn(() => ({})),
  deepClone: vi.fn((value) => value),
  normalizeParagraphSpacing: vi.fn(),
  normalizeParagraphIndent: vi.fn(),
  normalizePxIndent: vi.fn(),
  normalizeOoxmlTabs: vi.fn(),
}));

vi.mock('../sdt/index.js', () => ({
  resolveNodeSdtMetadata: vi.fn(),
  getNodeInstruction: vi.fn(),
}));

vi.mock('../marks/index.js', () => ({
  trackedChangesCompatible: vi.fn(),
  collectTrackedChangeFromMarks: vi.fn(),
  applyMarksToRun: vi.fn(),
}));

vi.mock('../tracked-changes.js', () => ({
  shouldHideTrackedNode: vi.fn(),
  annotateBlockWithTrackedChange: vi.fn(),
  applyTrackedChangesModeToRuns: vi.fn(),
}));

vi.mock('../attributes/paragraph-styles.js', () => ({
  resolveParagraphProperties: vi.fn(),
  hydrateCharacterStyleAttrs: vi.fn(),
  hydrateMarkerStyleAttrs: vi.fn(),
}));

// Import mocked functions
import { textNodeToRun, tabNodeToRun, tokenNodeToRun } from './text-run.js';
import { computeParagraphAttrs, cloneParagraphAttrs, deepClone, hasPageBreakBefore } from '../attributes/index.js';
import { resolveNodeSdtMetadata, getNodeInstruction } from '../sdt/index.js';
import { trackedChangesCompatible, collectTrackedChangeFromMarks, applyMarksToRun } from '../marks/index.js';
import {
  shouldHideTrackedNode,
  annotateBlockWithTrackedChange,
  applyTrackedChangesModeToRuns,
} from '../tracked-changes.js';

const DEFAULT_HYPERLINK_CONFIG: HyperlinkConfig = { enableRichHyperlinks: false };
let defaultConverterContext: ConverterContext = {
  translatedNumbering: {},
  translatedLinkedStyles: {
    docDefaults: {
      runProperties: {},
      paragraphProperties: {},
    },
    styles: {},
  },
};

const isConverters = (value: unknown): value is NestedConverters => {
  if (!value || typeof value !== 'object') return false;
  return (
    'paragraphToFlowBlocks' in value ||
    'tableNodeToBlock' in value ||
    'imageNodeToBlock' in value ||
    'contentBlockNodeToDrawingBlock' in value ||
    'vectorShapeNodeToDrawingBlock' in value ||
    'shapeGroupNodeToDrawingBlock' in value ||
    'shapeContainerNodeToDrawingBlock' in value ||
    'shapeTextboxNodeToDrawingBlock' in value
  );
};

const paragraphToFlowBlocks = (
  para: PMNode,
  nextBlockId: BlockIdGenerator,
  positions: PositionMap,
  defaultFont: string,
  defaultSize: number,
  styleContext: StyleContext,
  trackedChangesConfig?: TrackedChangesConfig,
  bookmarks?: Map<string, number>,
  hyperlinkConfig?: HyperlinkConfig,
  themeColors?: ThemeColorPalette,
  converterContextOrConverters?: ConverterContext | NestedConverters,
  maybeConverters?: NestedConverters,
) => {
  let converterContext: ConverterContext | undefined;
  let converters: NestedConverters | undefined;

  if (isConverters(maybeConverters)) {
    converters = maybeConverters;
  }

  if (isConverters(converterContextOrConverters)) {
    converters = converterContextOrConverters;
  } else if (converterContextOrConverters) {
    converterContext = converterContextOrConverters as ConverterContext;
  }

  return baseParagraphToFlowBlocks({
    para,
    nextBlockId,
    positions,
    defaultFont,
    defaultSize,
    styleContext,
    trackedChangesConfig,
    bookmarks,
    hyperlinkConfig: hyperlinkConfig ?? DEFAULT_HYPERLINK_CONFIG,
    themeColors,
    converters: converters as NestedConverters,
    converterContext: converterContext ?? defaultConverterContext,
    enableComments: true,
  });
};

describe('paragraph converters', () => {
  describe('mergeAdjacentRuns', () => {
    it('should return empty array unchanged', () => {
      const result = mergeAdjacentRuns([]);
      expect(result).toEqual([]);
    });

    it('should return single run unchanged', () => {
      const run: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 0,
        pmEnd: 5,
      };
      const result = mergeAdjacentRuns([run]);
      expect(result).toEqual([run]);
    });

    it('should merge two text runs with continuous PM positions and identical styling', () => {
      const run1: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        bold: true,
        pmStart: 0,
        pmEnd: 5,
      };
      const run2: TextRun = {
        text: ' world',
        fontFamily: 'Arial',
        fontSize: 16,
        bold: true,
        pmStart: 5,
        pmEnd: 11,
      };

      vi.mocked(trackedChangesCompatible).mockReturnValue(true);

      const result = mergeAdjacentRuns([run1, run2]);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        text: 'hello world',
        fontFamily: 'Arial',
        fontSize: 16,
        bold: true,
        pmStart: 0,
        pmEnd: 11,
      });
    });

    it('should not merge runs with non-continuous PM positions', () => {
      const run1: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 0,
        pmEnd: 5,
      };
      const run2: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 10, // Gap in positions
        pmEnd: 15,
      };

      vi.mocked(trackedChangesCompatible).mockReturnValue(true);

      const result = mergeAdjacentRuns([run1, run2]);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(run1);
      expect(result[1]).toEqual(run2);
    });

    it('should not merge runs with different fontFamily', () => {
      const run1: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 0,
        pmEnd: 5,
      };
      const run2: TextRun = {
        text: 'world',
        fontFamily: 'Times New Roman',
        fontSize: 16,
        pmStart: 5,
        pmEnd: 10,
      };

      vi.mocked(trackedChangesCompatible).mockReturnValue(true);

      const result = mergeAdjacentRuns([run1, run2]);
      expect(result).toHaveLength(2);
    });

    it('should not merge runs with different fontSize', () => {
      const run1: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 0,
        pmEnd: 5,
      };
      const run2: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 20,
        pmStart: 5,
        pmEnd: 10,
      };

      vi.mocked(trackedChangesCompatible).mockReturnValue(true);

      const result = mergeAdjacentRuns([run1, run2]);
      expect(result).toHaveLength(2);
    });

    it('should not merge runs with different bold values', () => {
      const run1: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        bold: true,
        pmStart: 0,
        pmEnd: 5,
      };
      const run2: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
        bold: false,
        pmStart: 5,
        pmEnd: 10,
      };

      vi.mocked(trackedChangesCompatible).mockReturnValue(true);

      const result = mergeAdjacentRuns([run1, run2]);
      expect(result).toHaveLength(2);
    });

    it('should not merge runs with different italic values', () => {
      const run1: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        italic: true,
        pmStart: 0,
        pmEnd: 5,
      };
      const run2: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 5,
        pmEnd: 10,
      };

      vi.mocked(trackedChangesCompatible).mockReturnValue(true);

      const result = mergeAdjacentRuns([run1, run2]);
      expect(result).toHaveLength(2);
    });

    it('should not merge runs with different color values', () => {
      const run1: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        color: '#FF0000',
        pmStart: 0,
        pmEnd: 5,
      };
      const run2: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
        color: '#00FF00',
        pmStart: 5,
        pmEnd: 10,
      };

      vi.mocked(trackedChangesCompatible).mockReturnValue(true);

      const result = mergeAdjacentRuns([run1, run2]);
      expect(result).toHaveLength(2);
    });

    it('should not merge runs with different underline values', () => {
      const run1: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        underline: { style: 'single' },
        pmStart: 0,
        pmEnd: 5,
      };
      const run2: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 5,
        pmEnd: 10,
      };

      vi.mocked(trackedChangesCompatible).mockReturnValue(true);

      const result = mergeAdjacentRuns([run1, run2]);
      expect(result).toHaveLength(2);
    });

    it('should not merge runs with different strike values', () => {
      const run1: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        strike: true,
        pmStart: 0,
        pmEnd: 5,
      };
      const run2: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 5,
        pmEnd: 10,
      };

      vi.mocked(trackedChangesCompatible).mockReturnValue(true);

      const result = mergeAdjacentRuns([run1, run2]);
      expect(result).toHaveLength(2);
    });

    it('should not merge runs with different highlight values', () => {
      const run1: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        highlight: '#FFFF00',
        pmStart: 0,
        pmEnd: 5,
      };
      const run2: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 5,
        pmEnd: 10,
      };

      vi.mocked(trackedChangesCompatible).mockReturnValue(true);

      const result = mergeAdjacentRuns([run1, run2]);
      expect(result).toHaveLength(2);
    });

    it('should not merge runs with different letterSpacing values', () => {
      const run1: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        letterSpacing: 2,
        pmStart: 0,
        pmEnd: 5,
      };
      const run2: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
        letterSpacing: 4,
        pmStart: 5,
        pmEnd: 10,
      };

      vi.mocked(trackedChangesCompatible).mockReturnValue(true);

      const result = mergeAdjacentRuns([run1, run2]);
      expect(result).toHaveLength(2);
    });

    it('should not merge runs when one has token property', () => {
      const run1: TextRun = {
        text: 'Page ',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 0,
        pmEnd: 5,
      };
      const run2: TextRun = {
        text: '1',
        token: 'pageNumber',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 5,
        pmEnd: 6,
      };

      vi.mocked(trackedChangesCompatible).mockReturnValue(true);

      const result = mergeAdjacentRuns([run1, run2]);
      expect(result).toHaveLength(2);
    });

    it('should preserve tab runs without merging', () => {
      const run1: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 0,
        pmEnd: 5,
      };
      const tabRun: Run = {
        kind: 'tab',
        text: '\t',
        pmStart: 5,
        pmEnd: 6,
        tabIndex: 0,
        leader: null,
      };
      const run2: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 6,
        pmEnd: 11,
      };

      vi.mocked(trackedChangesCompatible).mockReturnValue(true);

      const result = mergeAdjacentRuns([run1, tabRun, run2]);
      expect(result).toHaveLength(3);
      expect(result[1]).toEqual(tabRun);
    });

    it('should merge multiple consecutive mergeable runs', () => {
      const run1: TextRun = {
        text: 'a',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 0,
        pmEnd: 1,
      };
      const run2: TextRun = {
        text: 'b',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 1,
        pmEnd: 2,
      };
      const run3: TextRun = {
        text: 'c',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 2,
        pmEnd: 3,
      };

      vi.mocked(trackedChangesCompatible).mockReturnValue(true);

      const result = mergeAdjacentRuns([run1, run2, run3]);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        text: 'abc',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 0,
        pmEnd: 3,
      });
    });

    it('should handle mix of mergeable and non-mergeable runs', () => {
      const run1: TextRun = {
        text: 'a',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 0,
        pmEnd: 1,
      };
      const run2: TextRun = {
        text: 'b',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 1,
        pmEnd: 2,
      };
      const run3: TextRun = {
        text: 'c',
        fontFamily: 'Times',
        fontSize: 16,
        pmStart: 2,
        pmEnd: 3,
      };
      const run4: TextRun = {
        text: 'd',
        fontFamily: 'Times',
        fontSize: 16,
        pmStart: 3,
        pmEnd: 4,
      };

      vi.mocked(trackedChangesCompatible).mockReturnValue(true);

      const result = mergeAdjacentRuns([run1, run2, run3, run4]);
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('ab');
      expect(result[1].text).toBe('cd');
    });

    it('should not merge when tracked changes are incompatible', () => {
      const run1: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 0,
        pmEnd: 5,
      };
      const run2: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 5,
        pmEnd: 10,
      };

      vi.mocked(trackedChangesCompatible).mockReturnValue(false);

      const result = mergeAdjacentRuns([run1, run2]);
      expect(result).toHaveLength(2);
    });

    it('should not merge runs missing pmStart', () => {
      const run1: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        pmEnd: 5,
      };
      const run2: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 5,
        pmEnd: 10,
      };

      vi.mocked(trackedChangesCompatible).mockReturnValue(true);

      const result = mergeAdjacentRuns([run1, run2]);
      expect(result).toHaveLength(2);
    });

    it('should not merge runs missing pmEnd', () => {
      const run1: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 0,
      };
      const run2: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 5,
        pmEnd: 10,
      };

      vi.mocked(trackedChangesCompatible).mockReturnValue(true);

      const result = mergeAdjacentRuns([run1, run2]);
      expect(result).toHaveLength(2);
    });

    it('should handle empty text in runs', () => {
      const run1: TextRun = {
        text: '',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 0,
        pmEnd: 0,
      };
      const run2: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
        pmStart: 0,
        pmEnd: 5,
      };

      vi.mocked(trackedChangesCompatible).mockReturnValue(true);

      const result = mergeAdjacentRuns([run1, run2]);
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('world');
    });

    it('should handle long sequences of runs efficiently', () => {
      const runs: TextRun[] = [];
      for (let i = 0; i < 100; i++) {
        runs.push({
          text: String(i),
          fontFamily: 'Arial',
          fontSize: 16,
          pmStart: i,
          pmEnd: i + 1,
        });
      }

      vi.mocked(trackedChangesCompatible).mockReturnValue(true);

      const result = mergeAdjacentRuns(runs);
      expect(result).toHaveLength(1);
      expect(result[0].pmStart).toBe(0);
      expect(result[0].pmEnd).toBe(100);
    });
  });

  describe('paragraphToFlowBlocks', () => {
    let nextBlockId: BlockIdGenerator;
    let positions: PositionMap;
    let styleContext: StyleContext;
    let converterContext: ConverterContext;

    beforeEach(() => {
      vi.clearAllMocks();

      // Setup default block ID generator
      let counter = 0;
      nextBlockId = vi.fn((kind: string) => `${kind}-${counter++}`);

      // Setup position map
      positions = new WeakMap();

      // Setup style context (mock)
      styleContext = {};
      converterContext = {
        translatedNumbering: {},
        translatedLinkedStyles: {
          docDefaults: {
            runProperties: {},
            paragraphProperties: {},
          },
          styles: {},
        },
      };
      defaultConverterContext = converterContext;

      // Setup default mock returns
      vi.mocked(computeParagraphAttrs).mockReturnValue({ paragraphAttrs: {}, resolvedParagraphProperties: {} });
      vi.mocked(cloneParagraphAttrs).mockReturnValue({});
      vi.mocked(hasPageBreakBefore).mockReturnValue(false);
      vi.mocked(textNodeToRun).mockImplementation((node) => ({
        text: node.text || '',
        fontFamily: 'Arial',
        fontSize: 16,
      }));
      vi.mocked(tabNodeToRun).mockReturnValue({
        kind: 'tab',
        text: '\t',
        pmStart: 0,
        pmEnd: 1,
        tabIndex: 0,
        leader: null,
      });
      vi.mocked(tokenNodeToRun).mockReturnValue({
        text: '1',
        token: 'pageNumber',
        fontFamily: 'Arial',
        fontSize: 16,
      });
      vi.mocked(resolveNodeSdtMetadata).mockReturnValue(undefined);
      vi.mocked(getNodeInstruction).mockReturnValue('');
      vi.mocked(collectTrackedChangeFromMarks).mockReturnValue(undefined);
      vi.mocked(shouldHideTrackedNode).mockReturnValue(false);
      vi.mocked(applyTrackedChangesModeToRuns).mockImplementation((runs) => runs);
      vi.mocked(annotateBlockWithTrackedChange).mockImplementation(() => undefined);
      vi.mocked(applyMarksToRun).mockImplementation(() => undefined);
    });

    describe('Basic functionality', () => {
      it('should create empty paragraph for node with no content', () => {
        const para: PMNode = {
          type: 'paragraph',
          content: [],
        };

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        expect(blocks).toHaveLength(1);
        expect(blocks[0].kind).toBe('paragraph');
        const paraBlock = blocks[0] as ParagraphBlock;
        expect(paraBlock.runs).toHaveLength(1);
        expect(paraBlock.runs[0]).toMatchObject({
          text: '',
        });
        // Font properties are set from style resolution or defaults
        expect(paraBlock.runs[0].fontFamily).toBeDefined();
        expect(paraBlock.runs[0].fontSize).toBeGreaterThan(0);
      });

      it('flags empty sectPr paragraph as a section marker', () => {
        const para: PMNode = {
          type: 'paragraph',
          content: [],
          attrs: {
            paragraphProperties: {
              sectPr: { type: 'element', name: 'w:sectPr', elements: [] },
            },
          },
        };

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        expect(blocks).toHaveLength(1);
        const paraBlock = blocks[0] as ParagraphBlock;
        expect(paraBlock.attrs?.sectPrMarker).toBe(true);
      });

      it('should skip empty paragraph when paragraph runProperties.vanish is true', () => {
        const para: PMNode = {
          type: 'paragraph',
          attrs: {
            paragraphProperties: {
              runProperties: {
                vanish: true,
              },
            },
          },
          content: [],
        };

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        expect(blocks).toHaveLength(0);
      });

      it('should still render text when paragraph runProperties.vanish is true', () => {
        const para: PMNode = {
          type: 'paragraph',
          attrs: {
            paragraphProperties: {
              runProperties: {
                vanish: true,
              },
            },
          },
          content: [{ type: 'text', text: 'Visible text' }],
        };

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        expect(blocks).toHaveLength(1);
        const paraBlock = blocks[0] as ParagraphBlock;
        expect(paraBlock.runs).toHaveLength(1);
        expect(paraBlock.runs[0].text).toBe('Visible text');
      });

      it('should create empty paragraph for node without content property', () => {
        const para: PMNode = {
          type: 'paragraph',
        };

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        expect(blocks).toHaveLength(1);
        expect(blocks[0].kind).toBe('paragraph');
      });

      it('should convert simple text paragraph', () => {
        const textNode: PMNode = { type: 'text', text: 'Hello world' };
        const para: PMNode = {
          type: 'paragraph',
          content: [textNode],
        };

        vi.mocked(textNodeToRun).mockReturnValue({
          text: 'Hello world',
          fontFamily: 'Arial',
          fontSize: 16,
        });

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        expect(blocks).toHaveLength(1);
        expect(blocks[0].kind).toBe('paragraph');
        const paraBlock = blocks[0] as ParagraphBlock;
        expect(paraBlock.runs).toHaveLength(1);
        expect(paraBlock.runs[0].text).toBe('Hello world');
        expect(vi.mocked(textNodeToRun)).toHaveBeenCalledWith(
          textNode,
          positions,
          'Arial',
          16,
          [],
          undefined,
          expect.any(Object),
          undefined,
        );
      });

      it('should add page break before paragraph when paragraph attrs request it', () => {
        const para: PMNode = {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Test' }],
        };

        vi.mocked(computeParagraphAttrs).mockReturnValue({
          paragraphAttrs: { pageBreakBefore: true },
          resolvedParagraphProperties: {},
        });

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        expect(blocks).toHaveLength(2);
        expect(blocks[0].kind).toBe('pageBreak');
        expect(blocks[0]).toEqual({
          kind: 'pageBreak',
          id: expect.any(String),
          attrs: { source: 'pageBreakBefore' },
        });
        expect(blocks[1].kind).toBe('paragraph');
      });

      it('should handle multiple text nodes', () => {
        const para: PMNode = {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: ' world' },
          ],
        };

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        expect(blocks).toHaveLength(1);
        const paraBlock = blocks[0] as ParagraphBlock;
        expect(paraBlock.runs).toHaveLength(2);
        expect(vi.mocked(textNodeToRun)).toHaveBeenCalledTimes(2);
      });
    });

    describe('Run nodes', () => {
      it('should handle run node as transparent container', () => {
        const para: PMNode = {
          type: 'paragraph',
          content: [
            {
              type: 'run',
              marks: [{ type: 'bold' }],
              content: [{ type: 'text', text: 'Bold text' }],
            },
          ],
        };

        const blocks = paragraphToFlowBlocks(
          para,
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          converterContext,
        );

        expect(blocks).toHaveLength(1);
        // textNodeToRun receives empty marks - marks are applied separately after linked styles
        // This ensures marks override linked styles (correct priority order)
        expect(vi.mocked(textNodeToRun)).toHaveBeenCalledWith(
          { type: 'text', text: 'Bold text' },
          positions,
          'Arial',
          16,
          [], // Empty marks - marks applied separately after linked styles
          undefined,
          expect.any(Object),
          undefined,
        );
        // Marks including bold are applied via applyMarksToRun after linked styles
        expect(vi.mocked(applyMarksToRun)).toHaveBeenCalledWith(
          expect.any(Object),
          expect.arrayContaining([{ type: 'bold' }]),
          expect.any(Object),
          undefined,
          undefined,
          true, // enableComments defaults to true
        );
      });

      it('should skip run content when runProperties.vanish is true', () => {
        const para: PMNode = {
          type: 'paragraph',
          content: [
            {
              type: 'run',
              attrs: {
                runProperties: {
                  vanish: true,
                },
              },
              content: [{ type: 'text', text: 'Hidden text' }],
            },
          ],
        };

        const blocks = paragraphToFlowBlocks(
          para,
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          converterContext,
        );

        expect(blocks).toHaveLength(0);
        expect(vi.mocked(textNodeToRun)).not.toHaveBeenCalled();
      });

      it('should merge marks from nested run nodes', () => {
        const para: PMNode = {
          type: 'paragraph',
          content: [
            {
              type: 'run',
              marks: [{ type: 'bold' }],
              content: [
                {
                  type: 'run',
                  marks: [{ type: 'italic' }],
                  content: [{ type: 'text', text: 'Bold italic' }],
                },
              ],
            },
          ],
        };

        paragraphToFlowBlocks(
          para,
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          converterContext,
        );

        // textNodeToRun receives empty marks - marks are applied separately after linked styles
        expect(vi.mocked(textNodeToRun)).toHaveBeenCalledWith(
          { type: 'text', text: 'Bold italic' },
          positions,
          'Arial',
          16,
          [], // Empty marks - marks applied separately after linked styles
          undefined,
          { enableRichHyperlinks: false },
          undefined,
        );
        // Marks are merged as [...nodeMarks, ...inheritedMarks] and applied via applyMarksToRun
        // So italic (from inner run) comes first, then bold (from outer run)
        expect(vi.mocked(applyMarksToRun)).toHaveBeenCalledWith(
          expect.any(Object),
          expect.arrayContaining([{ type: 'italic' }, { type: 'bold' }]),
          { enableRichHyperlinks: false },
          undefined,
          undefined,
          true, // enableComments defaults to true
        );
      });
    });

    describe('Tab nodes', () => {
      it('should convert tab node and track ordinal', () => {
        const tabNode: PMNode = { type: 'tab' };
        const para: PMNode = {
          type: 'paragraph',
          content: [tabNode],
        };

        const mockTabRun: Run = {
          kind: 'tab',
          text: '\t',
          pmStart: 0,
          pmEnd: 1,
          tabIndex: 0,
          leader: null,
        };
        vi.mocked(tabNodeToRun).mockReturnValue(mockTabRun);

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        expect(vi.mocked(tabNodeToRun)).toHaveBeenCalledWith(tabNode, positions, 0, {}, []);
        const paraBlock = blocks[0] as ParagraphBlock;
        expect(paraBlock.runs).toContain(mockTabRun);
      });

      it('should increment tab ordinal for multiple tabs', () => {
        const para: PMNode = {
          type: 'paragraph',
          content: [{ type: 'tab' }, { type: 'tab' }, { type: 'tab' }],
        };

        paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        expect(vi.mocked(tabNodeToRun)).toHaveBeenNthCalledWith(1, expect.any(Object), positions, 0, {}, []);
        expect(vi.mocked(tabNodeToRun)).toHaveBeenNthCalledWith(2, expect.any(Object), positions, 1, {}, []);
        expect(vi.mocked(tabNodeToRun)).toHaveBeenNthCalledWith(3, expect.any(Object), positions, 2, {}, []);
      });

      it('should skip tab when tabNodeToRun returns null', () => {
        const para: PMNode = {
          type: 'paragraph',
          content: [{ type: 'tab' }],
        };

        vi.mocked(tabNodeToRun).mockReturnValue(null);

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        const paraBlock = blocks[0] as ParagraphBlock;
        // Empty paragraph created because no runs were added
        expect(paraBlock.runs).toHaveLength(1);
        expect(paraBlock.runs[0].text).toBe('');
      });
    });

    describe('Token nodes', () => {
      it('should convert page-number token node', () => {
        const tokenNode: PMNode = { type: 'page-number' };
        const para: PMNode = {
          type: 'paragraph',
          content: [tokenNode],
        };

        const mockTokenRun: TextRun = {
          text: '1',
          token: 'pageNumber',
          fontFamily: 'Arial',
          fontSize: 16,
        };
        vi.mocked(tokenNodeToRun).mockReturnValue(mockTokenRun);

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        expect(vi.mocked(tokenNodeToRun)).toHaveBeenCalledWith(
          tokenNode,
          positions,
          'Arial',
          16,
          [],
          'pageNumber',
          expect.any(Object),
          undefined,
        );
        const paraBlock = blocks[0] as ParagraphBlock;
        expect(paraBlock.runs).toContain(mockTokenRun);
      });

      it('should convert total-page-number token node', () => {
        const tokenNode: PMNode = { type: 'total-page-number' };

        paragraphToFlowBlocks(
          {
            type: 'paragraph',
            content: [tokenNode],
          },
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
        );

        expect(vi.mocked(tokenNodeToRun)).toHaveBeenCalledWith(
          tokenNode,
          positions,
          'Arial',
          16,
          [],
          'totalPageCount',
          expect.any(Object),
          undefined,
        );
      });

      it('should attach SDT metadata to token run when active', () => {
        const sdtMetadata = { kind: 'field' as const };
        const para: PMNode = {
          type: 'paragraph',
          content: [
            {
              type: 'structuredContent',
              content: [{ type: 'page-number' }],
            },
          ],
        };

        vi.mocked(resolveNodeSdtMetadata).mockReturnValue(sdtMetadata);
        const mockTokenRun: TextRun = {
          text: '1',
          token: 'pageNumber',
          fontFamily: 'Arial',
          fontSize: 16,
        };
        vi.mocked(tokenNodeToRun).mockReturnValue(mockTokenRun);

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        const paraBlock = blocks[0] as ParagraphBlock;
        const tokenRun = paraBlock.runs[0] as TextRun;
        expect(tokenRun.sdt).toEqual(sdtMetadata);
      });
    });

    describe('SDT nodes', () => {
      it('should handle structuredContent as transparent container', () => {
        const para: PMNode = {
          type: 'paragraph',
          content: [
            {
              type: 'structuredContent',
              content: [{ type: 'text', text: 'SDT content' }],
            },
          ],
        };

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        expect(vi.mocked(textNodeToRun)).toHaveBeenCalled();
        const paraBlock = blocks[0] as ParagraphBlock;
        expect(paraBlock.runs).toHaveLength(1);
      });

      it('should resolve and propagate SDT metadata through structuredContent', () => {
        const sdtMetadata = { kind: 'field' as const };

        vi.mocked(resolveNodeSdtMetadata).mockReturnValue(sdtMetadata);

        paragraphToFlowBlocks(
          {
            type: 'paragraph',
            content: [
              {
                type: 'structuredContent',
                content: [{ type: 'text', text: 'SDT content' }],
              },
            ],
          },
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
        );

        expect(vi.mocked(textNodeToRun)).toHaveBeenCalledWith(
          expect.any(Object),
          positions,
          'Arial',
          16,
          [],
          sdtMetadata,
          expect.any(Object),
          undefined,
        );
      });

      it('should render fieldAnnotation as FieldAnnotationRun with inner content as displayLabel', () => {
        const blocks = paragraphToFlowBlocks(
          {
            type: 'paragraph',
            content: [
              {
                type: 'fieldAnnotation',
                content: [{ type: 'text', text: 'Field value' }],
              },
            ],
          },
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
        );

        expect(blocks).toHaveLength(1);
        const para = blocks[0] as { kind: string; runs: unknown[] };
        expect(para.kind).toBe('paragraph');
        expect(para.runs).toHaveLength(1);
        expect(para.runs[0]).toMatchObject({
          kind: 'fieldAnnotation',
          variant: 'text',
          displayLabel: 'Field value',
        });
      });

      it('should use displayLabel when fieldAnnotation has no content', () => {
        const blocks = paragraphToFlowBlocks(
          {
            type: 'paragraph',
            content: [
              {
                type: 'fieldAnnotation',
                attrs: { displayLabel: 'Display Text' },
                content: [],
              },
            ],
          },
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
        );

        expect(blocks).toHaveLength(1);
        const para = blocks[0] as { kind: string; runs: unknown[] };
        expect(para.kind).toBe('paragraph');
        expect(para.runs).toHaveLength(1);
        expect(para.runs[0]).toMatchObject({
          kind: 'fieldAnnotation',
          variant: 'text',
          displayLabel: 'Display Text',
        });
      });

      it('should fallback to defaultDisplayLabel when displayLabel not present', () => {
        const blocks = paragraphToFlowBlocks(
          {
            type: 'paragraph',
            content: [
              {
                type: 'fieldAnnotation',
                attrs: { defaultDisplayLabel: 'Default Text' },
                content: [],
              },
            ],
          },
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
        );

        expect(blocks).toHaveLength(1);
        const para = blocks[0] as { kind: string; runs: unknown[] };
        expect(para.kind).toBe('paragraph');
        expect(para.runs).toHaveLength(1);
        expect(para.runs[0]).toMatchObject({
          kind: 'fieldAnnotation',
          variant: 'text',
          displayLabel: 'Default Text',
        });
      });

      it('should use alias as final fallback for fieldAnnotation', () => {
        const blocks = paragraphToFlowBlocks(
          {
            type: 'paragraph',
            content: [
              {
                type: 'fieldAnnotation',
                attrs: { alias: 'Alias Text' },
                content: [],
              },
            ],
          },
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
        );

        expect(blocks).toHaveLength(1);
        const para = blocks[0] as { kind: string; runs: unknown[] };
        expect(para.kind).toBe('paragraph');
        expect(para.runs).toHaveLength(1);
        expect(para.runs[0]).toMatchObject({
          kind: 'fieldAnnotation',
          variant: 'text',
          displayLabel: 'Alias Text',
        });
      });

      it('should propagate SDT metadata from fieldAnnotation', () => {
        const fieldMetadata = {
          type: 'fieldAnnotation' as const,
          fieldId: 'test-field-123',
          variant: 'text' as const,
        };

        vi.mocked(resolveNodeSdtMetadata).mockReturnValue(fieldMetadata);

        const blocks = paragraphToFlowBlocks(
          {
            type: 'paragraph',
            content: [
              {
                type: 'fieldAnnotation',
                content: [{ type: 'text', text: 'Field' }],
              },
            ],
          },
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
        );

        expect(blocks).toHaveLength(1);
        const para = blocks[0] as { kind: string; runs: unknown[] };
        expect(para.kind).toBe('paragraph');
        expect(para.runs).toHaveLength(1);
        expect(para.runs[0]).toMatchObject({
          kind: 'fieldAnnotation',
          displayLabel: 'Field',
          sdt: fieldMetadata,
        });
      });
    });

    describe('Page reference', () => {
      it('should create pageReference token run with bookmark ID', () => {
        const pageRefNode: PMNode = {
          type: 'pageReference',
          attrs: {},
        };
        const para: PMNode = {
          type: 'paragraph',
          content: [pageRefNode],
        };

        vi.mocked(getNodeInstruction).mockReturnValue('PAGEREF _Toc123 \\h');
        positions.set(pageRefNode, { start: 10, end: 15 });

        const blocks = paragraphToFlowBlocks(
          para,
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          converterContext,
        );

        const paraBlock = blocks[0] as ParagraphBlock;
        const run = paraBlock.runs[0] as TextRun;
        expect(run.token).toBe('pageReference');
        expect(run.pageRefMetadata).toEqual({
          bookmarkId: '_Toc123',
          instruction: 'PAGEREF _Toc123 \\h',
        });
        expect(run.pmStart).toBe(10);
        expect(run.pmEnd).toBe(15);
      });

      it('should handle quoted bookmark ID in instruction', () => {
        const para: PMNode = {
          type: 'paragraph',
          content: [{ type: 'pageReference', attrs: {} }],
        };

        vi.mocked(getNodeInstruction).mockReturnValue('PAGEREF "_Toc456" \\h');

        const blocks = paragraphToFlowBlocks(
          para,
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          converterContext,
        );

        const paraBlock = blocks[0] as ParagraphBlock;
        const run = paraBlock.runs[0] as TextRun;
        expect(run.pageRefMetadata?.bookmarkId).toBe('_Toc456');
      });

      it('should use materialized content as fallback text', () => {
        vi.mocked(getNodeInstruction).mockReturnValue('PAGEREF _Toc123 \\h');

        paragraphToFlowBlocks(
          {
            type: 'paragraph',
            content: [
              {
                type: 'pageReference',
                attrs: {},
                content: [{ type: 'text', text: '42' }],
              },
            ],
          },
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          converterContext,
        );

        expect(vi.mocked(textNodeToRun)).toHaveBeenCalledWith(
          { type: 'text', text: '42' },
          positions,
          'Arial',
          16,
          [],
          undefined,
          expect.any(Object),
          undefined,
        );
      });

      it('should use ?? as default fallback when no content', () => {
        vi.mocked(getNodeInstruction).mockReturnValue('PAGEREF _Toc123 \\h');

        paragraphToFlowBlocks(
          {
            type: 'paragraph',
            content: [{ type: 'pageReference', attrs: {} }],
          },
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          converterContext,
        );

        expect(vi.mocked(textNodeToRun)).toHaveBeenCalledWith(
          { type: 'text', text: '??' },
          positions,
          'Arial',
          16,
          [],
          undefined,
          expect.any(Object),
          undefined,
        );
      });

      it('should treat as transparent container when no bookmark ID found', () => {
        vi.mocked(getNodeInstruction).mockReturnValue('INVALID');

        paragraphToFlowBlocks(
          {
            type: 'paragraph',
            content: [
              {
                type: 'pageReference',
                attrs: {},
                content: [{ type: 'text', text: 'fallback' }],
              },
            ],
          },
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          converterContext,
        );

        expect(vi.mocked(textNodeToRun)).toHaveBeenCalledWith(
          { type: 'text', text: 'fallback' },
          positions,
          'Arial',
          16,
          [],
          undefined,
          expect.any(Object),
          undefined,
        );
      });

      it('should apply marks from pageReference marksAsAttrs', () => {
        vi.mocked(getNodeInstruction).mockReturnValue('PAGEREF _Toc123 \\h');

        paragraphToFlowBlocks(
          {
            type: 'paragraph',
            content: [
              {
                type: 'pageReference',
                attrs: {
                  marksAsAttrs: [{ type: 'bold' }, { type: 'italic' }],
                },
              },
            ],
          },
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          converterContext,
        );

        // textNodeToRun is called with empty marks (marks are applied separately via applyMarksToRun)
        expect(vi.mocked(textNodeToRun)).toHaveBeenCalledWith(
          expect.any(Object),
          positions,
          'Arial',
          16,
          [], // Empty marks - applied separately to honor enableComments
          undefined,
          expect.any(Object),
          undefined,
        );

        // Marks are applied via applyMarksToRun to honor enableComments flag
        expect(vi.mocked(applyMarksToRun)).toHaveBeenCalledWith(
          expect.any(Object),
          [{ type: 'bold' }, { type: 'italic' }],
          expect.any(Object),
          undefined,
          undefined,
          true, // enableComments defaults to true
        );
      });
    });

    describe('Bookmarks', () => {
      it('should track bookmarkStart position in bookmarks map', () => {
        const bookmarkNode: PMNode = {
          type: 'bookmarkStart',
          attrs: { name: 'MyBookmark' },
        };
        const para: PMNode = {
          type: 'paragraph',
          content: [bookmarkNode],
        };

        positions.set(bookmarkNode, { start: 100, end: 100 });
        const bookmarks = new Map<string, number>();

        paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext, undefined, bookmarks);

        expect(bookmarks.get('MyBookmark')).toBe(100);
      });

      it('should not track bookmark when bookmarks map not provided', () => {
        const para: PMNode = {
          type: 'paragraph',
          content: [
            {
              type: 'bookmarkStart',
              attrs: { name: 'MyBookmark' },
            },
          ],
        };

        // Should not throw
        expect(() => {
          paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);
        }).not.toThrow();
      });

      it('should process bookmark content when present', () => {
        paragraphToFlowBlocks(
          {
            type: 'paragraph',
            content: [
              {
                type: 'bookmarkStart',
                attrs: { name: 'MyBookmark' },
                content: [{ type: 'text', text: 'Bookmarked text' }],
              },
            ],
          },
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
        );

        expect(vi.mocked(textNodeToRun)).toHaveBeenCalled();
      });
    });

    describe('Block nodes', () => {
      it('should flush paragraph before image node', () => {
        const imageNode: PMNode = { type: 'image' };
        const para: PMNode = {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Before' }, imageNode, { type: 'text', text: 'After' }],
        };

        const mockImageBlock: FlowBlock = {
          kind: 'image',
          id: 'image-0',
          src: 'image.jpg',
          width: 100,
          height: 100,
          attrs: {},
        };

        const converters = {
          imageNodeToBlock: vi.fn().mockReturnValue(mockImageBlock),
        };

        const blocks = paragraphToFlowBlocks(
          para,
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
          undefined,
          undefined,
          undefined,
          undefined,
          converters as never,
        );

        expect(blocks).toHaveLength(3);
        expect(blocks[0].kind).toBe('paragraph');
        expect(blocks[1].kind).toBe('image');
        expect(blocks[2].kind).toBe('paragraph');
      });

      it('should call imageNodeToBlock converter with correct parameters', () => {
        const imageNode: PMNode = { type: 'image', marks: [{ type: 'trackInsert' }] };
        const para: PMNode = {
          type: 'paragraph',
          content: [imageNode],
        };

        const trackedMeta: TrackedChangeMeta = {
          kind: 'insert',
          id: 'insert-1',
        };
        const trackedChanges: TrackedChangesConfig = {
          mode: 'review',
          enabled: true,
        };

        vi.mocked(collectTrackedChangeFromMarks).mockReturnValue(trackedMeta);

        const converters = {
          imageNodeToBlock: vi.fn().mockReturnValue({
            kind: 'image',
            id: 'image-0',
            src: 'image.jpg',
            width: 100,
            height: 100,
            attrs: {},
          }),
        };

        paragraphToFlowBlocks(
          para,
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
          trackedChanges,
          undefined,
          undefined,
          undefined,
          converters as never,
        );

        expect(converters.imageNodeToBlock).toHaveBeenCalledWith(
          imageNode,
          nextBlockId,
          positions,
          trackedMeta,
          trackedChanges,
        );
      });

      it('should hide image when shouldHideTrackedNode returns true', () => {
        const imageNode: PMNode = { type: 'image' };

        vi.mocked(shouldHideTrackedNode).mockReturnValue(true);

        const converters = {
          imageNodeToBlock: vi.fn(),
        };

        paragraphToFlowBlocks(
          {
            type: 'paragraph',
            content: [imageNode],
          },
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
          { mode: 'final', enabled: true },
          undefined,
          undefined,
          undefined,
          converters as never,
        );

        expect(converters.imageNodeToBlock).not.toHaveBeenCalled();
      });

      it('should handle vectorShape node', () => {
        const shapeNode: PMNode = { type: 'vectorShape' };
        const para: PMNode = {
          type: 'paragraph',
          content: [shapeNode],
        };

        const mockDrawingBlock: FlowBlock = {
          kind: 'drawing',
          id: 'drawing-0',
          shapes: [],
          attrs: {},
        };

        const converters = {
          vectorShapeNodeToDrawingBlock: vi.fn().mockReturnValue(mockDrawingBlock),
        };

        const blocks = paragraphToFlowBlocks(
          para,
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
          undefined,
          undefined,
          undefined,
          undefined,
          converters as never,
        );

        expect(converters.vectorShapeNodeToDrawingBlock).toHaveBeenCalledWith(shapeNode, nextBlockId, positions);
        expect(blocks.some((b) => b.kind === 'drawing')).toBe(true);
      });

      it('should handle shapeGroup node', () => {
        const shapeNode: PMNode = { type: 'shapeGroup' };

        const converters = {
          shapeGroupNodeToDrawingBlock: vi.fn().mockReturnValue({
            kind: 'drawing',
            id: 'drawing-0',
            shapes: [],
            attrs: {},
          }),
        };

        paragraphToFlowBlocks(
          {
            type: 'paragraph',
            content: [shapeNode],
          },
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
          undefined,
          undefined,
          undefined,
          undefined,
          converters as never,
        );

        expect(converters.shapeGroupNodeToDrawingBlock).toHaveBeenCalled();
      });

      it('should handle shapeContainer node', () => {
        const shapeNode: PMNode = { type: 'shapeContainer' };

        const converters = {
          shapeContainerNodeToDrawingBlock: vi.fn().mockReturnValue({
            kind: 'drawing',
            id: 'drawing-0',
            shapes: [],
            attrs: {},
          }),
        };

        paragraphToFlowBlocks(
          {
            type: 'paragraph',
            content: [shapeNode],
          },
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
          undefined,
          undefined,
          undefined,
          undefined,
          converters as never,
        );

        expect(converters.shapeContainerNodeToDrawingBlock).toHaveBeenCalled();
      });

      it('should handle shapeTextbox node', () => {
        const shapeNode: PMNode = { type: 'shapeTextbox' };

        const converters = {
          shapeTextboxNodeToDrawingBlock: vi.fn().mockReturnValue({
            kind: 'drawing',
            id: 'drawing-0',
            shapes: [],
            attrs: {},
          }),
        };

        paragraphToFlowBlocks(
          {
            type: 'paragraph',
            content: [shapeNode],
          },
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
          undefined,
          undefined,
          undefined,
          undefined,
          converters as never,
        );

        expect(converters.shapeTextboxNodeToDrawingBlock).toHaveBeenCalled();
      });

      it('should handle table node', () => {
        const tableNode: PMNode = { type: 'table' };
        const para: PMNode = {
          type: 'paragraph',
          content: [tableNode],
        };

        const mockTableBlock: FlowBlock = {
          kind: 'table',
          id: 'table-0',
          rows: [],
          attrs: {},
        };

        const converters = {
          tableNodeToBlock: vi.fn().mockReturnValue(mockTableBlock),
        };

        const bookmarks = new Map<string, number>();
        const hyperlinkConfig: HyperlinkConfig = { enableRichHyperlinks: false };
        const trackedChanges: TrackedChangesConfig = { mode: 'review', enabled: true };

        const blocks = paragraphToFlowBlocks(
          para,
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
          trackedChanges,
          bookmarks,
          hyperlinkConfig,
          undefined,
          converters as never,
        );

        expect(converters.tableNodeToBlock).toHaveBeenCalledWith(
          expect.objectContaining({
            node: tableNode,
            nextBlockId,
            positions,
            defaultFont: 'Arial',
            defaultSize: 16,
            styleContext,
            trackedChangesConfig: trackedChanges,
            bookmarks,
            hyperlinkConfig,
          }),
        );
        expect(blocks.some((b) => b.kind === 'table')).toBe(true);
      });

      it('should handle hardBreak node (page break)', () => {
        const hardBreakNode: PMNode = {
          type: 'hardBreak',
          attrs: { pageBreakType: 'page', customAttr: 'value' },
        };
        const para: PMNode = {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Before' }, hardBreakNode, { type: 'text', text: 'After' }],
        };

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        expect(blocks).toHaveLength(3);
        expect(blocks[1].kind).toBe('pageBreak');
        expect(blocks[1].attrs).toEqual({ pageBreakType: 'page', customAttr: 'value' });
      });

      it('should handle lineBreak with column break type', () => {
        const lineBreakNode: PMNode = {
          type: 'lineBreak',
          attrs: { lineBreakType: 'column' },
        };
        const para: PMNode = {
          type: 'paragraph',
          content: [lineBreakNode],
        };

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        expect(blocks.some((b) => b.kind === 'columnBreak')).toBe(true);
      });

      it('should ignore lineBreak without column break type', () => {
        const lineBreakNode: PMNode = {
          type: 'lineBreak',
          attrs: {},
        };
        const para: PMNode = {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Text' }, lineBreakNode],
        };

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        expect(blocks).toHaveLength(1);
        expect(blocks[0].kind).toBe('paragraph');
        const paraBlock = blocks[0] as ParagraphBlock;
        expect(paraBlock.runs).toHaveLength(2);
        expect((paraBlock.runs[1] as Run).kind).toBe('lineBreak');
      });
    });

    describe('Tracked changes', () => {
      it('should apply tracked changes mode to runs when config provided', () => {
        const para: PMNode = {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Test' }],
        };

        const trackedChanges: TrackedChangesConfig = {
          mode: 'final',
          enabled: true,
        };

        const filteredRuns: Run[] = [
          {
            text: 'Test',
            fontFamily: 'Arial',
            fontSize: 16,
          },
        ];

        vi.mocked(applyTrackedChangesModeToRuns).mockReturnValue(filteredRuns);

        const blocks = paragraphToFlowBlocks(
          para,
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
          trackedChanges,
          undefined,
          undefined,
        );

        expect(vi.mocked(applyTrackedChangesModeToRuns)).toHaveBeenCalledWith(
          expect.any(Array),
          trackedChanges,
          expect.any(Object),
          applyMarksToRun,
          undefined,
          true,
        );

        const paraBlock = blocks[0] as ParagraphBlock;
        expect(paraBlock.attrs?.trackedChangesMode).toBe('final');
        expect(paraBlock.attrs?.trackedChangesEnabled).toBe(true);
      });

      it('should remove empty paragraph after tracked changes filtering', () => {
        const para: PMNode = {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Deleted text' }],
        };

        const trackedChanges: TrackedChangesConfig = {
          mode: 'final',
          enabled: true,
        };

        vi.mocked(applyTrackedChangesModeToRuns).mockReturnValue([]);

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext, trackedChanges);

        expect(blocks).toHaveLength(0);
      });

      it('should not apply tracked changes mode when config not provided', () => {
        const para: PMNode = {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Test' }],
        };

        paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        expect(vi.mocked(applyTrackedChangesModeToRuns)).not.toHaveBeenCalled();
      });

      it('should preserve non-paragraph blocks during tracked changes processing', () => {
        const hardBreakNode: PMNode = { type: 'hardBreak', attrs: { pageBreakType: 'page' } };
        const para: PMNode = {
          type: 'paragraph',
          content: [hardBreakNode],
        };

        const trackedChanges: TrackedChangesConfig = {
          mode: 'final',
          enabled: true,
        };

        vi.mocked(applyTrackedChangesModeToRuns).mockReturnValue([]);

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext, trackedChanges);

        expect(blocks.some((b) => b.kind === 'pageBreak')).toBe(true);
      });
    });

    describe('Run merging', () => {
      it('should merge adjacent runs in paragraph', () => {
        const para: PMNode = {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a' },
            { type: 'text', text: 'b' },
          ],
        };

        vi.mocked(textNodeToRun)
          .mockReturnValueOnce({
            text: 'a',
            fontFamily: 'Arial',
            fontSize: 16,
            pmStart: 0,
            pmEnd: 1,
          })
          .mockReturnValueOnce({
            text: 'b',
            fontFamily: 'Arial',
            fontSize: 16,
            pmStart: 1,
            pmEnd: 2,
          });

        vi.mocked(trackedChangesCompatible).mockReturnValue(true);

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        const paraBlock = blocks[0] as ParagraphBlock;
        expect(paraBlock.runs).toHaveLength(1);
        expect(paraBlock.runs[0].text).toBe('ab');
      });
    });

    describe('Edge cases', () => {
      it('should create empty paragraph when all content is block nodes', () => {
        // hardBreak without pageBreakType defaults to line break (inline)
        // so we use pageBreakType: 'page' to make it a block node
        const para: PMNode = {
          type: 'paragraph',
          content: [{ type: 'hardBreak', attrs: { pageBreakType: 'page' } }],
        };

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        expect(blocks.some((b) => b.kind === 'paragraph')).toBe(true);
        const paraBlock = blocks.find((b) => b.kind === 'paragraph') as ParagraphBlock;
        expect(paraBlock.runs).toHaveLength(1);
        expect(paraBlock.runs[0].text).toBe('');
      });

      it('should handle mixed inline and block content', () => {
        const para: PMNode = {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Before' },
            { type: 'hardBreak', attrs: { pageBreakType: 'page' } },
            { type: 'text', text: 'After' },
          ],
        };

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        expect(blocks.length).toBeGreaterThan(1);
        expect(blocks.some((b) => b.kind === 'pageBreak')).toBe(true);
        expect(blocks.filter((b) => b.kind === 'paragraph')).toHaveLength(2);
      });

      it('should generate unique IDs for paragraph splits', () => {
        const para: PMNode = {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Part1' },
            { type: 'hardBreak', attrs: { pageBreakType: 'page' } },
            { type: 'text', text: 'Part2' },
          ],
        };

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        const paraBlocks = blocks.filter((b) => b.kind === 'paragraph');
        expect(paraBlocks[0].id).not.toBe(paraBlocks[1].id);
      });

      it('should handle converter returning null for image', () => {
        const imageNode: PMNode = { type: 'image' };
        const para: PMNode = {
          type: 'paragraph',
          content: [imageNode],
        };

        const converters = {
          imageNodeToBlock: vi.fn().mockReturnValue(null),
        };

        const blocks = paragraphToFlowBlocks(
          para,
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
          undefined,
          undefined,
          undefined,
          undefined,
          converters as never,
        );

        expect(blocks.every((b) => b.kind !== 'image')).toBe(true);
      });

      it('should handle converter returning non-image block kind', () => {
        const imageNode: PMNode = { type: 'image' };
        const para: PMNode = {
          type: 'paragraph',
          content: [imageNode],
        };

        const converters = {
          imageNodeToBlock: vi.fn().mockReturnValue({
            kind: 'paragraph',
            id: 'para-0',
            runs: [],
            attrs: {},
          }),
        };

        const blocks = paragraphToFlowBlocks(
          para,
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
          undefined,
          undefined,
          undefined,
          undefined,
          converters as never,
        );

        // Should not add the non-image block
        expect(blocks.every((b) => b.kind !== 'image')).toBe(true);
      });

      it('should handle missing converter gracefully', () => {
        const imageNode: PMNode = { type: 'image' };
        const para: PMNode = {
          type: 'paragraph',
          content: [imageNode],
        };

        // No converters provided
        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        // Should create empty paragraph
        expect(blocks).toHaveLength(1);
        expect(blocks[0].kind).toBe('paragraph');
      });

      it('should use custom hyperlink config when provided', () => {
        const para: PMNode = {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Test' }],
        };

        const customHyperlinkConfig: HyperlinkConfig = {
          enableRichHyperlinks: true,
        };

        paragraphToFlowBlocks(
          para,
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
          undefined,
          undefined,
          customHyperlinkConfig,
        );

        expect(vi.mocked(textNodeToRun)).toHaveBeenCalledWith(
          expect.any(Object),
          positions,
          'Arial',
          16,
          [],
          undefined,
          customHyperlinkConfig,
          undefined,
        );
      });

      it('should pass converter context to computeParagraphAttrs', () => {
        const para: PMNode = {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Test' }],
        };

        paragraphToFlowBlocks(
          para,
          nextBlockId,
          positions,
          'Arial',
          16,
          styleContext,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          converterContext,
        );

        expect(vi.mocked(computeParagraphAttrs)).toHaveBeenCalledWith(para, converterContext);
      });

      it('should clone paragraph attrs for each paragraph block', () => {
        const para: PMNode = {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Part1' },
            { type: 'hardBreak', attrs: {} },
            { type: 'text', text: 'Part2' },
          ],
        };

        const mockAttrs = { align: 'center' };
        vi.mocked(computeParagraphAttrs).mockReturnValue({
          paragraphAttrs: mockAttrs,
          resolvedParagraphProperties: {},
        });
        vi.mocked(deepClone).mockImplementation((attrs) => ({ ...attrs }));

        const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

        const paraBlocks = blocks.filter((b) => b.kind === 'paragraph');
        // Should be called once per paragraph block (2 blocks in this case)
        expect(vi.mocked(deepClone)).toHaveBeenCalledTimes(paraBlocks.length);
      });
    });
  });

  describe('dataAttrsCompatible', () => {
    it('returns true when both runs have no dataAttrs', () => {
      const runA: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
      };
      const runB: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
      };

      expect(dataAttrsCompatible(runA, runB)).toBe(true);
    });

    it('returns true when both runs have identical dataAttrs', () => {
      const runA: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        dataAttrs: {
          'data-id': '123',
          'data-name': 'test',
        },
      };
      const runB: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
        dataAttrs: {
          'data-id': '123',
          'data-name': 'test',
        },
      };

      expect(dataAttrsCompatible(runA, runB)).toBe(true);
    });

    it('returns false when one run has dataAttrs and other does not', () => {
      const runA: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        dataAttrs: {
          'data-id': '123',
        },
      };
      const runB: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
      };

      expect(dataAttrsCompatible(runA, runB)).toBe(false);
      expect(dataAttrsCompatible(runB, runA)).toBe(false);
    });

    it('returns false when both have dataAttrs but different keys', () => {
      const runA: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        dataAttrs: {
          'data-id': '123',
        },
      };
      const runB: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
        dataAttrs: {
          'data-name': 'test',
        },
      };

      expect(dataAttrsCompatible(runA, runB)).toBe(false);
    });

    it('returns false when both have dataAttrs but different values', () => {
      const runA: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        dataAttrs: {
          'data-id': '123',
        },
      };
      const runB: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
        dataAttrs: {
          'data-id': '456',
        },
      };

      expect(dataAttrsCompatible(runA, runB)).toBe(false);
    });

    it('returns false when attribute counts differ', () => {
      const runA: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        dataAttrs: {
          'data-id': '123',
          'data-name': 'test',
        },
      };
      const runB: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
        dataAttrs: {
          'data-id': '123',
        },
      };

      expect(dataAttrsCompatible(runA, runB)).toBe(false);
    });

    it('returns true when both have empty dataAttrs objects', () => {
      const runA: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        dataAttrs: {},
      };
      const runB: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
        dataAttrs: {},
      };

      expect(dataAttrsCompatible(runA, runB)).toBe(true);
    });

    it('returns true when both have multiple identical attributes in different order', () => {
      const runA: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        dataAttrs: {
          'data-id': '123',
          'data-name': 'test',
          'data-category': 'example',
        },
      };
      const runB: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
        dataAttrs: {
          'data-category': 'example',
          'data-id': '123',
          'data-name': 'test',
        },
      };

      expect(dataAttrsCompatible(runA, runB)).toBe(true);
    });

    it('returns false when one value differs among many matching attributes', () => {
      const runA: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        dataAttrs: {
          'data-id': '123',
          'data-name': 'test',
          'data-category': 'example',
        },
      };
      const runB: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
        dataAttrs: {
          'data-id': '123',
          'data-name': 'different',
          'data-category': 'example',
        },
      };

      expect(dataAttrsCompatible(runA, runB)).toBe(false);
    });
  });

  describe('commentsCompatible', () => {
    it('returns true when both runs have identical comment annotations', () => {
      const runA: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        comments: [{ commentId: 'c1', importedId: 'imp-1', internal: true }],
      };
      const runB: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
        comments: [{ commentId: 'c1', importedId: 'imp-1', internal: true }],
      };

      expect(commentsCompatible(runA, runB)).toBe(true);
    });

    it('returns false when comment annotations differ', () => {
      const runA: TextRun = {
        text: 'hello',
        fontFamily: 'Arial',
        fontSize: 16,
        comments: [{ commentId: 'c1', importedId: 'imp-1', internal: true }],
      };
      const runB: TextRun = {
        text: 'world',
        fontFamily: 'Arial',
        fontSize: 16,
        comments: [{ commentId: 'c2', importedId: 'imp-2', internal: false }],
      };

      expect(commentsCompatible(runA, runB)).toBe(false);
    });
  });

  describe('isInlineImage', () => {
    it('returns true when wrap.type is Inline', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          wrap: { type: 'Inline' },
        },
      };
      expect(isInlineImage(node)).toBe(true);
    });

    it('returns false when wrap.type is Tight (anchored)', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          wrap: { type: 'Tight' },
        },
      };
      expect(isInlineImage(node)).toBe(false);
    });

    it('returns false when wrap.type is Square (anchored)', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          wrap: { type: 'Square' },
        },
      };
      expect(isInlineImage(node)).toBe(false);
    });

    it('returns true for legacy inline attribute when no wrap.type', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          inline: true,
        },
      };
      expect(isInlineImage(node)).toBe(true);
    });

    it('returns true for display=inline when no wrap.type', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          display: 'inline',
        },
      };
      expect(isInlineImage(node)).toBe(true);
    });

    it('prioritizes wrap.type over inline attribute', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          wrap: { type: 'Tight' },
          inline: true, // Should be ignored
        },
      };
      expect(isInlineImage(node)).toBe(false);
    });

    it('returns false by default when no inline indicators', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {},
      };
      expect(isInlineImage(node)).toBe(false);
    });

    it('returns false when attrs is missing', () => {
      const node: PMNode = {
        type: 'image',
      };
      expect(isInlineImage(node)).toBe(false);
    });
  });

  describe('imageNodeToRun', () => {
    let positions: PositionMap;

    beforeEach(() => {
      positions = new WeakMap();
    });

    it('converts image node to ImageRun with all properties', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'data:image/png;base64,iVBORw...',
          size: { width: 200, height: 150 },
          alt: 'Test image',
          title: 'Test title',
          wrap: {
            attrs: {
              distTop: 10,
              distBottom: 20,
              distLeft: 5,
              distRight: 15,
            },
          },
        },
      };
      positions.set(node, { start: 10, end: 11 });

      const result = imageNodeToRun(node, positions);

      expect(result).toEqual({
        kind: 'image',
        src: 'data:image/png;base64,iVBORw...',
        width: 200,
        height: 150,
        alt: 'Test image',
        title: 'Test title',
        distTop: 10,
        distBottom: 20,
        distLeft: 5,
        distRight: 15,
        verticalAlign: 'bottom',
        pmStart: 10,
        pmEnd: 11,
      });
    });

    it('returns null when src is missing', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          size: { width: 100, height: 100 },
        },
      };

      const result = imageNodeToRun(node, positions);
      expect(result).toBeNull();
    });

    it('returns null when src is empty string', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: '',
          size: { width: 100, height: 100 },
        },
      };

      const result = imageNodeToRun(node, positions);
      expect(result).toBeNull();
    });

    it('uses default dimensions when size is missing', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.png',
        },
      };

      const result = imageNodeToRun(node, positions);
      expect(result?.width).toBe(100);
      expect(result?.height).toBe(100);
    });

    it('uses default dimensions when size has invalid values', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.png',
          size: { width: NaN, height: Infinity },
        },
      };

      const result = imageNodeToRun(node, positions);
      expect(result?.width).toBe(100);
      expect(result?.height).toBe(100);
    });

    it('uses default dimensions for negative width', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.png',
          size: { width: -10, height: 100 },
        },
      };

      const result = imageNodeToRun(node, positions);
      expect(result?.width).toBe(100); // DEFAULT_IMAGE_DIMENSION_PX
      expect(result?.height).toBe(100);
    });

    it('uses default dimensions for negative height', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.png',
          size: { width: 100, height: -10 },
        },
      };

      const result = imageNodeToRun(node, positions);
      expect(result?.width).toBe(100);
      expect(result?.height).toBe(100); // DEFAULT_IMAGE_DIMENSION_PX
    });

    it('uses default dimensions for zero width', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.png',
          size: { width: 0, height: 100 },
        },
      };

      const result = imageNodeToRun(node, positions);
      expect(result?.width).toBe(100); // DEFAULT_IMAGE_DIMENSION_PX
      expect(result?.height).toBe(100);
    });

    it('uses default dimensions for zero height', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.png',
          size: { width: 100, height: 0 },
        },
      };

      const result = imageNodeToRun(node, positions);
      expect(result?.width).toBe(100);
      expect(result?.height).toBe(100); // DEFAULT_IMAGE_DIMENSION_PX
    });

    it('extracts spacing from wrap.attrs with distT/distB/distL/distR', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.png',
          wrap: {
            attrs: {
              distT: 5,
              distB: 10,
              distL: 3,
              distR: 7,
            },
          },
        },
      };

      const result = imageNodeToRun(node, positions);
      expect(result?.distTop).toBe(5);
      expect(result?.distBottom).toBe(10);
      expect(result?.distLeft).toBe(3);
      expect(result?.distRight).toBe(7);
    });

    it('extracts spacing with full names (distTop, distBottom, etc.)', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.png',
          wrap: {
            attrs: {
              distTop: 12,
              distBottom: 14,
              distLeft: 8,
              distRight: 10,
            },
          },
        },
      };

      const result = imageNodeToRun(node, positions);
      expect(result?.distTop).toBe(12);
      expect(result?.distBottom).toBe(14);
      expect(result?.distLeft).toBe(8);
      expect(result?.distRight).toBe(10);
    });

    it('omits spacing when not present', () => {
      const node: PMNode = {
        type: 'image',
        attrs: {
          src: 'image.png',
        },
      };

      const result = imageNodeToRun(node, positions);
      expect(result?.distTop).toBeUndefined();
      expect(result?.distBottom).toBeUndefined();
      expect(result?.distLeft).toBeUndefined();
      expect(result?.distRight).toBeUndefined();
    });

    it('includes SDT metadata when provided', () => {
      const node: PMNode = {
        type: 'image',
        attrs: { src: 'image.png' },
      };
      const sdt = { kind: 'field' as const };

      const result = imageNodeToRun(node, positions, sdt);
      expect(result?.sdt).toEqual(sdt);
    });

    it('includes PM positions when available', () => {
      const node: PMNode = {
        type: 'image',
        attrs: { src: 'image.png' },
      };
      positions.set(node, { start: 42, end: 43 });

      const result = imageNodeToRun(node, positions);
      expect(result?.pmStart).toBe(42);
      expect(result?.pmEnd).toBe(43);
    });

    it('omits PM positions when not in map', () => {
      const node: PMNode = {
        type: 'image',
        attrs: { src: 'image.png' },
      };

      const result = imageNodeToRun(node, positions);
      expect(result?.pmStart).toBeUndefined();
      expect(result?.pmEnd).toBeUndefined();
    });

    it('sets verticalAlign to bottom by default', () => {
      const node: PMNode = {
        type: 'image',
        attrs: { src: 'image.png' },
      };

      const result = imageNodeToRun(node, positions);
      expect(result?.verticalAlign).toBe('bottom');
    });

    it('omits alt and title when not present', () => {
      const node: PMNode = {
        type: 'image',
        attrs: { src: 'image.png' },
      };

      const result = imageNodeToRun(node, positions);
      expect(result?.alt).toBeUndefined();
      expect(result?.title).toBeUndefined();
    });
  });

  describe('Integration: Inline images in paragraphs', () => {
    let nextBlockId: BlockIdGenerator;
    let positions: PositionMap;
    let styleContext: StyleContext;

    beforeEach(() => {
      vi.clearAllMocks();

      let counter = 0;
      nextBlockId = vi.fn((kind: string) => `${kind}-${counter++}`);
      positions = new WeakMap();
      styleContext = {};

      vi.mocked(computeParagraphAttrs).mockReturnValue({ paragraphAttrs: {}, resolvedParagraphProperties: {} });
      vi.mocked(cloneParagraphAttrs).mockReturnValue({});
      vi.mocked(hasPageBreakBefore).mockReturnValue(false);
      vi.mocked(textNodeToRun).mockImplementation((node) => ({
        text: node.text || '',
        fontFamily: 'Arial',
        fontSize: 16,
      }));
      vi.mocked(trackedChangesCompatible).mockReturnValue(true);
    });

    it('creates ImageRuns for inline images in paragraphToFlowBlocks', () => {
      const imageNode: PMNode = {
        type: 'image',
        attrs: {
          wrap: { type: 'Inline' },
          src: 'image.png',
          size: { width: 50, height: 50 },
        },
      };
      const para: PMNode = {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Text before ' }, imageNode, { type: 'text', text: ' text after' }],
      };

      const converters = {};
      const blocks = paragraphToFlowBlocks(
        para,
        nextBlockId,
        positions,
        'Arial',
        16,
        styleContext,
        undefined,
        undefined,
        undefined,
        undefined,
        converters as never,
      );

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe('paragraph');
      const paraBlock = blocks[0] as ParagraphBlock;
      expect(paraBlock.runs).toHaveLength(3);

      // Check that second run is an ImageRun
      const imageRun = paraBlock.runs[1] as ImageRun;
      expect(imageRun.kind).toBe('image');
      expect(imageRun.src).toBe('image.png');
      expect(imageRun.width).toBe(50);
      expect(imageRun.height).toBe(50);
    });

    it('creates ImageBlock for anchored images (not inline)', () => {
      const imageNode: PMNode = {
        type: 'image',
        attrs: {
          wrap: { type: 'Tight' },
          src: 'image.png',
          size: { width: 100, height: 100 },
        },
      };
      const para: PMNode = {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Before' }, imageNode, { type: 'text', text: 'After' }],
      };

      const mockImageBlock: FlowBlock = {
        kind: 'image',
        id: 'image-0',
        src: 'image.png',
        width: 100,
        height: 100,
        attrs: {},
      };

      const converters = {
        imageNodeToBlock: vi.fn().mockReturnValue(mockImageBlock),
      };

      const blocks = paragraphToFlowBlocks(
        para,
        nextBlockId,
        positions,
        'Arial',
        16,
        styleContext,
        undefined,
        undefined,
        undefined,
        undefined,
        converters as never,
      );

      // Should split into: paragraph before, image block, paragraph after
      expect(blocks).toHaveLength(3);
      expect(blocks[0].kind).toBe('paragraph');
      expect(blocks[1].kind).toBe('image');
      expect(blocks[2].kind).toBe('paragraph');
      expect(converters.imageNodeToBlock).toHaveBeenCalledWith(imageNode, nextBlockId, positions, undefined, undefined);
    });

    it('handles multiple inline images in same paragraph', () => {
      const para: PMNode = {
        type: 'paragraph',
        content: [
          {
            type: 'image',
            attrs: {
              wrap: { type: 'Inline' },
              src: 'img1.png',
              size: { width: 20, height: 20 },
            },
          },
          { type: 'text', text: ' and ' },
          {
            type: 'image',
            attrs: {
              wrap: { type: 'Inline' },
              src: 'img2.png',
              size: { width: 30, height: 30 },
            },
          },
        ],
      };

      const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

      expect(blocks).toHaveLength(1);
      const paraBlock = blocks[0] as ParagraphBlock;
      expect(paraBlock.runs).toHaveLength(3);

      const img1 = paraBlock.runs[0] as ImageRun;
      expect(img1.kind).toBe('image');
      expect(img1.src).toBe('img1.png');
      expect(img1.width).toBe(20);

      const img2 = paraBlock.runs[2] as ImageRun;
      expect(img2.kind).toBe('image');
      expect(img2.src).toBe('img2.png');
      expect(img2.width).toBe(30);
    });

    it('does not create ImageRun when src is missing', () => {
      const para: PMNode = {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Before ' },
          {
            type: 'image',
            attrs: {
              wrap: { type: 'Inline' },
              // Missing src
              size: { width: 50, height: 50 },
            },
          },
          { type: 'text', text: ' After' },
        ],
      };

      const blocks = paragraphToFlowBlocks(para, nextBlockId, positions, 'Arial', 16, styleContext);

      expect(blocks).toHaveLength(1);
      const paraBlock = blocks[0] as ParagraphBlock;
      // Should only have the text runs, no image run
      expect(paraBlock.runs).toHaveLength(2);
      expect(paraBlock.runs[0].text).toBe('Before ');
      expect(paraBlock.runs[1].text).toBe(' After');
    });
  });
});
