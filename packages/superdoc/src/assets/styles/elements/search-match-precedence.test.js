import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// SD-3045 (cross-package CSS invariant). The DomPainter writes
// `style.backgroundColor = run.highlight` inline on the same span the search
// DecorationBridge tags with `.ProseMirror-search-match`. Without `!important`,
// the inline style wins and the search highlight is invisible on every run
// whose source rPr carries a highlight mark (e.g. `<w:highlight w:val="white"/>`).
// These tests guard the two CSS sites that paint the transient search colour.

const repoRoot = join(__dirname, '..', '..', '..', '..', '..', '..');

const superdocCss = readFileSync(
  join(repoRoot, 'packages', 'superdoc', 'src', 'assets', 'styles', 'elements', 'superdoc.css'),
  'utf8',
);

const editorScopedCss = readFileSync(
  join(repoRoot, 'packages', 'super-editor', 'src', 'editors', 'v1', 'assets', 'styles', 'elements', 'prosemirror.css'),
  'utf8',
);

const extractRuleBody = (css, selector) => {
  const idx = css.indexOf(selector);
  if (idx === -1) return null;
  const open = css.indexOf('{', idx);
  const close = css.indexOf('}', open);
  if (open === -1 || close === -1) return null;
  return css.slice(open + 1, close);
};

describe('search-match CSS precedence (SD-3045)', () => {
  describe('packages/superdoc/src/assets/styles/elements/superdoc.css', () => {
    it('`.superdoc .ProseMirror-search-match` background uses !important', () => {
      const body = extractRuleBody(superdocCss, '.superdoc .ProseMirror-search-match');
      expect(body, '.superdoc .ProseMirror-search-match rule must exist').not.toBeNull();
      expect(body).toMatch(/background\s*:[^;]*!important/);
    });

    it('`.superdoc .ProseMirror-active-search-match` background uses !important', () => {
      const body = extractRuleBody(superdocCss, '.superdoc .ProseMirror-active-search-match');
      expect(body, '.superdoc .ProseMirror-active-search-match rule must exist').not.toBeNull();
      expect(body).toMatch(/background\s*:[^;]*!important/);
    });
  });

  describe('packages/super-editor/.../prosemirror.css', () => {
    it('`.sd-editor-scoped .ProseMirror-search-match` background-color uses !important', () => {
      const body = extractRuleBody(editorScopedCss, '.sd-editor-scoped .ProseMirror-search-match');
      expect(body, '.sd-editor-scoped .ProseMirror-search-match rule must exist').not.toBeNull();
      expect(body).toMatch(/background-color\s*:[^;]*!important/);
    });

    it('`.sd-editor-scoped .ProseMirror-active-search-match` background-color uses !important', () => {
      const body = extractRuleBody(editorScopedCss, '.sd-editor-scoped .ProseMirror-active-search-match');
      expect(body, '.sd-editor-scoped .ProseMirror-active-search-match rule must exist').not.toBeNull();
      expect(body).toMatch(/background-color\s*:[^;]*!important/);
    });
  });

  describe('JSDOM specificity sanity check', () => {
    it('class-level `background !important` beats inline `style="background-color: white"`', () => {
      const styleEl = document.createElement('style');
      styleEl.textContent = `.search-test { background: rgba(255, 213, 0, 0.4) !important; }`;
      document.head.appendChild(styleEl);

      const span = document.createElement('span');
      span.className = 'search-test';
      span.setAttribute('style', 'background-color: rgb(255, 255, 255);');
      document.body.appendChild(span);

      const bg = getComputedStyle(span).backgroundColor;

      styleEl.remove();
      span.remove();

      expect(bg).toBe('rgba(255, 213, 0, 0.4)');
    });

    it('without !important, inline `background-color: white` overrides class background', () => {
      const styleEl = document.createElement('style');
      styleEl.textContent = `.search-test-noimp { background: rgba(255, 213, 0, 0.4); }`;
      document.head.appendChild(styleEl);

      const span = document.createElement('span');
      span.className = 'search-test-noimp';
      span.setAttribute('style', 'background-color: rgb(255, 255, 255);');
      document.body.appendChild(span);

      const bg = getComputedStyle(span).backgroundColor;

      styleEl.remove();
      span.remove();

      expect(bg).toBe('rgb(255, 255, 255)');
    });
  });
});
