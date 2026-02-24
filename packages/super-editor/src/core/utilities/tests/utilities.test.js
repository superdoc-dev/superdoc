import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

import { callOrGet } from '../callOrGet.js';
import { carbonCopy } from '../carbonCopy.js';
import { createStyleTag } from '../createStyleTag.js';
import { deleteProps } from '../deleteProps.js';
import { getMediaObjectUrls } from '../imageBlobs.js';
import { isEmptyObject } from '../isEmptyObject.js';
import { isIOS } from '../isIOS.js';
import { isMacOS } from '../isMacOS.js';
import { isRegExp } from '../isRegExp.js';
import { minMax } from '../minMax.js';
import { objectIncludes } from '../objectIncludes.js';
import { parseSizeUnit } from '../parseSizeUnit.js';
import { cssColorToHex } from '../cssColorToHex.js';

const originalNavigator = global.navigator;
const originalFile = global.File;
const originalCreateObjectURL = URL.createObjectURL;

class FakeFile extends Blob {
  constructor(parts, name, options) {
    super(parts, options);
    this.name = name;
  }
}

beforeEach(() => {
  if (typeof global.File === 'undefined') {
    global.File = FakeFile;
  }

  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = () => '';
  }
});

afterEach(() => {
  if (typeof originalNavigator !== 'undefined') {
    global.navigator = originalNavigator;
  } else {
    delete global.navigator;
  }

  if (typeof originalFile !== 'undefined') {
    global.File = originalFile;
  } else {
    delete global.File;
  }

  if (typeof originalCreateObjectURL === 'function') {
    URL.createObjectURL = originalCreateObjectURL;
  } else {
    delete URL.createObjectURL;
  }

  vi.restoreAllMocks();

  // Clean up any styles appended during tests
  document.querySelectorAll('style').forEach((style) => {
    const attributes = Array.from(style.attributes || []);
    const hasSuperEditorAttr = attributes.some((attr) => attr.name.startsWith('data-supereditor-style'));
    if (hasSuperEditorAttr) style.remove();
  });
});

