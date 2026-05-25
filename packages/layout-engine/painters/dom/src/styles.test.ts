import { describe, expect, it } from 'vitest';
import { ensureSdtContainerStyles, ensureTrackChangeStyles, lineStyles } from './styles.js';

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
  it('exposes hover border tokens for structured content overrides', () => {
    ensureSdtContainerStyles(document);

    const styleEl = document.querySelector('[data-superdoc-sdt-container-styles="true"]');
    const cssText = styleEl?.textContent ?? '';

    expect(cssText).toContain('border-color: var(--sd-content-controls-block-hover-border, transparent);');
    expect(cssText).toContain('border-color: var(--sd-content-controls-inline-hover-border, transparent);');
  });

  it('gives empty inline SDTs a default visible affordance', () => {
    ensureSdtContainerStyles(document);

    const styleEl = document.querySelector('[data-superdoc-sdt-container-styles="true"]');
    const cssText = styleEl?.textContent ?? '';
    const emptyRule = cssText.match(
      /\.superdoc-structured-content-inline\[data-empty='true'\]:not\(\[data-appearance='hidden'\]\)\s*\{([^}]*)\}/,
    )?.[1];

    expect(cssText).toContain(".superdoc-structured-content-inline[data-empty='true']:not([data-appearance='hidden'])");
    expect(cssText).toContain('border-color: var(--sd-content-controls-inline-border, #629be7);');
    expect(emptyRule).not.toContain('display: inline-block');
    expect(emptyRule).not.toContain('vertical-align');
  });

  it('reserves empty inline SDT width without adding line-box height', () => {
    ensureSdtContainerStyles(document);

    const styleEl = document.querySelector('[data-superdoc-sdt-container-styles="true"]');
    const cssText = styleEl?.textContent ?? '';
    const placeholderRule = cssText.match(/\.superdoc-empty-inline-sdt-placeholder\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(placeholderRule).toContain('display: inline-block;');
    expect(placeholderRule).toContain('width: 8px;');
    expect(placeholderRule).toContain('height: 0;');
    expect(placeholderRule).toContain('line-height: 0;');
    expect(placeholderRule).toContain('vertical-align: baseline;');
    expect(placeholderRule).not.toContain('height: 1em;');
  });

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

describe('ensureTrackChangeStyles', () => {
  it('keeps focused tracked-change emphasis paint-only so selection does not change inline geometry', () => {
    ensureTrackChangeStyles(document);

    const styleEl = document.querySelector('[data-superdoc-track-change-styles="true"]');
    const cssText = styleEl?.textContent ?? '';

    expect(cssText).toContain('.superdoc-layout .track-insert-dec.highlighted.track-change-focused');
    expect(cssText).toContain('.superdoc-layout .track-delete-dec.highlighted.track-change-focused');
    expect(cssText).toContain('.superdoc-layout .track-format-dec.highlighted.track-change-focused');
    expect(cssText).toContain('border-top-style: solid;');
    expect(cssText).toContain('border-bottom-style: solid;');
    expect(cssText).toContain('border-left: none;');
    expect(cssText).toContain('border-right: none;');
    expect(cssText).not.toMatch(
      /track-(insert|delete)-dec\.highlighted\.track-change-focused\s*\{[\s\S]*border-style:/,
    );
    expect(cssText).not.toMatch(
      /track-(insert|delete)-dec\.highlighted\.track-change-focused\s*\{[\s\S]*border-width:/,
    );
    expect(cssText).not.toMatch(
      /track-(insert|delete)-dec\.highlighted\.track-change-focused\s*\{[\s\S]*border-left-width:/,
    );
    expect(cssText).not.toMatch(
      /track-(insert|delete)-dec\.highlighted\.track-change-focused\s*\{[\s\S]*border-right-width:/,
    );
    expect(cssText).not.toMatch(/track-format-dec\.highlighted\.track-change-focused\s*\{[\s\S]*border-bottom-width:/);
  });
});
