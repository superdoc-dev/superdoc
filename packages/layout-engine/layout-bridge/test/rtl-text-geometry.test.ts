import { describe, it, expect } from 'vite-plus/test';
import {
  containerXToLogicalAdvance,
  lineHasComplexBidiContent,
  logicalAdvanceToContainerX,
} from '../src/rtl-text-geometry.ts';

describe('rtl-text-geometry mapping helpers', () => {
  // Content box: contentLeft = 100, contentWidth = 30.
  const LEFT = 100;
  const WIDTH = 30;

  describe('logicalAdvanceToContainerX', () => {
    it('is the identity offset from contentLeft for LTR', () => {
      expect(logicalAdvanceToContainerX('ltr', LEFT, WIDTH, 0)).toBe(100);
      expect(logicalAdvanceToContainerX('ltr', LEFT, WIDTH, 10)).toBe(110);
      expect(logicalAdvanceToContainerX('ltr', LEFT, WIDTH, 30)).toBe(130);
    });

    it('mirrors about the content box for RTL (logical start at the visual right)', () => {
      // advance 0 (before the first logical char) -> visual RIGHT edge.
      expect(logicalAdvanceToContainerX('rtl', LEFT, WIDTH, 0)).toBe(130);
      expect(logicalAdvanceToContainerX('rtl', LEFT, WIDTH, 10)).toBe(120);
      // advance == contentWidth (after the last logical char) -> visual LEFT edge.
      expect(logicalAdvanceToContainerX('rtl', LEFT, WIDTH, 30)).toBe(100);
    });
  });

  describe('containerXToLogicalAdvance', () => {
    it('is the inverse for LTR and clamps to the content box', () => {
      expect(containerXToLogicalAdvance('ltr', LEFT, WIDTH, 100)).toBe(0);
      expect(containerXToLogicalAdvance('ltr', LEFT, WIDTH, 115)).toBe(15);
      expect(containerXToLogicalAdvance('ltr', LEFT, WIDTH, 130)).toBe(30);
      // out of the box clamps.
      expect(containerXToLogicalAdvance('ltr', LEFT, WIDTH, 90)).toBe(0);
      expect(containerXToLogicalAdvance('ltr', LEFT, WIDTH, 200)).toBe(30);
    });

    it('is the inverse for RTL (visual right -> logical start, visual left -> logical end)', () => {
      expect(containerXToLogicalAdvance('rtl', LEFT, WIDTH, 130)).toBe(0);
      expect(containerXToLogicalAdvance('rtl', LEFT, WIDTH, 115)).toBe(15);
      expect(containerXToLogicalAdvance('rtl', LEFT, WIDTH, 100)).toBe(30);
      // out of the box clamps to the box on both ends.
      expect(containerXToLogicalAdvance('rtl', LEFT, WIDTH, 200)).toBe(0);
      expect(containerXToLogicalAdvance('rtl', LEFT, WIDTH, 90)).toBe(30);
    });

    it('round-trips with logicalAdvanceToContainerX for both directions', () => {
      for (const direction of ['ltr', 'rtl'] as const) {
        for (const advance of [0, 7, 15, 23, 30]) {
          const x = logicalAdvanceToContainerX(direction, LEFT, WIDTH, advance);
          expect(containerXToLogicalAdvance(direction, LEFT, WIDTH, x)).toBe(advance);
        }
      }
    });

    it('coerces non-finite x to a safe 0 advance', () => {
      expect(containerXToLogicalAdvance('rtl', LEFT, WIDTH, Number.NaN)).toBe(0);
    });
  });

  describe('lineHasComplexBidiContent', () => {
    it('treats pure Hebrew/Arabic + neutral punctuation as simple (false)', () => {
      expect(lineHasComplexBidiContent('שלום')).toBe(false);
      expect(lineHasComplexBidiContent('مرحبا')).toBe(false);
      // leading/trailing neutral punctuation + whitespace + RTL mark stay simple.
      expect(lineHasComplexBidiContent('  «שלום, עולם!» ')).toBe(false);
      expect(lineHasComplexBidiContent('')).toBe(false);
    });

    it('flags strong-LTR letters mixed into RTL flow (true)', () => {
      expect(lineHasComplexBidiContent('abc שלום')).toBe(true);
      expect(lineHasComplexBidiContent('שלום World')).toBe(true);
    });

    it('flags Unicode numbers as complex (numeric runs are not a simple reverse)', () => {
      expect(lineHasComplexBidiContent('שלום 2026')).toBe(true);
      expect(lineHasComplexBidiContent('123')).toBe(true);
      // Arabic-Indic, Extended Arabic-Indic, Devanagari, and fullwidth digits.
      expect(lineHasComplexBidiContent('שלום ٢٠٢٦')).toBe(true);
      expect(lineHasComplexBidiContent('שלום ۲۰۲۶')).toBe(true);
      expect(lineHasComplexBidiContent('שלום २०२६')).toBe(true);
      expect(lineHasComplexBidiContent('שלום ２０２６')).toBe(true);
      // Non-decimal Unicode numeric classes are also conservative fail-closed.
      expect(lineHasComplexBidiContent('שלום Ⅻ')).toBe(true);
    });
  });
});