describe('core utilities', () => {
  describe('callOrGet', () => {
    it('returns direct value when not a function', () => {
      expect(callOrGet('value')).toBe('value');
    });

    it('calls provided function with arguments', () => {
      const fn = vi.fn((x, y) => x + y);
      expect(callOrGet(fn, null, 2, 3)).toBe(5);
      expect(fn).toHaveBeenCalledWith(2, 3);
    });

    it('binds context when provided', () => {
      const ctx = { factor: 4 };
      const fn = function (value) {
        return this.factor * value;
      };
      expect(callOrGet(fn, ctx, 3)).toBe(12);
    });
  });

  describe('carbonCopy', () => {
    it('deep clones serialisable objects', () => {
      const input = { a: 1, nested: { b: 2 } };
      const copy = carbonCopy(input);
      expect(copy).toEqual(input);
      expect(copy).not.toBe(input);
      expect(copy.nested).not.toBe(input.nested);
    });

    it('returns undefined and logs when cloning fails', () => {
      const circular = {};
      circular.self = circular;
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = carbonCopy(circular);

      expect(result).toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('createStyleTag', () => {
    it('creates a new style tag when absent', () => {
      const style = createStyleTag('.foo { color: red; }');
      expect(style).toBeInstanceOf(HTMLStyleElement);
      expect(style.getAttribute('data-supereditor-style')).toBe('');
      expect(style.innerHTML).toContain('color: red');
    });

    it('reuses existing style tag when present', () => {
      const first = createStyleTag('.foo { color: red; }', 'test');
      first.setAttribute('data-test', 'existing');
      const second = createStyleTag('.bar { color: blue; }', 'test');

      expect(second).toBe(first);
      expect(second.getAttribute('data-test')).toBe('existing');
      expect(second.innerHTML).toContain('color: red');
    });
  });

  describe('deleteProps', () => {
    it('removes a single property by key', () => {
      const original = { keep: 1, remove: 2 };
      expect(deleteProps(original, 'remove')).toEqual({ keep: 1 });
    });

    it('removes multiple properties when provided an array', () => {
      const original = { keep: true, a: 1, b: 2 };
      expect(deleteProps(original, ['a', 'b'])).toEqual({ keep: true });
    });
  });

  describe('getMediaObjectUrls', () => {
    it('creates blob URLs for each media entry', () => {
      const media = {
        'word/media/image1.png': new Uint8Array([1, 2, 3]),
        'word/media/image2.png': new Uint8Array([4, 5, 6]),
      };

      const createUrlSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => `blob:${blob.size}`);

      const result = getMediaObjectUrls(media);

      expect(Object.keys(result)).toEqual(Object.keys(media));
      expect(createUrlSpy).toHaveBeenCalledTimes(2);
      expect(result['word/media/image1.png']).toMatch(/^blob:/);
    });
  });

  describe('isEmptyObject', () => {
    it('returns true for empty plain objects', () => {
      expect(isEmptyObject({})).toBe(true);
    });

    it('returns false for non-empty objects', () => {
      expect(isEmptyObject({ a: 1 })).toBe(false);
    });
  });

  describe('platform checks', () => {
    it('detects iOS platforms', () => {
      global.navigator = { platform: 'iPhone' };
      expect(isIOS()).toBe(true);
    });

    it('detects non-iOS platforms', () => {
      global.navigator = { platform: 'Windows' };
      expect(isIOS()).toBe(false);
    });

    it('detects macOS platforms when navigator present', () => {
      global.navigator = { platform: 'MacIntel' };
      expect(isMacOS()).toBe(true);
    });

    it('returns false for macOS check when navigator missing', () => {
      delete global.navigator;
      expect(isMacOS()).toBe(false);
    });
  });

  describe('isRegExp', () => {
    it('identifies regular expressions', () => {
      expect(isRegExp(/test/)).toBe(true);
      expect(isRegExp('test')).toBe(false);
    });
  });

  describe('minMax', () => {
    it('clamps values between bounds', () => {
      expect(minMax(5, 0, 10)).toBe(5);
      expect(minMax(-5, 0, 10)).toBe(0);
      expect(minMax(20, 0, 10)).toBe(10);
    });
  });

  describe('objectIncludes', () => {
    it('performs strict comparison by default', () => {
      expect(objectIncludes({ a: 1, b: 2 }, { a: 1 })).toBe(true);
      expect(objectIncludes({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('supports regex comparisons when strict option disabled', () => {
      const result = objectIncludes({ email: 'user@example.com' }, { email: /@example\.com$/ }, { strict: false });
      expect(result).toBe(true);
    });
  });

  describe('parseSizeUnit', () => {
    it('parses numeric value and recognised unit', () => {
      expect(parseSizeUnit('12px')).toEqual([12, 'px']);
      expect(parseSizeUnit('2.5rem')).toEqual([2.5, 'rem']);
    });

    it('returns null unit when unrecognised', () => {
      expect(parseSizeUnit('10unknown')).toEqual([10, null]);
    });
  });

  describe('cssColorToHex', () => {
    it('returns null for null, undefined, and empty string', () => {
      expect(cssColorToHex(null)).toBeNull();
      expect(cssColorToHex(undefined)).toBeNull();
      expect(cssColorToHex('')).toBeNull();
      expect(cssColorToHex('  ')).toBeNull();
    });

    it('passes through 6-digit hex colors', () => {
      expect(cssColorToHex('#ff0000')).toBe('#ff0000');
      expect(cssColorToHex('#00FF00')).toBe('#00FF00');
    });

    it('passes through 3-digit hex colors', () => {
      expect(cssColorToHex('#f00')).toBe('#f00');
    });

    it('converts rgb() to hex', () => {
      expect(cssColorToHex('rgb(255, 0, 0)')).toBe('#ff0000');
      expect(cssColorToHex('rgb(0, 128, 255)')).toBe('#0080ff');
      expect(cssColorToHex('rgb(0, 0, 0)')).toBe('#000000');
      expect(cssColorToHex('rgb(255, 255, 255)')).toBe('#ffffff');
    });

    it('converts rgba() to hex (ignoring alpha)', () => {
      expect(cssColorToHex('rgba(255, 0, 0, 0.5)')).toBe('#ff0000');
      expect(cssColorToHex('rgba(0, 128, 255, 1)')).toBe('#0080ff');
    });

    it('returns null for fully transparent rgba (alpha 0)', () => {
      expect(cssColorToHex('rgba(255, 0, 0, 0)')).toBeNull();
      expect(cssColorToHex('rgba(0, 0, 0, 0.0)')).toBeNull();
    });

    it('returns null for out-of-range rgb channel values', () => {
      expect(cssColorToHex('rgb(256, 0, 0)')).toBeNull();
      expect(cssColorToHex('rgb(0, 300, 0)')).toBeNull();
      expect(cssColorToHex('rgb(0, 0, 999)')).toBeNull();
      expect(cssColorToHex('rgba(256, 0, 0, 1)')).toBeNull();
    });

    it('accepts rgb boundary values', () => {
      expect(cssColorToHex('rgb(0, 0, 0)')).toBe('#000000');
      expect(cssColorToHex('rgb(255, 255, 255)')).toBe('#ffffff');
    });

    it('handles rgb with no spaces', () => {
      expect(cssColorToHex('rgb(255,0,0)')).toBe('#ff0000');
    });

    it('returns named colors as-is', () => {
      expect(cssColorToHex('red')).toBe('red');
      expect(cssColorToHex('blue')).toBe('blue');
    });

    it('trims whitespace', () => {
      expect(cssColorToHex('  #ff0000  ')).toBe('#ff0000');
      expect(cssColorToHex('  rgb(255, 0, 0)  ')).toBe('#ff0000');
    });
  });
});
