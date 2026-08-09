import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

/**
 * Colour-contrast guard for the migration explorer.
 *
 * AIDEV-NOTE: An axe run against the built page found a serious violation here:
 * the facet count badges used `opacity: 0.7`, which blended
 * `--sd-text-secondary` toward the surface and measured 3.35:1 against the
 * 4.5:1 WCAG AA floor for small text. That run was a throwaway script, so
 * nothing stopped the regression from returning.
 *
 * This computes the ratios from the token values in `app/global.css`, which is
 * enough to catch that class of defect without a browser or a build. It does
 * NOT replace axe: structural rules (labels, roles, focus order) still need a
 * real page. Run axe when changing the component's markup.
 */

const globalCssUrl = new URL('../app/global.css', import.meta.url);
const explorerCssUrl = new URL('../components/mdx/migration-explorer.module.css', import.meta.url);

const css = await readFile(globalCssUrl, 'utf8');
const explorerCss = await readFile(explorerCssUrl, 'utf8');

/**
 * Reads a `--sd-*` token for one theme.
 *
 * AIDEV-NOTE: The first version of this helper took the FIRST definition in the
 * file, which is always the light theme. That made the test structurally blind
 * to dark mode: `--sd-surface` flips to #151820 in the `.dark` block while
 * `--sd-blue-600` has no override, and the v2 replacement names rendered at
 * 2.30:1 with the test still green. Always resolve per theme.
 */
function token(name, theme) {
  const darkBlockStart = css.indexOf('.dark {');
  assert.ok(darkBlockStart > 0, 'global.css has no .dark block; this test assumes one exists');

  const scope = theme === 'dark' ? css.slice(darkBlockStart) : css.slice(0, darkBlockStart);
  const pattern = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`);

  // A token with no dark override keeps its light value, which is exactly the
  // condition that produced the bug: the palette blues are not overridden.
  const match = scope.match(pattern) ?? css.match(pattern);
  assert.ok(match, `token --${name} not found in global.css`);
  return match[1];
}

function rgb(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value;
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16));
}

function relativeLuminance(hex) {
  const [r, g, b] = rgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const AA_SMALL_TEXT = 4.5;

/**
 * The colour pairs the explorer renders, resolved per theme.
 *
 * `--sd-explorer-code` is a component-local token because the palette blues are
 * theme-independent: `blue-600` is legible on white and unreadable on the dark
 * surface, `blue-300` the reverse. The component declares its own dark value.
 */
function pairsFor(theme) {
  const explorerCode = theme === 'dark' ? token('sd-blue-300', theme) : token('sd-blue-600', theme);

  return [
    ['chip label', token('sd-text-secondary', theme), token('sd-surface', theme)],
    ['facet count', token('sd-text-tertiary', theme), token('sd-surface', theme)],
    ['selected chip label', '#ffffff', token('sd-blue-500', theme)],
    ['result count status', token('sd-text-tertiary', theme), token('sd-surface', theme)],
    ['symptom and notes prose', token('sd-text-secondary', theme), token('sd-surface', theme)],
    ['v2 replacement code', explorerCode, token('sd-surface', theme)],
    ['read-more link', explorerCode, token('sd-surface', theme)],
    ['column header', token('sd-text-tertiary', theme), token('sd-canvas', theme)],
    ['redesign pill', token('sd-blue-600', theme), token('sd-blue-50', theme)],
    ['unsupported pill', token('sd-error', theme), token('sd-error-surface', theme)],
    ['mechanical pill', token('sd-success', theme), token('sd-success-surface', theme)],
  ];
}

for (const theme of ['light', 'dark']) {
  test(`explorer text meets WCAG AA in ${theme} mode`, () => {
    for (const [label, foreground, background] of pairsFor(theme)) {
      const ratio = contrast(foreground, background);
      assert.ok(
        ratio >= AA_SMALL_TEXT,
        `${theme}: ${label} is ${foreground} on ${background} = ${ratio.toFixed(2)}:1, below the ${AA_SMALL_TEXT}:1 AA floor`,
      );
    }
  });
}

// A palette token with no `.dark` override is only safe when its background is
// equally theme-independent. The explorer declares `--sd-explorer-code` for the
// one case where it is not.
test('the explorer declares a dark value for its code colour', () => {
  assert.match(
    explorerCss,
    /:global\(\.dark\)[^{]*\{\s*--sd-explorer-code:/,
    'explorer.module.css must override --sd-explorer-code for dark mode',
  );
});

// AIDEV-NOTE: The pair list above only covers colours someone remembered to
// add. Both dark-mode failures on this component were text rules using a raw
// palette blue: the v2 code at 2.30:1 and the read-more link at 3.19:1. This
// catches the next one structurally, whether or not the list is updated.
//
// A rule that sets its OWN background is exempt: the pills pair `blue-600` with
// `blue-50`, both fixed palette values, so the ratio is theme-independent
// (6.99:1). The danger is only text that inherits the themed surface.
test('no text rule uses a palette blue over the themed surface', () => {
  const rules = [...explorerCss.matchAll(/(^|\n)\.([\w-]+)[^{]*\{([^}]*)\}/g)];
  const offenders = rules
    .filter(([, , , body]) => /^\s*color:\s*var\(--sd-blue-\d+\)/m.test(body))
    .filter(([, , , body]) => !/^\s*background:/m.test(body))
    .map(([, , selector]) => `.${selector}`);

  assert.deepEqual(
    offenders,
    [],
    'palette blues are fixed across themes and unreadable on the dark surface. ' +
      'Use --sd-explorer-code, which carries its own dark value.',
  );
});

// The specific regression axe caught. `opacity` on small text silently lowers
// contrast in a way the token values alone do not reveal, so the property is
// banned outright in this stylesheet rather than tuned to a passing value.
test('the explorer stylesheet does not dim text with opacity', () => {
  const declarations = [...explorerCss.matchAll(/^\s*opacity:\s*([\d.]+)/gm)].map((match) => Number(match[1]));
  const dimmed = declarations.filter((value) => value < 1);

  assert.deepEqual(
    dimmed,
    [],
    `opacity < 1 dims text below its token contrast. Found: ${dimmed.join(', ')}. ` +
      'Use a lighter token instead so the ratio stays measurable.',
  );
});
