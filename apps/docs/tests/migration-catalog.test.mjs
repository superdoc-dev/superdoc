import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { DISPOSITION_DEFINITIONS, MIGRATION_CATALOG } from '../lib/migration/catalog.ts';
import {
  collectFeaturesByStatus,
  parseRuntimeExports,
  parseTypeExports,
  readCodeSubpaths,
  resolveConfigPath,
} from '../lib/migration/exports.ts';

const v1SurfaceUrl = new URL('../lib/migration/v1-surface.json', import.meta.url);
const v2PackageJson = fileURLToPath(new URL('../../../packages/superdoc/package.json', import.meta.url));
const v2EntryUrl = new URL('../../../packages/superdoc/src/public/index.ts', import.meta.url);

const v1Surface = JSON.parse(await readFile(v1SurfaceUrl, 'utf8'));
const v2EntrySource = await readFile(v2EntryUrl, 'utf8');
const v2RuntimeExports = parseRuntimeExports(v2EntrySource);
const v2TypeExports = parseTypeExports(v2EntrySource);
const v2CodeSubpaths = await readCodeSubpaths(v2PackageJson);

const catalogById = new Map(MIGRATION_CATALOG.entries.map((entry) => [entry.id, entry]));

test('catalog entry ids are unique', () => {
  assert.equal(catalogById.size, MIGRATION_CATALOG.entries.length, 'Duplicate migration catalog id');
});

test('catalog records the v1 version it was derived from', () => {
  assert.equal(MIGRATION_CATALOG.v1Version, v1Surface.version);
});

// Prose in the generated page quotes these counts. Pinning them to the snapshot
// stops the page from asserting a v1 surface the snapshot does not describe.
test('catalog v1 counts match the committed v1 surface', () => {
  assert.equal(MIGRATION_CATALOG.v1ExportCount, v1Surface.runtimeExports.length);
  assert.equal(MIGRATION_CATALOG.v1SubpathCount, v1Surface.codeSubpaths.length);
});

// The two tests below are the drift gate. They fail when the v2 package changes
// its public surface without a corresponding catalog update, which is the exact
// way migration documentation silently goes stale.
test('every removed v1 runtime export is documented', () => {
  const surviving = new Set(v2RuntimeExports);
  const removed = v1Surface.runtimeExports.filter((name) => !surviving.has(name));
  const documented = new Set(
    MIGRATION_CATALOG.entries.filter((entry) => entry.id.startsWith('root.')).map((entry) => entry.v1),
  );

  const missing = removed.filter((name) => !documented.has(name));
  assert.deepEqual(missing, [], `Removed v1 exports missing from the migration catalog: ${missing.join(', ')}`);
});

test('every removed v1 subpath is documented', () => {
  const surviving = new Set(v2CodeSubpaths);
  const removed = v1Surface.codeSubpaths.filter((subpath) => !surviving.has(subpath));
  const documented = new Set(
    MIGRATION_CATALOG.entries.filter((entry) => entry.id.startsWith('subpath.')).map((entry) => entry.v1),
  );

  const missing = removed.filter((subpath) => !documented.has(`superdoc${subpath.slice(1)}`));
  assert.deepEqual(missing, [], `Removed v1 subpaths missing from the migration catalog: ${missing.join(', ')}`);
});

// A subpath surviving is not the same as its exports surviving. `superdoc/ui`
// exists in both versions, but v2 rebuilt it as a v2-native controller rather
// than re-exporting v1, so names disappeared from a path that still resolves.
//
// AIDEV-NOTE: Comparing only export-map KEYS misses this entirely: the subpath
// is filtered out of `removed` above, so a consumer importing a dropped name
// from a surviving path gets a build error the catalog never mentions.
test('names dropped from surviving subpaths are documented', async () => {
  const v2SubpathEntries = {
    'superdoc/ui': '../../../packages/superdoc/src/public/ui.ts',
    'superdoc/ui/react': '../../../packages/superdoc/src/public/ui-react.ts',
  };

  // Resolved against structured data, not prose. `v1Symbols` exists so a
  // grouped entry stays addressable by exact name.
  const documented = new Set();
  for (const entry of MIGRATION_CATALOG.entries) {
    documented.add(entry.v1);
    for (const symbol of entry.v1Symbols ?? []) documented.add(symbol);
  }

  for (const [subpath, entryPath] of Object.entries(v2SubpathEntries)) {
    const v1Names = v1Surface.subpathExports?.[subpath];
    assert.ok(v1Names, `The v1 surface snapshot records no export list for the surviving subpath ${subpath}`);

    const source = await readFile(new URL(entryPath, import.meta.url), 'utf8');
    const surviving = new Set([...parseRuntimeExports(source), ...parseTypeExports(source)]);

    const missing = v1Names.filter((name) => !surviving.has(name)).filter((name) => !documented.has(name));

    assert.deepEqual(
      missing,
      [],
      `${subpath} no longer exports ${missing.length} name(s) the v1 subpath did, and the catalog does not ` +
        `document them: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`,
    );
  }
});

