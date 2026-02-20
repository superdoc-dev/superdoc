import { describe, expect, it, vi } from 'vitest';
import type { ParagraphBlock, ParagraphMeasure, Line } from '@superdoc/contracts';
import { layoutParagraphBlock, type ParagraphLayoutContext } from './layout-paragraph.js';
import type { PageState } from './paginator.js';
import type { FloatingObjectManager } from './floating-objects.js';

/**
 * Helper to create a minimal line for testing.
 */
const makeLine = (width: number, lineHeight: number, maxWidth: number): Line => ({
  fromRun: 0,
  fromChar: 0,
  toRun: 0,
  toChar: 0,
  width,
  ascent: lineHeight * 0.8,
  descent: lineHeight * 0.2,
  lineHeight,
  maxWidth,
});

/**
 * Helper to create a minimal paragraph measure for testing.
 */
const makeMeasure = (
  lines: Array<{ width: number; lineHeight: number; maxWidth: number }>,
  marker?: {
    markerWidth?: number;
    markerTextWidth?: number;
    gutterWidth?: number;
  },
): ParagraphMeasure => ({
  kind: 'paragraph',
  lines: lines.map((l) => makeLine(l.width, l.lineHeight, l.maxWidth)),
  totalHeight: lines.reduce((sum, l) => sum + l.lineHeight, 0),
  marker: marker
    ? {
        markerWidth: marker.markerWidth ?? 0,
        markerTextWidth: marker.markerTextWidth ?? 0,
        indentLeft: 0,
        gutterWidth: marker.gutterWidth,
      }
    : undefined,
});

/**
 * Helper to create a minimal page state for testing.
 */
const makePageState = (): PageState => ({
  page: {
    number: 1,
    fragments: [],
  },
  columnIndex: 0,
  cursorY: 50,
  topMargin: 50,
  contentBottom: 750,
  constraintBoundaries: [],
  activeConstraintIndex: -1,
  trailingSpacing: 0,
  lastParagraphStyleId: undefined,
});

/**
 * Helper to create a minimal floating object manager for testing.
 */
const makeFloatManager = (): FloatingObjectManager => ({
  registerDrawing: vi.fn(),
  registerTable: vi.fn(),
  getExclusionsForLine: vi.fn(() => []),
  computeAvailableWidth: vi.fn((lineY, lineHeight, columnWidth) => ({
    width: columnWidth,
    offsetX: 0,
  })),
  getAllFloatsForPage: vi.fn(() => []),
  clear: vi.fn(),
  setLayoutContext: vi.fn(),
});

