import { describe, it, expect } from 'vitest';
import { resolveListTextStartPx, type MinimalWordLayout, type MinimalMarker } from './list-marker-utils.js';
import { LIST_MARKER_GAP, SPACE_SUFFIX_GAP_PX, DEFAULT_TAB_INTERVAL_PX } from './layout-constants.js';

describe('resolveListTextStartPx', () => {
  const mockMeasureMarkerText = (text: string): number => text.length * 8; // 8px per character

  describe('edge cases and validation', () => {
    it('returns undefined when no marker present', () => {
      const wordLayout: MinimalWordLayout = {};
      const result = resolveListTextStartPx(wordLayout, 36, 0, 18, mockMeasureMarkerText);
      expect(result).toBeUndefined();
    });

    it('returns undefined when wordLayout is undefined', () => {
      const result = resolveListTextStartPx(undefined, 36, 0, 18, mockMeasureMarkerText);
      expect(result).toBeUndefined();
    });

    it('handles NaN markerBoxWidthPx by using 0', () => {
      const wordLayout: MinimalWordLayout = {
        marker: {
          markerBoxWidthPx: NaN,
          suffix: 'nothing',
        },
      };
      const result = resolveListTextStartPx(wordLayout, 0, 0, 0, mockMeasureMarkerText);
      expect(result).toBe(0); // markerStartPos(0) + markerTextWidth(0)
    });

    it('handles negative markerBoxWidthPx by using 0', () => {
      const wordLayout: MinimalWordLayout = {
        marker: {
          markerBoxWidthPx: -10,
          suffix: 'nothing',
        },
      };
      const result = resolveListTextStartPx(wordLayout, 0, 0, 0, mockMeasureMarkerText);
      expect(result).toBe(0); // markerStartPos(0) + markerTextWidth(0)
    });

    it('handles NaN markerX in firstLineIndentMode by falling back to standard calculation', () => {
      const wordLayout: MinimalWordLayout = {
        firstLineIndentMode: true,
        marker: {
          markerX: NaN,
          glyphWidthPx: 20,
          suffix: 'nothing',
        },
      };
      const result = resolveListTextStartPx(wordLayout, 36, 0, 18, mockMeasureMarkerText);
      // When markerX is NaN, falls back to: indentLeft - hanging + firstLine = 36 - 18 + 0 = 18
      // markerStartPos(18) + glyphWidth(20) = 38
      expect(result).toBe(38);
    });
  });

  describe('suffix handling', () => {
    describe('space suffix', () => {
      it('adds SPACE_SUFFIX_GAP_PX (4px) after marker', () => {
        const wordLayout: MinimalWordLayout = {
          marker: {
            glyphWidthPx: 15,
            markerX: 0,
            suffix: 'space',
          },
          firstLineIndentMode: true,
        };
        const result = resolveListTextStartPx(wordLayout, 0, 0, 0, mockMeasureMarkerText);
        expect(result).toBe(15 + SPACE_SUFFIX_GAP_PX); // 15 + 4 = 19
      });

      it('uses measured width when glyphWidthPx not provided', () => {
        const wordLayout: MinimalWordLayout = {
          marker: {
            markerText: 'ABC', // 3 chars * 8px = 24px
            markerX: 0,
            suffix: 'space',
          },
          firstLineIndentMode: true,
        };
        const result = resolveListTextStartPx(wordLayout, 0, 0, 0, mockMeasureMarkerText);
        expect(result).toBe(24 + SPACE_SUFFIX_GAP_PX); // 24 + 4 = 28
      });
    });

    describe('nothing suffix', () => {
      it('returns position immediately after marker', () => {
        const wordLayout: MinimalWordLayout = {
          marker: {
            glyphWidthPx: 20,
            markerX: 10,
            suffix: 'nothing',
          },
          firstLineIndentMode: true,
        };
        const result = resolveListTextStartPx(wordLayout, 0, 0, 0, mockMeasureMarkerText);
        expect(result).toBe(30); // markerX(10) + glyphWidth(20)
      });
    });

    describe('tab suffix (default)', () => {
      it('uses tab suffix when not specified', () => {
        const wordLayout: MinimalWordLayout = {
          marker: {
            glyphWidthPx: 20,
            markerX: 0,
          },
          firstLineIndentMode: true,
          textStartPx: 48,
        };
        const result = resolveListTextStartPx(wordLayout, 0, 0, 0, mockMeasureMarkerText);
        expect(result).toBe(48); // Advances to textStartPx
      });
    });
  });

  describe('justification modes', () => {
    describe('left justification (default)', () => {
      it('uses tab-based spacing in standard mode', () => {
        const wordLayout: MinimalWordLayout = {
          marker: {
            glyphWidthPx: 20,
            justification: 'left',
            suffix: 'tab',
            gutterWidthPx: 8,
          },
        };
        const indentLeft = 36;
        const firstLine = 0;
        const hanging = 18;
        // markerStartPos = 36 - 18 + 0 = 18
        // currentPos = 18 + 20 = 38
        // textStart = 36, tabWidth = 36 - 38 = -2 → overflow
        // nextDefaultTab = 38 + 48 - (38 % 48) = 48
        // result = 48
        const result = resolveListTextStartPx(wordLayout, indentLeft, firstLine, hanging, mockMeasureMarkerText);
        expect(result).toBe(48);
      });

      it('uses textStartPx when provided even in standard mode', () => {
        const wordLayout: MinimalWordLayout = {
          marker: {
            glyphWidthPx: 20,
            justification: 'left',
            suffix: 'tab',
            gutterWidthPx: 8,
          },
          textStartPx: 50,
        };
        const indentLeft = 36;
        const firstLine = 0;
        const hanging = 18;
        // markerStartPos = 18, currentPos = 38, textStartPx=50 => gap = max(50-38=12, gutter 8) = 12
        // result = 38 + 12 = 50
        const result = resolveListTextStartPx(wordLayout, indentLeft, firstLine, hanging, mockMeasureMarkerText);
        expect(result).toBe(50);
      });
    });

    describe('center/right justification', () => {
      it('uses gutterWidthPx for center justification', () => {
        const wordLayout: MinimalWordLayout = {
          marker: {
            glyphWidthPx: 20,
            markerX: 0,
            justification: 'center',
            gutterWidthPx: 12,
            suffix: 'tab',
          },
          firstLineIndentMode: true,
        };
        const result = resolveListTextStartPx(wordLayout, 0, 0, 0, mockMeasureMarkerText);
        // Uses max(gutterWidthPx, LIST_MARKER_GAP) = max(12, 8) = 12
        expect(result).toBe(20 + 12); // glyphWidth(20) + gutter(12) = 32
      });

      it('uses LIST_MARKER_GAP when gutterWidthPx too small', () => {
        const wordLayout: MinimalWordLayout = {
          marker: {
            glyphWidthPx: 20,
            markerX: 0,
            justification: 'right',
            gutterWidthPx: 4, // Less than LIST_MARKER_GAP (8)
            suffix: 'tab',
          },
          firstLineIndentMode: true,
        };
        const result = resolveListTextStartPx(wordLayout, 0, 0, 0, mockMeasureMarkerText);
        // Uses max(gutterWidthPx, LIST_MARKER_GAP) = max(4, 8) = 8
        expect(result).toBe(20 + LIST_MARKER_GAP); // glyphWidth(20) + LIST_MARKER_GAP(8) = 28
      });

      it('uses LIST_MARKER_GAP when gutterWidthPx not provided', () => {
        const wordLayout: MinimalWordLayout = {
          marker: {
            glyphWidthPx: 20,
            markerX: 0,
            justification: 'right',
            suffix: 'tab',
          },
          firstLineIndentMode: true,
        };
        const result = resolveListTextStartPx(wordLayout, 0, 0, 0, mockMeasureMarkerText);
        expect(result).toBe(20 + LIST_MARKER_GAP); // glyphWidth(20) + LIST_MARKER_GAP(8) = 28
      });
    });
  });

  describe('first-line indent mode', () => {
    it('uses markerX for marker start position', () => {
      const wordLayout: MinimalWordLayout = {
        firstLineIndentMode: true,
        marker: {
          markerX: 10,
          glyphWidthPx: 20,
          textStartX: 48,
          suffix: 'tab',
        },
      };
      const result = resolveListTextStartPx(wordLayout, 36, 0, 18, mockMeasureMarkerText);
      expect(result).toBe(48); // Uses textStartX
    });

    it('uses explicit tab stop when available and after marker', () => {
      const wordLayout: MinimalWordLayout = {
        firstLineIndentMode: true,
        tabsPx: [24, 48, 72],
        marker: {
          markerX: 0,
          glyphWidthPx: 18, // currentPos = 0 + 18 = 18
          suffix: 'tab',
        },
      };
      const result = resolveListTextStartPx(wordLayout, 0, 0, 0, mockMeasureMarkerText);
      // First tab after currentPos(18) is at 24
      // tabWidth = 24 - 18 = 6, which is less than LIST_MARKER_GAP (8)
      // So enforces minimum: markerStartPos(0) + markerTextWidth(18) + LIST_MARKER_GAP(8) = 26
      expect(result).toBe(26);
    });

    it('uses textStartX when no tab stop found', () => {
      const wordLayout: MinimalWordLayout = {
        firstLineIndentMode: true,
        tabsPx: [12, 24], // All tabs before marker end
        marker: {
          markerX: 0,
          glyphWidthPx: 30, // currentPos = 30
          textStartX: 56,
          suffix: 'tab',
        },
      };
      const result = resolveListTextStartPx(wordLayout, 0, 0, 0, mockMeasureMarkerText);
      expect(result).toBe(56); // Uses textStartX since no tabs after 30
    });

    it('prefers textStartX over textStartPx', () => {
      const wordLayout: MinimalWordLayout = {
        firstLineIndentMode: true,
        textStartPx: 100, // Should be ignored
        marker: {
          markerX: 0,
          glyphWidthPx: 20,
          textStartX: 56, // Should be used
          suffix: 'tab',
        },
      };
      const result = resolveListTextStartPx(wordLayout, 0, 0, 0, mockMeasureMarkerText);
      expect(result).toBe(56); // Uses textStartX, not textStartPx
    });

    it('falls back to textStartPx when textStartX not provided', () => {
      const wordLayout: MinimalWordLayout = {
        firstLineIndentMode: true,
        textStartPx: 48,
        marker: {
          markerX: 0,
          glyphWidthPx: 20,
          suffix: 'tab',
        },
      };
      const result = resolveListTextStartPx(wordLayout, 0, 0, 0, mockMeasureMarkerText);
      expect(result).toBe(48); // Uses textStartPx
    });

    it('enforces minimum LIST_MARKER_GAP tab width', () => {
      const wordLayout: MinimalWordLayout = {
        firstLineIndentMode: true,
        marker: {
          markerX: 0,
          glyphWidthPx: 20, // currentPos = 20
          textStartX: 22, // Would give tabWidth = 2, less than LIST_MARKER_GAP (8)
          suffix: 'tab',
        },
      };
      const result = resolveListTextStartPx(wordLayout, 0, 0, 0, mockMeasureMarkerText);
      expect(result).toBe(20 + LIST_MARKER_GAP); // Enforces minimum: 20 + 8 = 28
    });

    it('uses LIST_MARKER_GAP when no tab or textStart available', () => {
      const wordLayout: MinimalWordLayout = {
        firstLineIndentMode: true,
        marker: {
          markerX: 0,
          glyphWidthPx: 20,
          suffix: 'tab',
        },
      };
      const result = resolveListTextStartPx(wordLayout, 0, 0, 0, mockMeasureMarkerText);
      expect(result).toBe(20 + LIST_MARKER_GAP); // 20 + 8 = 28
    });
  });

  describe('standard hanging indent mode', () => {
    it('calculates marker start from indents', () => {
      const wordLayout: MinimalWordLayout = {
        marker: {
          glyphWidthPx: 18,
          suffix: 'tab',
        },
      };
      const indentLeft = 36;
      const firstLine = 0;
      const hanging = 18;
      // markerStartPos = indentLeft - hanging + firstLine = 36 - 18 + 0 = 18
      // currentPos = 18 + 18 = 36
      // textStart = indentLeft + firstLine = 36 + 0 = 36
      // tabWidth = textStart - currentPos = 36 - 36 = 0 → overflow
      // nextDefaultTab = 36 + 48 - (36 % 48) = 48
      // result = 48
      const result = resolveListTextStartPx(wordLayout, indentLeft, firstLine, hanging, mockMeasureMarkerText);
      expect(result).toBe(48);
    });

    it('uses minimum gutter when currentPos exceeds textStart', () => {
      const wordLayout: MinimalWordLayout = {
        marker: {
          glyphWidthPx: 30, // Long marker
          suffix: 'tab',
        },
      };
      const indentLeft = 36;
      const firstLine = 0;
      const hanging = 18;
      // markerStartPos = 36 - 18 + 0 = 18
      // currentPos = 18 + 30 = 48
      // textStart = 36 + 0 = 36
      // tabWidth = textStart - currentPos = 36 - 48 = -12 → overflow
      // nextDefaultTab = 48 + 48 - (48 % 48) = 96
      // result = 96
      const result = resolveListTextStartPx(wordLayout, indentLeft, firstLine, hanging, mockMeasureMarkerText);
      expect(result).toBe(96);
    });

    it('enforces minimum LIST_MARKER_GAP tab width', () => {
      const wordLayout: MinimalWordLayout = {
        marker: {
          glyphWidthPx: 10,
          suffix: 'tab',
        },
      };
      const indentLeft = 36;
      const firstLine = 0;
      const hanging = 18;
      // markerStartPos = 36 - 18 + 0 = 18
      // currentPos = 18 + 10 = 28
      // textStart = 36 + 0 = 36
      // tabWidth = 36 - 28 = 8 (exactly LIST_MARKER_GAP, not enforced)
      const result = resolveListTextStartPx(wordLayout, indentLeft, firstLine, hanging, mockMeasureMarkerText);
      expect(result).toBe(36); // textStart
    });

    it('uses actual tab width when positive (matches renderer)', () => {
      const wordLayout: MinimalWordLayout = {
        marker: {
          glyphWidthPx: 12,
          suffix: 'tab',
        },
      };
      const indentLeft = 36;
      const firstLine = 0;
      const hanging = 18;
      // markerStartPos = 36 - 18 + 0 = 18
      // currentPos = 18 + 12 = 30
      // textStart = 36 + 0 = 36
      // tabWidth = 36 - 30 = 6 (positive, used as-is to match renderer)
      const result = resolveListTextStartPx(wordLayout, indentLeft, firstLine, hanging, mockMeasureMarkerText);
      expect(result).toBe(36); // text starts at textStart position
    });
  });

  // ---------------------------------------------------------------------------
  // Step 8 hotfix regression guards
  //
  // These tests lock the hanging-overflow safeguard behavior that prevents
  // the 48px DEFAULT_TAB_INTERVAL_PX jump. Each test targets a specific
  // branch in Step 8 (standard hanging mode, lines 318–346).
  // ---------------------------------------------------------------------------

  describe('Step 8: hanging-overflow advances to next default tab stop', () => {
    it('advances to next default tab stop when marker overruns hanging space', () => {
      // Marker wider than hanging indent, no textStartPx.
      // Must advance to next 48px-aligned tab stop, matching the renderer's computeTabWidth().
      const wordLayout: MinimalWordLayout = {
        marker: {
          glyphWidthPx: 25, // wider than hanging (18px)
          suffix: 'tab',
        },
      };
      const indentLeft = 36;
      const hanging = 18;
      // markerStartPos = 36 - 18 = 18
      // currentPosStandard = 18 + 25 = 43 (past indentLeft 36)
      // textStart = 36, tabWidth = 36 - 43 = -7 → overflow
      // nextDefaultTab = 43 + 48 - (43 % 48) = 48
      const result = resolveListTextStartPx(wordLayout, indentLeft, 0, hanging, mockMeasureMarkerText);

      expect(result).toBe(48); // advances to next default tab stop
    });

    it('advances to next default tab stop when marker exactly fills hanging space', () => {
      // Edge case: marker width === hanging indent → tabWidth = 0 → overflow branch
      const wordLayout: MinimalWordLayout = {
        marker: {
          glyphWidthPx: 18, // exactly equals hanging
          suffix: 'tab',
        },
      };
      const indentLeft = 36;
      const hanging = 18;
      // markerStartPos = 36 - 18 = 18
      // currentPosStandard = 18 + 18 = 36 (exactly at indentLeft)
      // textStart = 36, tabWidth = 36 - 36 = 0 → overflow
      // nextDefaultTab = 36 + 48 - (36 % 48) = 48
      const result = resolveListTextStartPx(wordLayout, indentLeft, 0, hanging, mockMeasureMarkerText);

      expect(result).toBe(48); // advances to next default tab stop
    });

    it('advances to next default tab stop when hanging is zero and no textStartPx', () => {
      // hanging=0 → markerStartPos = indentLeft, textStart = indentLeft → tabWidth = -markerWidth
      const wordLayout: MinimalWordLayout = {
        marker: {
          glyphWidthPx: 10,
          suffix: 'tab',
        },
      };
      const indentLeft = 24;
      const hanging = 0;
      // markerStartPos = 24 - 0 = 24
      // currentPosStandard = 24 + 10 = 34
      // textStart = 24, tabWidth = 24 - 34 = -10 → overflow
      // nextDefaultTab = 34 + 48 - (34 % 48) = 48
      const result = resolveListTextStartPx(wordLayout, indentLeft, 0, hanging, mockMeasureMarkerText);

      expect(result).toBe(48); // advances to next default tab stop
    });
  });

  describe('Step 8: textStartPx target branch', () => {
    it('uses textStartPx when it exceeds currentPosStandard', () => {
      const wordLayout: MinimalWordLayout = {
        marker: {
          glyphWidthPx: 10,
          suffix: 'tab',
        },
        textStartPx: 36,
      };
      const indentLeft = 36;
      const hanging = 18;
      // markerStartPos = 36 - 18 = 18
      // currentPosStandard = 18 + 10 = 28
      // gap = max(36 - 28, 8) = max(8, 8) = 8
      const result = resolveListTextStartPx(wordLayout, indentLeft, 0, hanging, mockMeasureMarkerText);

      expect(result).toBe(36); // 28 + 8 = 36
    });

    it('enforces minimum gutterWidth when textStartPx is close to currentPosStandard', () => {
      const wordLayout: MinimalWordLayout = {
        marker: {
          glyphWidthPx: 15,
          suffix: 'tab',
        },
        textStartPx: 36,
      };
      const indentLeft = 36;
      const hanging = 18;
      // markerStartPos = 36 - 18 = 18
      // currentPosStandard = 18 + 15 = 33
      // gap = max(36 - 33, 8) = max(3, 8) = 8 (gutterWidth enforced)
      const result = resolveListTextStartPx(wordLayout, indentLeft, 0, hanging, mockMeasureMarkerText);

      expect(result).toBe(33 + LIST_MARKER_GAP); // 33 + 8 = 41
      expect(result).toBeGreaterThanOrEqual(33 + LIST_MARKER_GAP);
    });

    it('enforces minimum gutterWidth when textStartPx is behind currentPosStandard', () => {
      // Overflow: marker extends past the target text start
      const wordLayout: MinimalWordLayout = {
        marker: {
          glyphWidthPx: 25, // wider than hanging
          suffix: 'tab',
        },
        textStartPx: 36,
      };
      const indentLeft = 36;
      const hanging = 18;
      // markerStartPos = 36 - 18 = 18
      // currentPosStandard = 18 + 25 = 43
      // gap = max(36 - 43, 8) = max(-7, 8) = 8
      const result = resolveListTextStartPx(wordLayout, indentLeft, 0, hanging, mockMeasureMarkerText);

      expect(result).toBe(43 + LIST_MARKER_GAP); // 43 + 8 = 51
      expect(result).not.toBe(43 + DEFAULT_TAB_INTERVAL_PX);
    });

    it('uses custom gutterWidthPx when larger than LIST_MARKER_GAP', () => {
      const wordLayout: MinimalWordLayout = {
        marker: {
          glyphWidthPx: 25,
          suffix: 'tab',
          gutterWidthPx: 12,
        },
        textStartPx: 36,
      };
      const indentLeft = 36;
      const hanging = 18;
      // markerStartPos = 18, currentPosStandard = 18 + 25 = 43
      // gap = max(36 - 43, 12) = max(-7, 12) = 12
      const result = resolveListTextStartPx(wordLayout, indentLeft, 0, hanging, mockMeasureMarkerText);

      expect(result).toBe(43 + 12); // 55
    });
  });

  describe('Step 8: implicit indent fallback', () => {
    it('uses indentLeft + firstLine when no textStartPx provided', () => {
      const wordLayout: MinimalWordLayout = {
        marker: {
          glyphWidthPx: 8,
          suffix: 'tab',
        },
      };
      const indentLeft = 36;
      const hanging = 18;
      // markerStartPos = 36 - 18 = 18
      // currentPosStandard = 18 + 8 = 26
      // textStart = 36, tabWidth = 36 - 26 = 10 (>= LIST_MARKER_GAP, used as-is)
      const result = resolveListTextStartPx(wordLayout, indentLeft, 0, hanging, mockMeasureMarkerText);

      expect(result).toBe(36); // 26 + 10 = 36
    });

    it('uses actual tab width for small positive gap (matches renderer)', () => {
      const wordLayout: MinimalWordLayout = {
        marker: {
          glyphWidthPx: 14,
          suffix: 'tab',
        },
      };
      const indentLeft = 36;
      const hanging = 18;
      // markerStartPos = 18, currentPosStandard = 18 + 14 = 32
      // textStart = 36, tabWidth = 36 - 32 = 4 (used as-is, matching renderer)
      const result = resolveListTextStartPx(wordLayout, indentLeft, 0, hanging, mockMeasureMarkerText);

      expect(result).toBe(36); // text starts at textStart position (indentLeft)
    });
  });

  describe('Step 7: first-line indent mode preserves floor on all branches', () => {
    it('floors real tab stop gap to LIST_MARKER_GAP when tab is very close to marker', () => {
      // Step 7 floors even real tab stops — this is intentional current behavior.
      // A tab stop 2px past the marker still gets floored to LIST_MARKER_GAP.
      const wordLayout: MinimalWordLayout = {
        firstLineIndentMode: true,
        tabsPx: [22], // tab at 22, just 2px past marker end at 20
        marker: {
          markerX: 0,
          glyphWidthPx: 20, // currentPos = 20
          suffix: 'tab',
        },
      };
      const result = resolveListTextStartPx(wordLayout, 0, 0, 0, mockMeasureMarkerText);

      // tabWidth = 22 - 20 = 2, which is < LIST_MARKER_GAP (8), so floored to 8
      expect(result).toBe(20 + LIST_MARKER_GAP); // 28
    });

    it('uses real tab stop gap when it exceeds LIST_MARKER_GAP', () => {
      const wordLayout: MinimalWordLayout = {
        firstLineIndentMode: true,
        tabsPx: [36], // tab at 36, 16px past marker end at 20
        marker: {
          markerX: 0,
          glyphWidthPx: 20, // currentPos = 20
          suffix: 'tab',
        },
      };
      const result = resolveListTextStartPx(wordLayout, 0, 0, 0, mockMeasureMarkerText);

      // tabWidth = 36 - 20 = 16, which is >= LIST_MARKER_GAP → used as-is
      expect(result).toBe(36);
    });
  });

  // ---------------------------------------------------------------------------
  // Regression-value tests
  //
  // These use representative indent/hanging/marker-width values from common
  // DOCX list patterns to guard against regressions in real-world documents.
  // Values derived from word-layout defaults:
  //   DEFAULT_LIST_INDENT_BASE_PX = 24
  //   DEFAULT_LIST_INDENT_STEP_PX = 24
  //   DEFAULT_LIST_HANGING_PX = 18
  // ---------------------------------------------------------------------------

  describe('regression-value tests (representative doc patterns)', () => {
    // Pattern: standard level-1 list (indentLeft=24, hanging=18)
    // Common in most DOCX files. Marker sits in the 18px hanging area.
    describe('standard level-1 list (indentLeft=24, hanging=18)', () => {
      it('short numbered marker "1." fits in hanging area', () => {
        const wordLayout: MinimalWordLayout = {
          marker: { glyphWidthPx: 8, suffix: 'tab' },
          textStartPx: 24,
        };
        // markerStartPos = 24 - 18 = 6, currentPosStandard = 6 + 8 = 14
        // gap = max(24 - 14, 8) = max(10, 8) = 10
        const result = resolveListTextStartPx(wordLayout, 24, 0, 18, mockMeasureMarkerText);

        expect(result).toBe(24); // text starts at indentLeft
      });

      it('wide numbered marker "viii." overflows hanging area with minimum gap', () => {
        const wordLayout: MinimalWordLayout = {
          marker: { glyphWidthPx: 22, suffix: 'tab' },
          textStartPx: 24,
        };
        // markerStartPos = 6, currentPosStandard = 6 + 22 = 28
        // gap = max(24 - 28, 8) = max(-4, 8) = 8
        const result = resolveListTextStartPx(wordLayout, 24, 0, 18, mockMeasureMarkerText);

        expect(result).toBe(28 + LIST_MARKER_GAP); // 36, not 28 + 48 = 76
        expect(result).not.toBe(28 + DEFAULT_TAB_INTERVAL_PX);
      });

      it('bullet marker "•" fits comfortably in hanging area', () => {
        const wordLayout: MinimalWordLayout = {
          marker: { glyphWidthPx: 6, suffix: 'tab' },
          textStartPx: 24,
        };
        // markerStartPos = 6, currentPosStandard = 6 + 6 = 12
        // gap = max(24 - 12, 8) = max(12, 8) = 12
        const result = resolveListTextStartPx(wordLayout, 24, 0, 18, mockMeasureMarkerText);

        expect(result).toBe(24); // text starts at indentLeft
      });
    });

    // Pattern: level-2 list (indentLeft=48, hanging=18)
    describe('level-2 list (indentLeft=48, hanging=18)', () => {
      it('sub-item marker fits in hanging area', () => {
        const wordLayout: MinimalWordLayout = {
          marker: { glyphWidthPx: 12, suffix: 'tab' },
          textStartPx: 48,
        };
        // markerStartPos = 48 - 18 = 30, currentPosStandard = 30 + 12 = 42
        // gap = max(48 - 42, 8) = max(6, 8) = 8
        const result = resolveListTextStartPx(wordLayout, 48, 0, 18, mockMeasureMarkerText);

        expect(result).toBe(42 + LIST_MARKER_GAP); // 42 + 8 = 50 (gap enforced to minimum)
        expect(result).toBe(50);
      });
    });

    // Pattern: tiny spacing (small indents, marker nearly fills available space)
    // Representative of tight-spacing documents like tiny-spacing.docx
    describe('tiny spacing pattern (small indents)', () => {
      it('marker fills entire indent with no overflow', () => {
        const wordLayout: MinimalWordLayout = {
          marker: { glyphWidthPx: 10, suffix: 'tab' },
          textStartPx: 12,
        };
        // indentLeft=12, hanging=12 → markerStartPos = 0
        // currentPosStandard = 0 + 10 = 10
        // gap = max(12 - 10, 8) = max(2, 8) = 8
        const result = resolveListTextStartPx(wordLayout, 12, 0, 12, mockMeasureMarkerText);

        expect(result).toBe(10 + LIST_MARKER_GAP); // 18
        expect(result).toBeGreaterThanOrEqual(10 + LIST_MARKER_GAP);
      });

      it('marker overflows tiny hanging space', () => {
        const wordLayout: MinimalWordLayout = {
          marker: { glyphWidthPx: 15, suffix: 'tab' },
          textStartPx: 12,
        };
        // indentLeft=12, hanging=10 → markerStartPos = 2
        // currentPosStandard = 2 + 15 = 17
        // gap = max(12 - 17, 8) = max(-5, 8) = 8
        const result = resolveListTextStartPx(wordLayout, 12, 0, 10, mockMeasureMarkerText);

        expect(result).toBe(17 + LIST_MARKER_GAP); // 25
        expect(result).not.toBe(17 + DEFAULT_TAB_INTERVAL_PX);
      });
    });

    // Pattern: legal numbering (wider markers like "(a)", "1.1.1")
    // Representative of template_format.docx and sd-1356 patterns
    describe('legal numbering pattern (wide markers)', () => {
      it('compound marker "1.1.1" overflows standard hanging with minimum gap', () => {
        const wordLayout: MinimalWordLayout = {
          marker: { glyphWidthPx: 30, suffix: 'tab' },
          textStartPx: 36,
        };
        // indentLeft=36, hanging=18 → markerStartPos = 18
        // currentPosStandard = 18 + 30 = 48
        // gap = max(36 - 48, 8) = max(-12, 8) = 8
        const result = resolveListTextStartPx(wordLayout, 36, 0, 18, mockMeasureMarkerText);

        expect(result).toBe(48 + LIST_MARKER_GAP); // 56
        expect(result).not.toBe(48 + DEFAULT_TAB_INTERVAL_PX); // not 96
      });

      it('parenthetical marker "(a)" fits in standard hanging', () => {
        const wordLayout: MinimalWordLayout = {
          marker: { glyphWidthPx: 16, suffix: 'tab' },
          textStartPx: 36,
        };
        // indentLeft=36, hanging=18 → markerStartPos = 18
        // currentPosStandard = 18 + 16 = 34
        // gap = max(36 - 34, 8) = max(2, 8) = 8
        const result = resolveListTextStartPx(wordLayout, 36, 0, 18, mockMeasureMarkerText);

        expect(result).toBe(34 + LIST_MARKER_GAP); // 42
      });
    });

    // Pattern: no textStartPx (wordLayout missing or textStartPx absent)
    // Falls to implicit indent fallback in Step 8
    describe('implicit indent fallback (no textStartPx)', () => {
      it('level-1 list with no textStartPx uses indentLeft', () => {
        const wordLayout: MinimalWordLayout = {
          marker: { glyphWidthPx: 8, suffix: 'tab' },
          // textStartPx intentionally omitted
        };
        // markerStartPos = 24 - 18 = 6, currentPosStandard = 6 + 8 = 14
        // textStart = 24, tabWidth = 24 - 14 = 10 (>= LIST_MARKER_GAP)
        const result = resolveListTextStartPx(wordLayout, 24, 0, 18, mockMeasureMarkerText);

        expect(result).toBe(24); // text at indentLeft
      });

      it('wide marker with no textStartPx advances to next default tab stop', () => {
        const wordLayout: MinimalWordLayout = {
          marker: { glyphWidthPx: 25, suffix: 'tab' },
          // textStartPx intentionally omitted
        };
        // markerStartPos = 24 - 18 = 6, currentPosStandard = 6 + 25 = 31
        // textStart = 24, tabWidth = 24 - 31 = -7 → overflow
        // nextDefaultTab = 31 + 48 - (31 % 48) = 48
        const result = resolveListTextStartPx(wordLayout, 24, 0, 18, mockMeasureMarkerText);

        expect(result).toBe(48); // advances to next default tab stop
      });
    });
  });

  describe('marker text measurement', () => {
    it('uses glyphWidthPx when provided', () => {
      const measureCalls: string[] = [];
      const trackingMeasure = (text: string): number => {
        measureCalls.push(text);
        return text.length * 8;
      };

      const wordLayout: MinimalWordLayout = {
        marker: {
          glyphWidthPx: 25,
          markerText: 'ABC', // Should not be measured
          suffix: 'nothing',
        },
      };

      const result = resolveListTextStartPx(wordLayout, 0, 0, 0, trackingMeasure);
      expect(result).toBe(25); // Uses glyphWidthPx
      expect(measureCalls).toHaveLength(0); // measureMarkerText not called
    });

    it('measures markerText when glyphWidthPx not provided', () => {
      const measureCalls: string[] = [];
      const trackingMeasure = (text: string): number => {
        measureCalls.push(text);
        return text.length * 8;
      };

      const wordLayout: MinimalWordLayout = {
        marker: {
          markerText: 'ABC', // 3 * 8 = 24
          suffix: 'nothing',
        },
      };

      const result = resolveListTextStartPx(wordLayout, 0, 0, 0, trackingMeasure);
      expect(result).toBe(24); // Measured width
      expect(measureCalls).toEqual(['ABC']); // measureMarkerText called
    });

    it('falls back to markerBoxWidthPx when measurement fails', () => {
      const failingMeasure = (): number => NaN;

      const wordLayout: MinimalWordLayout = {
        marker: {
          markerBoxWidthPx: 20,
          markerText: 'ABC',
          suffix: 'nothing',
        },
      };

      const result = resolveListTextStartPx(wordLayout, 0, 0, 0, failingMeasure);
      expect(result).toBe(20); // Uses markerBoxWidthPx fallback
    });

    it('uses 0 when no width information available', () => {
      const wordLayout: MinimalWordLayout = {
        marker: {
          suffix: 'nothing',
        },
      };

      const result = resolveListTextStartPx(wordLayout, 0, 0, 0, mockMeasureMarkerText);
      expect(result).toBe(0); // All widths default to 0
    });
  });
});