test('the catalog does not claim a surviving export was removed', () => {
  const surviving = new Set(v2RuntimeExports);
  const wrong = MIGRATION_CATALOG.entries
    .filter((entry) => entry.id.startsWith('root.'))
    .filter((entry) => surviving.has(entry.v1))
    .map((entry) => entry.v1);

  assert.deepEqual(wrong, [], `Catalog claims these were removed, but v2 still exports them: ${wrong.join(', ')}`);
});

test('the catalog does not claim a surviving subpath was removed', () => {
  const surviving = new Set(v2CodeSubpaths.map((subpath) => `superdoc${subpath.slice(1)}`));
  const wrong = MIGRATION_CATALOG.entries
    .filter((entry) => entry.id.startsWith('subpath.'))
    .filter((entry) => surviving.has(entry.v1))
    .map((entry) => entry.v1);

  assert.deepEqual(wrong, [], `Catalog claims these were removed, but v2 still exports them: ${wrong.join(', ')}`);
});

test('unsupported entries offer no v2 replacement', () => {
  for (const entry of MIGRATION_CATALOG.entries) {
    if (entry.disposition !== 'unsupported') continue;
    assert.equal(entry.v2, null, `${entry.id} is unsupported but names a v2 replacement`);
  }
});

test('mechanical and redesign entries name a v2 replacement', () => {
  for (const entry of MIGRATION_CATALOG.entries) {
    if (entry.disposition === 'unsupported') continue;
    assert.ok(entry.v2, `${entry.id} is ${entry.disposition} but names no v2 replacement`);
  }
});

// Compiled-fixture policy. A `mechanical` label promises a drop-in
// substitution, and the checks below only reach bare-package targets: an entry
// pointing at `superdoc.ui` or `config.modules.ai` would carry the label with
// nothing proving the substitution compiles.
//
// AIDEV-NOTE: Until a mapping can be validated by building real consumer code
// against it, no entry may be mechanical. Do not relax this to unblock an
// entry - add the fixture, or classify the entry as `redesign`. The generated
// page reads the same count and tells readers this is not a codemod.
test('no entry is mechanical without compiled-fixture validation', () => {
  const mechanical = MIGRATION_CATALOG.entries.filter((entry) => entry.disposition === 'mechanical').map((e) => e.id);

  assert.deepEqual(
    mechanical,
    [],
    `Mechanical entries require a compiled consumer fixture, which does not exist yet: ${mechanical.join(', ')}. ` +
      'Classify these as `redesign` until fixture validation lands.',
  );
});

