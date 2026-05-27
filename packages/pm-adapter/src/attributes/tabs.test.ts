/**
 * Tests for Tab Stop Normalization Module
 *
 * Covers 3 functions for normalizing OOXML tab stops:
 * - normalizeOoxmlTabs: Main function for normalizing tab stop array
 * - normalizeTabVal: Normalize tab alignment values (left→start, right→end)
 * - normalizeTabLeader: Normalize tab leader values (thick→heavy)
 *
 * Critical: Tests include px→twips conversion (1px = 15 twips at 96 DPI)
 * and multiple property name fallbacks.
 */

import { describe, it, expect } from 'vitest';
import { normalizeOoxmlTabs, normalizeTabVal, normalizeTabLeader } from './tabs.js';

describe('normalizeOoxmlTabs', () => {
  describe('valid tab stops', () => {
    it('should normalize tab with originalPos (twips)', () => {
      const tabs = [
        { val: 'start', originalPos: 720 }, // 0.5 inch
      ];
      const result = normalizeOoxmlTabs(tabs);
      expect(result).toEqual([{ val: 'start', pos: 720 }]);
    });

    it('should normalize tab with pos (pixels) converting to twips', () => {
      const tabs = [
        { val: 'center', pos: 48 }, // 48px = 720 twips
      ];
      const result = normalizeOoxmlTabs(tabs);
      expect(result).toEqual([{ val: 'center', pos: 720 }]);
    });

    it('should prioritize originalPos over pos', () => {
      const tabs = [{ val: 'end', originalPos: 1440, pos: 100 }];
      const result = normalizeOoxmlTabs(tabs);
      // Should use originalPos (1440), not pos
      expect(result?.[0].pos).toBe(1440);
    });

    it('should include leader when present', () => {
      const tabs = [{ val: 'decimal', pos: 96, leader: 'dot' }];
      const result = normalizeOoxmlTabs(tabs);
      expect(result).toEqual([{ val: 'decimal', pos: 1440, leader: 'dot' }]);
    });

    it('should omit leader when undefined', () => {
      const tabs = [{ val: 'start', pos: 48 }];
      const result = normalizeOoxmlTabs(tabs);
      expect(result?.[0].leader).toBeUndefined();
    });

    it('should normalize multiple tab stops', () => {
      const tabs = [
        { val: 'start', pos: 48 },
        { val: 'center', pos: 96 },
        { val: 'end', pos: 144 },
      ];
      const result = normalizeOoxmlTabs(tabs);
      expect(result).toEqual([
        { val: 'start', pos: 720 },
        { val: 'center', pos: 1440 },
        { val: 'end', pos: 2160 },
      ]);
    });
  });

  describe('property name fallbacks', () => {
    it('should use pos as primary position property', () => {
      const tabs = [{ val: 'start', pos: 48 }];
      const result = normalizeOoxmlTabs(tabs);
      expect(result?.[0].pos).toBe(720);
    });

    it('should fall back to position when pos is missing', () => {
      const tabs = [{ val: 'start', position: 48 }];
      const result = normalizeOoxmlTabs(tabs);
      expect(result?.[0].pos).toBe(720);
    });

    it('should fall back to offset when pos and position are missing', () => {
      const tabs = [{ val: 'start', offset: 48 }];
      const result = normalizeOoxmlTabs(tabs);
      expect(result?.[0].pos).toBe(720);
    });

    it('should use val as primary alignment property', () => {
      const tabs = [{ val: 'center', pos: 48 }];
      const result = normalizeOoxmlTabs(tabs);
      expect(result?.[0].val).toBe('center');
    });

    it('should fall back to align when val is missing', () => {
      const tabs = [{ align: 'center', pos: 48 }];
      const result = normalizeOoxmlTabs(tabs);
      expect(result?.[0].val).toBe('center');
    });

    it('should fall back to alignment when val and align are missing', () => {
      const tabs = [{ alignment: 'center', pos: 48 }];
      const result = normalizeOoxmlTabs(tabs);
      expect(result?.[0].val).toBe('center');
    });

    it('should fall back to type when val/align/alignment are missing', () => {
      const tabs = [{ type: 'center', pos: 48 }];
      const result = normalizeOoxmlTabs(tabs);
      expect(result?.[0].val).toBe('center');
    });
  });

  describe('px to twips conversion', () => {
    it('should convert 48px to 720 twips (0.5 inch)', () => {
      const tabs = [{ val: 'start', pos: 48 }];
      const result = normalizeOoxmlTabs(tabs);
      expect(result?.[0].pos).toBe(720);
    });

    it('should convert 96px to 1440 twips (1 inch)', () => {
      const tabs = [{ val: 'start', pos: 96 }];
      const result = normalizeOoxmlTabs(tabs);
      expect(result?.[0].pos).toBe(1440);
    });

    it('should round fractional twips', () => {
      const tabs = [{ val: 'start', pos: 48.5 }]; // 48.5 * 15 = 727.5
      const result = normalizeOoxmlTabs(tabs);
      expect(result?.[0].pos).toBe(728); // Rounded
    });

    it('should round down for .4 fractional part', () => {
      const tabs = [{ val: 'start', pos: 48.2 }]; // 48.2 * 15 = 723
      const result = normalizeOoxmlTabs(tabs);
      expect(result?.[0].pos).toBe(723);
    });

    it('should handle zero position', () => {
      const tabs = [{ val: 'start', pos: 0 }];
      const result = normalizeOoxmlTabs(tabs);
      expect(result?.[0].pos).toBe(0);
    });
  });

  describe('invalid inputs', () => {
    it('should return undefined for non-array', () => {
      expect(normalizeOoxmlTabs(null)).toBeUndefined();
      expect(normalizeOoxmlTabs(undefined)).toBeUndefined();
      expect(normalizeOoxmlTabs('string')).toBeUndefined();
      expect(normalizeOoxmlTabs({})).toBeUndefined();
    });

    it('should return undefined for empty array', () => {
      expect(normalizeOoxmlTabs([])).toBeUndefined();
    });

    it('should skip non-object entries', () => {
      const tabs = ['invalid', { val: 'start', pos: 48 }, null];
      const result = normalizeOoxmlTabs(tabs);
      expect(result).toHaveLength(1);
      expect(result?.[0].val).toBe('start');
    });

    it('should skip entries without position', () => {
      const tabs = [
        { val: 'start' }, // Missing pos
      ];
      const result = normalizeOoxmlTabs(tabs);
      expect(result).toBeUndefined();
    });

    it('should skip entries without val', () => {
      const tabs = [
        { pos: 48 }, // Missing val
      ];
      const result = normalizeOoxmlTabs(tabs);
      expect(result).toBeUndefined();
    });

    it('should skip entries with invalid val', () => {
      const tabs = [{ val: 'invalid', pos: 48 }];
      const result = normalizeOoxmlTabs(tabs);
      expect(result).toBeUndefined();
    });

    it('should filter out invalid entries but keep valid ones', () => {
      const tabs = [
        { val: 'start', pos: 48 },
        { val: 'invalid', pos: 96 },
        { val: 'center', pos: 144 },
      ];
      const result = normalizeOoxmlTabs(tabs);
      expect(result).toHaveLength(2);
      expect(result?.[0].val).toBe('start');
      expect(result?.[1].val).toBe('center');
    });
  });
});

