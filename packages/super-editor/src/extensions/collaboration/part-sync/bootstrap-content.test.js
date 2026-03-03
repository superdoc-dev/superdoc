import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeBootstrapContent, readBootstrapContent, hasBootstrapContent } from './bootstrap-content.js';

const createMockYMap = (initial = {}) => {
  const store = new Map(Object.entries(initial));
  return {
    get: (k) => store.get(k),
    set: (k, v) => store.set(k, v),
    has: (k) => store.has(k),
    forEach: (fn) => store.forEach(fn),
  };
};

const createMockYdoc = (mapData = {}) => {
  const maps = {};
  return {
    isDestroyed: false,
    getMap: (name) => {
      if (!maps[name]) maps[name] = createMockYMap(mapData[name] ?? {});
      return maps[name];
    },
    transact: vi.fn((fn) => fn()),
  };
};

const BOOTSTRAP_MAP = 'bootstrapDocxParts';

describe('writeBootstrapContent', () => {
  let ydoc;

  beforeEach(() => {
    ydoc = createMockYdoc();
  });

  it('writes content entries to the map', () => {
    const contentArray = [
      { name: 'word/document.xml', content: '<doc/>' },
      { name: 'word/styles.xml', content: '<styles/>' },
    ];

    writeBootstrapContent(ydoc, contentArray);

    const map = ydoc.getMap(BOOTSTRAP_MAP);
    expect(map.get('word/document.xml')).toBe('<doc/>');
    expect(map.get('word/styles.xml')).toBe('<styles/>');
  });

  it('writes fonts if provided in context', () => {
    const fonts = { Arial: { family: 'Arial' } };

    writeBootstrapContent(ydoc, [{ name: 'a.xml', content: '<a/>' }], { fonts });

    const map = ydoc.getMap(BOOTSTRAP_MAP);
    expect(map.get('_fonts')).toEqual(fonts);
  });

  it('sets _version sentinel', () => {
    writeBootstrapContent(ydoc, [{ name: 'a.xml', content: '<a/>' }]);

    const map = ydoc.getMap(BOOTSTRAP_MAP);
    expect(map.get('_version')).toBe(1);
  });

  it('is idempotent — skips if already written', () => {
    writeBootstrapContent(ydoc, [{ name: 'a.xml', content: '<a/>' }]);
    writeBootstrapContent(ydoc, [{ name: 'b.xml', content: '<b/>' }]);

    const map = ydoc.getMap(BOOTSTRAP_MAP);
    expect(map.get('a.xml')).toBe('<a/>');
    expect(map.get('b.xml')).toBeUndefined();
  });

  it('skips null ydoc', () => {
    expect(() => writeBootstrapContent(null, [{ name: 'a', content: 'b' }])).not.toThrow();
  });

  it('skips undefined ydoc', () => {
    expect(() => writeBootstrapContent(undefined, [{ name: 'a', content: 'b' }])).not.toThrow();
  });

  it('skips destroyed ydoc', () => {
    ydoc.isDestroyed = true;

    writeBootstrapContent(ydoc, [{ name: 'a.xml', content: '<a/>' }]);

    expect(ydoc.transact).not.toHaveBeenCalled();
  });

  it('skips null contentArray', () => {
    writeBootstrapContent(ydoc, null);

    expect(ydoc.transact).not.toHaveBeenCalled();
  });

  it('skips empty contentArray', () => {
    writeBootstrapContent(ydoc, []);

    expect(ydoc.transact).not.toHaveBeenCalled();
  });

  it('skips entries with null name', () => {
    writeBootstrapContent(ydoc, [
      { name: null, content: '<a/>' },
      { name: 'b.xml', content: '<b/>' },
    ]);

    const map = ydoc.getMap(BOOTSTRAP_MAP);
    expect(map.get(null)).toBeUndefined();
    expect(map.get('b.xml')).toBe('<b/>');
  });

  it('skips entries with null content', () => {
    writeBootstrapContent(ydoc, [
      { name: 'a.xml', content: null },
      { name: 'b.xml', content: '<b/>' },
    ]);

    const map = ydoc.getMap(BOOTSTRAP_MAP);
    expect(map.get('a.xml')).toBeUndefined();
    expect(map.get('b.xml')).toBe('<b/>');
  });

  it('passes correct transact origin', () => {
    const user = { id: 'user-1' };

    writeBootstrapContent(ydoc, [{ name: 'a.xml', content: '<a/>' }], { user });

    expect(ydoc.transact).toHaveBeenCalledWith(expect.any(Function), { event: 'bootstrap-seed', user });
  });
});

