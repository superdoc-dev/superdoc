import { describe, it, expect } from 'vitest';
import {
  parseTocInstruction,
  serializeTocInstruction,
  applyTocPatch,
  areTocConfigsEqual,
  DEFAULT_TOC_INSTRUCTION,
  DEFAULT_TOC_CONFIG,
} from './toc-switches.js';

describe('parseTocInstruction', () => {
  it('parses Word default instruction', () => {
    const config = parseTocInstruction('TOC \\o "1-3" \\h \\z \\u');
    expect(config.source.outlineLevels).toEqual({ from: 1, to: 3 });
    expect(config.source.useAppliedOutlineLevel).toBe(true);
    expect(config.display.hyperlinks).toBe(true);
    expect(config.display.hideInWebView).toBe(true);
  });

  it('parses all ship-now switches', () => {
    const config = parseTocInstruction('TOC \\o "1-5" \\u \\h \\z \\n "2-3" \\p "-"');
    expect(config.source.outlineLevels).toEqual({ from: 1, to: 5 });
    expect(config.source.useAppliedOutlineLevel).toBe(true);
    expect(config.display.hyperlinks).toBe(true);
    expect(config.display.hideInWebView).toBe(true);
    expect(config.display.omitPageNumberLevels).toEqual({ from: 2, to: 3 });
    expect(config.display.separator).toBe('-');
  });

  it('parses parse-preserve switches without loss', () => {
    const config = parseTocInstruction('TOC \\o "1-3" \\t "Heading 1,1,Heading 2,2" \\b "MyBookmark"');
    expect(config.preserved.customStyles).toEqual([
      { styleName: 'Heading 1', level: 1 },
      { styleName: 'Heading 2', level: 2 },
    ]);
    expect(config.preserved.bookmarkName).toBe('MyBookmark');
  });

  it('stores unrecognized switches in rawExtensions', () => {
    const config = parseTocInstruction('TOC \\o "1-3" \\x "unknown" \\y');
    expect(config.preserved.rawExtensions).toEqual(['\\x "unknown"', '\\y']);
  });

  it('parses all preserved switches', () => {
    const config = parseTocInstruction(
      'TOC \\a "Figure" \\b "Bm1" \\c "SEQ" \\d "." \\f "F" \\l "1-3" \\s "Heading1" \\w',
    );
    expect(config.preserved.captionType).toBe('Figure');
    expect(config.preserved.bookmarkName).toBe('Bm1');
    expect(config.preserved.seqFieldIdentifier).toBe('SEQ');
    expect(config.preserved.chapterSeparator).toBe('.');
    // \f and \l are promoted to source config
    expect(config.source.tcFieldIdentifier).toBe('F');
    expect(config.source.tcFieldLevels).toEqual({ from: 1, to: 3 });
    expect(config.preserved.chapterNumberSource).toBe('Heading1');
    expect(config.preserved.preserveTabEntries).toBe(true);
  });

  it('handles empty instruction', () => {
    const config = parseTocInstruction('TOC');
    expect(config.source).toEqual({});
    // Convenience projections are derived even for bare TOC instructions
    expect(config.display).toEqual({ includePageNumbers: true, tabLeader: 'none' });
    expect(config.preserved).toEqual({});
  });
});

describe('serializeTocInstruction', () => {
  it('serializes default config to canonical instruction', () => {
    const result = serializeTocInstruction(DEFAULT_TOC_CONFIG);
    expect(result).toBe(DEFAULT_TOC_INSTRUCTION);
  });

  it('maintains deterministic switch order', () => {
    const config = parseTocInstruction('TOC \\h \\z \\u \\o "1-3"');
    const serialized = serializeTocInstruction(config);
    expect(serialized).toBe('TOC \\o "1-3" \\u \\h \\z');
  });

  it('preserves parse-preserve switches through round-trip', () => {
    const input = 'TOC \\o "1-3" \\t "Style1,1,Style2,2" \\b "BM"';
    const config = parseTocInstruction(input);
    const serialized = serializeTocInstruction(config);
    expect(serialized).toContain('\\t "Style1,1,Style2,2"');
    expect(serialized).toContain('\\b "BM"');
  });

  it('preserves rawExtensions through round-trip', () => {
    const input = 'TOC \\o "1-3" \\x "foo"';
    const config = parseTocInstruction(input);
    const serialized = serializeTocInstruction(config);
    expect(serialized).toContain('\\x "foo"');
  });
});

describe('round-trip stability', () => {
  it('parse(serialize(parse(input))) === parse(input)', () => {
    const inputs = [
      'TOC \\o "1-3" \\h \\z \\u',
      'TOC \\o "1-5" \\u \\h \\z \\n "2-3" \\p "-"',
      'TOC \\o "1-3" \\t "H1,1,H2,2" \\b "BM" \\a "Fig"',
      'TOC \\o "1-3" \\x "custom"',
      'TOC',
    ];

    for (const input of inputs) {
      const first = parseTocInstruction(input);
      const serialized = serializeTocInstruction(first);
      const second = parseTocInstruction(serialized);
      expect(second, `round-trip failed for: ${input}`).toEqual(first);
    }
  });

  it('serialize → parse → serialize is idempotent', () => {
    const input = 'TOC \\h \\o "1-3" \\z \\u';
    const first = serializeTocInstruction(parseTocInstruction(input));
    const second = serializeTocInstruction(parseTocInstruction(first));
    expect(second).toBe(first);
  });
});

