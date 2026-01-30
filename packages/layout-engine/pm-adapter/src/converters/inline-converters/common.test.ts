import { describe, it, expect, vi } from 'vitest';
import type { TextRun } from '@superdoc/contracts';
import type { RunProperties } from '@superdoc/style-engine/ooxml';
import { applyInlineRunProperties } from './common.js';

vi.mock('../../attributes/paragraph.js', () => ({
  computeRunAttrs: vi.fn((runProps: RunProperties) => ({
    fontFamily: 'Arial',
    fontSize: 12,
    bold: runProps.bold,
    italic: runProps.italic,
    color: runProps.color?.val ? `#${runProps.color.val.toUpperCase()}` : undefined,
  })),
}));

describe('applyInlineRunProperties', () => {
  const baseRun: TextRun = {
    text: 'Hello',
    fontFamily: 'Times New Roman',
    fontSize: 16,
  };

  it('returns unchanged run when runProperties is undefined', () => {
    const result = applyInlineRunProperties(baseRun, undefined);

    expect(result).toBe(baseRun);
  });

  it('merges computed attributes from runProperties onto the run', () => {
    const runProperties: RunProperties = { bold: true };

    const result = applyInlineRunProperties(baseRun, runProperties);

    expect(result.bold).toBe(true);
    expect(result.fontFamily).toBe('Arial');
    expect(result.fontSize).toBe(12);
    expect(result.text).toBe('Hello');
  });

  it('preserves run.color when runProperties does not specify a color', () => {
    const runWithColor: TextRun = {
      ...baseRun,
      color: '#FF0000',
    };
    const runProperties: RunProperties = { bold: true };

    const result = applyInlineRunProperties(runWithColor, runProperties);

    expect(result.color).toBe('#FF0000');
  });

  it('overwrites run.color when runProperties specifies a color', () => {
    const runWithColor: TextRun = {
      ...baseRun,
      color: '#FF0000',
    };
    const runProperties: RunProperties = {
      color: { val: '00FF00' },
    };

    const result = applyInlineRunProperties(runWithColor, runProperties);

    expect(result.color).toBe('#00FF00');
  });

  it('does not set color when both run and runProperties have no color', () => {
    const runProperties: RunProperties = { bold: true };

    const result = applyInlineRunProperties(baseRun, runProperties);

    expect(result.color).toBeUndefined();
  });

  it('returns a new object instead of mutating the original run', () => {
    const runProperties: RunProperties = { italic: true };

    const result = applyInlineRunProperties(baseRun, runProperties);

    expect(result).not.toBe(baseRun);
    expect(baseRun.italic).toBeUndefined();
  });
});
