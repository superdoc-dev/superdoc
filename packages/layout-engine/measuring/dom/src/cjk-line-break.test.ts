import { describe, it, expect } from 'vite-plus/test';
import { measureBlock } from './index.js';
import type { FlowBlock, Measure, ParagraphMeasure, TextRun } from '@superdoc/contracts';

/**
 * CJK line breaking.
 *
 * `segment.split(' ')` only sees ASCII spaces, so a spaceless CJK clause reaches
 * the wrapper as ONE giant "word". These tests pin the two behaviors Word (and
 * CSS `line-break: normal`) produce and SuperDoc previously did not:
 *
 * 1. inter-ideograph break opportunities, including filling the remainder of an
 *    already-started line so a short lead-in run is never stranded alone;
 * 2. kinsoku shori — no line opens with a fullwidth closer, no line ends with a
 *    fullwidth opener.
 *
 * Widths are derived from real measurements (`charWidth`) so the assertions hold
 * regardless of which physical font the host resolves for CJK.
 */

const FORBIDDEN_LINE_START = '、。，．：；！？）］｝〉》」』】〕…‥ー々ゝゞヽヾ';
const FORBIDDEN_LINE_END = '（［｛〈《「『【〔';

const expectParagraphMeasure = (measure: Measure): ParagraphMeasure => {
  expect(measure.kind).toBe('paragraph');
  return measure as ParagraphMeasure;
};

const paragraph = (runs: Array<Partial<TextRun> & { text: string }>): FlowBlock => ({
  kind: 'paragraph',
  id: 'cjk-paragraph',
  runs: runs.map((run) => ({ fontFamily: 'Arial', fontSize: 16, ...run })) as TextRun[],
  attrs: {},
});

const extractLineText = (block: FlowBlock, line: ParagraphMeasure['lines'][number]): string => {
  if (block.kind !== 'paragraph') return '';
  const runs = (block.runs || []) as Array<{ text?: string }>;
  const parts: string[] = [];
  for (let runIndex = line.fromRun; runIndex <= line.toRun; runIndex++) {
    const run = runs[runIndex];
    if (!run || typeof run.text !== 'string') continue;
    const start = runIndex === line.fromRun ? line.fromChar : 0;
    const end = runIndex === line.toRun ? line.toChar : run.text.length;
    parts.push(run.text.slice(start, end));
  }
  return parts.join('');
};

const measureLineTexts = async (block: FlowBlock, width: number): Promise<string[]> => {
  const measure = expectParagraphMeasure(await measureBlock(block, width));
  return measure.lines.map((line) => extractLineText(block, line));
};

/** Natural advance width of a single character under the test font. */
const charWidth = async (char: string): Promise<number> => {
  const measure = expectParagraphMeasure(await measureBlock(paragraph([{ text: char }]), 10_000));
  return measure.lines[0].width;
};

/** Matches a surrogate half that is not part of a complete pair. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])([\uDC00-\uDFFF])/;

/**
 * Line ranges alone can hide a split surrogate pair, because rejoining the
 * lines makes the halves adjacent again. Assert on each line AND each segment
 * so a boundary landing inside a pair actually fails.
 */
const expectCodePointSafeRanges = (block: FlowBlock, measure: ParagraphMeasure): void => {
  if (block.kind !== 'paragraph') return;
  const runs = (block.runs || []) as Array<{ text?: string }>;
  for (const line of measure.lines) {
    expect(extractLineText(block, line)).not.toMatch(LONE_SURROGATE);
    for (const segment of line.segments ?? []) {
      const text = runs[segment.runIndex]?.text;
      if (typeof text !== 'string') continue;
      expect(text.slice(segment.fromChar, segment.toChar)).not.toMatch(LONE_SURROGATE);
    }
  }
};