describe('readBootstrapContent', () => {
  it('returns content entries and fonts', () => {
    const fonts = { Arial: { family: 'Arial' } };
    const ydoc = createMockYdoc({
      [BOOTSTRAP_MAP]: {
        _version: 1,
        _fonts: fonts,
        'word/document.xml': '<doc/>',
        'word/styles.xml': '<styles/>',
      },
    });

    const result = readBootstrapContent(ydoc);

    expect(result.fonts).toEqual(fonts);
    expect(result.content).toEqual(
      expect.arrayContaining([
        { name: 'word/document.xml', content: '<doc/>' },
        { name: 'word/styles.xml', content: '<styles/>' },
      ]),
    );
    expect(result.content).toHaveLength(2);
  });

  it('excludes reserved keys from content array', () => {
    const ydoc = createMockYdoc({
      [BOOTSTRAP_MAP]: {
        _version: 1,
        _fonts: { Arial: {} },
        'word/document.xml': '<doc/>',
      },
    });

    const result = readBootstrapContent(ydoc);

    const names = result.content.map((e) => e.name);
    expect(names).not.toContain('_version');
    expect(names).not.toContain('_fonts');
  });

  it('returns null if no version sentinel', () => {
    const ydoc = createMockYdoc({
      [BOOTSTRAP_MAP]: { 'word/document.xml': '<doc/>' },
    });

    expect(readBootstrapContent(ydoc)).toBeNull();
  });

  it('returns null if content is empty (only reserved keys)', () => {
    const ydoc = createMockYdoc({
      [BOOTSTRAP_MAP]: { _version: 1, _fonts: {} },
    });

    expect(readBootstrapContent(ydoc)).toBeNull();
  });

  it('returns null for null ydoc', () => {
    expect(readBootstrapContent(null)).toBeNull();
  });

  it('returns null for destroyed ydoc', () => {
    const ydoc = createMockYdoc();
    ydoc.isDestroyed = true;

    expect(readBootstrapContent(ydoc)).toBeNull();
  });

  it('returns empty fonts object if no _fonts key', () => {
    const ydoc = createMockYdoc({
      [BOOTSTRAP_MAP]: {
        _version: 1,
        'word/document.xml': '<doc/>',
      },
    });

    const result = readBootstrapContent(ydoc);

    expect(result.fonts).toEqual({});
  });
});

describe('hasBootstrapContent', () => {
  it('returns true when version sentinel exists', () => {
    const ydoc = createMockYdoc({
      [BOOTSTRAP_MAP]: { _version: 1 },
    });

    expect(hasBootstrapContent(ydoc)).toBe(true);
  });

  it('returns false when no version', () => {
    const ydoc = createMockYdoc();

    expect(hasBootstrapContent(ydoc)).toBe(false);
  });

  it('returns false for null ydoc', () => {
    expect(hasBootstrapContent(null)).toBe(false);
  });

  it('returns false for destroyed ydoc', () => {
    const ydoc = createMockYdoc();
    ydoc.isDestroyed = true;

    expect(hasBootstrapContent(ydoc)).toBe(false);
  });

  it('returns false when getMap is not a function', () => {
    const ydoc = { isDestroyed: false, getMap: 'not-a-function' };

    expect(hasBootstrapContent(ydoc)).toBe(false);
  });
});
