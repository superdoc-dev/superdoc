import { describe, it, expect } from 'vitest';
import { parseTcInstruction, serializeTcInstruction, applyTcPatch, areTcConfigsEqual } from './tc-switches.js';

describe('parseTcInstruction', () => {
  it('parses basic TC entry with quoted text', () => {
    const config = parseTcInstruction('TC "Chapter One"');
    expect(config.text).toBe('Chapter One');
    expect(config.level).toBe(1);
    expect(config.omitPageNumber).toBe(false);
    expect(config.tableIdentifier).toBeUndefined();
  });

  it('parses all switches', () => {
    const config = parseTcInstruction('TC "Entry" \\f "A" \\l "3" \\n');
    expect(config.text).toBe('Entry');
    expect(config.tableIdentifier).toBe('A');
    expect(config.level).toBe(3);
    expect(config.omitPageNumber).toBe(true);
  });

  it('parses unquoted switch arguments', () => {
    const config = parseTcInstruction('TC "Entry" \\f A \\l 3 \\n');
    expect(config.tableIdentifier).toBe('A');
    expect(config.level).toBe(3);
    expect(config.omitPageNumber).toBe(true);
  });

  it('defaults level to 1 when \\l is absent', () => {
    const config = parseTcInstruction('TC "Hello"');
    expect(config.level).toBe(1);
  });

  it('stores unrecognized switches in rawExtensions', () => {
    const config = parseTcInstruction('TC "Text" \\x "custom" \\y');
    expect(config.rawExtensions).toEqual(['\\x "custom"', '\\y']);
  });

  it('handles unquoted text before switches', () => {
    const config = parseTcInstruction('TC My Text \\l "2"');
    expect(config.text).toBe('My Text');
    expect(config.level).toBe(2);
  });

  it('accepts mixed quoted and unquoted switch arguments', () => {
    const config = parseTcInstruction('TC "Entry" \\f "A" \\l 3');
    expect(config.tableIdentifier).toBe('A');
    expect(config.level).toBe(3);
  });
});

describe('serializeTcInstruction', () => {
  it('serializes basic entry', () => {
    expect(serializeTcInstruction({ text: 'Entry', level: 1, omitPageNumber: false })).toBe('TC "Entry"');
  });

  it('serializes all switches', () => {
    const result = serializeTcInstruction({
      text: 'Entry',
      tableIdentifier: 'B',
      level: 2,
      omitPageNumber: true,
    });
    expect(result).toBe('TC "Entry" \\f "B" \\l "2" \\n');
  });

  it('omits \\l when level is 1 (default)', () => {
    const result = serializeTcInstruction({ text: 'X', level: 1, omitPageNumber: false });
    expect(result).not.toContain('\\l');
  });

  it('preserves rawExtensions', () => {
    const result = serializeTcInstruction({
      text: 'X',
      level: 1,
      omitPageNumber: false,
      rawExtensions: ['\\z "foo"'],
    });
    expect(result).toContain('\\z "foo"');
  });
});

describe('round-trip stability', () => {
  it('parse(serialize(parse(input))) === parse(input)', () => {
    const inputs = ['TC "Chapter One"', 'TC "Entry" \\f "A" \\l "3" \\n', 'TC "Text" \\x "custom"'];

    for (const input of inputs) {
      const first = parseTcInstruction(input);
      const serialized = serializeTcInstruction(first);
      const second = parseTcInstruction(serialized);
      expect(second, `round-trip failed for: ${input}`).toEqual(first);
    }
  });
});

describe('applyTcPatch', () => {
  it('merges partial patch onto existing config', () => {
    const existing = parseTcInstruction('TC "Old" \\f "A" \\l "2"');
    const patched = applyTcPatch(existing, { text: 'New' });
    expect(patched.text).toBe('New');
    expect(patched.tableIdentifier).toBe('A');
    expect(patched.level).toBe(2);
  });

  it('preserves unspecified fields', () => {
    const existing = parseTcInstruction('TC "Entry" \\f "B" \\n');
    const patched = applyTcPatch(existing, { level: 3 });
    expect(patched.text).toBe('Entry');
    expect(patched.tableIdentifier).toBe('B');
    expect(patched.omitPageNumber).toBe(true);
    expect(patched.level).toBe(3);
  });

  it('preserves rawExtensions from existing config', () => {
    const existing = parseTcInstruction('TC "X" \\z "custom"');
    const patched = applyTcPatch(existing, { text: 'Y' });
    expect(patched.rawExtensions).toEqual(['\\z "custom"']);
  });
});

describe('areTcConfigsEqual', () => {
  it('returns true for identical configs', () => {
    const a = parseTcInstruction('TC "A" \\f "X" \\l "2"');
    const b = parseTcInstruction('TC "A" \\f "X" \\l "2"');
    expect(areTcConfigsEqual(a, b)).toBe(true);
  });

  it('returns false for different configs', () => {
    const a = parseTcInstruction('TC "A" \\l "1"');
    const b = parseTcInstruction('TC "A" \\l "2"');
    expect(areTcConfigsEqual(a, b)).toBe(false);
  });
});
