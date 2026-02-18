/**
 * Comprehensive test suite for utilities.ts
 * Tests all utility functions including edge cases, type guards, and bug fixes
 */

import { describe, it, expect } from 'vitest';
import type { FlowBlock } from '@superdoc/contracts';
import {
  twipsToPx,
  ptToPx,
  isFiniteNumber,
  isPlainObject,
  normalizePrefix,
  pickNumber,
  normalizeColor,
  normalizeString,
  coerceNumber,
  coercePositiveNumber,
  coerceBoolean,
  toBoolean,
  toBoxSpacing,
  normalizeMediaKey,
  inferExtensionFromPath,
  hydrateImageBlocks,
  shallowObjectEquals,
  buildPositionMap,
  createBlockIdGenerator,
  toDrawingContentSnapshot,
  isShapeGroupTransform,
  normalizeShapeSize,
  normalizeShapeGroupChildren,
  normalizeLineEnds,
  normalizeEffectExtent,
  coerceRelativeHeight,
  normalizeZIndex,
  getFragmentZIndex,
  resolveFloatingZIndex,
  OOXML_Z_INDEX_BASE,
} from './utilities.js';

// ============================================================================
// Unit Conversion Tests
// ============================================================================

describe('Unit Conversion', () => {
  describe('twipsToPx', () => {
    it('converts twips to pixels correctly', () => {
      expect(twipsToPx(1440)).toBe(96); // 1 inch = 1440 twips = 96px
      expect(twipsToPx(720)).toBe(48); // 0.5 inch
      expect(twipsToPx(0)).toBe(0);
    });

    it('handles negative values', () => {
      expect(twipsToPx(-1440)).toBe(-96);
    });

    it('handles fractional values', () => {
      expect(twipsToPx(360)).toBe(24); // 0.25 inch
    });
  });

  describe('ptToPx', () => {
    it('converts points to pixels', () => {
      expect(ptToPx(12)).toBeCloseTo(16, 1); // 12pt = 16px at 96 DPI
      expect(ptToPx(0)).toBe(0);
      expect(ptToPx(72)).toBe(96); // 72pt = 1 inch = 96px
    });

    it('returns undefined for null/undefined', () => {
      expect(ptToPx(null)).toBeUndefined();
      expect(ptToPx(undefined)).toBeUndefined();
    });

    it('returns undefined for non-finite numbers', () => {
      expect(ptToPx(NaN)).toBeUndefined();
      expect(ptToPx(Infinity)).toBeUndefined();
      expect(ptToPx(-Infinity)).toBeUndefined();
    });
  });
});

// ============================================================================
// Type Guard Tests
// ============================================================================

describe('Type Guards', () => {
  describe('isFiniteNumber', () => {
    it('returns true for finite numbers', () => {
      expect(isFiniteNumber(0)).toBe(true);
      expect(isFiniteNumber(42)).toBe(true);
      expect(isFiniteNumber(-3.14)).toBe(true);
      expect(isFiniteNumber(Number.MIN_VALUE)).toBe(true);
      expect(isFiniteNumber(Number.MAX_VALUE)).toBe(true);
    });

    it('returns false for non-finite numbers', () => {
      expect(isFiniteNumber(NaN)).toBe(false);
      expect(isFiniteNumber(Infinity)).toBe(false);
      expect(isFiniteNumber(-Infinity)).toBe(false);
    });

    it('returns false for non-numbers', () => {
      expect(isFiniteNumber('42')).toBe(false);
      expect(isFiniteNumber(null)).toBe(false);
      expect(isFiniteNumber(undefined)).toBe(false);
      expect(isFiniteNumber({})).toBe(false);
      expect(isFiniteNumber([])).toBe(false);
      expect(isFiniteNumber(true)).toBe(false);
    });
  });

  describe('isPlainObject', () => {
    it('returns true for plain objects', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1 })).toBe(true);
      expect(isPlainObject({ nested: { value: 42 } })).toBe(true);
    });

    it('returns true for class instances', () => {
      expect(isPlainObject(new Date())).toBe(true);
      expect(isPlainObject(new Map())).toBe(true);
      expect(isPlainObject(new Set())).toBe(true);
    });

    it('returns false for arrays', () => {
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject([1, 2, 3])).toBe(false);
    });

    it('returns false for null', () => {
      expect(isPlainObject(null)).toBe(false);
    });

    it('returns false for primitives', () => {
      expect(isPlainObject(42)).toBe(false);
      expect(isPlainObject('string')).toBe(false);
      expect(isPlainObject(true)).toBe(false);
      expect(isPlainObject(undefined)).toBe(false);
    });
  });
});

// ============================================================================
// Normalization & Coercion Tests
// ============================================================================

describe('Normalization', () => {
  describe('normalizePrefix', () => {
    it('returns empty string for falsy values', () => {
      expect(normalizePrefix(undefined)).toBe('');
      expect(normalizePrefix('')).toBe('');
    });

    it('converts values to strings', () => {
      expect(normalizePrefix('prefix-')).toBe('prefix-');
      expect(normalizePrefix('doc_')).toBe('doc_');
    });
  });

  describe('pickNumber', () => {
    it('returns numbers directly', () => {
      expect(pickNumber(42)).toBe(42);
      expect(pickNumber(0)).toBe(0);
      expect(pickNumber(-3.14)).toBe(-3.14);
    });

    it('parses numeric strings', () => {
      expect(pickNumber('42')).toBe(42);
      expect(pickNumber('3.14')).toBe(3.14);
      expect(pickNumber('-10')).toBe(-10);
    });

    it('returns undefined for non-numeric values', () => {
      expect(pickNumber('abc')).toBeUndefined(); // Fixed: now filters out NaN from parseFloat
      expect(pickNumber(null)).toBeUndefined();
      expect(pickNumber(undefined)).toBeUndefined();
    });
  });

  describe('normalizeColor', () => {
    it('adds # prefix when missing', () => {
      expect(normalizeColor('FF0000')).toBe('#FF0000');
      expect(normalizeColor('ABC')).toBe('#ABC');
    });

    it('preserves # prefix', () => {
      expect(normalizeColor('#FF0000')).toBe('#FF0000');
      expect(normalizeColor('#123ABC')).toBe('#123ABC');
    });

    it('returns undefined for auto/none (case-sensitive)', () => {
      expect(normalizeColor('auto')).toBeUndefined();
      expect(normalizeColor('none')).toBeUndefined();
      // Note: check is case-sensitive, so 'AUTO' is treated as a color
      expect(normalizeColor('AUTO')).toBe('#AUTO');
    });

    it('trims whitespace', () => {
      expect(normalizeColor('  FF0000  ')).toBe('#FF0000');
      expect(normalizeColor('  #ABC  ')).toBe('#ABC');
    });

    it('returns undefined for non-strings', () => {
      expect(normalizeColor(null as never)).toBeUndefined();
      expect(normalizeColor(undefined as never)).toBeUndefined();
      expect(normalizeColor(123 as never)).toBeUndefined();
    });

    it('returns undefined for empty strings', () => {
      expect(normalizeColor('')).toBeUndefined();
      expect(normalizeColor('   ')).toBeUndefined();
    });
  });

  describe('normalizeString', () => {
    it('trims and returns non-empty strings', () => {
      expect(normalizeString('  hello  ')).toBe('hello');
      expect(normalizeString('test')).toBe('test');
    });

    it('returns undefined for empty strings', () => {
      expect(normalizeString('')).toBeUndefined();
      expect(normalizeString('   ')).toBeUndefined();
    });

    it('returns undefined for non-strings', () => {
      expect(normalizeString(null as never)).toBeUndefined();
      expect(normalizeString(undefined as never)).toBeUndefined();
      expect(normalizeString(42 as never)).toBeUndefined();
    });
  });
});

