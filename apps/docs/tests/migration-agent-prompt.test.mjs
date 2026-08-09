import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

/**
 * The migration agent prompt exists twice: once in the React component a reader
 * copies, once in the exporter so agents reading `/md/...` get the prompt itself
 * rather than a card telling them to copy one.
 *
 * AIDEV-NOTE: Two copies can drift, and the drift is invisible. Nothing renders
 * both, so a reworded instruction in the component would leave agents following
 * the old one indefinitely. These checks pin the parts that carry meaning.
 *
 * The copies are NOT byte-identical on purpose: the component builds absolute
 * URLs from the browser origin so the prompt survives a clipboard paste, while
 * the export is served from the same origin as its own reader and uses relative
 * paths. Only the instruction text has to match.
 */

const markdownUrl = new URL('../out/md/editor/migrate-from-v1/overview.md', import.meta.url);
const pageUrl = new URL('../out/editor/migrate-from-v1/overview/index.html', import.meta.url);
// The third place the prompt ships. `app/llms-full.txt/route.ts` assembles the
// corpus through its own page filter, so a change there could drop the
// migration page while the page and per-page Markdown assertions stayed green.
const corpusUrl = new URL('../out/llms-full.txt', import.meta.url);

// React escapes these when rendering text, so compare on the escaped form.
function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const markdown = await readFile(markdownUrl, 'utf8');
const page = await readFile(pageUrl, 'utf8');
const corpus = await readFile(corpusUrl, 'utf8');

/**
 * The prompt itself, cut out of the artifact that carries it.
 *
 * AIDEV-NOTE: Scope matters more than it looks. Searching the whole page or the
 * whole guide passes whenever the words appear anywhere on it, and this guide is
 * *about* migration, so prose near the prompt uses the same vocabulary. An
 * instruction could be dropped from the prompt and still be found in the page
 * around it. Every assertion below is about the block a reader copies.
 */
