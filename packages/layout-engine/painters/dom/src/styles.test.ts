import { describe, expect, it } from 'vitest';
import { ensureSdtContainerStyles, lineStyles } from './styles.js';

describe('lineStyles', () => {
  it('sets height and lineHeight from the argument', () => {
    const styles = lineStyles(24);
    expect(styles.height).toBe('24px');
    expect(styles.lineHeight).toBe('24px');
  });

  it('sets fontSize to 0 to eliminate the CSS strut', () => {
    const styles = lineStyles(20);
    expect(styles.fontSize).toBe('0');
  });
});

describe('ensureSdtContainerStyles', () => {
  it('suppresses structured-content hover backgrounds in viewing mode, including grouped hover', () => {
    ensureSdtContainerStyles(document);

    const styleEl = document.querySelector('[data-superdoc-sdt-container-styles="true"]');
    const cssText = styleEl?.textContent ?? '';

    expect(cssText).toContain('.presentation-editor--viewing .superdoc-structured-content-block.sdt-group-hover');
    expect(cssText).toContain(
      '.presentation-editor--viewing .superdoc-structured-content-block[data-lock-mode].sdt-group-hover',
    );
    expect(cssText).toContain(
      '.presentation-editor--viewing .superdoc-structured-content-inline[data-lock-mode]:hover',
    );
    expect(cssText).toContain('background: none;');
  });
});