describe('layoutParagraphBlock - remeasurement with list markers', () => {
  describe('standard hanging indent mode', () => {
    it('remeasures with firstLineIndent=0 when firstLineIndentMode is not set', () => {
      const remeasureParagraph = vi.fn((block, maxWidth, firstLineIndent) => {
        // Verify that firstLineIndent is 0 for standard hanging indent
        expect(firstLineIndent).toBe(0);
        return makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);
      });

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          wordLayout: {
            marker: {
              markerBoxWidthPx: 20,
            },
            // firstLineIndentMode is NOT set - this is standard hanging indent
          },
        },
      };

      const measure = makeMeasure(
        [{ width: 100, lineHeight: 20, maxWidth: 200 }], // Measured at wider width
        { markerWidth: 18, gutterWidth: 6 },
      );

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150, // Narrower than measurement width
        ensurePage: vi.fn(() => makePageState()),
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
        remeasureParagraph,
      };

      layoutParagraphBlock(ctx);

      expect(remeasureParagraph).toHaveBeenCalledWith(block, 150, 0);
    });

    it('remeasures with firstLineIndent=0 when marker is missing in measure', () => {
      const remeasureParagraph = vi.fn((block, maxWidth, firstLineIndent) => {
        expect(firstLineIndent).toBe(0);
        return makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);
      });

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          wordLayout: {
            marker: {
              markerBoxWidthPx: 20,
            },
            firstLineIndentMode: true,
          },
        },
      };

      const measure = makeMeasure(
        [{ width: 100, lineHeight: 20, maxWidth: 200 }],
        // No marker in measure
      );

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage: vi.fn(() => makePageState()),
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
        remeasureParagraph,
      };

      layoutParagraphBlock(ctx);

      expect(remeasureParagraph).toHaveBeenCalledWith(block, 150, 0);
    });
  });

  describe('firstLineIndentMode', () => {
    it('remeasures with correct firstLineIndent when marker is inline', () => {
      const remeasureParagraph = vi.fn((block, maxWidth, firstLineIndent) => {
        // Verify that firstLineIndent is markerWidth + gutterWidth
        expect(firstLineIndent).toBe(24); // 18 + 6
        return makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);
      });

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          wordLayout: {
            marker: {
              markerBoxWidthPx: 20,
            },
            firstLineIndentMode: true,
          },
        },
      };

      const measure = makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 200 }], { markerWidth: 18, gutterWidth: 6 });

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage: vi.fn(() => makePageState()),
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
        remeasureParagraph,
      };

      layoutParagraphBlock(ctx);

      expect(remeasureParagraph).toHaveBeenCalledWith(block, 150, 24);
    });

    it('uses markerWidth=0 fallback when markerWidth is missing', () => {
      const remeasureParagraph = vi.fn((block, maxWidth, firstLineIndent) => {
        // markerWidth defaults to 0 when the measure marker is present
        expect(firstLineIndent).toBe(6);
        return makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);
      });

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          wordLayout: {
            marker: {
              markerBoxWidthPx: 20,
            },
            firstLineIndentMode: true,
          },
        },
      };

      const measure = makeMeasure(
        [{ width: 100, lineHeight: 20, maxWidth: 200 }],
        { gutterWidth: 6 }, // markerWidth is missing and defaults to 0
      );

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage: vi.fn(() => makePageState()),
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
        remeasureParagraph,
      };

      layoutParagraphBlock(ctx);

      expect(remeasureParagraph).toHaveBeenCalledWith(block, 150, 6);
    });

    it('uses fallback to 0 when both markerWidth and markerBoxWidthPx are missing', () => {
      const remeasureParagraph = vi.fn((block, maxWidth, firstLineIndent) => {
        // Should use 0 + gutterWidth (6)
        expect(firstLineIndent).toBe(6);
        return makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);
      });

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          wordLayout: {
            marker: {
              // markerBoxWidthPx is missing
            },
            firstLineIndentMode: true,
          },
        },
      };

      const measure = makeMeasure(
        [{ width: 100, lineHeight: 20, maxWidth: 200 }],
        { gutterWidth: 6 }, // markerWidth is missing
      );

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage: vi.fn(() => makePageState()),
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
        remeasureParagraph,
      };

      layoutParagraphBlock(ctx);

      expect(remeasureParagraph).toHaveBeenCalledWith(block, 150, 6);
    });
  });

  describe('input validation', () => {
    it('handles NaN marker width gracefully', () => {
      const remeasureParagraph = vi.fn((block, maxWidth, firstLineIndent) => {
        // NaN should be treated as 0
        expect(firstLineIndent).toBe(6); // 0 + 6
        return makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);
      });

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          wordLayout: {
            marker: {
              markerBoxWidthPx: 20,
            },
            firstLineIndentMode: true,
          },
        },
      };

      const measure = makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 200 }], {
        markerWidth: NaN,
        gutterWidth: 6,
      });

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage: vi.fn(() => makePageState()),
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
        remeasureParagraph,
      };

      layoutParagraphBlock(ctx);

      expect(remeasureParagraph).toHaveBeenCalledWith(block, 150, 6);
    });

    it('handles Infinity marker width gracefully', () => {
      const remeasureParagraph = vi.fn((block, maxWidth, firstLineIndent) => {
        // Infinity should be treated as 0
        expect(firstLineIndent).toBe(6); // 0 + 6
        return makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);
      });

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          wordLayout: {
            marker: {
              markerBoxWidthPx: 20,
            },
            firstLineIndentMode: true,
          },
        },
      };

      const measure = makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 200 }], {
        markerWidth: Infinity,
        gutterWidth: 6,
      });

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage: vi.fn(() => makePageState()),
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
        remeasureParagraph,
      };

      layoutParagraphBlock(ctx);

      expect(remeasureParagraph).toHaveBeenCalledWith(block, 150, 6);
    });

    it('handles negative marker width gracefully', () => {
      const remeasureParagraph = vi.fn((block, maxWidth, firstLineIndent) => {
        // Negative values should be treated as 0
        expect(firstLineIndent).toBe(6); // 0 + 6
        return makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);
      });

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          wordLayout: {
            marker: {
              markerBoxWidthPx: 20,
            },
            firstLineIndentMode: true,
          },
        },
      };

      const measure = makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 200 }], {
        markerWidth: -10,
        gutterWidth: 6,
      });

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage: vi.fn(() => makePageState()),
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
        remeasureParagraph,
      };

      layoutParagraphBlock(ctx);

      expect(remeasureParagraph).toHaveBeenCalledWith(block, 150, 6);
    });

    it('handles NaN gutter width gracefully', () => {
      const remeasureParagraph = vi.fn((block, maxWidth, firstLineIndent) => {
        // NaN gutter should be treated as 0
        expect(firstLineIndent).toBe(18); // 18 + 0
        return makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);
      });

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          wordLayout: {
            marker: {
              markerBoxWidthPx: 20,
            },
            firstLineIndentMode: true,
          },
        },
      };

      const measure = makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 200 }], {
        markerWidth: 18,
        gutterWidth: NaN,
      });

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage: vi.fn(() => makePageState()),
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
        remeasureParagraph,
      };

      layoutParagraphBlock(ctx);

      expect(remeasureParagraph).toHaveBeenCalledWith(block, 150, 18);
    });

    it('handles negative gutter width gracefully', () => {
      const remeasureParagraph = vi.fn((block, maxWidth, firstLineIndent) => {
        // Negative gutter should be treated as 0
        expect(firstLineIndent).toBe(18); // 18 + 0
        return makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);
      });

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          wordLayout: {
            marker: {
              markerBoxWidthPx: 20,
            },
            firstLineIndentMode: true,
          },
        },
      };

      const measure = makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 200 }], {
        markerWidth: 18,
        gutterWidth: -5,
      });

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage: vi.fn(() => makePageState()),
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
        remeasureParagraph,
      };

      layoutParagraphBlock(ctx);

      expect(remeasureParagraph).toHaveBeenCalledWith(block, 150, 18);
    });
  });

  describe('float remeasurement', () => {
    it('remeasures with correct firstLineIndent when narrower width is found due to floats', () => {
      const remeasureParagraph = vi.fn((block, maxWidth, firstLineIndent) => {
        if (maxWidth === 120) {
          // This is the float remeasurement - should include marker indent
          expect(firstLineIndent).toBe(24); // 18 + 6
        }
        return makeMeasure([{ width: 100, lineHeight: 20, maxWidth }]);
      });

      const floatManager = makeFloatManager();
      // Mock float manager to return narrower width
      floatManager.computeAvailableWidth = vi.fn(() => ({
        width: 120, // Narrower than column width
        offsetX: 10,
      }));

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          wordLayout: {
            marker: {
              markerBoxWidthPx: 20,
            },
            firstLineIndentMode: true,
          },
        },
      };

      const measure = makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }], { markerWidth: 18, gutterWidth: 6 });

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage: vi.fn(() => makePageState()),
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager,
        remeasureParagraph,
      };

      layoutParagraphBlock(ctx);

      expect(remeasureParagraph).toHaveBeenCalledWith(block, 120, 24);
    });
  });
});

