import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { archiveOrigin } from '../lib/site-url.ts';

const outDirectory = fileURLToPath(new URL('../out/', import.meta.url));
const headerCss = fileURLToPath(new URL('../components/site-header.css', import.meta.url));
const siteHeader = fileURLToPath(new URL('../components/site-header.tsx', import.meta.url));
const versionMenu = fileURLToPath(new URL('../components/version-menu.tsx', import.meta.url));

test('the header grid gets exactly as many children as it declares columns', async () => {
  const source = await readFile(siteHeader, 'utf8');
  const css = await readFile(headerCss, 'utf8');

  const template = /\.sd-site-header-inner\s*\{[^}]*grid-template-columns:([^;]+);/.exec(css);
  assert.ok(template, 'the header should still be a grid with an explicit column template');
  const columns = template[1].trim().replace(/\([^)]*\)/g, '').split(/\s+/).length;

  // Read from the JSX rather than the rendered markup: the grid's own children
  // are written at one indentation level inside the nav, while the built HTML
  // inlines whole component subtrees that no cheap parser separates reliably.
  const nav = source.slice(source.indexOf("<nav className='sd-site-header-inner'"));
  const children = [...nav.slice(0, nav.indexOf('</nav>')).matchAll(/^ {8}<(\w+)(?:[^>]*className='([^']*)')?/gm)]
    .map(([, tag, cls]) => cls ?? `<${tag}>`)
    // Hidden above the mobile breakpoint, so it never takes a desktop track.
    .filter((cls) => !cls.includes('sd-site-mobile-actions'));

  // A child beyond the declared columns is auto-placed into a second row, which
  // silently overflows the fixed-height header rather than failing to build.
  assert.equal(
    children.length,
    columns,
    `the grid declares ${columns} columns but lays out ${children.length} desktop children: ${children.join(', ')}`,
  );
  assert.ok(
    children.some((cls) => cls.includes('sd-site-brand-group')),
    'the brand and version should share one grid item',
  );
});

test('the version trigger names the version it is showing', async () => {
  const html = await readFile(`${outDirectory}index.html`, 'utf8');
  const trigger = /<button[^>]*class="sd-version-trigger"[^>]*>/.exec(html);

  assert.ok(trigger, 'the version trigger should render on the home page');
  assert.match(trigger[0], /aria-label="Documentation version: SuperDoc v2"/);
  assert.match(trigger[0], /aria-expanded="false"/);
});

test('the version panel is a disclosure rather than an ARIA menu', async () => {
  const source = await readFile(versionMenu, 'utf8');

  // role="menu" promises arrow-key navigation between items. A panel holding one
  // line of text and one link does not implement that, so claiming the role
  // would leave a keyboard reader pressing keys that do nothing. Matched on JSX
  // attributes only, so the comment explaining this does not trip the check.
  const jsx = source.slice(source.indexOf('return ('));
  assert.doesNotMatch(jsx, /role=['"]menu(item)?['"]/);
  assert.match(source, /aria-expanded=\{open\}/);
  // Dismissing the panel has to put focus back, or a keyboard reader restarts
  // from the top of the page.
  assert.match(source, /trigger\.current\?\.focus\(\)/);
});

test('the version panel offers the action rather than restating the current version', async () => {
  const source = await readFile(versionMenu, 'utf8');
  const panel = source.slice(source.indexOf("<div className='sd-version-panel'>"));

  // The wordmark already reads SuperDoc and the pill already reads v2, so a row
  // naming the current version would only repeat what is on screen.
  assert.doesNotMatch(panel, /SuperDoc v2/, 'the panel should not restate the current version');
  assert.doesNotMatch(panel, /Previous versions/, 'a list of one version needs no section heading');
  assert.match(panel, /Switch to v1 docs/);
});

test('the archive link points at the configured archive origin', async () => {
  const source = await readFile(versionMenu, 'utf8');

  assert.match(source, /href=\{archiveOrigin\}/, 'the link should reuse the shared constant');
  assert.doesNotMatch(source, /https:\/\/docs-v1/, 'the origin should not be repeated as a literal');
  assert.equal(archiveOrigin, 'https://docs-v1.superdoc.dev');
});
