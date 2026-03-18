import { describe, expect, it, beforeEach } from 'vitest';
import { createTheme, buildTheme } from './create-theme.js';

describe('createTheme', () => {
  beforeEach(() => {
    // Clean up injected styles between tests
    document.querySelectorAll('[data-sd-theme]').forEach((el) => el.remove());
  });

  it('returns a class name', () => {
    const className = createTheme({ colors: { action: '#ff0000' } });
    expect(className).toMatch(/^sd-theme-/);
  });

  it('uses the provided name', () => {
    const className = createTheme({ name: 'dark', colors: { bg: '#000' } });
    expect(className).toBe('sd-theme-dark');
  });

  it('maps colors to CSS variables', () => {
    const { css } = buildTheme({
      name: 'test-colors',
      colors: {
        action: '#6366f1',
        bg: '#ffffff',
        text: '#1e293b',
        border: '#e2e8f0',
      },
    });
    expect(css).toContain('--sd-ui-action: #6366f1');
    expect(css).toContain('--sd-ui-bg: #ffffff');
    expect(css).toContain('--sd-ui-text: #1e293b');
    expect(css).toContain('--sd-ui-border: #e2e8f0');
  });

  it('maps top-level font and radius', () => {
    const { css } = buildTheme({
      name: 'test-font',
      font: 'Inter, sans-serif',
      radius: '8px',
    });
    expect(css).toContain('--sd-ui-font-family: Inter, sans-serif');
    expect(css).toContain('--sd-ui-radius: 8px');
  });

  it('maps component-level toolbar overrides', () => {
    const { css } = buildTheme({
      name: 'test-toolbar',
      toolbar: { bg: '#f1f5f9', buttonText: '#333' },
    });
    expect(css).toContain('--sd-ui-toolbar-bg: #f1f5f9');
    expect(css).toContain('--sd-ui-toolbar-button-text: #333');
  });

  it('maps component-level comments overrides', () => {
    const { css } = buildTheme({
      name: 'test-comments',
      comments: { cardBg: '#f0f0ff', inputBg: '#fff', separator: '#ddd' },
    });
    expect(css).toContain('--sd-ui-comments-card-bg: #f0f0ff');
    expect(css).toContain('--sd-ui-comments-input-bg: #fff');
    expect(css).toContain('--sd-ui-comments-separator: #ddd');
  });

  it('maps tracked changes overrides', () => {
    const { css } = buildTheme({
      name: 'test-tc',
      trackedChanges: { insertBorder: '#00ff00', deleteBorder: '#ff0000' },
    });
    expect(css).toContain('--sd-tracked-changes-insert-border: #00ff00');
    expect(css).toContain('--sd-tracked-changes-delete-border: #ff0000');
  });

  it('ignores null and undefined values', () => {
    const { css } = buildTheme({
      name: 'test-null',
      colors: { action: '#ff0000', bg: undefined, text: null },
    });
    expect(css).toContain('--sd-ui-action: #ff0000');
    expect(css).not.toContain('--sd-ui-bg');
    expect(css).not.toContain('--sd-ui-text');
  });

  it('injects a style element into the document', () => {
    const className = createTheme({ name: 'inject-test', colors: { action: '#abc' } });
    const style = document.querySelector(`[data-sd-theme="${className}"]`);
    expect(style).not.toBeNull();
    expect(style.textContent).toContain('--sd-ui-action: #abc');
  });

  it('updates existing style element on re-call with same name', () => {
    createTheme({ name: 'reuse', colors: { action: '#111' } });
    createTheme({ name: 'reuse', colors: { action: '#222' } });
    const styles = document.querySelectorAll('[data-sd-theme="sd-theme-reuse"]');
    expect(styles.length).toBe(1);
    expect(styles[0].textContent).toContain('#222');
  });

  it('buildTheme returns both className and css', () => {
    const result = buildTheme({ name: 'build-test', colors: { action: '#f00' } });
    expect(result.className).toBe('sd-theme-build-test');
    expect(result.css).toContain('.sd-theme-build-test');
    expect(result.css).toContain('--sd-ui-action: #f00');
  });
});