describe('layoutParagraphBlock - contextualSpacing', () => {
  describe('same-style paragraphs', () => {
    it('suppresses spacingBefore when same-style paragraphs are adjacent', () => {
      const pageState = makePageState();
      pageState.lastParagraphStyleId = 'Heading1';
      pageState.trailingSpacing = 20;
      pageState.cursorY = 100;

      const ensurePage = vi.fn(() => pageState);

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          styleId: 'Heading1',
          contextualSpacing: true,
          spacing: {
            before: 30,
            after: 20,
          },
        },
      };

      const measure = makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage,
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
      };

      layoutParagraphBlock(ctx);

      // When contextualSpacing is active and styles match:
      // 1. spacingBefore (30) is zeroed
      // 2. prevTrailing (20) is undone (cursorY -= 20)
      // 3. Line height (20) is added
      // 4. spacingAfter (20) is added at the end
      // Result: 100 - 20 + 20 + 20 = 120
      expect(pageState.cursorY).toBe(120);
    });

    it('undoes previous paragraph trailing spacing when contextualSpacing is active', () => {
      const pageState = makePageState();
      pageState.lastParagraphStyleId = 'Normal';
      pageState.trailingSpacing = 15;
      pageState.cursorY = 100;

      const ensurePage = vi.fn(() => pageState);

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          styleId: 'Normal',
          contextualSpacing: true,
          spacing: {
            before: 10,
            after: 10,
          },
        },
      };

      const measure = makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage,
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
      };

      layoutParagraphBlock(ctx);

      // When contextualSpacing is active and styles match:
      // 1. spacingBefore (10) is zeroed
      // 2. prevTrailing (15) is undone (cursorY -= 15)
      // 3. Line height (20) is added
      // 4. spacingAfter (10) is added at the end
      // Result: 100 - 15 + 20 + 10 = 115
      expect(pageState.cursorY).toBe(115);
      expect(pageState.trailingSpacing).toBe(10);
    });

    it('handles contextualSpacing when trailingSpacing is 0', () => {
      const pageState = makePageState();
      pageState.lastParagraphStyleId = 'Normal';
      pageState.trailingSpacing = 0;
      pageState.cursorY = 100;

      const ensurePage = vi.fn(() => pageState);

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          styleId: 'Normal',
          contextualSpacing: true,
          spacing: {
            before: 10,
            after: 10,
          },
        },
      };

      const measure = makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage,
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
      };

      layoutParagraphBlock(ctx);

      // When contextualSpacing is active and styles match:
      // 1. spacingBefore (10) is zeroed
      // 2. prevTrailing (0) is undone (no change)
      // 3. Line height (20) is added
      // 4. spacingAfter (10) is added at the end
      // Result: 100 + 20 + 10 = 130
      expect(pageState.cursorY).toBe(130);
      expect(pageState.trailingSpacing).toBe(10);
    });

    it('handles contextualSpacing when trailingSpacing is null', () => {
      const pageState = makePageState();
      pageState.lastParagraphStyleId = 'Normal';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pageState.trailingSpacing as any) = null;
      pageState.cursorY = 100;

      const ensurePage = vi.fn(() => pageState);

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          styleId: 'Normal',
          contextualSpacing: true,
          spacing: {
            before: 10,
            after: 10,
          },
        },
      };

      const measure = makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage,
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
      };

      layoutParagraphBlock(ctx);

      // null trailingSpacing is treated as 0
      // Result: 100 + 20 + 10 = 130
      expect(pageState.cursorY).toBe(130);
    });

    it('handles contextualSpacing when trailingSpacing is undefined', () => {
      const pageState = makePageState();
      pageState.lastParagraphStyleId = 'Normal';
      pageState.trailingSpacing = 0;
      pageState.cursorY = 100;

      const ensurePage = vi.fn(() => pageState);

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          styleId: 'Normal',
          contextualSpacing: true,
          spacing: {
            before: 10,
            after: 10,
          },
        },
      };

      const measure = makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage,
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
      };

      layoutParagraphBlock(ctx);

      // undefined trailingSpacing is treated as 0
      // Result: 100 + 20 + 10 = 130
      expect(pageState.cursorY).toBe(130);
    });
  });

  describe('different-style paragraphs', () => {
    it('does not apply contextualSpacing when style IDs differ', () => {
      const pageState = makePageState();
      pageState.lastParagraphStyleId = 'Heading1';
      pageState.trailingSpacing = 20;
      pageState.cursorY = 100;

      const ensurePage = vi.fn(() => pageState);

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          styleId: 'Normal',
          contextualSpacing: true,
          spacing: {
            before: 30,
            after: 20,
          },
        },
      };

      const measure = makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage,
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
      };

      layoutParagraphBlock(ctx);

      // Different styles: contextualSpacing should NOT suppress spacing
      // Normal spacing collapse applies:
      // 1. prevTrailing (20) remains in trailingSpacing (will be collapsed)
      // 2. spacingBefore (30) - prevTrailing (20) = 10 additional spacing
      // 3. Line height (20) is added
      // 4. spacingAfter (20) is added at the end
      // Result: 100 + 10 + 20 + 20 = 150
      expect(pageState.cursorY).toBe(150);
    });

    it('does not apply contextualSpacing when lastParagraphStyleId is undefined', () => {
      const pageState = makePageState();
      pageState.lastParagraphStyleId = undefined;
      pageState.trailingSpacing = 20;
      pageState.cursorY = 100;

      const ensurePage = vi.fn(() => pageState);

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          styleId: 'Normal',
          contextualSpacing: true,
          spacing: {
            before: 30,
            after: 20,
          },
        },
      };

      const measure = makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage,
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
      };

      layoutParagraphBlock(ctx);

      // No lastParagraphStyleId: contextualSpacing should NOT apply
      // Normal spacing collapse applies
      // Result: 100 + 10 + 20 + 20 = 150
      expect(pageState.cursorY).toBe(150);
    });

    it('does not apply contextualSpacing when current styleId is undefined', () => {
      const pageState = makePageState();
      pageState.lastParagraphStyleId = 'Normal';
      pageState.trailingSpacing = 20;
      pageState.cursorY = 100;

      const ensurePage = vi.fn(() => pageState);

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          // styleId is undefined
          contextualSpacing: true,
          spacing: {
            before: 30,
            after: 20,
          },
        },
      };

      const measure = makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage,
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
      };

      layoutParagraphBlock(ctx);

      // No current styleId: contextualSpacing should NOT apply
      // Normal spacing collapse applies
      // Result: 100 + 10 + 20 + 20 = 150
      expect(pageState.cursorY).toBe(150);
    });
  });

  describe('contextualSpacing disabled', () => {
    it('does not suppress spacing when contextualSpacing is false', () => {
      const pageState = makePageState();
      pageState.lastParagraphStyleId = 'Normal';
      pageState.trailingSpacing = 20;
      pageState.cursorY = 100;

      const ensurePage = vi.fn(() => pageState);

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          styleId: 'Normal',
          contextualSpacing: false,
          spacing: {
            before: 30,
            after: 20,
          },
        },
      };

      const measure = makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage,
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
      };

      layoutParagraphBlock(ctx);

      // contextualSpacing is false: normal spacing collapse should apply
      // Result: 100 + 10 + 20 + 20 = 150
      expect(pageState.cursorY).toBe(150);
    });

    it('does not suppress spacing when contextualSpacing is not set', () => {
      const pageState = makePageState();
      pageState.lastParagraphStyleId = 'Normal';
      pageState.trailingSpacing = 20;
      pageState.cursorY = 100;

      const ensurePage = vi.fn(() => pageState);

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          styleId: 'Normal',
          // contextualSpacing not set
          spacing: {
            before: 30,
            after: 20,
          },
        },
      };

      const measure = makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage,
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
      };

      layoutParagraphBlock(ctx);

      // contextualSpacing not set: normal spacing collapse should apply
      // Result: 100 + 10 + 20 + 20 = 150
      expect(pageState.cursorY).toBe(150);
    });
  });

  describe('edge cases', () => {
    it('handles NaN trailingSpacing gracefully', () => {
      const pageState = makePageState();
      pageState.lastParagraphStyleId = 'Normal';
      pageState.trailingSpacing = NaN;
      pageState.cursorY = 100;

      const ensurePage = vi.fn(() => pageState);

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          styleId: 'Normal',
          contextualSpacing: true,
          spacing: {
            before: 10,
            after: 10,
          },
        },
      };

      const measure = makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage,
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
      };

      layoutParagraphBlock(ctx);

      // NaN should be treated as 0
      // Result: 100 + 20 + 10 = 130
      expect(pageState.cursorY).toBe(130);
    });

    it('handles Infinity trailingSpacing gracefully', () => {
      const pageState = makePageState();
      pageState.lastParagraphStyleId = 'Normal';
      pageState.trailingSpacing = Infinity;
      pageState.cursorY = 100;

      const ensurePage = vi.fn(() => pageState);

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          styleId: 'Normal',
          contextualSpacing: true,
          spacing: {
            before: 10,
            after: 10,
          },
        },
      };

      const measure = makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage,
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
      };

      layoutParagraphBlock(ctx);

      // Infinity should be treated as 0
      // Result: 100 + 20 + 10 = 130
      expect(pageState.cursorY).toBe(130);
    });

    it('handles negative trailingSpacing gracefully', () => {
      const pageState = makePageState();
      pageState.lastParagraphStyleId = 'Normal';
      pageState.trailingSpacing = -10;
      pageState.cursorY = 100;

      const ensurePage = vi.fn(() => pageState);

      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
        attrs: {
          styleId: 'Normal',
          contextualSpacing: true,
          spacing: {
            before: 10,
            after: 10,
          },
        },
      };

      const measure = makeMeasure([{ width: 100, lineHeight: 20, maxWidth: 150 }]);

      const ctx: ParagraphLayoutContext = {
        block,
        measure,
        columnWidth: 150,
        ensurePage,
        advanceColumn: vi.fn((state) => state),
        columnX: vi.fn(() => 50),
        floatManager: makeFloatManager(),
      };

      layoutParagraphBlock(ctx);

      // Negative should be treated as 0
      // Result: 100 + 20 + 10 = 130
      expect(pageState.cursorY).toBe(130);
    });
  });
});

