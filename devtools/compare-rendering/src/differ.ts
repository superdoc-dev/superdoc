import type { Finding, NormalizedParagraph } from './types.ts';
import { codeAreaFor, specRefFor } from './taxonomy.ts';

export function diffParagraphs(word: NormalizedParagraph[], superdoc: NormalizedParagraph[]): Finding[] {
  const findings: Finding[] = [];

  if (word.length !== superdoc.length) {
    findings.push({
      category: 'structure',
      severity: 'blocking',
      paragraphOrdinal: 0,
      word: word.length,
      superdoc: superdoc.length,
      message:
        `Paragraph count differs: Word=${word.length} SuperDoc=${superdoc.length}. ` +
        `Per-paragraph findings suppressed because ordinal alignment cannot be trusted.`,
      codeAreaHint: codeAreaFor('structure'),
    });
    return findings;
  }

  const n = word.length;
  for (let i = 0; i < n; i += 1) {
    const w = word[i]!;
    const s = superdoc[i]!;

    if (!textsMatch(w.text, s.text)) {
      findings.push({
        category: 'text',
        severity: 'blocking',
        paragraphOrdinal: w.ordinal,
        word: truncate(w.text),
        superdoc: truncate(s.text),
        message: `Paragraph #${w.ordinal} text differs.`,
        specRef: specRefFor('text'),
        codeAreaHint: codeAreaFor('text'),
      });
    }

    if (w.page !== s.page) {
      findings.push({
        category: 'pagination',
        severity: 'visible',
        paragraphOrdinal: w.ordinal,
        word: { page: w.page, y: round(w.y) },
        superdoc: { page: s.page, y: round(s.y) },
        message:
          `Paragraph #${w.ordinal} landed on page ${s.page} in SuperDoc but page ${w.page} in Word` +
          (w.text ? ` ("${truncate(w.text, 40)}")` : ' (empty line)'),
        specRef: specRefFor('pagination'),
        codeAreaHint: codeAreaFor('pagination'),
      });
    }
  }

  return findings;
}

function textsMatch(a: string, b: string): boolean {
  return normalizeText(a) === normalizeText(b);
}

function normalizeText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function truncate(s: string, n = 80): string {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function round(v: number, digits = 1): number {
  const m = 10 ** digits;
  return Math.round(v * m) / m;
}