describe('Coercion', () => {
  describe('coerceNumber', () => {
    it('returns numbers as-is', () => {
      expect(coerceNumber(42)).toBe(42);
      expect(coerceNumber(0)).toBe(0);
      expect(coerceNumber(-3.14)).toBe(-3.14);
    });

    it('parses numeric strings', () => {
      expect(coerceNumber('42')).toBe(42);
      expect(coerceNumber('3.14')).toBe(3.14);
      expect(coerceNumber('-10')).toBe(-10);
    });

    it('returns undefined for non-numeric strings', () => {
      expect(coerceNumber('abc')).toBeUndefined();
      expect(coerceNumber('12px')).toBeUndefined();
    });

    it('returns undefined for empty/whitespace strings', () => {
      expect(coerceNumber('')).toBeUndefined();
      expect(coerceNumber('   ')).toBeUndefined();
    });

    it('returns undefined for non-finite numbers', () => {
      expect(coerceNumber(NaN)).toBeUndefined();
      expect(coerceNumber(Infinity)).toBeUndefined();
      expect(coerceNumber(-Infinity)).toBeUndefined();
    });

    it('returns undefined for null/undefined/objects', () => {
      expect(coerceNumber(null)).toBeUndefined();
      expect(coerceNumber(undefined)).toBeUndefined();
      expect(coerceNumber({})).toBeUndefined();
    });
  });

  describe('coercePositiveNumber', () => {
    it('returns positive numbers', () => {
      expect(coercePositiveNumber(42, 10)).toBe(42);
      expect(coercePositiveNumber('3.14', 10)).toBe(3.14);
    });

    it('returns fallback for zero', () => {
      expect(coercePositiveNumber(0, 10)).toBe(10);
    });

    it('returns fallback for negative numbers', () => {
      expect(coercePositiveNumber(-5, 10)).toBe(10);
    });

    it('returns fallback for invalid inputs', () => {
      expect(coercePositiveNumber('abc', 10)).toBe(10);
      expect(coercePositiveNumber(null, 10)).toBe(10);
      expect(coercePositiveNumber(NaN, 10)).toBe(10);
    });

    it('throws error for non-positive fallback', () => {
      expect(() => coercePositiveNumber(5, 0)).toThrow();
      expect(() => coercePositiveNumber(5, -10)).toThrow();
      expect(() => coercePositiveNumber(5, NaN)).toThrow();
    });
  });

  describe('coerceBoolean', () => {
    it('returns boolean values as-is', () => {
      expect(coerceBoolean(true)).toBe(true);
      expect(coerceBoolean(false)).toBe(false);
    });

    it('converts truthy numbers', () => {
      expect(coerceBoolean(1)).toBe(true);
    });

    it('converts falsy numbers', () => {
      expect(coerceBoolean(0)).toBe(false);
    });

    it('returns undefined for other numbers', () => {
      expect(coerceBoolean(2)).toBeUndefined();
      expect(coerceBoolean(-1)).toBeUndefined();
    });

    it('converts truthy strings (case-insensitive)', () => {
      expect(coerceBoolean('true')).toBe(true);
      expect(coerceBoolean('TRUE')).toBe(true);
      expect(coerceBoolean('1')).toBe(true);
      expect(coerceBoolean('yes')).toBe(true);
      expect(coerceBoolean('YES')).toBe(true);
      expect(coerceBoolean('on')).toBe(true);
      expect(coerceBoolean('ON')).toBe(true);
    });

    it('converts falsy strings (case-insensitive)', () => {
      expect(coerceBoolean('false')).toBe(false);
      expect(coerceBoolean('FALSE')).toBe(false);
      expect(coerceBoolean('0')).toBe(false);
      expect(coerceBoolean('no')).toBe(false);
      expect(coerceBoolean('NO')).toBe(false);
      expect(coerceBoolean('off')).toBe(false);
      expect(coerceBoolean('OFF')).toBe(false);
    });

    it('returns undefined for other values', () => {
      expect(coerceBoolean(null)).toBeUndefined();
      expect(coerceBoolean(undefined)).toBeUndefined();
      expect(coerceBoolean('other')).toBeUndefined();
      expect(coerceBoolean({})).toBeUndefined();
    });
  });

  describe('toBoolean', () => {
    it('returns boolean values as-is', () => {
      expect(toBoolean(true)).toBe(true);
      expect(toBoolean(false)).toBe(false);
    });

    it('converts truthy strings', () => {
      expect(toBoolean('true')).toBe(true);
      expect(toBoolean('TRUE')).toBe(true);
      expect(toBoolean('1')).toBe(true);
    });

    it('converts falsy strings', () => {
      expect(toBoolean('false')).toBe(false);
      expect(toBoolean('FALSE')).toBe(false);
      expect(toBoolean('0')).toBe(false);
    });

    it('does NOT convert yes/no/on/off', () => {
      expect(toBoolean('yes')).toBeUndefined();
      expect(toBoolean('no')).toBeUndefined();
      expect(toBoolean('on')).toBeUndefined();
      expect(toBoolean('off')).toBeUndefined();
    });

    it('converts numbers', () => {
      expect(toBoolean(1)).toBe(true);
      expect(toBoolean(0)).toBe(false);
    });

    it('returns undefined for other values', () => {
      expect(toBoolean(2)).toBeUndefined();
      expect(toBoolean(null)).toBeUndefined();
      expect(toBoolean(undefined)).toBeUndefined();
    });
  });
});

// ============================================================================
// Box Spacing Tests
// ============================================================================

