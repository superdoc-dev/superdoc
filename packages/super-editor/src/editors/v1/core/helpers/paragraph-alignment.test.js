import { describe, it, expect } from 'vitest';
import {
  mapDisplayAlignmentToStoredJustification,
  mapStoredJustificationToDisplayAlignment,
} from './paragraph-alignment.js';

// SD-3094: per ECMA-376 §17.3.1.13, `w:jc="left"` is the leading edge of the
// paragraph, not the physical left. In RTL paragraphs (`w:bidi`), leading is
// the right side. The two helpers below own the display ↔ stored translation
// so the editor can keep its UI in physical terms while the model stays in the
// spec's logical terms.

describe('mapDisplayAlignmentToStoredJustification', () => {
  describe('LTR paragraphs (isRtl=false)', () => {
    it('passes left/right/center through unchanged', () => {
      expect(mapDisplayAlignmentToStoredJustification('left', false)).toBe('left');
      expect(mapDisplayAlignmentToStoredJustification('right', false)).toBe('right');
      expect(mapDisplayAlignmentToStoredJustification('center', false)).toBe('center');
    });

    it('maps justify to OOXML both', () => {
      expect(mapDisplayAlignmentToStoredJustification('justify', false)).toBe('both');
    });
  });

  describe('RTL paragraphs (isRtl=true)', () => {
    it('mirrors left to right', () => {
      expect(mapDisplayAlignmentToStoredJustification('left', true)).toBe('right');
    });

    it('mirrors right to left', () => {
      expect(mapDisplayAlignmentToStoredJustification('right', true)).toBe('left');
    });

    it('keeps center unchanged', () => {
      expect(mapDisplayAlignmentToStoredJustification('center', true)).toBe('center');
    });

    it('maps justify to OOXML both (no direction-flip)', () => {
      expect(mapDisplayAlignmentToStoredJustification('justify', true)).toBe('both');
    });
  });

  it('justify always maps to both regardless of direction', () => {
    expect(mapDisplayAlignmentToStoredJustification('justify', false)).toBe('both');
    expect(mapDisplayAlignmentToStoredJustification('justify', true)).toBe('both');
  });
});

describe('mapStoredJustificationToDisplayAlignment', () => {
  describe('LTR paragraphs (isRtl=false)', () => {
    it('passes left/right/center through unchanged', () => {
      expect(mapStoredJustificationToDisplayAlignment('left', false)).toBe('left');
      expect(mapStoredJustificationToDisplayAlignment('right', false)).toBe('right');
      expect(mapStoredJustificationToDisplayAlignment('center', false)).toBe('center');
    });

    it('maps both to justify', () => {
      expect(mapStoredJustificationToDisplayAlignment('both', false)).toBe('justify');
    });

    it('defaults to left when justification is absent', () => {
      expect(mapStoredJustificationToDisplayAlignment(null, false)).toBe('left');
      expect(mapStoredJustificationToDisplayAlignment(undefined, false)).toBe('left');
      expect(mapStoredJustificationToDisplayAlignment('', false)).toBe('left');
    });
  });

  describe('RTL paragraphs (isRtl=true)', () => {
    it('mirrors stored left to display right', () => {
      expect(mapStoredJustificationToDisplayAlignment('left', true)).toBe('right');
    });

    it('mirrors stored right to display left', () => {
      expect(mapStoredJustificationToDisplayAlignment('right', true)).toBe('left');
    });

    it('keeps center unchanged', () => {
      expect(mapStoredJustificationToDisplayAlignment('center', true)).toBe('center');
    });

    it('maps both to justify (no direction-flip)', () => {
      expect(mapStoredJustificationToDisplayAlignment('both', true)).toBe('justify');
    });

    it('defaults to right when justification is absent', () => {
      expect(mapStoredJustificationToDisplayAlignment(null, true)).toBe('right');
      expect(mapStoredJustificationToDisplayAlignment(undefined, true)).toBe('right');
      expect(mapStoredJustificationToDisplayAlignment('', true)).toBe('right');
    });
  });

  // Roundtrip: writing then reading must return the original display value.
  describe('roundtrip display → stored → display', () => {
    for (const isRtl of [false, true]) {
      for (const display of /** @type {const} */ (['left', 'center', 'right', 'justify'])) {
        it(`${display} on ${isRtl ? 'RTL' : 'LTR'} survives a write+read cycle`, () => {
          const stored = mapDisplayAlignmentToStoredJustification(display, isRtl);
          const readBack = mapStoredJustificationToDisplayAlignment(stored, isRtl);
          expect(readBack).toBe(display);
        });
      }
    }
  });
});
