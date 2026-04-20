import { describe, expect, it } from 'vitest';
import { diffParagraphs } from './differ.ts';
import { oleToHex, pxToPt, wordAlignment, wordTri } from './normalize.ts';
import { codeAreaFor, specRefFor } from './taxonomy.ts';
import type { NormalizedParagraph } from './types.ts';

const para = (overrides: Partial<NormalizedParagraph> = {}): NormalizedParagraph => ({
  ordinal: 1,
  text: 'hello',
  style: 'Normal',
  page: 1,
  y: 72,
  ...overrides,
});

describe('oleToHex', () => {
  it('converts 0x00BBGGRR to #RRGGBB', () => {
    expect(oleToHex(0x000000ff)).toBe('#FF0000'); // red
    expect(oleToHex(0x0000ff00)).toBe('#00FF00'); // green
    expect(oleToHex(0x00ff0000)).toBe('#0000FF'); // blue
    expect(oleToHex(0)).toBe('#000000');
  });

  it("handles Word's negative wdColorAutomatic sentinel", () => {
    // -16777216 === 0xFF000000 in 32-bit; low 24 bits are 0 → maps to #000000 today.
    // Flagged as M2 work: distinguish auto-color from explicit black.
    expect(oleToHex(-16777216)).toBe('#000000');
  });
});

describe('wordTri', () => {
  it("maps 9999999 (wdUndefined) to 'mixed'", () => {
    expect(wordTri(9999999)).toBe('mixed');
  });
  it('coerces other numbers to boolean', () => {
    expect(wordTri(0)).toBe(false);
    expect(wordTri(-1)).toBe(true);
    expect(wordTri(1)).toBe(true);
  });
});

describe('wordAlignment', () => {
  it("maps 0/1/2/3 and falls back to 'unknown'", () => {
    expect(wordAlignment(0)).toBe('left');
    expect(wordAlignment(1)).toBe('center');
    expect(wordAlignment(2)).toBe('right');
    expect(wordAlignment(3)).toBe('justify');
    expect(wordAlignment(42)).toBe('unknown');
  });
});

describe('pxToPt', () => {
  it('converts 96px to 72pt', () => {
    expect(pxToPt(96)).toBe(72);
    expect(pxToPt(0)).toBe(0);
  });
});

describe('diffParagraphs', () => {
  it('emits no findings when both sides agree', () => {
    const p = [para({ ordinal: 1, text: 'a' }), para({ ordinal: 2, text: 'b', y: 100 })];
    expect(diffParagraphs(p, p)).toEqual([]);
  });

  it('ignores whitespace-only text differences', () => {
    const w = [para({ text: '  hello   world  ' })];
    const s = [para({ text: 'hello world' })];
    expect(diffParagraphs(w, s)).toEqual([]);
  });

  it("emits one blocking 'structure' finding on paragraph-count mismatch and suppresses per-paragraph findings", () => {
    const w = [para({ text: 'a' }), para({ text: 'b', page: 1 })];
    const s = [para({ text: 'different' })];
    const findings = diffParagraphs(w, s);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.category).toBe('structure');
    expect(findings[0]!.severity).toBe('blocking');
    expect(findings[0]!.codeAreaHint).toBeDefined();
  });

  it("emits a blocking 'text' finding when aligned paragraphs differ in text", () => {
    const w = [para({ text: 'word side' })];
    const s = [para({ text: 'superdoc side' })];
    const findings = diffParagraphs(w, s);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.category).toBe('text');
    expect(findings[0]!.severity).toBe('blocking');
    expect(findings[0]!.specRef).toMatch(/ECMA-376/);
  });

  it("emits a visible 'pagination' finding with rounded y and page info when pages differ", () => {
    const w = [para({ text: 'same', page: 2, y: 100.456 })];
    const s = [para({ text: 'same', page: 1, y: 700.123 })];
    const findings = diffParagraphs(w, s);
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.category).toBe('pagination');
    expect(f.severity).toBe('visible');
    expect(f.word).toEqual({ page: 2, y: 100.5 });
    expect(f.superdoc).toEqual({ page: 1, y: 700.1 });
    expect(f.message).toContain('"same"');
  });

  it("uses '(empty line)' message when the Word-side text is empty", () => {
    const w = [para({ text: '', page: 2 })];
    const s = [para({ text: '', page: 1 })];
    const findings = diffParagraphs(w, s);
    expect(findings[0]!.message).toContain('(empty line)');
  });
});

describe('taxonomy', () => {
  it('returns non-undefined hints for M1 categories', () => {
    expect(codeAreaFor('pagination')).toBeDefined();
    expect(codeAreaFor('text')).toBeDefined();
    expect(codeAreaFor('structure')).toBeDefined();
    expect(specRefFor('text')).toMatch(/ECMA-376/);
    expect(specRefFor('pagination')).toMatch(/ECMA-376/);
  });
});