describe('applyTocPatch', () => {
  it('merges partial patch onto existing config', () => {
    const existing = parseTocInstruction('TOC \\o "1-3" \\h \\u \\z');
    const patched = applyTocPatch(existing, { outlineLevels: { from: 1, to: 5 } });
    expect(patched.source.outlineLevels).toEqual({ from: 1, to: 5 });
    expect(patched.source.useAppliedOutlineLevel).toBe(true);
    expect(patched.display.hyperlinks).toBe(true);
  });

  it('preserves unspecified configurable values', () => {
    const existing = parseTocInstruction('TOC \\o "1-3" \\h \\u \\z \\n "2-3"');
    const patched = applyTocPatch(existing, { hyperlinks: false });
    expect(patched.display.hyperlinks).toBe(false);
    expect(patched.display.omitPageNumberLevels).toEqual({ from: 2, to: 3 });
    expect(patched.source.outlineLevels).toEqual({ from: 1, to: 3 });
  });

  it('carries preserved switches through untouched', () => {
    const existing = parseTocInstruction('TOC \\o "1-3" \\t "H1,1" \\b "BM"');
    const patched = applyTocPatch(existing, { outlineLevels: { from: 1, to: 5 } });
    expect(patched.preserved.customStyles).toEqual([{ styleName: 'H1', level: 1 }]);
    expect(patched.preserved.bookmarkName).toBe('BM');
  });

  it('includePageNumbers: false sets \\n to cover \\o range', () => {
    const existing = parseTocInstruction('TOC \\o "1-3" \\h');
    const patched = applyTocPatch(existing, { includePageNumbers: false });
    expect(patched.display.includePageNumbers).toBe(false);
    expect(patched.display.omitPageNumberLevels).toEqual({ from: 1, to: 3 });
  });

  it('includePageNumbers: true removes \\n', () => {
    const existing = parseTocInstruction('TOC \\o "1-3" \\n "1-3"');
    const patched = applyTocPatch(existing, { includePageNumbers: true });
    expect(patched.display.includePageNumbers).toBe(true);
    expect(patched.display.omitPageNumberLevels).toBeUndefined();
  });

  it('tabLeader: dot sets \\p separator', () => {
    const existing = parseTocInstruction('TOC \\o "1-3"');
    const patched = applyTocPatch(existing, { tabLeader: 'dot' });
    expect(patched.display.tabLeader).toBe('dot');
    expect(patched.display.separator).toBe('.');
  });

  it('tabLeader: none removes separator', () => {
    const existing = parseTocInstruction('TOC \\o "1-3" \\p "."');
    const patched = applyTocPatch(existing, { tabLeader: 'none' });
    expect(patched.display.tabLeader).toBe('none');
    expect(patched.display.separator).toBeUndefined();
  });

  it('throws on tabLeader + separator conflict', () => {
    const existing = parseTocInstruction('TOC \\o "1-3"');
    expect(() => applyTocPatch(existing, { tabLeader: 'dot', separator: '-' })).toThrow('INVALID_INPUT');
  });

  it('throws on includePageNumbers + omitPageNumberLevels conflict', () => {
    const existing = parseTocInstruction('TOC \\o "1-3"');
    expect(() =>
      applyTocPatch(existing, { includePageNumbers: false, omitPageNumberLevels: { from: 1, to: 2 } }),
    ).toThrow('INVALID_INPUT');
  });

  it('patches tcFieldIdentifier on source config', () => {
    const existing = parseTocInstruction('TOC \\o "1-3"');
    const patched = applyTocPatch(existing, { tcFieldIdentifier: 'A' });
    expect(patched.source.tcFieldIdentifier).toBe('A');
  });

  it('patches tcFieldLevels on source config', () => {
    const existing = parseTocInstruction('TOC \\o "1-3"');
    const patched = applyTocPatch(existing, { tcFieldLevels: { from: 1, to: 5 } });
    expect(patched.source.tcFieldLevels).toEqual({ from: 1, to: 5 });
  });
});

describe('areTocConfigsEqual', () => {
  it('returns true for identical configs', () => {
    const a = parseTocInstruction('TOC \\o "1-3" \\h \\u \\z');
    const b = parseTocInstruction('TOC \\h \\o "1-3" \\z \\u');
    expect(areTocConfigsEqual(a, b)).toBe(true);
  });

  it('returns false for different configs', () => {
    const a = parseTocInstruction('TOC \\o "1-3" \\h');
    const b = parseTocInstruction('TOC \\o "1-5" \\h');
    expect(areTocConfigsEqual(a, b)).toBe(false);
  });
});