describe('toBoxSpacing', () => {
  it('extracts all spacing sides', () => {
    const result = toBoxSpacing({
      top: 10,
      right: 20,
      bottom: 30,
      left: 40,
    });
    expect(result).toEqual({
      top: 10,
      right: 20,
      bottom: 30,
      left: 40,
    });
  });

  it('handles partial spacing', () => {
    const result = toBoxSpacing({ top: 10, bottom: 20 });
    expect(result).toEqual({ top: 10, bottom: 20 });
  });

  it('returns undefined for empty spacing', () => {
    expect(toBoxSpacing({})).toBeUndefined();
  });

  it('returns undefined for null/undefined', () => {
    expect(toBoxSpacing(undefined)).toBeUndefined();
  });

  it('ignores non-finite values', () => {
    const result = toBoxSpacing({
      top: 10,
      right: NaN,
      bottom: Infinity,
      left: 'invalid' as never,
    });
    expect(result).toEqual({ top: 10 });
  });
});

// ============================================================================
// Media Utilities Tests (Bug Fixes)
// ============================================================================

describe('Media Utilities', () => {
  describe('normalizeMediaKey', () => {
    it('removes leading slashes', () => {
      expect(normalizeMediaKey('/media/image.png')).toBe('media/image.png');
      expect(normalizeMediaKey('///media/image.png')).toBe('media/image.png');
    });

    it('removes ./ prefix', () => {
      expect(normalizeMediaKey('./media/image.png')).toBe('media/image.png');
    });

    it('converts backslashes to forward slashes', () => {
      expect(normalizeMediaKey('media\\image.png')).toBe('media/image.png');
      expect(normalizeMediaKey('\\media\\image.png')).toBe('media/image.png');
    });

    it('handles complex paths (BUG FIX TEST)', () => {
      // This tests the regex ordering bug fix
      expect(normalizeMediaKey('.///media/image.png')).toBe('media/image.png');
      expect(normalizeMediaKey('////media/image.png')).toBe('media/image.png');
      expect(normalizeMediaKey('./././media/image.png')).toBe('media/image.png');
    });

    it('handles mixed slashes and dots', () => {
      expect(normalizeMediaKey('.\\\\\\\\media\\image.png')).toBe('media/image.png');
    });

    it('returns undefined for undefined input', () => {
      expect(normalizeMediaKey(undefined)).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(normalizeMediaKey('')).toBeUndefined();
    });
  });

  describe('inferExtensionFromPath', () => {
    it('extracts extension from simple paths', () => {
      expect(inferExtensionFromPath('document.pdf')).toBe('pdf');
      expect(inferExtensionFromPath('image.PNG')).toBe('png');
      expect(inferExtensionFromPath('file.txt')).toBe('txt');
    });

    it('handles paths with directories', () => {
      expect(inferExtensionFromPath('/path/to/file.txt')).toBe('txt');
      expect(inferExtensionFromPath('C:\\Users\\file.docx')).toBe('docx');
    });

    it('handles multiple dots', () => {
      expect(inferExtensionFromPath('archive.tar.gz')).toBe('gz');
      expect(inferExtensionFromPath('file.backup.txt')).toBe('txt');
    });

    it('returns undefined for files without extension', () => {
      expect(inferExtensionFromPath('README')).toBeUndefined();
      expect(inferExtensionFromPath('Makefile')).toBeUndefined();
    });

    it('returns undefined for hidden files (BUG FIX TEST)', () => {
      expect(inferExtensionFromPath('.gitignore')).toBeUndefined();
      expect(inferExtensionFromPath('.env')).toBeUndefined();
      expect(inferExtensionFromPath('/path/.hidden')).toBeUndefined();
    });

    it('returns undefined for trailing dots (BUG FIX TEST)', () => {
      expect(inferExtensionFromPath('file.')).toBeUndefined();
      expect(inferExtensionFromPath('/path/to/file.')).toBeUndefined();
    });

    it('returns undefined for null/undefined', () => {
      expect(inferExtensionFromPath(null)).toBeUndefined();
      expect(inferExtensionFromPath(undefined)).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(inferExtensionFromPath('')).toBeUndefined();
    });

    it('handles extensions with numbers', () => {
      expect(inferExtensionFromPath('file.mp3')).toBe('mp3');
      expect(inferExtensionFromPath('video.mp4')).toBe('mp4');
    });
  });

  describe('hydrateImageBlocks - ImageRun hydration', () => {
    it('hydrates ImageRuns inside paragraph blocks', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: '1',
          runs: [
            { text: 'Before ' },
            { kind: 'image', src: 'media/logo.png', width: 100, height: 100 },
            { text: ' After' },
          ],
        },
      ];
      const mediaFiles = { 'media/logo.png': 'iVBORw0KGgoAAAANS' };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      const runs = (result[0] as (typeof blocks)[0] & { runs: (typeof blocks)[0]['runs'] }).runs;

      expect(runs[0]).toEqual({ text: 'Before ' });
      expect(runs[1]).toEqual({
        kind: 'image',
        src: 'data:image/png;base64,iVBORw0KGgoAAAANS',
        width: 100,
        height: 100,
      });
      expect(runs[2]).toEqual({ text: ' After' });
    });

    it('hydrates multiple ImageRuns in same paragraph', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: '1',
          runs: [
            { kind: 'image', src: 'img1.png', width: 50, height: 50 },
            { text: ' and ' },
            { kind: 'image', src: 'img2.jpg', width: 60, height: 60 },
          ],
        },
      ];
      const mediaFiles = {
        'img1.png': 'base64data1',
        'img2.jpg': 'base64data2',
      };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      const runs = (result[0] as (typeof blocks)[0] & { runs: (typeof blocks)[0]['runs'] }).runs;

      expect(runs[0]).toEqual({
        kind: 'image',
        src: 'data:image/png;base64,base64data1',
        width: 50,
        height: 50,
      });
      expect(runs[2]).toEqual({
        kind: 'image',
        src: 'data:image/jpg;base64,base64data2',
        width: 60,
        height: 60,
      });
    });

    it('skips non-ImageRuns in paragraph', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: '1',
          runs: [{ text: 'Text run' }, { kind: 'tab', text: '\t', tabIndex: 0, leader: null }],
        },
      ];
      const mediaFiles = { 'media/image.png': 'base64data' };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      expect(result[0]).toEqual(blocks[0]);
    });

    it('skips ImageRuns with data URLs', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: '1',
          runs: [
            {
              kind: 'image',
              src: 'data:image/png;base64,existing',
              width: 100,
              height: 100,
            },
          ],
        },
      ];
      const mediaFiles = { 'media/image.png': 'newdata' };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      const runs = (result[0] as (typeof blocks)[0] & { runs: (typeof blocks)[0]['runs'] }).runs;
      expect(runs[0]).toEqual({
        kind: 'image',
        src: 'data:image/png;base64,existing',
        width: 100,
        height: 100,
      });
    });

    it('returns original runs array when no changes', () => {
      const originalRuns = [{ text: 'No images' }];
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: '1',
          runs: originalRuns,
        },
      ];
      const mediaFiles = { 'media/image.png': 'base64data' };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      const runs = (result[0] as (typeof blocks)[0] & { runs: (typeof blocks)[0]['runs'] }).runs;
      expect(runs).toBe(originalRuns); // Same reference (optimization)
    });

    it('handles paragraphs with empty runs array', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: '1',
          runs: [],
        },
      ];
      const mediaFiles = { 'media/image.png': 'base64data' };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      expect(result).toEqual(blocks);
    });
  });

  describe('hydrateImageBlocks', () => {
    it('returns blocks unchanged when no media files', () => {
      const blocks: FlowBlock[] = [{ kind: 'paragraph', id: '1', runs: [] }];
      expect(hydrateImageBlocks(blocks, undefined)).toBe(blocks);
      expect(hydrateImageBlocks(blocks, {})).toBe(blocks);
    });

    it('hydrates image blocks with matching media', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'image',
          id: '1',
          src: 'media/image.png',
          runs: [],
        },
      ];
      const mediaFiles = { 'media/image.png': 'base64data' };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      expect(result[0].src).toBe('data:image/png;base64,base64data');
    });

    it('leaves non-image blocks unchanged', () => {
      const blocks: FlowBlock[] = [{ kind: 'paragraph', id: '1', runs: [] }];
      const mediaFiles = { 'media/image.png': 'base64data' };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      expect(result).toEqual(blocks);
    });

    it('leaves data URLs unchanged', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'image',
          id: '1',
          src: 'data:image/png;base64,existing',
          runs: [],
        },
      ];
      const mediaFiles = { 'media/image.png': 'base64data' };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      expect(result[0].src).toBe('data:image/png;base64,existing');
    });

    it('handles normalized path matching', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'image',
          id: '1',
          src: './media/image.png',
          runs: [],
        },
      ];
      const mediaFiles = { 'media/image.png': 'base64data' };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      expect(result[0].src).toBe('data:image/png;base64,base64data');
    });

    it('uses rId fallback when direct path does not match', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'image',
          id: '1',
          src: './unknown.png',
          attrs: { rId: 'rId5' },
          runs: [],
        },
      ];
      const mediaFiles = { 'word/media/rId5.png': 'base64data' };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      expect(result[0].src).toBe('data:image/png;base64,base64data');
    });

    it('infers extension from src when not in attrs', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'image',
          id: '1',
          src: 'file.jpg',
          attrs: { rId: 'rId1' },
          runs: [],
        },
      ];
      const mediaFiles = { 'word/media/rId1.jpg': 'base64data' };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      expect(result[0].src).toBe('data:image/jpg;base64,base64data');
    });

    it('does not double-prefix when media value already has data URI prefix', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'image',
          id: '1',
          src: 'media/image.png',
          runs: [],
        },
      ];
      // Media value already contains full data URI (as stored by some converters)
      const mediaFiles = { 'media/image.png': 'data:image/png;base64,iVBORw0KGgoAAAANS' };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      // Should use the existing data URI as-is, not add another prefix
      expect(result[0].src).toBe('data:image/png;base64,iVBORw0KGgoAAAANS');
      // Verify no double prefix
      expect(result[0].src).not.toContain('data:image/png;base64,data:image');
    });

    it('does not double-prefix with rId fallback matching', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'image',
          id: '1',
          src: './unknown.png',
          attrs: { rId: 'rId5' },
          runs: [],
        },
      ];
      // Media value already contains full data URI
      const mediaFiles = { 'word/media/rId5.png': 'data:image/png;base64,existingData' };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      expect(result[0].src).toBe('data:image/png;base64,existingData');
      expect(result[0].src).not.toContain('data:image/png;base64,data:image');
    });

    it('adds prefix to raw base64 values without data URI prefix', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'image',
          id: '1',
          src: 'media/image.png',
          runs: [],
        },
      ];
      // Media value is raw base64 without prefix
      const mediaFiles = { 'media/image.png': 'iVBORw0KGgoAAAANS' };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      expect(result[0].src).toBe('data:image/png;base64,iVBORw0KGgoAAAANS');
    });
  });

  describe('hydrateImageBlocks - ShapeGroup image hydration', () => {
    it('hydrates image children inside shapeGroup drawing blocks', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'drawing',
          id: 'drawing-1',
          drawingKind: 'shapeGroup',
          geometry: { width: 500, height: 300, rotation: 0, flipH: false, flipV: false },
          shapes: [
            {
              shapeType: 'image',
              attrs: {
                x: 0,
                y: 0,
                width: 200,
                height: 150,
                src: 'word/media/image1.jpeg',
              },
            },
            {
              shapeType: 'vectorShape',
              attrs: {
                x: 200,
                y: 0,
                width: 100,
                height: 100,
                kind: 'rect',
                fillColor: '#ff0000',
              },
            },
            {
              shapeType: 'image',
              attrs: {
                x: 300,
                y: 0,
                width: 200,
                height: 150,
                src: 'word/media/image2.png',
              },
            },
          ],
        } as unknown as FlowBlock,
      ];
      const mediaFiles = {
        'word/media/image1.jpeg': 'base64ImageData1',
        'word/media/image2.png': 'base64ImageData2',
      };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      const drawingBlock = result[0] as unknown as {
        shapes: Array<{ shapeType: string; attrs: { src?: string } }>;
      };

      // First image should be hydrated
      expect(drawingBlock.shapes[0].attrs.src).toBe('data:image/jpeg;base64,base64ImageData1');
      // Vector shape should remain unchanged
      expect(drawingBlock.shapes[1].shapeType).toBe('vectorShape');
      expect(drawingBlock.shapes[1].attrs.src).toBeUndefined();
      // Second image should be hydrated
      expect(drawingBlock.shapes[2].attrs.src).toBe('data:image/png;base64,base64ImageData2');
    });

    it('leaves shapeGroup images with data URLs unchanged', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'drawing',
          id: 'drawing-1',
          drawingKind: 'shapeGroup',
          geometry: { width: 200, height: 150, rotation: 0, flipH: false, flipV: false },
          shapes: [
            {
              shapeType: 'image',
              attrs: {
                x: 0,
                y: 0,
                width: 200,
                height: 150,
                src: 'data:image/png;base64,existingData',
              },
            },
          ],
        } as unknown as FlowBlock,
      ];
      const mediaFiles = { 'word/media/image.png': 'newData' };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      const drawingBlock = result[0] as unknown as {
        shapes: Array<{ shapeType: string; attrs: { src?: string } }>;
      };

      expect(drawingBlock.shapes[0].attrs.src).toBe('data:image/png;base64,existingData');
    });

    it('returns shapeGroup unchanged when no matching media files', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'drawing',
          id: 'drawing-1',
          drawingKind: 'shapeGroup',
          geometry: { width: 200, height: 150, rotation: 0, flipH: false, flipV: false },
          shapes: [
            {
              shapeType: 'image',
              attrs: {
                x: 0,
                y: 0,
                width: 200,
                height: 150,
                src: 'word/media/missing.png',
              },
            },
          ],
        } as unknown as FlowBlock,
      ];
      const mediaFiles = { 'word/media/other.png': 'someData' };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      expect(result[0]).toBe(blocks[0]); // Same reference, no changes
    });

    it('skips non-shapeGroup drawing blocks', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'drawing',
          id: 'drawing-1',
          drawingKind: 'vectorShape',
          geometry: { width: 100, height: 100, rotation: 0, flipH: false, flipV: false },
          shapeKind: 'rect',
        } as unknown as FlowBlock,
      ];
      const mediaFiles = { 'word/media/image.png': 'base64data' };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      expect(result[0]).toBe(blocks[0]); // Same reference, no changes
    });

    it('handles shapeGroup with empty shapes array', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'drawing',
          id: 'drawing-1',
          drawingKind: 'shapeGroup',
          geometry: { width: 100, height: 100, rotation: 0, flipH: false, flipV: false },
          shapes: [],
        } as unknown as FlowBlock,
      ];
      const mediaFiles = { 'word/media/image.png': 'base64data' };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      expect(result[0]).toBe(blocks[0]); // Same reference, no changes
    });

    it('handles shapeGroup with image child that has attrs: undefined', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'drawing',
          id: 'drawing-1',
          drawingKind: 'shapeGroup',
          geometry: { width: 200, height: 150, rotation: 0, flipH: false, flipV: false },
          shapes: [
            {
              shapeType: 'image',
              attrs: undefined, // Edge case: attrs is undefined
            },
          ],
        } as unknown as FlowBlock,
      ];
      const mediaFiles = { 'word/media/image.png': 'base64data' };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      // Should handle gracefully and return unchanged (no src to hydrate)
      expect(result[0]).toBe(blocks[0]);
    });

    it('handles shapeGroup with image child that has attrs: {} (no src)', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'drawing',
          id: 'drawing-1',
          drawingKind: 'shapeGroup',
          geometry: { width: 200, height: 150, rotation: 0, flipH: false, flipV: false },
          shapes: [
            {
              shapeType: 'image',
              attrs: {}, // Edge case: attrs exists but has no src
            },
          ],
        } as unknown as FlowBlock,
      ];
      const mediaFiles = { 'word/media/image.png': 'base64data' };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      // Should handle gracefully and return unchanged (no src to hydrate)
      expect(result[0]).toBe(blocks[0]);
    });

    it('handles shapeGroup with image child that has attrs with src: undefined', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'drawing',
          id: 'drawing-1',
          drawingKind: 'shapeGroup',
          geometry: { width: 200, height: 150, rotation: 0, flipH: false, flipV: false },
          shapes: [
            {
              shapeType: 'image',
              attrs: {
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                src: undefined, // Edge case: src is explicitly undefined
              },
            },
          ],
        } as unknown as FlowBlock,
      ];
      const mediaFiles = { 'word/media/image.png': 'base64data' };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      // Should handle gracefully and return unchanged (src is undefined)
      expect(result[0]).toBe(blocks[0]);
    });

    it('handles shapeGroup with mixed valid and invalid image children', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'drawing',
          id: 'drawing-1',
          drawingKind: 'shapeGroup',
          geometry: { width: 500, height: 300, rotation: 0, flipH: false, flipV: false },
          shapes: [
            {
              shapeType: 'image',
              attrs: undefined, // Invalid: attrs is undefined
            },
            {
              shapeType: 'image',
              attrs: {
                x: 100,
                y: 0,
                width: 100,
                height: 100,
                src: 'word/media/image1.png', // Valid: should be hydrated
              },
            },
            {
              shapeType: 'image',
              attrs: {}, // Invalid: no src
            },
            {
              shapeType: 'image',
              attrs: {
                x: 300,
                y: 0,
                width: 100,
                height: 100,
                src: 'word/media/image2.png', // Valid: should be hydrated
              },
            },
          ],
        } as unknown as FlowBlock,
      ];
      const mediaFiles = {
        'word/media/image1.png': 'base64data1',
        'word/media/image2.png': 'base64data2',
      };

      const result = hydrateImageBlocks(blocks, mediaFiles);
      const drawingBlock = result[0] as unknown as {
        shapes: Array<{ shapeType: string; attrs?: { src?: string } }>;
      };

      // First shape should remain unchanged (attrs is undefined)
      expect(drawingBlock.shapes[0].attrs).toBeUndefined();

      // Second shape should be hydrated
      expect(drawingBlock.shapes[1].attrs?.src).toBe('data:image/png;base64,base64data1');

      // Third shape should remain unchanged (no src)
      expect(drawingBlock.shapes[2].attrs?.src).toBeUndefined();

      // Fourth shape should be hydrated
      expect(drawingBlock.shapes[3].attrs?.src).toBe('data:image/png;base64,base64data2');
    });
  });
});

