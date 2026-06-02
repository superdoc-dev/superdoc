import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';

/**
 * CSS Bleed Prevention Tests (SD-1850)
 *
 * Structural lint tests that parse CSS files and verify no selectors
 * can bleed into host applications. This prevents regressions if someone
 * adds an unscoped selector in the future.
 */

const SUPER_EDITOR_STYLES_DIR = resolve(__dirname, '../assets/styles');
const SUPER_EDITOR_V1_DIR = resolve(__dirname, '..');
const SUPERDOC_COMPONENTS_DIR = resolve(__dirname, '../../../../../superdoc/src/components');

/**
 * Recursively find all .css files in a directory.
 */
function findCssFiles(dir, prefix = '') {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...findCssFiles(join(dir, entry.name), rel));
    } else if (entry.name.endsWith('.css')) {
      results.push(rel);
    }
  }
  return results;
}

function findVueFiles(dir, prefix = '') {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...findVueFiles(join(dir, entry.name), rel));
    } else if (entry.name.endsWith('.vue')) {
      results.push(rel);
    }
  }
  return results;
}

function extractStyleBlocks(vueText) {
  const blocks = [];
  const styleTagPattern = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let match;
  while ((match = styleTagPattern.exec(vueText)) !== null) {
    blocks.push(match[1] ?? '');
  }
  return blocks;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse top-level CSS selectors from a CSS file string.
 * Returns an array of selector strings (only top-level, not inside @media/@keyframes).
 */
function extractTopLevelSelectors(cssText) {
  const selectors = [];
  let depth = 0;
  let current = '';
  let inComment = false;
  let inAtRule = false;

  for (let i = 0; i < cssText.length; i++) {
    const char = cssText[i];
    const next = cssText[i + 1];

    // Track comments
    if (!inComment && char === '/' && next === '*') {
      inComment = true;
      i++;
      continue;
    }
    if (inComment && char === '*' && next === '/') {
      inComment = false;
      i++;
      continue;
    }
    if (inComment) continue;

    // Track @ rules (keyframes, media, etc.)
    if (depth === 0 && char === '@') {
      inAtRule = true;
      current = '@';
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        const trimmed = current.trim();
        if (trimmed && !inAtRule) {
          // Split comma-separated selectors
          const parts = trimmed.split(',').map((s) => s.trim());
          selectors.push(...parts);
        }
        current = '';
      }
      depth++;
      continue;
    }

    if (char === '}') {
      depth--;
      if (depth === 0) {
        inAtRule = false;
        current = '';
      }
      continue;
    }

    if (depth === 0) {
      current += char;
    }
  }

  return selectors;
}

/**
 * Bare HTML element selectors that should NEVER appear at top-level without a parent scope.
 * These are the most dangerous: they affect all elements of that type on the page.
 */
