import { describe, expect, it } from 'vitest';
import { diffParagraphs, fingerprintOf } from './differ.ts';
import { oleToHex, pxToPt, wordAlignment, wordTri } from './normalize.ts';
import { codeAreaFor, specRefFor } from './taxonomy.ts';
import { diffAgainstBaseline } from './baseline.ts';
import type { Baseline, CompareReport, NormalizedParagraph } from './types.ts';

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

describe('fingerprintOf', () => {
  it('is stable and collision-free per (category, ordinal)', () => {
    expect(fingerprintOf('pagination', 39)).toBe('pagination:39');
    expect(fingerprintOf('text', 39)).not.toBe(fingerprintOf('pagination', 39));
    expect(fingerprintOf('pagination', 39)).toBe(fingerprintOf('pagination', 39));
  });

  it('is set on every finding emitted by diffParagraphs', () => {
    const w = [para({ text: 'a', page: 1 }), para({ ordinal: 2, text: 'b', page: 2 })];
    const s = [para({ text: 'a', page: 1 }), para({ ordinal: 2, text: 'DIFFERENT', page: 1 })];
    for (const f of diffParagraphs(w, s)) {
      expect(f.fingerprint).toBeTruthy();
      expect(f.fingerprint).toBe(`${f.category}:${f.paragraphOrdinal}`);
    }
  });
});

describe('diffAgainstBaseline', () => {
  const makeReport = (
    file: string,
    findings: NormalizedParagraph[] extends unknown ? number[] : never = [],
  ): CompareReport => {
    // findings argument not used below; we construct findings explicitly per test
    void findings;
    return {
      docxPath: `/abs/path/${file}`,
      docxSha: 'sha',
      wordSupported: true,
      counts: { wordParagraphs: 0, superdocParagraphs: 0, wordPages: 1, superdocPages: 1 },
      findings: [],
    };
  };

  const mkFinding = (cat: 'pagination' | 'text', ordinal: number) => ({
    fingerprint: fingerprintOf(cat, ordinal),
    category: cat,
    severity: 'visible' as const,
    paragraphOrdinal: ordinal,
    word: null,
    superdoc: null,
    message: `${cat} at #${ordinal}`,
  });

  it('classifies findings as resolved / new / unchanged', () => {
    const baseline: Baseline = {
      schemaVersion: 1,
      capturedAt: '2026-01-01T00:00:00Z',
      docs: {
        'memo.docx': {
          docxSha: 'sha',
          findings: [mkFinding('pagination', 39), mkFinding('pagination', 80)],
        },
      },
    };
    const report = makeReport('memo.docx');
    report.findings = [mkFinding('pagination', 39), mkFinding('text', 42)];
    const delta = diffAgainstBaseline([report], baseline);

    expect(delta.totals).toEqual({ resolved: 1, new: 1, unchanged: 1 });
    expect(delta.docs).toHaveLength(1);
    expect(delta.docs[0]!.resolved.map((f) => f.fingerprint)).toEqual(['pagination:80']);
    expect(delta.docs[0]!.new.map((f) => f.fingerprint)).toEqual(['text:42']);
    expect(delta.docs[0]!.unchangedCount).toBe(1);
  });

  it('treats docs not in baseline as all-new', () => {
    const baseline: Baseline = { schemaVersion: 1, capturedAt: 'x', docs: {} };
    const report = makeReport('new-doc.docx');
    report.findings = [mkFinding('pagination', 5)];
    const delta = diffAgainstBaseline([report], baseline);
    expect(delta.totals.new).toBe(1);
    expect(delta.totals.resolved).toBe(0);
  });

  it('emits empty delta when nothing changed', () => {
    const baseline: Baseline = {
      schemaVersion: 1,
      capturedAt: 'x',
      docs: { 'x.docx': { docxSha: 's', findings: [mkFinding('pagination', 1)] } },
    };
    const report = makeReport('x.docx');
    report.findings = [mkFinding('pagination', 1)];
    const delta = diffAgainstBaseline([report], baseline);
    expect(delta.totals).toEqual({ resolved: 0, new: 0, unchanged: 1 });
  });
});