// ============================================================================
// Drawing/Shape Utilities Tests
// ============================================================================

describe('Drawing/Shape Utilities', () => {
  describe('toDrawingContentSnapshot', () => {
    it('extracts name from valid object', () => {
      const result = toDrawingContentSnapshot({ name: 'shape1' });
      expect(result).toEqual({ name: 'shape1' });
    });

    it('extracts attributes (BUG FIX TEST)', () => {
      const result = toDrawingContentSnapshot({
        name: 'shape1',
        attributes: { width: 100, height: 200 },
      });
      expect(result).toEqual({
        name: 'shape1',
        attributes: { width: 100, height: 200 },
      });
    });

    it('filters out array attributes (BUG FIX TEST)', () => {
      const result = toDrawingContentSnapshot({
        name: 'shape1',
        attributes: [1, 2, 3], // Should be ignored
      });
      expect(result).toEqual({ name: 'shape1' });
    });

    it('validates elements array (BUG FIX TEST)', () => {
      const result = toDrawingContentSnapshot({
        name: 'shape1',
        elements: [
          { type: 'rect' },
          null, // Should be filtered out
          { type: 'circle' },
          undefined, // Should be filtered out
        ],
      });
      expect(result?.elements).toHaveLength(2);
      expect(result?.elements?.[0]).toEqual({ type: 'rect' });
      expect(result?.elements?.[1]).toEqual({ type: 'circle' });
    });

    it('returns undefined for invalid input', () => {
      expect(toDrawingContentSnapshot(null)).toBeUndefined();
      expect(toDrawingContentSnapshot(undefined)).toBeUndefined();
      expect(toDrawingContentSnapshot('string')).toBeUndefined();
      expect(toDrawingContentSnapshot(42)).toBeUndefined();
    });

    it('returns undefined for missing name', () => {
      expect(toDrawingContentSnapshot({})).toBeUndefined();
      expect(toDrawingContentSnapshot({ attributes: {} })).toBeUndefined();
    });
  });

  describe('isShapeGroupTransform', () => {
    it('returns true for valid transform objects', () => {
      expect(isShapeGroupTransform({ x: 10 })).toBe(true);
      expect(isShapeGroupTransform({ y: 20 })).toBe(true);
      expect(isShapeGroupTransform({ width: 100, height: 200 })).toBe(true);
      expect(isShapeGroupTransform({ childX: 5, childY: 10 })).toBe(true);
    });

    it('returns false for invalid objects', () => {
      expect(isShapeGroupTransform({})).toBe(false);
      expect(isShapeGroupTransform({ other: 'property' })).toBe(false);
      expect(isShapeGroupTransform(null)).toBe(false);
      expect(isShapeGroupTransform(undefined)).toBe(false);
    });
  });

  describe('normalizeShapeSize', () => {
    it('extracts width and height', () => {
      const result = normalizeShapeSize({ width: 100, height: 200 });
      expect(result).toEqual({ width: 100, height: 200 });
    });

    it('handles partial dimensions', () => {
      expect(normalizeShapeSize({ width: 100 })).toEqual({ width: 100 });
      expect(normalizeShapeSize({ height: 200 })).toEqual({ height: 200 });
    });

    it('coerces string values', () => {
      const result = normalizeShapeSize({ width: '100', height: '200' });
      expect(result).toEqual({ width: 100, height: 200 });
    });

    it('returns undefined for invalid input', () => {
      expect(normalizeShapeSize(null)).toBeUndefined();
      expect(normalizeShapeSize({})).toBeUndefined();
    });
  });

  describe('normalizeShapeGroupChildren', () => {
    it('filters valid shape children', () => {
      const children = [{ shapeType: 'rect' }, { shapeType: 'circle' }];
      const result = normalizeShapeGroupChildren(children);
      expect(result).toHaveLength(2);
    });

    it('filters out invalid children', () => {
      const children = [{ shapeType: 'rect' }, null, { other: 'property' }, { shapeType: 'circle' }];
      const result = normalizeShapeGroupChildren(children);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ shapeType: 'rect' });
      expect(result[1]).toEqual({ shapeType: 'circle' });
    });

    it('returns empty array for non-arrays', () => {
      expect(normalizeShapeGroupChildren(null)).toEqual([]);
      expect(normalizeShapeGroupChildren(undefined)).toEqual([]);
      expect(normalizeShapeGroupChildren({} as never)).toEqual([]);
    });
  });
});