describe('normalizeTabVal', () => {
  describe('OOXML native values', () => {
    it('should return "start" for start', () => {
      expect(normalizeTabVal('start')).toBe('start');
    });

    it('should return "center" for center', () => {
      expect(normalizeTabVal('center')).toBe('center');
    });

    it('should return "end" for end', () => {
      expect(normalizeTabVal('end')).toBe('end');
    });

    it('should return "decimal" for decimal', () => {
      expect(normalizeTabVal('decimal')).toBe('decimal');
    });

    it('should return "bar" for bar', () => {
      expect(normalizeTabVal('bar')).toBe('bar');
    });

    it('should return "clear" for clear', () => {
      expect(normalizeTabVal('clear')).toBe('clear');
    });
  });

  describe('legacy mappings', () => {
    it('should map "left" to "start"', () => {
      expect(normalizeTabVal('left')).toBe('start');
    });

    it('should map "right" to "end"', () => {
      expect(normalizeTabVal('right')).toBe('end');
    });

    it('should map "dec" to "decimal"', () => {
      expect(normalizeTabVal('dec')).toBe('decimal');
    });
  });

  describe('invalid values', () => {
    it('should return undefined for invalid string', () => {
      expect(normalizeTabVal('invalid')).toBeUndefined();
      expect(normalizeTabVal('top')).toBeUndefined();
    });

    it('should return undefined for non-string values', () => {
      expect(normalizeTabVal(null)).toBeUndefined();
      expect(normalizeTabVal(undefined)).toBeUndefined();
      expect(normalizeTabVal(123)).toBeUndefined();
      expect(normalizeTabVal({})).toBeUndefined();
    });

    it('should be case-sensitive', () => {
      expect(normalizeTabVal('START')).toBeUndefined();
      expect(normalizeTabVal('Center')).toBeUndefined();
      expect(normalizeTabVal('Left')).toBeUndefined();
    });
  });
});