// A `mechanical` label promises a drop-in substitution. For a bare package
// specifier that means every name the v1 path exported must still be reachable
// at the v2 target.
//
// AIDEV-NOTE: `superdoc/types` was originally labelled mechanical -> `superdoc`.
// The target resolves, so a path-existence check passes it. But none of the 116
// names the v1 subpath re-exported exist on the v2 root, so following the
// mapping broke every application that used it. Checking that the NAMES survive
// is the only version of this test that catches the real defect.
test('mechanical package replacements preserve the exported names', () => {
  const survivingSubpaths = new Set(v2CodeSubpaths.map((subpath) => `superdoc${subpath.slice(1)}`));
  survivingSubpaths.add('superdoc');

  for (const entry of MIGRATION_CATALOG.entries) {
    if (entry.disposition !== 'mechanical') continue;
    if (!entry.v2?.startsWith('superdoc') || entry.v2.includes('.')) continue;

    assert.ok(
      survivingSubpaths.has(entry.v2),
      `${entry.id} is mechanical and points at ${entry.v2}, which v2 does not publish`,
    );

    const v1Names = v1Surface.subpathExports?.[entry.v1];
    assert.ok(
      v1Names,
      `${entry.id} is mechanical, but the v1 surface snapshot records no export list for ${entry.v1}. ` +
        'A mechanical label cannot be verified without one; use `redesign` or add the list.',
    );

    const surviving = new Set(v2RuntimeExports.concat(v2TypeExports));
    const missing = v1Names.filter((name) => !surviving.has(name));
    assert.deepEqual(
      missing,
      [],
      `${entry.id} is mechanical, but ${missing.length}/${v1Names.length} names from ${entry.v1} ` +
        `do not exist at ${entry.v2}: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`,
    );
  }
});

// Config-path replacements are easy to invent. Every `config.*` target must
// resolve as a declared property chain under the v2 `Config` interface.
//
// AIDEV-NOTE: This proves the field is DECLARED, not that v2 honors it.
// Capability claims belong to the feature matrix, not this check.
test('config replacements resolve against the v2 Config interface', async () => {
  const configSource = await readFile(
    new URL('../../../packages/superdoc/src/core/types/index.ts', import.meta.url),
    'utf8',
  );

  for (const entry of MIGRATION_CATALOG.entries) {
    if (!entry.v2?.startsWith('config.')) continue;

    assert.ok(
      resolveConfigPath(configSource, entry.v2),
      `${entry.id} points at ${entry.v2}, which does not resolve as a property chain under the v2 Config`,
    );
  }
});

// A field existing is not the same as a feature shipping. Any entry naming a
// not-shipped feature must say so rather than presenting it as a working
// replacement.
//
// AIDEV-NOTE: Parsed with the TypeScript AST, not a regex. A regex over
// `feature:`/`status:` pairs is sensitive to quote style and line breaks, and a
// PARTIAL miss is the dangerous case because the guard could silently stop
// covering whichever feature was reformatted. Parser behavior is tested
// independently below, so an empty not-shipped set is a valid matrix state.
test('no entry recommends a not-shipped v2 feature as its replacement', async () => {
  const superDocSource = await readFile(
    new URL('../../../packages/superdoc/src/core/SuperDoc.ts', import.meta.url),
    'utf8',
  );

  const notShipped = collectFeaturesByStatus(superDocSource, 'not-shipped');

  // Map a catalog entry to the feature id it would be steering consumers toward.
  const claimed = { 'root.ContextMenu': 'shell.context-menu', 'root.SlashMenu': 'shell.context-menu' };

  // Every feature this test claims to police must exist in the matrix, or the
  // mapping above has gone stale and the loop below would quietly do nothing.
  const known = new Set([...notShipped, ...collectFeaturesByStatus(superDocSource, 'supported')]);
  for (const feature of new Set(Object.values(claimed))) {
    assert.ok(known.has(feature), `${feature} is not in getV2FeatureMatrix(); this guard's mapping is stale`);
  }

  for (const [id, feature] of Object.entries(claimed)) {
    if (!notShipped.has(feature)) continue;

    const entry = catalogById.get(id);
    assert.ok(entry, `${id} is missing from the catalog`);
    assert.equal(
      entry.disposition,
      'unsupported',
      `${feature} is not-shipped, so ${id} must be unsupported rather than pointing at it`,
    );
  }
});