function promptBlock(source, label) {
  const match = source.match(/Help me migrate this project from SuperDoc v1 to v2\.[\s\S]*?(?:<\/pre>|```)/u);
  assert.ok(match, `${label} does not contain the prompt block`);
  return match[0];
}

// The four things the prompt asks an agent to inventory, plus the four things
// it asks for instead of edits. Every directive that changes what an agent does
// belongs here; anything left out can be dropped from one copy while this stays
// green.
//
// AIDEV-NOTE: The last three are fragments, not the whole sentence, because the
// exporter hard-wraps it after "migration catalog," while the component keeps it
// on one line. A full-sentence assertion would only ever match the component.
// Keep each fragment clear of that wrap boundary.
const INSTRUCTIONS = [
  'Removed imports and package subpaths',
  'Any direct editor.* access, including commands, state, view, chain(), helpers, comments, presentationEditor, and on()',
  'Legacy configuration and collaboration usage',
  'Custom UI, extensions, and DOM selectors that require redesign',
  'Synchronous Document API reads such as doc.extract(), doc.getMarkdown(), and doc.selection.current()',
  'Do not change code yet',
  'Classify each finding using the migration catalog',
  'the smallest safe migration sequence',
  'a verification plan',
];

/**
 * AIDEV-NOTE: Checked against RENDERED output, not source text. An earlier
 * version searched the two source files with `includes()`, which passes as long
 * as the words appear anywhere — including a comment or dead code. Verified by
 * deleting an instruction from the prompt body while leaving it in a comment:
 * the old check stayed green.
 *
 * The page HTML is the rendered component. The exported Markdown is the
 * exporter's output. Both are build artifacts, so neither can be satisfied by
 * text the reader never sees.
 */
test('the rendered prompt and the exported prompt ask for the same things', () => {
  const rendered = promptBlock(page, 'the built page');
  const exported = promptBlock(markdown, 'the exported guide');
  const corpusPrompt = promptBlock(corpus, 'llms-full.txt');

  for (const instruction of INSTRUCTIONS) {
    assert.ok(rendered.includes(escapeHtml(instruction)), `the rendered page prompt is missing: ${instruction}`);
    assert.ok(exported.includes(instruction), `the exported prompt is missing: ${instruction}`);
    assert.ok(corpusPrompt.includes(instruction), `the llms-full.txt prompt is missing: ${instruction}`);
  }
});

/**
 * Not one catalog entry is a safe rename: every entry is `redesign` or
 * `unsupported`. Verified against the published catalog, which has zero
 * `mechanical` entries. That makes this the single most load-bearing sentence
 * in the prompt, since an agent editing before it classifies anything is
 * applying search-and-replace to a surface where nothing is a rename.
 */
test('the prompt tells the agent not to edit on the first pass', async () => {
  assert.match(promptBlock(markdown, 'the exported guide'), /Do not change code yet/);
  assert.match(promptBlock(page, 'the built page'), /Do not change code yet/);
  assert.match(promptBlock(corpus, 'llms-full.txt'), /Do not change code yet/);

  // The claim above, as a check rather than a comment. If a future entry is
  // genuinely a safe rename this fails, and the reasoning for the instruction
  // gets revisited instead of quietly becoming untrue.
  const catalog = JSON.parse(await readFile(new URL('../out/migration/v1-to-v2.json', import.meta.url), 'utf8'));
  // Shape-checked before filtering, down to each entry: a malformed catalog
  // should name what is wrong rather than throwing a bare TypeError from the
  // filter callback. The generator owns this file, so a bad shape means the
  // generator broke, and the failure should say which entry.
  assert.ok(Array.isArray(catalog.entries), 'the published catalog has no entries array');

  const malformed = catalog.entries
    .map((entry, index) => (entry && typeof entry.disposition === 'string' ? null : index))
    .filter((index) => index !== null);
  assert.deepEqual(malformed, [], 'these catalog entries are missing a disposition (by index)');

  const mechanical = catalog.entries.filter((entry) => entry.disposition === 'mechanical');

  assert.deepEqual(
    mechanical.map((entry) => entry.id),
    [],
    'the prompt tells agents to classify before editing because no entry is a safe rename',
  );
});

/**
 * AIDEV-NOTE: Checked against the rendered <pre>, not the component's route
 * constants. The static export has no origin at build time, so `resolvePrompt('')`
 * ships both paths into the markup as literals and the copied URLs are
 * checkable. Asserting `GUIDE_HREF` and `CATALOG_PATH` in source instead left
 * the transformation between them and the prompt unguarded: a regression in
 * `getMarkdownUrl()` or `resolvePrompt()` would cite a dead URL with both
 * constants untouched and this test green.
 */
test('the prompt names both sources of truth', () => {
  const rendered = promptBlock(page, 'the built page');
  const exported = promptBlock(markdown, 'the exported guide');
  const corpusPrompt = promptBlock(corpus, 'llms-full.txt');

  for (const source of ['/md/editor/migrate-from-v1/overview.md', '/migration/v1-to-v2.json']) {
    assert.ok(rendered.includes(source), `the rendered prompt is missing: ${source}`);
    assert.ok(exported.includes(source), `the exported prompt is missing: ${source}`);
    assert.ok(corpusPrompt.includes(source), `the llms-full.txt prompt is missing: ${source}`);
  }
});

/**
 * A prompt is only useful if its URLs resolve. The catalog in particular is a
 * generated artifact that a build change could stop emitting, leaving the
 * prompt pointing an agent at a 404.
 */
test('both sources the prompt cites are actually published', async () => {
  const catalog = JSON.parse(await readFile(new URL('../out/migration/v1-to-v2.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(catalog.entries) && catalog.entries.length > 0, 'the published catalog has no entries');

  // Reading the guide Markdown above would have thrown if it were missing.
  assert.ok(markdown.length > 0);
});

test('the card renders on the page a reader lands on', () => {
  assert.match(page, /Migrating with an AI coding agent\?/);
  assert.match(page, /Copy prompt/);
});

/**
 * The prompt tells an agent which `editor.*` surfaces to inventory, and the
 * catalog decides which ones matter. Those two drifted once already: the prompt
 * named commands, state, and view while the catalog had grown rows for helpers,
 * comments, chain(), presentationEditor, and on(), so a project using them got
 * an audit that looked complete and was not.
 *
 * AIDEV-NOTE: Keyed on the published JSON rather than the source catalog,
 * because the JSON is what the prompt actually points the agent at. Adding a
 * row for a new `editor.*` surface fails this until the prompt mentions it.
 */
test('the prompt covers every editor surface the catalog names', async () => {
  const catalog = JSON.parse(await readFile(new URL('../out/migration/v1-to-v2.json', import.meta.url), 'utf8'));

  const surfaces = new Set();
  for (const entry of catalog.entries) {
    for (const name of [entry.v1, ...(entry.v1Symbols ?? [])]) {
      const match = /^editor\.([A-Za-z]+)/.exec(name ?? '');
      if (match) surfaces.add(match[1]);
    }
  }
  assert.ok(surfaces.size > 0, 'found no editor.* surfaces in the catalog; the parse is probably broken');

  // Every copy, not just the exported one. The component keeps its own prompt,
  // so a surface added to the exporter alone would leave readers copying the
  // page with an audit that silently skips it.
  //
  // Whole words, not substrings: `includes('on')` is satisfied by the `on` in
  // "configuration", so the shortest surface name in the catalog was checked by
  // nothing. Verified by deleting `on()` from the prompt, which `includes` still
  // passed and this does not.
  //
  // AIDEV-NOTE: Scoped to the inventory instruction, not the whole block. The
  // rest of the prompt already contains `extensions` and `selectors` as
  // ordinary words, so a future `editor.extensions` row would have been
  // satisfied by line 4 while the inventory never mentioned it. Verified by
  // injecting exactly that row into the built catalog: block-wide matching
  // passed, this fails.
  const inventoryLine = (block, label) => {
    const line = block.split('\n').find((candidate) => /^\s*2\.\s/u.test(candidate));
    assert.ok(line, `${label} has no numbered editor-surface instruction in its prompt block`);
    return line;
  };

  const copies = [
    ['the built page', inventoryLine(promptBlock(page, 'the built page'), 'the built page')],
    ['the exported guide', inventoryLine(promptBlock(markdown, 'the exported guide'), 'the exported guide')],
    ['llms-full.txt', inventoryLine(promptBlock(corpus, 'llms-full.txt'), 'llms-full.txt')],
  ];

  const missing = [];
  for (const surface of [...surfaces].sort()) {
    const named = new RegExp(`\\b${surface}\\b`, 'u');
    for (const [label, block] of copies) {
      if (!named.test(block)) missing.push(`editor.${surface} (${label})`);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `The catalog documents these editor surfaces but the prompt never asks the agent to look for them:\n  ${missing.join('\n  ')}\n` +
      'Name them in every prompt copy, or the audit misses code the catalog can already classify.',
  );
});

/**
 * The other half of the same problem. `editor.*` was not the only surface the
 * catalog classifies: `runtime.documentApi.syncReads` keys on `doc.extract`,
 * `doc.getMarkdown`, and `doc.selection.current`, whose v1 spelling still
 * compiles under v2 and returns a Promise where the code expects a value. The
 * inventory never asked for them, so a project whose only breakage is a missing
 * `await` got an audit that reported nothing.
 *
 * AIDEV-NOTE: Derived from the published catalog for the same reason as the
 * editor check: adding a row for another synchronous read has to fail this
 * until the prompt names it.
 */
test('the prompt covers every synchronous Document API read the catalog names', async () => {
  const catalog = JSON.parse(await readFile(new URL('../out/migration/v1-to-v2.json', import.meta.url), 'utf8'));

  const reads = new Set();
  for (const entry of catalog.entries) {
    for (const name of [entry.v1, ...(entry.v1Symbols ?? [])]) {
      // `doc` as the root, not as a member. `editor.state.doc.descendants` is
      // ProseMirror's document, a different thing from the Document API handle,
      // and matching it would demand the prompt name a read that does not exist.
      for (const match of String(name ?? '').matchAll(/(?<![.\w])doc\.([A-Za-z]+(?:\.[A-Za-z]+)*)/gu)) {
        reads.add(match[1]);
      }
    }
  }
  assert.ok(reads.size > 0, 'found no doc.* reads in the catalog; the parse is probably broken');

  const readsLine = (block, label) => {
    const line = block.split('\n').find((candidate) => /^\s*5\.\s/u.test(candidate));
    assert.ok(line, `${label} has no numbered Document API instruction in its prompt block`);
    return line;
  };

  const copies = [
    ['the built page', readsLine(promptBlock(page, 'the built page'), 'the built page')],
    ['the exported guide', readsLine(promptBlock(markdown, 'the exported guide'), 'the exported guide')],
    ['llms-full.txt', readsLine(promptBlock(corpus, 'llms-full.txt'), 'llms-full.txt')],
  ];

  const missing = [];
  for (const read of [...reads].sort()) {
    // Escaped, because these carry dots: `selection.current` must not match
    // `selectionXcurrent`, and an unescaped dot is any character.
    const named = new RegExp(`\\bdoc\\.${read.replace(/\./gu, '\\.')}\\b`, 'u');
    for (const [label, line] of copies) {
      if (!named.test(line)) missing.push(`doc.${read} (${label})`);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `The catalog documents these Document API reads but the prompt never asks the agent to look for them:\n  ${missing.join('\n  ')}\n` +
      'Name them in every prompt copy, or a project that only needs awaits gets a clean audit.',
  );
});