describe('layoutParagraphBlock - keepLines', () => {
  it('advances to next page when keepLines is true and paragraph does not fit', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'test-block',
      runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
      attrs: {
        keepLines: true,
      },
    };

    // 3 lines of 50px each = 150px total height
    const measure = makeMeasure([
      { width: 100, lineHeight: 50, maxWidth: 200 },
      { width: 100, lineHeight: 50, maxWidth: 200 },
      { width: 100, lineHeight: 50, maxWidth: 200 },
    ]);

    const pageState = makePageState();
    // cursorY=50, contentBottom=750, so available = 700
    // But we'll set cursorY high so only 100px remains (not enough for 150px)
    pageState.cursorY = 650;
    pageState.page.fragments.push({ blockId: 'existing', kind: 'para' } as never);

    let currentState = pageState;
    const advanceColumn = vi.fn((state: PageState) => {
      currentState = {
        ...state,
        cursorY: 50, // Reset to top of new page
        page: { number: state.page.number + 1, fragments: [] },
        trailingSpacing: 0,
      };
      return currentState;
    });

    const ctx: ParagraphLayoutContext = {
      block,
      measure,
      columnWidth: 200,
      ensurePage: vi.fn(() => currentState),
      advanceColumn,
      columnX: vi.fn(() => 50),
      floatManager: makeFloatManager(),
    };

    layoutParagraphBlock(ctx);

    // Should have advanced to next page because paragraph (150px) > remaining (100px)
    // but fits on blank page (150px < 700px)
    expect(advanceColumn).toHaveBeenCalled();
  });

  it('does not advance when keepLines is true but paragraph fits on current page', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'test-block',
      runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
      attrs: {
        keepLines: true,
      },
    };

    // 3 lines of 50px each = 150px total height
    const measure = makeMeasure([
      { width: 100, lineHeight: 50, maxWidth: 200 },
      { width: 100, lineHeight: 50, maxWidth: 200 },
      { width: 100, lineHeight: 50, maxWidth: 200 },
    ]);

    const pageState = makePageState();
    // cursorY=50, contentBottom=750, available = 700px - enough for 150px
    pageState.page.fragments.push({ blockId: 'existing', kind: 'para' } as never);

    const advanceColumn = vi.fn((state: PageState) => state);

    const ctx: ParagraphLayoutContext = {
      block,
      measure,
      columnWidth: 200,
      ensurePage: vi.fn(() => pageState),
      advanceColumn,
      columnX: vi.fn(() => 50),
      floatManager: makeFloatManager(),
    };

    layoutParagraphBlock(ctx);

    // Should NOT advance - paragraph fits
    expect(advanceColumn).not.toHaveBeenCalled();
  });

  it('does not pre-advance for keepLines when paragraph cannot fit on a blank page', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'test-block',
      runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
      attrs: {
        keepLines: true,
      },
    };

    // 20 lines of 50px each = 1000px total height (exceeds page content area)
    const measure = makeMeasure(
      Array(20)
        .fill(null)
        .map(() => ({ width: 100, lineHeight: 50, maxWidth: 200 })),
    );

    const pageState = makePageState();
    // contentBottom - topMargin = 750 - 50 = 700px page content height
    // Paragraph is 1000px, won't fit on blank page
    pageState.cursorY = 650; // Only 100px remaining
    pageState.page.fragments.push({ blockId: 'existing', kind: 'para' } as never);

    let currentState = pageState;
    const advanceColumn = vi.fn((state: PageState) => {
      currentState = {
        ...state,
        page: { number: state.page.number + 1, fragments: [] },
        cursorY: state.topMargin,
        trailingSpacing: 0,
      };
      return currentState;
    });

    const ctx: ParagraphLayoutContext = {
      block,
      measure,
      columnWidth: 200,
      ensurePage: vi.fn(() => currentState),
      advanceColumn,
      columnX: vi.fn(() => 50),
      floatManager: makeFloatManager(),
    };

    layoutParagraphBlock(ctx);

    // keepLines should not force an upfront move to the next page when the paragraph
    // cannot fit on a blank page anyway. The first fragment should still start on this page.
    const firstFragment = pageState.page.fragments.find(
      (fragment) => fragment.kind === 'para' && fragment.blockId === 'test-block',
    ) as { y: number } | undefined;
    expect(firstFragment).toBeTruthy();
    expect(firstFragment?.y).toBe(650);
    // The paragraph is still taller than the page, so normal pagination advances later.
    expect(advanceColumn).toHaveBeenCalled();
  });

  it('uses baseSpacingBefore (not collapsed) for blank page fit check', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'test-block',
      runs: [{ text: 'Test', fontFamily: 'Arial', fontSize: 12 }],
      attrs: {
        keepLines: true,
        spacing: { before: 50 }, // 50px spacing before
      },
    };

    // 3 lines of 200px each = 600px, plus 50px spacing = 650px
    // Page content is 700px, so it fits on blank page
    const measure = makeMeasure([
      { width: 100, lineHeight: 200, maxWidth: 200 },
      { width: 100, lineHeight: 200, maxWidth: 200 },
      { width: 100, lineHeight: 200, maxWidth: 200 },
    ]);

    const pageState = makePageState();
    // Current page has trailing spacing of 40px
    // Collapsed spacing = max(50-40, 0) = 10px (less space needed on current page)
    // But blank page needs full 50px spacing
    pageState.trailingSpacing = 40;
    pageState.cursorY = 100; // 650px remaining on current page
    pageState.page.fragments.push({ blockId: 'existing', kind: 'para' } as never);

    const advanceColumn = vi.fn((state: PageState) => ({
      ...state,
      cursorY: 50,
      trailingSpacing: 0,
      page: { number: 2, fragments: [] },
    }));

    const ctx: ParagraphLayoutContext = {
      block,
      measure,
      columnWidth: 200,
      ensurePage: vi.fn(() => pageState),
      advanceColumn,
      columnX: vi.fn(() => 50),
      floatManager: makeFloatManager(),
    };

    layoutParagraphBlock(ctx);

    // Paragraph (600px) + collapsed spacing (10px) = 610px fits in 650px remaining
    // So it should NOT advance (it fits on current page)
    expect(advanceColumn).not.toHaveBeenCalled();
  });
});