// Every entry must reach the human page as a table row, not just the JSON.
//
// AIDEV-NOTE: The generator once bucketed page rows by id prefix (`subpath.` /
// `root.`), so adding a `subpath-export.*` entry put it in the catalog and the
// JSON while it silently never rendered. The catalog-level guards all passed
// because they inspect the catalog, not the output.
//
// Matches the leading cell of a rendered row rather than a bare substring:
// `Editor` also appears in this page's prose, so a substring check would stay
// green if its row were dropped.
test('every catalog entry reaches the generated page', async () => {
  const page = await readFile(
    new URL('../content/docs/editor/migrate-from-v1/removed-apis.mdx', import.meta.url),
    'utf8',
  );

  // renderTable() emits `| <first cell> | …`, with code cells wrapped in backticks.
  const renderedCounts = new Map();
  for (const match of page.matchAll(/^\| (?:`([^`]+)`|([^|`][^|]*?)) +\|/gm)) {
    const cell = (match[1] ?? match[2]).trim();
    renderedCounts.set(cell, (renderedCounts.get(cell) ?? 0) + 1);
  }

  // Counted rather than set-tested: two entries sharing a `v1` value would both
  // be satisfied by a single rendered row, so membership alone does not prove
  // one-to-one coverage.
  const catalogCounts = new Map();
  for (const entry of MIGRATION_CATALOG.entries) {
    catalogCounts.set(entry.v1, (catalogCounts.get(entry.v1) ?? 0) + 1);
  }

  const missing = [...catalogCounts.entries()]
    .filter(([v1, count]) => (renderedCounts.get(v1) ?? 0) < count)
    .map(([v1, count]) => `${v1} (${renderedCounts.get(v1) ?? 0}/${count} rows)`);

  assert.deepEqual(missing, [], `These catalog entries render no table row on the page: ${missing.join(', ')}`);
});

test('citation presentation guidance uses the visual handle API', () => {
  const entry = catalogById.get('runtime.citations.presentation');

  assert.ok(entry, 'runtime.citations.presentation is missing from the catalog');
  assert.match(entry.notes, /ctx\.visuals\.inlineBox\([^)]*\)/);
  assert.match(entry.notes, /\.replace\(\[target\]\)/);
});

test('citation replacement guidance requires a collapsed insertion target', () => {
  const entry = catalogById.get('runtime.commands.replaceWithFieldAnnotation.citation');

  assert.ok(entry, 'runtime.commands.replaceWithFieldAnnotation.citation is missing from the catalog');
  assert.match(entry.notes, /citations\.insert.*accepts only a collapsed target/);
  assert.match(entry.notes, /derive .*insertion caret.*delete .*then pass the resulting collapsed caret/);
});

// A grouped entry must expose its concrete symbols as data. Otherwise a tool
// resolving a name it found in consumer source has to scrape English `notes`,
// which defeats the point of publishing JSON.
//
// AIDEV-NOTE: `MigrationEntry` is a discriminated union, so the compiler already
// rejects `isGroup` and `v1Symbols` appearing apart or an empty `v1Symbols`.
// This test covers the JS callers that read the published JSON, where no type
// applies. It is keyed on the declared `isGroup` flag and deliberately ignores
// the wording of `v1`: an earlier version inferred grouping from "contains a
// space", which made a rename like `uiTypeExports` change the invariant being
// enforced even though the entry's meaning had not changed.
test('grouped entries list their symbols as structured data', () => {
  for (const entry of MIGRATION_CATALOG.entries) {
    if (entry.isGroup) {
      assert.ok(
        entry.v1Symbols?.length,
        `${entry.id} is marked isGroup but lists no v1Symbols, so its names are not addressable in the JSON`,
      );
    }

    // Presence, not truthiness: `v1Symbols: []` would otherwise skip this
    // assertion and let a grouped entry ship unmarked.
    if (entry.v1Symbols !== undefined) {
      assert.equal(
        entry.isGroup,
        true,
        `${entry.id} lists v1Symbols but is not marked isGroup; readers cannot tell whether v1 is a real symbol`,
      );
      assert.ok(
        entry.v1Symbols.length > 0,
        `${entry.id} declares an empty v1Symbols; omit the field or list the names it covers`,
      );
    }
  }
});

// Every name the surviving-subpath comparison finds must be resolvable by an
// exact lookup, not only by substring-matching prose.
test('dropped subpath names are addressable in the published JSON', async () => {
  const addressable = new Set();
  for (const entry of MIGRATION_CATALOG.entries) {
    addressable.add(entry.v1);
    for (const symbol of entry.v1Symbols ?? []) addressable.add(symbol);
  }

  const source = await readFile(new URL('../../../packages/superdoc/src/public/ui.ts', import.meta.url), 'utf8');
  const surviving = new Set([...parseRuntimeExports(source), ...parseTypeExports(source)]);

  const missing = (v1Surface.subpathExports?.['superdoc/ui'] ?? [])
    .filter((name) => !surviving.has(name))
    .filter((name) => !addressable.has(name));

  assert.deepEqual(missing, [], `Dropped names not addressable by exact lookup in the JSON: ${missing.join(', ')}`);
});

