import { describe, it, expect } from 'vitest';
import type { TextRun } from '@superdoc/contracts';
import { applyMarksToRun } from '../../marks/application.js';
import { DEFAULT_HYPERLINK_CONFIG } from '../../constants.js';

describe('theme color resolution', () => {
  const createRun = (): TextRun => ({
    text: 'theme color',
    fontFamily: 'Arial',
    fontSize: 16,
  });

  const themePalette = {
    accent1: '#4F81BD',
    hyperlink: '#0000FF',
  };

  it('resolves theme colors when explicit color is missing', () => {
    const run = createRun();
    const marks = [{ type: 'textStyle', attrs: { themeColor: 'accent1' } }];
    applyMarksToRun(run, marks, DEFAULT_HYPERLINK_CONFIG, themePalette);
    expect(run.color).toBe('#4F81BD');
  });

  it('applies theme tints to theme colors', () => {
    const run = createRun();
    const marks = [{ type: 'textStyle', attrs: { themeColor: 'accent1', themeTint: '99' } }];
    applyMarksToRun(run, marks, DEFAULT_HYPERLINK_CONFIG, themePalette);
    expect(run.color).toBe('#B9CDE5');
  });

  it('applies theme shades to theme colors', () => {
    const run = createRun();
    const marks = [{ type: 'textStyle', attrs: { themeColor: 'accent1', themeShade: '33' } }];
    applyMarksToRun(run, marks, DEFAULT_HYPERLINK_CONFIG, themePalette);
    expect(run.color).toBe('#101A26');
  });

  it('applies resolved theme colors to highlights', () => {
    const run = createRun();
    const marks = [{ type: 'highlight', attrs: { themeColor: 'hyperlink' } }];
    applyMarksToRun(run, marks, DEFAULT_HYPERLINK_CONFIG, themePalette);
    expect(run.highlight).toBe('#0000FF');
  });
});
