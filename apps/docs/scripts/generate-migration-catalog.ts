/**
 * Projects the typed migration catalog into published artifacts.
 *
 * Outputs:
 *   content/docs/editor/migrate-from-v1/removed-apis.mdx - the human reference page
 *   public/migration/v1-to-v2.json         - the machine-readable mapping
 *
 * AIDEV-NOTE: Both outputs are generated and tracked.
 * `tests/migration-catalog.test.mjs` regenerates and compares, so editing
 * either by hand fails CI. Change `lib/migration/catalog.ts` and rerun instead.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { execFileSync } from 'node:child_process';

import { DISPOSITION_DEFINITIONS, DISPOSITION_LABELS, MIGRATION_CATALOG } from '../lib/migration/catalog';
import { readPackageVersion, readSurvivingSurface, type SurvivingSurface } from '../lib/migration/exports';
import type { MigrationDisposition, MigrationEntry, MigrationSurface } from '../lib/migration/types';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pagePath = resolve(appRoot, 'content/docs/editor/migrate-from-v1/removed-apis.mdx');
const jsonPath = resolve(appRoot, 'public/migration/v1-to-v2.json');
const v2PackageJson = resolve(appRoot, '../../packages/superdoc/package.json');
const v2Entry = resolve(appRoot, '../../packages/superdoc/src/public/index.ts');

const SURFACE_LABELS: Record<MigrationSurface, string> = {
  package: 'Package',
  'editor-internals': 'Editor internals',
  'custom-ui': 'Custom UI',
  extensions: 'Extensions',
  collaboration: 'Collaboration',
  converter: 'Converter and archives',
};

const DISPOSITION_LEGEND = (Object.keys(DISPOSITION_DEFINITIONS) as MigrationDisposition[])
  .map((disposition) => `- **${DISPOSITION_LABELS[disposition]}** — ${DISPOSITION_DEFINITIONS[disposition]}`)
  .join('\n');

/** Escapes pipes so a replacement path never breaks the Markdown table. */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function code(value: string): string {
  return `\`${cell(value)}\``;
}

/**
 * Renders a migration table.
 *
 * AIDEV-NOTE: `withSymptom` exists because the import tables share one symptom
 * across all their rows (module resolution fails; the named export is absent),
 * so repeating it 32 times is noise -- that text is stated once in the section
 * prose instead. The runtime table mixes four distinct symptoms, and telling
 * them apart is the whole point of that section, so it renders the column.
 */
function renderTable(entries: MigrationEntry[], { withSymptom = false } = {}): string {
  const rows = entries.map((entry) => {
    const replacement = entry.v2 ? code(entry.v2) : '_None_';
    // Grouped entries carry their concrete symbols in `v1Symbols`; list them so
    // a reader searching the page for one name still lands on the right row.
    const symbols = entry.v1Symbols?.length ? `${entry.v1Symbols.map(code).join(', ')}. ` : '';
    const notes = entry.notes ? cell(entry.notes) : '';
    const link = entry.docsPath ? ` [Read more](${entry.docsPath})` : '';
    const columns = [code(entry.v1), replacement, DISPOSITION_LABELS[entry.disposition]];
    if (withSymptom) columns.push(cell(entry.symptom));
    columns.push(`${symbols}${notes}${link}`);
    return `| ${columns.join(' | ')} |`;
  });

  const headers = withSymptom ? ['v1', 'v2', 'Migration', 'What you see', 'Notes'] : ['v1', 'v2', 'Migration', 'Notes'];

  return [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows].join('\n');
}