// The parsers replaced regexes that silently missed valid forms. These pin the
// forms that motivated the change, so a future refactor cannot quietly narrow
// them again.
test('the export parser handles every facade declaration form', () => {
  const source = [
    'export function NewApi() {}',
    'export class NewClass {}',
    'export enum NewEnum { A }',
    'export const NewConst = 1;',
    'export type NewType = string;',
    'export interface NewInterface {}',
    "export { Named, Renamed as Alias } from './x';",
    "export type { NamedType } from './y';",
  ].join('\n');

  assert.deepEqual(parseRuntimeExports(source), ['Alias', 'Named', 'NewApi', 'NewClass', 'NewConst', 'NewEnum']);
  assert.deepEqual(parseTypeExports(source), ['NamedType', 'NewInterface', 'NewType']);
});

test('the feature-matrix parser is insensitive to formatting', () => {
  const forms = {
    multiline: "const m = [{ feature: 'a.b',\n  status: 'not-shipped',\n  reason: 'x' }];",
    oneLine: "const m = [{ feature: 'a.b', status: 'not-shipped' }];",
    doubleQuoted: 'const m = [{ feature: "a.b", status: "not-shipped" }];',
    reorderedKeys: "const m = [{ status: 'not-shipped', feature: 'a.b' }];",
  };

  for (const [form, source] of Object.entries(forms)) {
    assert.ok(collectFeaturesByStatus(source, 'not-shipped').has('a.b'), `Missed the ${form} form`);
  }
});

test('config path resolution rejects paths that do not exist', async () => {
  const configSource = await readFile(
    new URL('../../../packages/superdoc/src/core/types/index.ts', import.meta.url),
    'utf8',
  );

  for (const valid of ['config.toolbar', 'config.modules.ai', 'config.modules.comments']) {
    assert.ok(resolveConfigPath(configSource, valid), `${valid} should resolve`);
  }
  // Each of these has a real leaf segment, so a leaf-only check would pass them.
  for (const invalid of ['config.notReal.contextMenu', 'config.modules.notReal.ai', 'config.completelyWrong.toolbar']) {
    assert.equal(resolveConfigPath(configSource, invalid), false, `${invalid} should not resolve`);
  }

  // `ui?: false | UIConfig` is an opt-out union. Without union traversal the
  // chain stopped at `config.ui`, so every path beneath it was unverifiable and
  // the catalog dodged the guard by omitting the `config.` prefix instead.
  assert.ok(
    resolveConfigPath(configSource, 'config.ui.contextMenu.customItems'),
    'config.ui.contextMenu.customItems should resolve through the opt-out union',
  );
  assert.equal(
    resolveConfigPath(configSource, 'config.ui.contextMenu.notReal'),
    false,
    'a wrong leaf under a union branch should still fail',
  );

  // A union with more than one object-like branch cannot say which shape a path
  // means, so it fails closed rather than silently resolving against the first.
  const ambiguous = [
    'interface Config { ambiguous?: LeftShape | RightShape }',
    'interface LeftShape { shared?: { leaf?: string } }',
    'interface RightShape { shared?: { other?: string } }',
  ].join('\n');
  assert.equal(
    resolveConfigPath(ambiguous, 'config.ambiguous.shared'),
    false,
    'a multi-object union should not resolve to an arbitrary branch',
  );
});