// ============================================================================
// Position Map Tests
// ============================================================================

describe('buildPositionMap', () => {
  it('builds position map for text nodes', () => {
    const node = {
      type: 'text',
      text: 'Hello',
    };

    const map = buildPositionMap(node);
    const pos = map.get(node);

    expect(pos).toEqual({ start: 0, end: 5 });
  });

  it('builds position map for nested nodes', () => {
    const textNode1 = { type: 'text', text: 'Hello' };
    const textNode2 = { type: 'text', text: ' World' };
    const paraNode = {
      type: 'paragraph',
      content: [textNode1, textNode2],
    };
    const docNode = {
      type: 'doc',
      content: [paraNode],
    };

    const map = buildPositionMap(docNode);

    // doc has no open/close tokens
    expect(map.get(docNode)).toEqual({ start: 0, end: 13 });
    // paragraph has 1 open + content + 1 close
    expect(map.get(paraNode)).toEqual({ start: 0, end: 13 });
    expect(map.get(textNode1)).toEqual({ start: 1, end: 6 });
    expect(map.get(textNode2)).toEqual({ start: 6, end: 12 });
  });

  it('handles empty text nodes', () => {
    const node = {
      type: 'text',
      text: '',
    };

    const map = buildPositionMap(node);
    const pos = map.get(node);

    expect(pos).toEqual({ start: 0, end: 0 });
  });

  it('handles atomic inline types', () => {
    const imageNode = { type: 'image' };
    const hardBreakNode = { type: 'hardBreak' };
    const paraNode = {
      type: 'paragraph',
      content: [imageNode, hardBreakNode],
    };

    const map = buildPositionMap(paraNode);

    expect(map.get(imageNode)).toEqual({ start: 1, end: 2 });
    expect(map.get(hardBreakNode)).toEqual({ start: 2, end: 3 });
  });

  it('supports custom atom node types', () => {
    const customAtomNode = { type: 'customAtom' };
    const textNode = { type: 'text', text: 'Hi' };
    const paraNode = {
      type: 'paragraph',
      content: [customAtomNode, textNode],
    };

    const map = buildPositionMap(paraNode, { atomNodeTypes: ['customAtom'] });

    expect(map.get(customAtomNode)).toEqual({ start: 1, end: 2 });
    expect(map.get(textNode)).toEqual({ start: 2, end: 4 });
  });

  it('handles passthroughInline and bookmarkEnd as atomic inline types', () => {
    const textNode = { type: 'text', text: 'Hello' };
    const passthroughNode = { type: 'passthroughInline', attrs: {} };
    const bookmarkEndNode = { type: 'bookmarkEnd', attrs: { id: 'bm1' } };
    const textNode2 = { type: 'text', text: 'World' };

    const paraNode = {
      type: 'paragraph',
      content: [textNode, passthroughNode, bookmarkEndNode, textNode2],
    };

    const map = buildPositionMap(paraNode);

    // Each atomic node should occupy exactly 1 position
    expect(map.get(textNode)).toEqual({ start: 1, end: 6 }); // 'Hello' = 5 chars
    expect(map.get(passthroughNode)).toEqual({ start: 6, end: 7 }); // 1 position
    expect(map.get(bookmarkEndNode)).toEqual({ start: 7, end: 8 }); // 1 position
    expect(map.get(textNode2)).toEqual({ start: 8, end: 13 }); // 'World' = 5 chars
  });
});