describe('CJK line breaking', () => {
  describe('inter-ideograph break opportunities', () => {
    it('fills the current line remainder instead of stranding a short lead-in run', async () => {
      const lead = '甲方：';
      const clause = '本合同由甲乙双方于二零二六年七月签署并自签署日起生效';
      const block = paragraph([{ text: lead }, { text: clause }]);
      const perChar = await charWidth('本');

      const texts = await measureLineTexts(block, perChar * 12);

      expect(texts.length).toBeGreaterThan(1);
      // The lead-in keeps its line AND that line carries ideographs from the
      // following clause — the pre-fix behavior wrapped the whole clause and
      // left `甲方：` alone on line 1.
      expect(texts[0].startsWith(lead)).toBe(true);
      expect(texts[0].length).toBeGreaterThan(lead.length + 3);
      expect(texts.join('')).toBe(lead + clause);
    });

    it('breaks a spaceless clause that is wider than a whole line', async () => {
      const clause = '本协议自双方签署之日起生效并对双方具有法律约束力';
      const block = paragraph([{ text: clause }]);
      const perChar = await charWidth('本');

      const texts = await measureLineTexts(block, perChar * 6);

      expect(texts.length).toBeGreaterThan(2);
      expect(texts.join('')).toBe(clause);
    });

    it('wraps CJK after a Latin lead-in without emptying the first line', async () => {
      const lead = 'Note: ';
      const clause = '本条款适用于全部附件与补充协议';
      const block = paragraph([{ text: lead }, { text: clause }]);
      const perChar = await charWidth('本');

      const texts = await measureLineTexts(block, perChar * 10);

      expect(texts.length).toBeGreaterThan(1);
      expect(/[一-鿿]/.test(texts[0])).toBe(true);
    });
  });

  describe('kinsoku shori', () => {
    it('never opens a line with a forbidden closing character', async () => {
      const clause = '第一条，第二条，第三条，第四条，第五条，第六条。';
      const block = paragraph([{ text: clause }]);
      const perChar = await charWidth('第');

      for (const charsPerLine of [3, 4, 5, 6, 7, 8, 9, 10]) {
        const texts = await measureLineTexts(block, perChar * charsPerLine);
        expect(texts.join('')).toBe(clause);
        for (const text of texts.slice(1)) {
          expect(FORBIDDEN_LINE_START.includes(text[0])).toBe(false);
        }
      }
    });

    it('never ends a line with a forbidden opening character', async () => {
      const clause = '适用（一）（二）（三）（四）（五）（六）';
      const block = paragraph([{ text: clause }]);
      const perChar = await charWidth('适');

      for (const charsPerLine of [3, 4, 5, 6, 7, 8, 9, 10]) {
        const texts = await measureLineTexts(block, perChar * charsPerLine);
        expect(texts.join('')).toBe(clause);
        for (const text of texts.slice(0, -1)) {
          expect(FORBIDDEN_LINE_END.includes(text[text.length - 1])).toBe(false);
        }
      }
    });

    it('hangs a leading closer even when nothing else fits the line remainder', async () => {
      // `甲` commits the line, leaving well under one glyph of remainder. The
      // clause opens with `》`, so it must hang here rather than open line 2.
      const perChar = await charWidth('甲');
      const block = paragraph([{ text: '甲' }, { text: '》乙丙丁戊' }]);

      const texts = await measureLineTexts(block, perChar + 2);

      expect(texts.length).toBeGreaterThan(1);
      expect(texts[0]).toBe('甲》');
      expect(texts.join('')).toBe('甲》乙丙丁戊');
    });

    it('hangs a closer that arrives as its own single-character run', async () => {
      // OOXML routinely fragments punctuation into its own run, so the closer
      // reaches the wrapper as a one-character "word" with no CJK neighbours.
      const perChar = await charWidth('甲');
      const block = paragraph([{ text: '甲乙丙丁' }, { text: '，' }, { text: '戊己' }]);

      const texts = await measureLineTexts(block, perChar * 4 + 2);

      expect(texts.join('')).toBe('甲乙丙丁，戊己');
      for (const text of texts.slice(1)) {
        expect(FORBIDDEN_LINE_START.includes(text[0])).toBe(false);
      }
    });

    it('never finalizes a line whose only content is an opener', async () => {
      // At roughly one glyph per line the naive boundary yields 甲 / （ / 乙,
      // leaving line 2 ending on an opener.
      const perChar = await charWidth('甲');
      const block = paragraph([{ text: '甲（乙' }]);

      const texts = await measureLineTexts(block, perChar + 2);

      expect(texts.join('')).toBe('甲（乙');
      for (const text of texts) {
        expect(text.endsWith('（')).toBe(false);
      }
    });

    it('does not split a Latin head to fill the current line', async () => {
      // `SuperDoc中文` is chunkable between its ideographs, but its Latin head
      // moves as a unit. Filling the line with `SuperDo` would cut the word.
      // Only meaningful while the head fits a line at all — below that width
      // splitting it is unavoidable, so the sweep starts from its own width.
      const block = paragraph([{ text: '甲 ' }, { text: 'SuperDoc中文说明' }]);
      const latinHeadWidth = await charWidth('SuperDoc');
      const perChar = await charWidth('中');

      for (let extra = 0; extra <= 4; extra += 1) {
        const width = latinHeadWidth + perChar * extra;
        const texts = await measureLineTexts(block, width);
        expect(texts.join('')).toBe('甲 SuperDoc中文说明');
        const withLatin = texts.filter((text) => /[A-Za-z]/.test(text));
        expect(withLatin).toHaveLength(1);
        expect(withLatin[0]).toContain('SuperDoc');
      }
    });

    it('keeps a Latin word embedded in CJK text on one line', async () => {
      const clause = '本条所称SuperDoc指本协议附件所列软件';
      const block = paragraph([{ text: clause }]);
      const perChar = await charWidth('本');

      const texts = await measureLineTexts(block, perChar * 8);

      expect(texts.join('')).toBe(clause);
      const lineWithLatin = texts.filter((text) => text.includes('Super'));
      expect(lineWithLatin).toHaveLength(1);
      expect(lineWithLatin[0]).toContain('SuperDoc');
    });
  });

  describe('astral characters', () => {
    it('never splits a surrogate pair across lines or segments', async () => {
      // CJK extension B ideographs (U+20000+) are two UTF-16 units each.
      const clause = '\u{20000}\u{20001}\u{20002}\u{20003}\u{20004}\u{20005}\u{20006}\u{20007}';
      const block = paragraph([{ text: clause }]);
      const perChar = await charWidth('\u{20000}');

      for (const charsPerLine of [1, 2, 3, 4, 5]) {
        const measure = expectParagraphMeasure(await measureBlock(block, perChar * charsPerLine + 2));
        expectCodePointSafeRanges(block, measure);
        expect(measure.lines.map((line) => extractLineText(block, line)).join('')).toBe(clause);
      }
    });

    it('keeps astral and BMP ideographs together in one clause', async () => {
      // Mixing widths is what makes a naive fitter overflow at an odd index and
      // cut a pair in half, so sweep widths rather than trusting one of them.
      const clause = '\u{20000}甲\u{20001}乙\u{20002}丙\u{20003}丁';
      const block = paragraph([{ text: '前言' }, { text: clause }]);

      for (const width of [40, 45, 50, 55, 60, 65, 70, 80, 90, 100]) {
        const measure = expectParagraphMeasure(await measureBlock(block, width));
        expectCodePointSafeRanges(block, measure);
        expect(measure.lines.map((line) => extractLineText(block, line)).join('')).toBe(`前言${clause}`);
      }
    });
  });

  describe('Latin regressions', () => {
    it('keeps space-based wrapping intact', async () => {
      const text = 'The quick brown fox jumps over the lazy dog';
      const block = paragraph([{ text }]);
      const words = text.split(' ');
      const natural = expectParagraphMeasure(await measureBlock(block, 10_000)).lines[0].width;

      const texts = await measureLineTexts(block, natural / 3);

      expect(texts.length).toBeGreaterThan(1);
      for (const line of texts) {
        for (const token of line.trim().split(' ')) {
          expect(words).toContain(token);
        }
      }
      expect(texts.map((line) => line.trim()).join(' ')).toBe(text);
    });

    it('still character-breaks a single Latin word wider than the line', async () => {
      const word = 'Supercalifragilisticexpialidocious';
      const block = paragraph([{ text: word }]);

      const texts = await measureLineTexts(block, 60);

      expect(texts.length).toBeGreaterThan(1);
      expect(texts.join('')).toBe(word);
    });
  });
});