// An `unsupported` entry claims no v2 equivalent exists. If its own notes then
// steer the reader to a concrete v2 API, one of the two is wrong, and migration
// tooling reading the JSON gets the opposite answer from the human reading the
// page.
//
// AIDEV-NOTE: `root.SuperEditor` shipped this way — `v2: null` while its notes
// said "Mount `SuperDoc` against a selector". The four entries listed below are
// deliberate: they name a v2 surface only to explain why it is NOT a
// replacement. Adding to this list needs the same justification in the entry's
// notes.
test('unsupported entries do not quietly name a replacement', () => {
  const explained = new Set(['subpath.converter', 'root.SuperConverter']);

  const contradictory = MIGRATION_CATALOG.entries
    .filter((entry) => entry.disposition === 'unsupported' && !explained.has(entry.id))
    .filter((entry) => /`(SuperDoc|superdoc\.[\w.]+|config\.[\w.]+)`/.test(entry.notes ?? ''))
    .map((entry) => entry.id);

  assert.deepEqual(
    contradictory,
    [],
    `These are marked unsupported but their notes point at a v2 API: ${contradictory.join(', ')}. ` +
      'Either reclassify as `redesign`, or say in the notes why that surface is not a replacement.',
  );
});

test('every entry describes an observable symptom', () => {
  for (const entry of MIGRATION_CATALOG.entries) {
    assert.ok(entry.symptom.length > 0, `${entry.id} has no symptom`);
  }
});

// Symptoms are the page's diagnostic value: they are what a consumer searches
// for when something breaks. They previously lived only in the JSON while the
// page told readers to "treat the messages above as symptoms", referring to
// messages it never rendered.
test('runtime symptoms reach the generated page', async () => {
  const page = await readFile(
    new URL('../content/docs/editor/migrate-from-v1/removed-apis.mdx', import.meta.url),
    'utf8',
  );

  for (const entry of MIGRATION_CATALOG.entries) {
    if (entry.failureMode !== 'runtime' && entry.failureMode !== 'config-silent') continue;
    assert.ok(page.includes(entry.symptom), `${entry.id}'s symptom is missing from the generated page`);
  }
});

// The disposition legend is the automation-safety contract. If it is not on the
// page and in the JSON, a reader has no way to know `redesign` is unsafe to
// apply mechanically.
//
// AIDEV-NOTE: Assert the DEFINITION TEXT, not the heading. An earlier version
// checked only for "How to read the Migration column", so deleting the legend
// body while keeping the heading kept all tests green.
test('the disposition legend is published in both projections', async () => {
  const page = await readFile(
    new URL('../content/docs/editor/migrate-from-v1/removed-apis.mdx', import.meta.url),
    'utf8',
  );
  const json = JSON.parse(await readFile(new URL('../public/migration/v1-to-v2.json', import.meta.url), 'utf8'));

  assert.ok(json.dispositions, 'The JSON does not publish disposition definitions');

  const used = new Set(MIGRATION_CATALOG.entries.map((entry) => entry.disposition));
  for (const [disposition, definition] of Object.entries(DISPOSITION_DEFINITIONS)) {
    assert.equal(json.dispositions[disposition], definition, `The JSON definition for ${disposition} has drifted`);
    assert.ok(page.includes(definition), `The page is missing the ${disposition} definition`);
  }

  // Every disposition an entry actually uses must be explained to the reader.
  for (const disposition of used) {
    assert.ok(DISPOSITION_DEFINITIONS[disposition], `Entries use ${disposition} but it has no published definition`);
  }
});

/**
 * AIDEV-NOTE: This reads `content/docs/` from disk, and Document API reference
 * pages under `content/docs/document-api/reference/` are generated and
 * gitignored. `test:migration-catalog` therefore runs `generate:reference`
 * first; without it this test fails on a clean checkout for every entry whose
 * `docsPath` points at a generated page, while passing for anyone who happened
 * to build earlier. Do not drop that step from the script.
 */
test('every docsPath resolves to a real page', async () => {
  const contentRoot = new URL('../content/docs/', import.meta.url);

  for (const entry of MIGRATION_CATALOG.entries) {
    if (!entry.docsPath) continue;

    const relative = entry.docsPath.replace(/^\/?/, '');
    const candidates = [new URL(`${relative}.mdx`, contentRoot), new URL(`${relative}/index.mdx`, contentRoot)];

    const found = await Promise.all(
      candidates.map((url) =>
        readFile(url, 'utf8').then(
          () => true,
          () => false,
        ),
      ),
    );
    assert.ok(found.includes(true), `${entry.id} links to ${entry.docsPath}, which has no page`);
  }
});