// ============================================================================
// Block ID Generator Tests
// ============================================================================

describe('createBlockIdGenerator', () => {
  it('generates sequential IDs with kind suffix', () => {
    const gen = createBlockIdGenerator();
    expect(gen('paragraph')).toBe('0-paragraph');
    expect(gen('paragraph')).toBe('1-paragraph');
    expect(gen('image')).toBe('2-image');
  });

  it('uses provided prefix', () => {
    const gen = createBlockIdGenerator('doc_');
    expect(gen('paragraph')).toBe('doc_0-paragraph');
    expect(gen('paragraph')).toBe('doc_1-paragraph');
  });

  it('handles empty prefix', () => {
    const gen = createBlockIdGenerator('');
    expect(gen('paragraph')).toBe('0-paragraph');
  });

  it('increments counter across different kinds', () => {
    const gen = createBlockIdGenerator('test-');
    expect(gen('paragraph')).toBe('test-0-paragraph');
    expect(gen('image')).toBe('test-1-image');
    expect(gen('table')).toBe('test-2-table');
  });
});

// ============================================================================
// Shallow Object Comparison Tests
// ============================================================================

describe('shallowObjectEquals', () => {
  it('returns true for both undefined', () => {
    expect(shallowObjectEquals(undefined, undefined)).toBe(true);
  });

  it('returns true for both null-ish', () => {
    expect(shallowObjectEquals(undefined, undefined)).toBe(true);
  });

  it('returns false when only one is undefined', () => {
    expect(shallowObjectEquals({}, undefined)).toBe(false);
    expect(shallowObjectEquals(undefined, {})).toBe(false);
  });

  it('returns true for equal objects', () => {
    expect(shallowObjectEquals({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  });

  it('returns false for different values', () => {
    expect(shallowObjectEquals({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('returns false for different keys', () => {
    expect(shallowObjectEquals({ a: 1 }, { b: 1 })).toBe(false);
  });

  it('returns false for different key counts', () => {
    expect(shallowObjectEquals({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('uses reference equality for nested objects', () => {
    const nested = { c: 3 };
    expect(shallowObjectEquals({ a: nested }, { a: nested })).toBe(true);
    expect(shallowObjectEquals({ a: { c: 3 } }, { a: { c: 3 } })).toBe(false);
  });

  it('handles arrays by reference', () => {
    const arr = [1, 2];
    expect(shallowObjectEquals({ a: arr }, { a: arr })).toBe(true);
    expect(shallowObjectEquals({ a: [1, 2] }, { a: [1, 2] })).toBe(false);
  });

  it('compares empty objects', () => {
    expect(shallowObjectEquals({}, {})).toBe(true);
  });
});

// ============================================================================
// Line Ends and Effect Extent Normalization Tests
// ============================================================================

describe('normalizeLineEnds', () => {
  it('returns undefined for null/undefined', () => {
    expect(normalizeLineEnds(null)).toBeUndefined();
    expect(normalizeLineEnds(undefined)).toBeUndefined();
  });

  it('returns undefined for non-object values', () => {
    expect(normalizeLineEnds('string')).toBeUndefined();
    expect(normalizeLineEnds(42)).toBeUndefined();
    expect(normalizeLineEnds([])).toBeUndefined();
  });

  it('returns undefined when neither head nor tail is present', () => {
    expect(normalizeLineEnds({})).toBeUndefined();
    expect(normalizeLineEnds({ other: 'property' })).toBeUndefined();
  });

  it('returns undefined when head/tail type is "none"', () => {
    expect(normalizeLineEnds({ head: { type: 'none' } })).toBeUndefined();
    expect(normalizeLineEnds({ tail: { type: 'none' } })).toBeUndefined();
    expect(normalizeLineEnds({ head: { type: 'none' }, tail: { type: 'none' } })).toBeUndefined();
  });

  it('extracts valid head configuration', () => {
    const result = normalizeLineEnds({ head: { type: 'triangle', width: 'sm', length: 'lg' } });
    expect(result).toEqual({
      head: { type: 'triangle', width: 'sm', length: 'lg' },
    });
  });

  it('extracts valid tail configuration', () => {
    const result = normalizeLineEnds({ tail: { type: 'arrow', width: 'med', length: 'sm' } });
    expect(result).toEqual({
      tail: { type: 'arrow', width: 'med', length: 'sm' },
    });
  });

  it('extracts both head and tail', () => {
    const result = normalizeLineEnds({
      head: { type: 'triangle' },
      tail: { type: 'diamond', width: 'lg' },
    });
    expect(result).toEqual({
      head: { type: 'triangle' },
      tail: { type: 'diamond', width: 'lg' },
    });
  });

  it('filters invalid size values', () => {
    const result = normalizeLineEnds({
      head: { type: 'triangle', width: 'invalid', length: 'sm' },
    });
    expect(result).toEqual({
      head: { type: 'triangle', length: 'sm' },
    });
  });

  it('allows valid size values (sm, med, lg)', () => {
    expect(normalizeLineEnds({ head: { type: 'arrow', width: 'sm' } })).toEqual({
      head: { type: 'arrow', width: 'sm' },
    });
    expect(normalizeLineEnds({ head: { type: 'arrow', width: 'med' } })).toEqual({
      head: { type: 'arrow', width: 'med' },
    });
    expect(normalizeLineEnds({ head: { type: 'arrow', width: 'lg' } })).toEqual({
      head: { type: 'arrow', width: 'lg' },
    });
  });
});

describe('normalizeEffectExtent', () => {
  it('returns undefined for null/undefined', () => {
    expect(normalizeEffectExtent(null)).toBeUndefined();
    expect(normalizeEffectExtent(undefined)).toBeUndefined();
  });

  it('returns undefined for non-object values', () => {
    expect(normalizeEffectExtent('string')).toBeUndefined();
    expect(normalizeEffectExtent(42)).toBeUndefined();
    expect(normalizeEffectExtent([])).toBeUndefined();
  });

  it('returns undefined when all values are null/undefined', () => {
    expect(normalizeEffectExtent({})).toBeUndefined();
    expect(normalizeEffectExtent({ other: 'property' })).toBeUndefined();
  });

  it('extracts all effect extent values', () => {
    const result = normalizeEffectExtent({ left: 10, top: 5, right: 10, bottom: 5 });
    expect(result).toEqual({ left: 10, top: 5, right: 10, bottom: 5 });
  });

  it('handles partial extent values', () => {
    expect(normalizeEffectExtent({ left: 10 })).toEqual({ left: 10, top: 0, right: 0, bottom: 0 });
    expect(normalizeEffectExtent({ left: 10, right: 20 })).toEqual({ left: 10, top: 0, right: 20, bottom: 0 });
  });

  it('clamps negative values to 0', () => {
    const result = normalizeEffectExtent({ left: -5, top: 10, right: -10, bottom: 5 });
    expect(result).toEqual({ left: 0, top: 10, right: 0, bottom: 5 });
  });

  it('coerces string values to numbers', () => {
    const result = normalizeEffectExtent({ left: '10', top: '5', right: '10', bottom: '5' });
    expect(result).toEqual({ left: 10, top: 5, right: 10, bottom: 5 });
  });

  it('treats zero as a valid value (not clamped)', () => {
    const result = normalizeEffectExtent({ left: 0, top: 0, right: 0, bottom: 10 });
    expect(result).toEqual({ left: 0, top: 0, right: 0, bottom: 10 });
  });
});

// ============================================================================
// Z-Index Utilities (OOXML relativeHeight)
// ============================================================================

describe('z-index utilities', () => {
  describe('coerceRelativeHeight', () => {
    it('returns number when given a finite number', () => {
      expect(coerceRelativeHeight(251658240)).toBe(251658240);
      expect(coerceRelativeHeight(0)).toBe(0);
    });

    it('returns number when given a numeric string', () => {
      expect(coerceRelativeHeight('251658240')).toBe(251658240);
      expect(coerceRelativeHeight('251659318')).toBe(251659318);
    });

    it('returns undefined for non-finite number', () => {
      expect(coerceRelativeHeight(NaN)).toBeUndefined();
      expect(coerceRelativeHeight(Infinity)).toBeUndefined();
    });

    it('returns undefined for empty or invalid string', () => {
      expect(coerceRelativeHeight('')).toBeUndefined();
      expect(coerceRelativeHeight('   ')).toBeUndefined();
      expect(coerceRelativeHeight('abc')).toBeUndefined();
    });

    it('returns undefined for null, undefined, or non-number/string', () => {
      expect(coerceRelativeHeight(null)).toBeUndefined();
      expect(coerceRelativeHeight(undefined)).toBeUndefined();
      expect(coerceRelativeHeight({})).toBeUndefined();
    });
  });

  describe('normalizeZIndex', () => {
    it('returns 0 for OOXML base relativeHeight', () => {
      expect(normalizeZIndex({ relativeHeight: OOXML_Z_INDEX_BASE })).toBe(0);
      expect(normalizeZIndex({ relativeHeight: '251658240' })).toBe(0);
    });

    it('returns positive z-index for relativeHeight above base', () => {
      expect(normalizeZIndex({ relativeHeight: OOXML_Z_INDEX_BASE + 2 })).toBe(2);
      expect(normalizeZIndex({ relativeHeight: OOXML_Z_INDEX_BASE + 51 })).toBe(51);
      expect(normalizeZIndex({ relativeHeight: '251658291' })).toBe(51);
    });

    it('returns undefined when relativeHeight is missing or invalid', () => {
      expect(normalizeZIndex({})).toBeUndefined();
      expect(normalizeZIndex(null)).toBeUndefined();
      expect(normalizeZIndex(undefined)).toBeUndefined();
      expect(normalizeZIndex({ relativeHeight: '' })).toBeUndefined();
    });
  });

  describe('resolveFloatingZIndex', () => {
    it('returns 0 when behindDoc is true', () => {
      expect(resolveFloatingZIndex(true, 42)).toBe(0);
      expect(resolveFloatingZIndex(true, undefined)).toBe(0);
      expect(resolveFloatingZIndex(true, 0)).toBe(0);
    });

    it('returns raw value when non-behindDoc and raw >= 1', () => {
      expect(resolveFloatingZIndex(false, 5)).toBe(5);
      expect(resolveFloatingZIndex(false, 100)).toBe(100);
    });

    it('clamps raw 0 to 1 for non-behindDoc', () => {
      expect(resolveFloatingZIndex(false, 0)).toBe(1);
    });

    it('returns fallback when raw is undefined', () => {
      expect(resolveFloatingZIndex(false, undefined)).toBe(1);
      expect(resolveFloatingZIndex(false, undefined, 5)).toBe(5);
    });

    it('clamps fallback to at least 1', () => {
      expect(resolveFloatingZIndex(false, undefined, 0)).toBe(1);
      expect(resolveFloatingZIndex(false, undefined, -1)).toBe(1);
    });
  });

  describe('getFragmentZIndex', () => {
    it('uses block.zIndex when set', () => {
      const block = {
        kind: 'image' as const,
        id: 'img-1',
        src: 'x.png',
        zIndex: 42,
        attrs: { originalAttributes: { relativeHeight: OOXML_Z_INDEX_BASE } },
      };
      expect(getFragmentZIndex(block)).toBe(42);
    });

    it('derives z-index from attrs.originalAttributes.relativeHeight (number)', () => {
      const block = {
        kind: 'image' as const,
        id: 'img-1',
        src: 'x.png',
        attrs: { originalAttributes: { relativeHeight: OOXML_Z_INDEX_BASE + 10 } },
      };
      expect(getFragmentZIndex(block)).toBe(10);
    });

    it('derives z-index from attrs.originalAttributes.relativeHeight (string)', () => {
      const block = {
        kind: 'image' as const,
        id: 'img-1',
        src: 'x.png',
        attrs: { originalAttributes: { relativeHeight: '251658250' } },
      };
      expect(getFragmentZIndex(block)).toBe(10);
    });

    it('preserves high z-index for wrapped anchored objects', () => {
      const block = {
        kind: 'image' as const,
        id: 'img-1',
        src: 'x.png',
        anchor: { isAnchored: true, behindDoc: false },
        wrap: { type: 'Through' as const },
        zIndex: 7168,
      };
      expect(getFragmentZIndex(block)).toBe(7168);
    });

    it('preserves relativeHeight z-index for wrap None anchored objects', () => {
      const block = {
        kind: 'image' as const,
        id: 'img-1',
        src: 'x.png',
        anchor: { isAnchored: true, behindDoc: false },
        wrap: { type: 'None' as const },
        attrs: { originalAttributes: { relativeHeight: OOXML_Z_INDEX_BASE + 10 } },
      };
      expect(getFragmentZIndex(block)).toBe(10);
    });

    it('returns 0 when anchor.behindDoc is true and no zIndex/originalAttributes', () => {
      const block = {
        kind: 'image' as const,
        id: 'img-1',
        src: 'x.png',
        anchor: { isAnchored: true, behindDoc: true },
      };
      expect(getFragmentZIndex(block)).toBe(0);
    });

    it('returns 1 when not behindDoc and no zIndex/originalAttributes', () => {
      const block = {
        kind: 'image' as const,
        id: 'img-1',
        src: 'x.png',
      };
      expect(getFragmentZIndex(block)).toBe(1);
    });

    it('does not treat base relativeHeight as behindDoc when behindDoc is false', () => {
      const block = {
        kind: 'image' as const,
        id: 'img-1',
        src: 'x.png',
        anchor: { isAnchored: true, behindDoc: false },
        attrs: { originalAttributes: { relativeHeight: OOXML_Z_INDEX_BASE } },
      };
      expect(getFragmentZIndex(block)).toBeGreaterThan(0);
    });

    it('forces behindDoc fragments to zIndex 0 even with relativeHeight', () => {
      const block = {
        kind: 'image' as const,
        id: 'img-1',
        src: 'x.png',
        anchor: { isAnchored: true, behindDoc: true },
        attrs: { originalAttributes: { relativeHeight: OOXML_Z_INDEX_BASE + 5 } },
      };
      expect(getFragmentZIndex(block)).toBe(0);
    });

    it('works for drawing blocks', () => {
      const block = {
        kind: 'drawing' as const,
        id: 'd-1',
        drawingKind: 'vectorShape' as const,
        attrs: { originalAttributes: { relativeHeight: OOXML_Z_INDEX_BASE + 5 } },
      };
      expect(getFragmentZIndex(block)).toBe(5);
    });
  });
});