const BARE_ELEMENT_PATTERN =
  /^(a|p|div|span|table|tr|td|th|ul|ol|li|h[1-6]|img|pre|blockquote|code|input|button|select|textarea|form|label|section|article|nav|header|footer|main|aside)\s*(\{|,|:|\[|>|\+|~|$)/;

/**
 * Check if a selector is scoped under a SuperDoc parent class.
 */
function isScopedSelector(selector) {
  // Already scoped under .super-editor, .superdoc, .sd-, .presentation-editor, .tippy-box
  const scopedPrefixes = ['.super-editor', '.superdoc', '.sd-', '.presentation-editor', '.tippy-box'];

  return scopedPrefixes.some((prefix) => selector.startsWith(prefix));
}

describe('CSS Bleed Prevention (SD-1850)', () => {
  it('should not have bare HTML element selectors at top level', () => {
    const cssFiles = findCssFiles(SUPER_EDITOR_STYLES_DIR);
    const violations = [];

    for (const file of cssFiles) {
      const fullPath = join(SUPER_EDITOR_STYLES_DIR, file);
      const cssText = readFileSync(fullPath, 'utf8');
      const selectors = extractTopLevelSelectors(cssText);

      for (const selector of selectors) {
        if (BARE_ELEMENT_PATTERN.test(selector)) {
          violations.push({ file, selector });
        }
      }
    }

    if (violations.length > 0) {
      const message = violations.map((v) => `  ${v.file}: "${v.selector}"`).join('\n');
      expect.fail(
        `Found bare HTML element selectors that will bleed into host apps:\n${message}\n\nScope them under .super-editor (e.g., ".super-editor a { ... }")`,
      );
    }
  });

  it('should scope all .ProseMirror selectors under .super-editor', () => {
    const cssFiles = findCssFiles(SUPER_EDITOR_STYLES_DIR);
    const violations = [];

    for (const file of cssFiles) {
      const fullPath = join(SUPER_EDITOR_STYLES_DIR, file);
      const cssText = readFileSync(fullPath, 'utf8');
      const selectors = extractTopLevelSelectors(cssText);

      for (const selector of selectors) {
        // Check for .ProseMirror selectors not scoped under .super-editor
        const isProseMirrorSelector =
          selector.startsWith('.ProseMirror') ||
          selector.startsWith('li.ProseMirror') ||
          selector.startsWith('img.ProseMirror');

        if (isProseMirrorSelector && !selector.startsWith('.super-editor')) {
          // Allow .ProseMirror inside already-scoped selectors (e.g., .superdoc-field .ProseMirror)
          if (!isScopedSelector(selector)) {
            violations.push({ file, selector });
          }
        }
      }
    }

    if (violations.length > 0) {
      const message = violations.map((v) => `  ${v.file}: "${v.selector}"`).join('\n');
      expect.fail(
        `Found .ProseMirror selectors not scoped under .super-editor:\n${message}\n\nPrefix with ".super-editor" (e.g., ".super-editor .ProseMirror { ... }")`,
      );
    }
  });

  it('should not have generic utility class names at top level', () => {
    const cssFiles = findCssFiles(SUPER_EDITOR_STYLES_DIR);
    const violations = [];

    // Generic class names that are commonly used by frameworks (Bootstrap, Tailwind, etc.)
    const genericClassNames = ['.sr-only', '.visually-hidden', '.hidden', '.clearfix', '.container', '.row', '.col'];

    for (const file of cssFiles) {
      const fullPath = join(SUPER_EDITOR_STYLES_DIR, file);
      const cssText = readFileSync(fullPath, 'utf8');
      const selectors = extractTopLevelSelectors(cssText);

      for (const selector of selectors) {
        for (const generic of genericClassNames) {
          if (
            selector === generic ||
            selector.startsWith(generic + ' ') ||
            selector.startsWith(generic + ':') ||
            selector.startsWith(generic + '.')
          ) {
            violations.push({ file, selector, generic });
          }
        }
      }
    }

    if (violations.length > 0) {
      const message = violations.map((v) => `  ${v.file}: "${v.selector}" (conflicts with "${v.generic}")`).join('\n');
      expect.fail(
        `Found generic utility class names that will conflict with host app frameworks:\n${message}\n\nPrefix with "superdoc-" or "sd-" namespace`,
      );
    }
  });

  it('extractTopLevelSelectors should parse basic CSS correctly', () => {
    const css = `
      .foo { color: red; }
      .bar, .baz { color: blue; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .qux { color: green; }
    `;
    const selectors = extractTopLevelSelectors(css);
    expect(selectors).toContain('.foo');
    expect(selectors).toContain('.bar');
    expect(selectors).toContain('.baz');
    expect(selectors).toContain('.qux');
    // @keyframes should not produce selectors
    expect(selectors).not.toContain('@keyframes spin');
  });

  it('extractTopLevelSelectors should ignore nested selectors', () => {
    const css = `
      .parent {
        .child { color: red; }
      }
      a { color: blue; }
    `;
    const selectors = extractTopLevelSelectors(css);
    expect(selectors).toContain('.parent');
    expect(selectors).toContain('a');
    // .child is nested, should not appear
    expect(selectors).not.toContain('.child');
  });

  it('should namespace all @keyframes names with superdoc- or sd-', () => {
    const cssFiles = findCssFiles(SUPER_EDITOR_STYLES_DIR);
    const violations = [];

    for (const file of cssFiles) {
      const fullPath = join(SUPER_EDITOR_STYLES_DIR, file);
      const cssText = readFileSync(fullPath, 'utf8');
      const keyframePattern = /@keyframes\s+([\w-]+)/g;
      let match;

      while ((match = keyframePattern.exec(cssText)) !== null) {
        const name = match[1];
        if (!name.startsWith('superdoc-') && !name.startsWith('sd-')) {
          violations.push({ file, keyframe: name });
        }
      }
    }

    if (violations.length > 0) {
      const message = violations.map((v) => `  ${v.file}: @keyframes ${v.keyframe}`).join('\n');
      expect.fail(
        `Found @keyframes names not prefixed with "superdoc-" or "sd-":\n${message}\n\nRename to start with "superdoc-" or "sd-" to avoid collisions with host apps`,
      );
    }
  });

  it('should not reintroduce legacy un-namespaced class names in Vue SFC styles', () => {
    const vueTargets = [
      { root: SUPER_EDITOR_V1_DIR, label: 'super-editor' },
      { root: SUPERDOC_COMPONENTS_DIR, label: 'superdoc' },
    ];
    const blockedClassNames = [
      '.button-icon',
      '.toolbar-item',
      '.button-label',
      '.dropdown-caret',
      '.disabled',
      '.is-disabled',
      '.active',
      '.selected',
      '.error',
      '.row',
      '.submit',
      '.submit-btn',
      '.option',
      '.option-row',
      '.option-item',
      '.option-state',
      '.toolbar-button',
      '.toolbar-icon',
      '.caret',
      '.visually-hidden',
    ];
    const allowlistedLegacyClassUsages = new Set([
      // pdf.js applies `.selected` on text-layer highlights; keep compatibility.
      'superdoc/PdfViewer/PdfViewerPage.vue::.selected',
    ]);
    const violations = [];

    for (const target of vueTargets) {
      const vueFiles = findVueFiles(target.root);
      for (const file of vueFiles) {
        const fullPath = join(target.root, file);
        const vueText = readFileSync(fullPath, 'utf8');
        const styleBlocks = extractStyleBlocks(vueText);

        for (const block of styleBlocks) {
          for (const blocked of blockedClassNames) {
            const blockedPattern = new RegExp(`${escapeRegExp(blocked)}(?![\\w-])`);
            if (blockedPattern.test(block)) {
              const allowlistKey = `${target.label}/${file}::${blocked}`;
              if (allowlistedLegacyClassUsages.has(allowlistKey)) {
                continue;
              }
              violations.push({
                file: `${target.label}/${file}`,
                blocked,
              });
              break;
            }
          }
        }
      }
    }

    if (violations.length > 0) {
      const message = violations.map((v) => `  ${v.file}: contains legacy "${v.blocked}"`).join('\n');
      expect.fail(
        `Found legacy un-namespaced class names in Vue SFC styles:\n${message}\n\nUse sd-* class names instead.`,
      );
    }
  });
});