describe('normalizeTabLeader', () => {
  describe('OOXML native values', () => {
    it('should return "none" for none', () => {
      expect(normalizeTabLeader('none')).toBe('none');
    });

    it('should return "dot" for dot', () => {
      expect(normalizeTabLeader('dot')).toBe('dot');
    });

    it('should return "hyphen" for hyphen', () => {
      expect(normalizeTabLeader('hyphen')).toBe('hyphen');
    });

    it('should return "heavy" for heavy', () => {
      expect(normalizeTabLeader('heavy')).toBe('heavy');
    });

    it('should return "underscore" for underscore', () => {
      expect(normalizeTabLeader('underscore')).toBe('underscore');
    });

    it('should return "middleDot" for middleDot', () => {
      expect(normalizeTabLeader('middleDot')).toBe('middleDot');
    });
  });

  describe('legacy mappings', () => {
    it('should map "thick" to "heavy"', () => {
      expect(normalizeTabLeader('thick')).toBe('heavy');
    });
  });

  describe('invalid values', () => {
    it('should return undefined for invalid string', () => {
      expect(normalizeTabLeader('invalid')).toBeUndefined();
      expect(normalizeTabLeader('solid')).toBeUndefined();
    });

    it('should return undefined for non-string values', () => {
      expect(normalizeTabLeader(null)).toBeUndefined();
      expect(normalizeTabLeader(undefined)).toBeUndefined();
      expect(normalizeTabLeader(123)).toBeUndefined();
      expect(normalizeTabLeader({})).toBeUndefined();
    });

    it('should be case-sensitive', () => {
      expect(normalizeTabLeader('DOT')).toBeUndefined();
      expect(normalizeTabLeader('Hyphen')).toBeUndefined();
      expect(normalizeTabLeader('Thick')).toBeUndefined();
    });
  });
});

describe('super-editor format (nested tab object)', () => {
  it('should normalize tab with nested { tab: { tabType, pos } } format', () => {
    const tabs = [{ tab: { tabType: 'left', pos: 4320 } }];
    const result = normalizeOoxmlTabs(tabs);
    expect(result).toEqual([{ val: 'start', pos: 4320 }]);
  });

  it('should treat nested tab pos as twips even when value is small', () => {
    const tabs = [{ tab: { tabType: 'left', pos: 360 } }];
    const result = normalizeOoxmlTabs(tabs);
    expect(result).toEqual([{ val: 'start', pos: 360 }]);
  });

  it('should normalize right-aligned tab from super-editor format', () => {
    const tabs = [{ tab: { tabType: 'right', pos: 8640 } }];
    const result = normalizeOoxmlTabs(tabs);
    expect(result).toEqual([{ val: 'end', pos: 8640 }]);
  });

  it('should normalize center-aligned tab from super-editor format', () => {
    const tabs = [{ tab: { tabType: 'center', pos: 6480 } }];
    const result = normalizeOoxmlTabs(tabs);
    expect(result).toEqual([{ val: 'center', pos: 6480 }]);
  });

  it('should normalize decimal tab from super-editor format', () => {
    const tabs = [{ tab: { tabType: 'decimal', pos: 7200 } }];
    const result = normalizeOoxmlTabs(tabs);
    expect(result).toEqual([{ val: 'decimal', pos: 7200 }]);
  });

  it('should include leader from super-editor format', () => {
    const tabs = [{ tab: { tabType: 'right', pos: 8640, leader: 'dot' } }];
    const result = normalizeOoxmlTabs(tabs);
    expect(result).toEqual([{ val: 'end', pos: 8640, leader: 'dot' }]);
  });

  it('should normalize multiple tabs from super-editor format', () => {
    const tabs = [
      { tab: { tabType: 'left', pos: 2880 } },
      { tab: { tabType: 'center', pos: 5760 } },
      { tab: { tabType: 'right', pos: 8640 } },
    ];
    const result = normalizeOoxmlTabs(tabs);
    expect(result).toEqual([
      { val: 'start', pos: 2880 },
      { val: 'center', pos: 5760 },
      { val: 'end', pos: 8640 },
    ]);
  });

  it('should handle mixed format (super-editor and flat) in same array', () => {
    const tabs = [
      { tab: { tabType: 'left', pos: 2880 } }, // super-editor format
      { val: 'center', originalPos: 5760 }, // flat format with originalPos
    ];
    const result = normalizeOoxmlTabs(tabs);
    expect(result).toEqual([
      { val: 'start', pos: 2880 },
      { val: 'center', pos: 5760 },
    ]);
  });

  it('should skip super-editor entries with malformed tab object', () => {
    const tabs = [
      { tab: null }, // Malformed: tab is null
      { tab: 'invalid' }, // Malformed: tab is not an object
      { tab: { tabType: 'left', pos: 4320 } }, // Valid
    ];
    const result = normalizeOoxmlTabs(tabs);
    expect(result).toEqual([{ val: 'start', pos: 4320 }]);
  });

  it('should skip super-editor entries with missing tabType', () => {
    const tabs = [
      { tab: { pos: 4320 } }, // Missing tabType
      { tab: { tabType: 'left', pos: 5760 } }, // Valid
    ];
    const result = normalizeOoxmlTabs(tabs);
    expect(result).toEqual([{ val: 'start', pos: 5760 }]);
  });

  it('should skip super-editor entries with missing pos', () => {
    const tabs = [
      { tab: { tabType: 'left' } }, // Missing pos
      { tab: { tabType: 'center', pos: 5760 } }, // Valid
    ];
    const result = normalizeOoxmlTabs(tabs);
    expect(result).toEqual([{ val: 'center', pos: 5760 }]);
  });

  it('should skip super-editor entries with invalid tabType', () => {
    const tabs = [
      { tab: { tabType: 'invalid', pos: 4320 } }, // Invalid tabType
      { tab: { tabType: 'center', pos: 5760 } }, // Valid
    ];
    const result = normalizeOoxmlTabs(tabs);
    expect(result).toEqual([{ val: 'center', pos: 5760 }]);
  });

  it('should normalize leader values in super-editor format', () => {
    const tabs = [
      { tab: { tabType: 'right', pos: 4320, leader: 'dot' } },
      { tab: { tabType: 'right', pos: 5760, leader: 'heavy' } },
      { tab: { tabType: 'right', pos: 7200, leader: 'thick' } }, // Legacy -> heavy
    ];
    const result = normalizeOoxmlTabs(tabs);
    expect(result).toEqual([
      { val: 'end', pos: 4320, leader: 'dot' },
      { val: 'end', pos: 5760, leader: 'heavy' },
      { val: 'end', pos: 7200, leader: 'heavy' },
    ]);
  });

  it('should handle super-editor format with all supported alignments', () => {
    const tabs = [
      { tab: { tabType: 'start', pos: 1440 } },
      { tab: { tabType: 'center', pos: 2880 } },
      { tab: { tabType: 'end', pos: 4320 } },
      { tab: { tabType: 'decimal', pos: 5760 } },
      { tab: { tabType: 'bar', pos: 7200 } },
    ];
    const result = normalizeOoxmlTabs(tabs);
    expect(result).toEqual([
      { val: 'start', pos: 1440 },
      { val: 'center', pos: 2880 },
      { val: 'end', pos: 4320 },
      { val: 'decimal', pos: 5760 },
      { val: 'bar', pos: 7200 },
    ]);
  });
});