function renderPage(v2Version: string, surviving: SurvivingSurface): string {
  const importFailures = MIGRATION_CATALOG.entries.filter(
    (entry) => entry.failureMode === 'unresolved-path' || entry.failureMode === 'missing-export',
  );
  const runtime = MIGRATION_CATALOG.entries.filter(
    (entry) => entry.failureMode === 'runtime' || entry.failureMode === 'config-silent',
  );

  // AIDEV-NOTE: Buckets are derived from `failureMode` and partitioned so every
  // import failure lands in exactly one of them. An earlier version selected by
  // id prefix (`subpath.` / `root.`), which silently dropped
  // `subpath-export.*` from the page while leaving it in the JSON. Do not
  // reintroduce prefix matching here: `tests/migration-catalog.test.mjs` asserts
  // that every catalog entry reaches the page.
  const subpaths = importFailures.filter((entry) => entry.failureMode === 'unresolved-path');
  const nameFailures = importFailures.filter((entry) => entry.failureMode === 'missing-export');
  const droppedFromSurviving = nameFailures.filter((entry) => entry.v1.includes('/'));
  const rootExports = nameFailures.filter((entry) => !entry.v1.includes('/'));

  const bySurface = new Map<MigrationSurface, MigrationEntry[]>();
  for (const entry of rootExports) {
    const group = bySurface.get(entry.surface) ?? [];
    group.push(entry);
    bySurface.set(entry.surface, group);
  }

  const surfaceSections = [...bySurface.entries()]
    .map(([surface, entries]) => `#### ${SURFACE_LABELS[surface]}\n\n${renderTable(entries)}`)
    .join('\n\n');

  const droppedSection = droppedFromSurviving.length
    ? `### Names dropped from subpaths that still exist

A subpath surviving is not the same as its exports surviving. These paths still resolve, so only the named import fails.

${renderTable(droppedFromSurviving, { withSymptom: true })}
`
    : '';

  const survivingSubpaths = surviving.codeSubpaths.map((subpath) => `\`superdoc${subpath.slice(1)}\``).join(', ');
  const survivingExports = surviving.runtimeExports.map((name) => `\`${name}\``).join(', ');
  const mechanicalCount = MIGRATION_CATALOG.entries.filter((entry) => entry.disposition === 'mechanical').length;

  return `---
title: Removed in v2
navTitle: Removed APIs
description: Every v1 import and editor internal that no longer works in SuperDoc v2, and what replaces it.
---

{/* Generated by scripts/generate-migration-catalog.ts. Edit lib/migration/catalog.ts instead. */}
{/* Media decision: none. This is a lookup surface — readers arrive searching for a symbol and need the table row, not a diagram. */}

Upgrading breaks three things, and they surface at different times. Removed subpaths always fail module resolution. Removed root exports fail the build under ESM and TypeScript, but a CommonJS \`require\` binds them to \`undefined\` and fails later at the call site. Configuration and editor internals that v2 no longer honors fail only once the editor is running, often without naming SuperDoc at all.

Work through them in that order. The import failures are the loudest, and fixing them tells you where the rest of the work is.

This page describes \`superdoc@${v2Version}\` compared against \`superdoc@${MIGRATION_CATALOG.v1Version}\`. A machine-readable version is available at [\`/migration/v1-to-v2.json\`](/migration/v1-to-v2.json).

## How to read the Migration column

${DISPOSITION_LEGEND}

${mechanicalCount === 0 ? 'Nothing here is currently classified as Mechanical, so this page is an inventory and a decision aid, not a codemod. Do not apply any of it as an automated find-and-replace.' : `${mechanicalCount} of these are Mechanical. Everything else needs reading and re-verification.`}

## Search the reference

<MigrationExplorer />

Every entry is also listed in full below, grouped by when the failure surfaces. The tables are the canonical form: they work without JavaScript and are what \`llms.txt\` and search engines read.

## Your application no longer imports

### Removed package subpaths

v1 published ${MIGRATION_CATALOG.v1SubpathCount} code subpaths. v2 publishes ${surviving.codeSubpaths.length}: ${survivingSubpaths}.

${renderTable(subpaths)}

A removed subpath fails module resolution in every module system, because it is absent from the package's exports map. Do not work around it by importing an internal package: names such as \`@superdoc/v2-host\` and \`@superdoc/document-api-v2-adapter\` are implementation details with no compatibility guarantee.

### Removed root exports

v1 exported ${MIGRATION_CATALOG.v1ExportCount} runtime values from the package root. v2 exports ${surviving.runtimeExports.length}: ${survivingExports}.

Everything below was removed. \`defineSuperDocExtension\` is the one value v2 adds.

${surfaceSections}

A missing named export is only reliably caught at build time under ESM and TypeScript. In CommonJS, \`const { Editor } = require('superdoc')\` binds \`undefined\` and fails later wherever the value is used, so a CommonJS integration can appear to upgrade cleanly and then break at the call site.

${droppedSection}
## Your application imports successfully, then fails when it runs

These compile. Some of them typecheck against the v2 configuration. They fail, or do nothing, once the editor is running.

${renderTable(runtime, { withSymptom: true })}

The editor internals are the harder half. v2 exposes \`commands\`, \`state\`, and \`view\` as \`null\` rather than removing them, so reading a property off one raises a generic null-property error that names your command and not SuperDoc. Optional chaining is worse: it turns the same mistake into a silent no-op that never errors at all.

Exact error wording varies by browser, bundler, and minifier. Treat the "What you see" column as symptoms to recognize, not as strings to match on.

## Before you start

Collaboration is not a configuration change. v2 rooms use a different document format, v2 owns the provider and \`Y.Doc\`, and a v2 editor must never be pointed at an existing v1 room. If your application uses collaboration, plan that migration separately before upgrading anything else.

Continue with the [v1 migration guide](/editor/migrate-from-v1/overview) for the full upgrade path, or the [Document API mental model](/document-api/mental-model) to understand what replaces direct editor access.
`;
}

function renderJson(v2Version: string): string {
  const payload = {
    v1Version: MIGRATION_CATALOG.v1Version,
    v2Version,
    dispositions: DISPOSITION_DEFINITIONS,
    // `docsMarker` is how the catalog test checks that a `docsPath` teaches the
    // row. It says nothing about the migration, so it stays out of the artifact
    // agents read.
    entries: MIGRATION_CATALOG.entries.map(({ docsMarker: _docsMarker, ...entry }) => entry),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

const v2Version = await readPackageVersion(v2PackageJson);
const surviving = await readSurvivingSurface(v2PackageJson, v2Entry);

// AIDEV-NOTE: Formatting the output here (rather than emitting pre-formatted
// text) keeps the repository formatter as the single formatting authority.
// `vp fmt --check` covers apps/docs, so a generator that emitted its own table
// padding would drift the moment the `fmt` block in vite.config.ts changed.
// `--stdin-filepath` is what tells Oxfmt which parser and options apply.
function format(source: string, filepath: string): string {
  // Run the JavaScript CLI through Node so pnpm's Windows `.cmd` shim is never involved.
  const vitePlusCli = fileURLToPath(import.meta.resolve('vite-plus/bin'));
  return execFileSync(process.execPath, [vitePlusCli, 'fmt', '--stdin-filepath', filepath], {
    input: source,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}

await mkdir(dirname(jsonPath), { recursive: true });
await writeFile(pagePath, format(renderPage(v2Version, surviving), pagePath), 'utf8');
await writeFile(jsonPath, format(renderJson(v2Version), jsonPath), 'utf8');

console.log(`Generated ${MIGRATION_CATALOG.entries.length} migration entries.`);