/**
 * A "Read more" link is a promise that the page teaches the replacement this
 * row names. Resolving to *a* page is not that promise, and the gap is
 * invisible: the link works, the page is relevant, and the method the reader
 * came for is absent.
 *
 * AIDEV-NOTE: This is a ratchet, not a clean gate. The allowlist below is the
 * set of replacements v2 documents nowhere outside the generated migration
 * table. Shrink it by writing the canonical section; do not grow it to land a
 * new entry. A new entry with an undocumented replacement should either omit
 * `docsPath` or get a page first, because a link that does not teach the
 * method is worse than no link.
 */
const DOCS_PATH_TEACHES_EXEMPT = new Map([
  ['subpath.types', 'links to the mental model for the whole surface, not one export'],
  ['subpath.super-editor', 'conceptual page; `activeEditor` is shown in query-content'],
  ['root.Editor', 'conceptual page; `activeEditor` is shown in query-content'],
]);

test('a docsPath teaches the replacement its row names', async () => {
  const contentRoot = new URL('../content/docs/', import.meta.url);

  const silent = [];
  const undeclared = [];
  for (const entry of MIGRATION_CATALOG.entries) {
    if (!entry.docsPath || !entry.v2) continue;
    if (DOCS_PATH_TEACHES_EXEMPT.has(entry.id)) continue;

    const relative = entry.docsPath.replace(/^\/?/, '');
    let page = null;
    for (const candidate of [`${relative}.mdx`, `${relative}/index.mdx`]) {
      page = await readFile(new URL(candidate, contentRoot), 'utf8').then(
        (text) => text,
        () => page,
      );
    }
    if (page == null) continue; // the test above owns "the page exists"

    // Match on the final member of the first named replacement: `superdoc.ui.
    // viewport.getRect` has to be findable as `getRect`, since pages write the
    // short form once they have introduced the handle.
    //
    // Deriving only works while `v2` names a symbol. `the same operations,
    // awaited` yielded the marker `the`, which every page on the site contains,
    // so that row's link was checked by nothing. A token carrying no `.` or `/`
    // is not a member path, and rather than guess whether it is an API name or
    // an English word, the entry has to say so with `docsMarker`.
    const named = entry.v2.split(' ')[0];
    const derivable = named.includes('.') || named.includes('/');
    if (!entry.docsMarker && !derivable) {
      undeclared.push(`${entry.id} -> v2 \`${entry.v2}\` names no member path; set docsMarker`);
      continue;
    }

    const marker = entry.docsMarker ?? named.split('.').pop().replace(/\(\)$/, '');
    if (marker && !page.includes(marker)) {
      silent.push(`${entry.id} -> ${entry.docsPath} never mentions \`${marker}\``);
    }
  }

  assert.deepEqual(
    undeclared,
    [],
    `These rows link to a page but give this check nothing specific to look for:\n  ${undeclared.join('\n  ')}\n` +
      'Set docsMarker to the text the page must contain.',
  );

  assert.deepEqual(
    silent,
    [],
    `These rows link to a page that does not teach the replacement they name:\n  ${silent.join('\n  ')}\n` +
      'Point docsPath at a page that documents the method, add that section, or omit docsPath.',
  );
});

// The generated page and JSON are tracked, so a hand-edit would otherwise ship
// silently and then be overwritten by the next generator run. Compares file
// contents before and after a regeneration rather than consulting git, so the
// check behaves the same whether or not the files are staged.
//
// AIDEV-NOTE: Runs the generator in-process rather than spawning `npx tsx`.
// A bare `npx` can resolve a tsx outside the workspace or attempt a network
// install, which makes the check non-hermetic in CI. Importing it also means
// the generator's own module graph is type-checked by the same tsx run that
// executes this file.
test('generated migration outputs are current', async () => {
  const outputs = ['content/docs/editor/migrate-from-v1/removed-apis.mdx', 'public/migration/v1-to-v2.json'];
  const before = await Promise.all(outputs.map((path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')));

  await import('../scripts/generate-migration-catalog.ts');

  const after = await Promise.all(outputs.map((path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')));

  for (const [index, path] of outputs.entries()) {
    assert.equal(
      after[index],
      before[index],
      `${path} is stale. Run: pnpm --filter @superdoc/docs generate:migration-catalog`,
    );
  }
});