describe('normalizeOoxmlTabs integration', () => {
  it('should normalize complete tab with all properties', () => {
    const tabs = [
      {
        val: 'decimal',
        originalPos: 1440,
        pos: 96,
        leader: 'dot',
      },
    ];
    const result = normalizeOoxmlTabs(tabs);
    expect(result).toEqual([
      {
        val: 'decimal',
        pos: 1440, // Uses originalPos, not pos
        leader: 'dot',
      },
    ]);
  });

  it('should normalize tab with legacy mappings', () => {
    const tabs = [
      {
        align: 'left', // Maps to 'start'
        position: 48,
        leader: 'thick', // Maps to 'heavy'
      },
    ];
    const result = normalizeOoxmlTabs(tabs);
    expect(result).toEqual([
      {
        val: 'start',
        pos: 720,
        leader: 'heavy',
      },
    ]);
  });

  it('should normalize mixed valid and invalid tabs', () => {
    const tabs = [
      { val: 'start', pos: 48 },
      { val: 'invalid', pos: 96 }, // Invalid val
      null, // Invalid entry
      { pos: 144 }, // Missing val
      { val: 'center' }, // Missing pos
      { val: 'end', pos: 192, leader: 'dot' },
    ];
    const result = normalizeOoxmlTabs(tabs);
    expect(result).toEqual([
      { val: 'start', pos: 720 },
      { val: 'end', pos: 2880, leader: 'dot' },
    ]);
  });

  it('should normalize tab with all property fallbacks', () => {
    const tabs = [
      {
        type: 'dec', // Falls back from val→align→alignment→type, maps to 'decimal'
        offset: 48.5, // Falls back from pos→position→offset
      },
    ];
    const result = normalizeOoxmlTabs(tabs);
    expect(result).toEqual([
      {
        val: 'decimal',
        pos: 728, // 48.5 * 15 rounded
      },
    ]);
  });
});
