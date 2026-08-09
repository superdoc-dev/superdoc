import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import JSZip from 'jszip';
import ts from 'typescript';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const contentRoot = new URL('../content/docs/', import.meta.url);
const snippetsRoot = fileURLToPath(new URL('../snippets/', import.meta.url));
const snippetsRootPrefix = snippetsRoot.endsWith('/') ? snippetsRoot : `${snippetsRoot}/`;
// Runnable examples own their typecheck and are included directly so the guide cannot drift from the app.
const examplesRoot = fileURLToPath(new URL('../../../examples/', import.meta.url));
const examplesRootPrefix = examplesRoot.endsWith('/') ? examplesRoot : `${examplesRoot}/`;
const fixturesRoot = new URL('../public/fixtures/', import.meta.url);
const runtimeConfigUrl = new URL('../config/editor-demo-runtime.json', import.meta.url);
const layoutUrl = new URL('../lib/layout.tsx', import.meta.url);
const docsHomeUrl = new URL('../components/docs-home.tsx', import.meta.url);
const pinnedV2MajorPackageInstall =
  /\b(?:pnpm add(?:\s+--global)?|npm (?:install|i|add)|yarn add|bun add)[^\n]*\s(?:superdoc|@superdoc\/[a-z0-9-]+)@(?:\^|~)?2(?:[.\w-]*)?(?=\s|$)/mu;
const editorDemoUrl = new URL('../components/embeds/editor-demo.tsx', import.meta.url);
const superdocRuntimeUrl = new URL('../components/embeds/superdoc-runtime.ts', import.meta.url);
const focusedToolbarExampleUrl = new URL('../snippets/editor/focused-built-in-toolbar.ts', import.meta.url);
const reactToolbarExampleUrl = new URL('../snippets/editor/react-custom-toolbar.tsx', import.meta.url);
const reactToolbarGuideUrl = new URL('../content/docs/editor/custom-ui/react-setup.mdx', import.meta.url);
const customCommentsExampleUrl = new URL('../snippets/editor/custom-comments.ts', import.meta.url);
const selectionViewportExampleUrl = new URL('../snippets/editor/selection-and-viewport.ts', import.meta.url);
const builtInFindReplaceExampleUrl = new URL('../snippets/editor/built-in-find-replace.ts', import.meta.url);
const customSearchExampleUrl = new URL('../snippets/editor/custom-search.ts', import.meta.url);
const customTrackedReviewExampleUrl = new URL('../snippets/editor/custom-tracked-review.ts', import.meta.url);
const customContentControlsExampleUrl = new URL('../snippets/editor/custom-content-controls.ts', import.meta.url);
const customTableControlsExampleUrl = new URL('../snippets/editor/custom-table-controls.ts', import.meta.url);
const customFormattingControlsExampleUrl = new URL('../snippets/editor/custom-formatting-controls.ts', import.meta.url);
const reviewHighlightsExampleUrl = new URL('../snippets/editor/review-highlights.ts', import.meta.url);
const customContextMenuExampleUrl = new URL('../snippets/editor/custom-context-menu.ts', import.meta.url);
const customZoomDocumentExampleUrl = new URL('../snippets/editor/custom-zoom-document.ts', import.meta.url);
const customCommandExampleUrl = new URL('../snippets/editor/custom-command.ts', import.meta.url);
const commandFailuresExampleUrl = new URL('../snippets/editor/command-failures.ts', import.meta.url);
const referenceQueryMatchExampleUrl = new URL('../snippets/document-api/reference-query-match.ts', import.meta.url);
const documentApiReferenceModelUrl = new URL('../generated/document-api-reference.json', import.meta.url);
const builtInLinksContextExampleUrl = new URL('../snippets/editor/built-in-links-context.ts', import.meta.url);
const builtInStructuredContentExampleUrl = new URL(
  '../snippets/editor/built-in-structured-content.ts',
  import.meta.url,
);
const responsiveBuiltInExampleUrl = new URL('../snippets/editor/responsive-built-in.ts', import.meta.url);
const editorConfigurationExampleUrl = new URL('../snippets/editor/editor-configuration.ts', import.meta.url);
const editorLifecycleExampleUrl = new URL('../snippets/editor/editor-lifecycle.ts', import.meta.url);
const documentManagementExampleUrl = new URL('../snippets/editor/document-management.ts', import.meta.url);
const externalSurfaceExampleUrl = new URL('../snippets/editor/external-surface.ts', import.meta.url);
const themeAndFontsExampleUrl = new URL('../snippets/editor/theme-and-fonts.ts', import.meta.url);
const reactQuickstartExampleUrl = new URL('../../../examples/react/src/App.tsx', import.meta.url);
const proofingProviderExampleUrl = new URL('../snippets/editor/proofing-provider.ts', import.meta.url);
const commentThreadExampleUrl = new URL('../snippets/document-api/comment-thread.ts', import.meta.url);
const pythonSdkExampleUrl = new URL('../snippets/headless/python-accept-changes.py', import.meta.url);
const cliExampleUrl = new URL('../snippets/headless/cli-accept-changes.sh', import.meta.url);
const toolbarCatalogUrl = new URL(
  '../../../packages/superdoc/src/internal/toolbar/compatibility-catalog.ts',
  import.meta.url,
);
const commandCatalogUrl = new URL('../../../packages/superdoc/src/public/ui/commands.ts', import.meta.url);
const superdocPackageUrl = new URL('../../../packages/superdoc/package.json', import.meta.url);
// The Document API operation inventory, taken from the canonical contract rather
// than from the generated model these tests are checking. A test that asked the
// model to agree with itself would pass no matter what the generator dropped.
// `check-documented-operations.ts` in the contract package guards the same
// invariant from the other side.
async function readContractOperationIds() {
  const { OPERATION_IDS } = await import('@superdoc/document-api');
  return new Set(OPERATION_IDS);
}
const registeredComponents = new Set([
  'Card',
  'Cards',
  'Callout',
  'CommandStateDemo',
  'CustomBoldDemo',
  'CustomUiArchitecture',
  'DocumentPreview',
  'DocumentApiNamespace',
  'DocumentApiOperation',
  'DocumentApiReferenceLanding',
  'DocsHome',
  'EditorDemo',
  'FileDownload',
  'MigrationAgentPrompt',
  'MigrationExplorer',
  'MigrationExample',
  'MigrationExampleTabs',
  'ReceiptBar',
  'RuntimeExample',
  'RuntimeExampleTabs',
]);
const editorDemoPresets = new Set(['document-modes', 'tracked-review']);

async function collectMdxFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = new URL(entry.name, directory);
      if (entry.isDirectory()) return collectMdxFiles(new URL(`${entry.name}/`, directory));
      return entry.name.endsWith('.mdx') ? [path] : [];
    }),
  );
  return files.flat();
}

function extractFrontmatter(markdown) {
  return markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u)?.[1] ?? '';
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('internal content, fixture, and media references resolve', async () => {
  const missingReferences = [];

  for (const file of await collectMdxFiles(contentRoot)) {
    const markdown = await readFile(file, 'utf8');
    // Any root-relative reference, not just a fixed set of prefixes. The pages
    // own the root namespace, so an internal link is simply /something: a regex
    // naming prefixes would skip the links it exists to check, and a broken one
    // would pass silently.
    const markdownLinks = [...markdown.matchAll(/\]\((\/[^)#?\s]+)/g)].map((match) => match[1]);
    const componentLinks = [...markdown.matchAll(/(?:href|fixture)=['"](\/[^'"#?\s]+)/g)].map((match) => match[1]);
    const markdownImages = [...markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+['"][^'"]*['"])?\)/g)].map(
      (match) => match[1],
    );

    for (const link of new Set([...markdownLinks, ...componentLinks])) {
      // A reference with a file extension is a public asset rather than a page
      // route, so it resolves against public/ instead of the content tree.
      if (/\.[a-z0-9]+$/iu.test(link)) {
        const assetPath = new URL(`../public${link}`, import.meta.url);
        if (!(await pathExists(assetPath))) missingReferences.push(`${file.pathname}: ${link}`);
        continue;
      }

      const route = link.slice('/'.length).replace(/\/$/, '');
      const page = new URL(`${route}.mdx`, contentRoot);
      const indexPage = new URL(`${route}/index.mdx`, contentRoot);
      if (!(await pathExists(page)) && !(await pathExists(indexPage))) {
        missingReferences.push(`${file.pathname}: ${link}`);
      }
    }

    for (const image of markdownImages) {
      if (/^https?:\/\//.test(image)) continue;
      const imagePath = image.startsWith('/') ? new URL(`../public${image}`, import.meta.url) : new URL(image, file);
      if (!(await pathExists(imagePath))) missingReferences.push(`${file.pathname}: ${image}`);
    }
  }

  assert.deepEqual(missingReferences, [], `Missing content references under ${appRoot}`);
});

test('authored guides use the generated local Document API reference', async () => {
  const staleReferences = [];

  for (const file of await collectMdxFiles(contentRoot)) {
    const markdown = await readFile(file, 'utf8');
    if (/https:\/\/docs\.superdoc\.dev\/document-api\/reference|Mintlify reference remains canonical/u.test(markdown)) {
      staleReferences.push(file.pathname);
    }
  }

  assert.deepEqual(staleReferences, []);
});

test('reader-facing guides omit authoring process notes', async () => {
  const processNotes = [];
  const processNotePattern =
    /(?:DX findings ledger|^No (?:additional |new |recorded )?(?:visual )?(?:media|screenshot)(?: is)? used\b)/imu;

  for (const file of await collectMdxFiles(contentRoot)) {
    const markdown = await readFile(file, 'utf8');
    if (processNotePattern.test(markdown)) processNotes.push(file.pathname);
  }

  assert.deepEqual(processNotes, []);
});

test('published install guidance targets stable v2 packages', async () => {
  const staleInstallTargets = [];
  const unqualifiedCanonicalPackageInstall =
    /\b(?:pnpm add(?:\s+--global)?|npm (?:install|i)|yarn add|bun add)\s+@superdoc\/(?:sdk|cli)(?=\s|$)/mu;

  for (const file of await collectMdxFiles(contentRoot)) {
    const markdown = await readFile(file, 'utf8');
    if (
      /(?:superdoc|@superdoc\/[a-z0-9-]+)@next|current `next` release|`next` dist-tag|@superdoc-dev\/(?:cli|sdk|mcp)/u.test(
        markdown,
      ) ||
      unqualifiedCanonicalPackageInstall.test(markdown) ||
      pinnedV2MajorPackageInstall.test(markdown)
    ) {
      staleInstallTargets.push(file.pathname);
    }
  }

  const docsHome = await readFile(docsHomeUrl, 'utf8');
  if (/superdoc@next/u.test(docsHome)) staleInstallTargets.push(docsHomeUrl.pathname);

  assert.deepEqual(staleInstallTargets, []);
  // The bare package name is deliberate: `latest` is the v2 line, so pinning a
  // major in the hero would only go stale at v3 while saying nothing today.
  assert.match(docsHome, /npm install superdoc'/u);
});

test('install guidance cannot pin the current v2 major', () => {
  for (const command of ['pnpm add superdoc@2', 'npm install @superdoc/sdk@2.0.0', 'bun add @superdoc/react@^2']) {
    assert.match(command, pinnedV2MajorPackageInstall);
  }

  assert.doesNotMatch('pnpm add superdoc', pinnedV2MajorPackageInstall);
  assert.doesNotMatch('pnpm add @superdoc/sdk@latest', pinnedV2MajorPackageInstall);
});

test('documentation pages provide concise sidebar titles', async () => {
  const issues = [];
  // Sidebar labels are navigation, not sentences: short, no parent repetition,
  // and no "Work with" / "Create and" / "How to" lead-ins. The descriptive
  // title stays on the page. Generated reference pages are excluded because
  // the contract names them, not an author.
  const sections = new Map([
    ['start', ['Start', 'Get started']],
    ['editor', ['Editor']],
    ['agents', ['Agents', 'Automation']],
    ['document-api', ['Document API']],
  ]);
  const filler = /^(?:work with|working with|create and|how to|understand(?:ing)? the|using|use the)\b/iu;

  for (const [section, parents] of sections) {
    const sectionRoot = new URL(`../content/docs/${section}/`, import.meta.url);

    for (const file of await collectMdxFiles(sectionRoot)) {
      if (file.pathname.includes('/reference/')) continue;

      const markdown = await readFile(file, 'utf8');
      const navTitle = extractFrontmatter(markdown)
        .match(/^navTitle:\s*(.+)$/mu)?.[1]
        ?.trim()
        .replace(/^["']|["']$/gu, '');

      if (!navTitle) {
        issues.push(`${file.pathname}: missing navTitle`);
        continue;
      }
      if (navTitle.length > 24) {
        issues.push(`${file.pathname}: navTitle exceeds 24 characters (${navTitle})`);
      }
      if (filler.test(navTitle)) {
        issues.push(`${file.pathname}: navTitle leads with filler (${navTitle})`);
      }
      if (parents.some((parent) => new RegExp(`\\b${parent}\\b`, 'iu').test(navTitle))) {
        issues.push(`${file.pathname}: navTitle repeats its section (${navTitle})`);
      }
    }
  }

  assert.deepEqual(issues, []);
});

test('sidebar title checks ignore MDX body content', () => {
  const markdown = `---
title: Missing sidebar title
---

\`\`\`yaml
navTitle: Body content
\`\`\`
`;

  assert.equal(extractFrontmatter(markdown).match(/^navTitle:\s*(.+)$/mu), null);
});

// The DOCX metadata check that used to live here is gone. `pnpm
// check:docx-privacy` covers every tracked archive in the repository rather
// than this one directory, and reads custom properties, taxonomy, and revision
// authors that this one never looked at. Keeping both meant two gates with
// different ideas of a clean fixture: this one required the fields to be empty
// while the sanitizer writes synthetic placeholders, so a sanitized fixture
// failed here.

test('Markdown images include alt text and accessible SVG metadata', async () => {
  const accessibilityIssues = [];

  for (const file of await collectMdxFiles(contentRoot)) {
    const markdown = await readFile(file, 'utf8');
    const images = [...markdown.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+['"][^'"]*['"])?\)/g)];

    for (const image of images) {
      const altText = image[1].trim();
      const source = image[2];
      if (!altText) accessibilityIssues.push(`${file.pathname}: ${source} has empty alt text`);

      if (!source.endsWith('.svg') || /^https?:\/\//.test(source)) continue;
      const imagePath = source.startsWith('/') ? new URL(`../public${source}`, import.meta.url) : new URL(source, file);
      const svg = await readFile(imagePath, 'utf8');
      if (!/<title(?:\s|>)/.test(svg)) accessibilityIssues.push(`${file.pathname}: ${source} has no SVG title`);
      if (!/<desc(?:\s|>)/.test(svg)) accessibilityIssues.push(`${file.pathname}: ${source} has no SVG description`);
    }
  }

  assert.deepEqual(accessibilityIssues, []);
});

test('the editor demo runtime matches the public package manifest', async () => {
  const runtimeConfig = JSON.parse(await readFile(runtimeConfigUrl, 'utf8'));
  const superdocPackage = JSON.parse(await readFile(superdocPackageUrl, 'utf8'));
  const engineSpecifier = superdocPackage.dependencies?.[runtimeConfig.enginePackage];

  assert.equal(runtimeConfig.runtimePackage, superdocPackage.name);
  assert.equal(runtimeConfig.runtimeVersion, superdocPackage.version);
  assert.equal(engineSpecifier, `workspace:${runtimeConfig.engineVersion}`);
  assert.equal(runtimeConfig.uiModulePath, superdocPackage.exports?.['./ui']?.import?.slice(1));
});

test('the editor demo fits from v2 page metrics and observes container width', async () => {
  const source = await readFile(editorDemoUrl, 'utf8');

  assert.match(source, /const pageMetrics = getPageMetrics\(instance\)/);
  assert.match(source, /instance\.activeEditor as \{ pageMetrics\?: unknown \}/);
  assert.match(source, /page\.base\.widthPx/);
  assert.match(source, /new ResizeObserver\(applyFit\)/);
  assert.match(source, /pageMetrics\.subscribe\(applyFit\)/);
  assert.match(source, /instance\.setZoom/);
  assert.match(source, /mode: 'manual'/);
  assert.match(source, /fitWidth: \{ min: initialZoom\.min, max: initialZoom\.max \}/);
  assert.match(source, /comments: \{ displayMode: 'inline' \}/);
  assert.match(source, /instanceRef\.current\?\.setDocumentMode\(mode\)/);
  assert.match(source, /preset === 'document-modes'/);
});

// The runtime loader moved out of the demo when a second embed needed it. These
// assertions follow the behavior rather than the file: a failed load must not
// leave a stale worker URL or a half-initialized global behind for the retry.
test('the shared runtime loader tears down a failed load completely', async () => {
  const source = await readFile(superdocRuntimeUrl, 'utf8');

  assert.match(source, /URL\.revokeObjectURL\(workerObjectUrl\)/);
  assert.match(source, /window\.__SUPERDOC_V2_BROWSER_WORKER_URL__ = undefined/);
  assert.match(source, /window\.SuperDoc = undefined;\s+resetConfiguredWorker\(\);\s+throw error/);
});

test('the built-in toolbar example uses item names from the v2 toolbar catalog', async () => {
  const example = await readFile(focusedToolbarExampleUrl, 'utf8');
  const catalog = await readFile(toolbarCatalogUrl, 'utf8');
  const groups = example.match(/groups:\s*\{([\s\S]*?)\n\s*\},/u)?.[1];

  assert.ok(groups, 'The focused toolbar example must define an explicit groups allowlist.');

  const configuredItems = [...groups.matchAll(/'([^']+)'/gu)].map((match) => match[1]);
  const catalogItems = new Set([...catalog.matchAll(/\bname:\s*'([^']+)'/gu)].map((match) => match[1]));
  const unknownItems = configuredItems.filter((item) => !catalogItems.has(item));

  assert.deepEqual(unknownItems, []);
});

test('the React toolbar example uses command ids from the public v2 command catalog', async () => {
  const example = await readFile(reactToolbarExampleUrl, 'utf8');
  const catalog = await readFile(commandCatalogUrl, 'utf8');
  const configuredIds = new Set([
    ...[...example.matchAll(/<CommandButton\s+id='([^']+)'/gu)].map((match) => match[1]),
    ...[...example.matchAll(/useSuperDocCommand\('([^']+)'\)/gu)].map((match) => match[1]),
  ]);
  const catalogIds = new Set([...catalog.matchAll(/\bid:\s*'([^']+)'/gu)].map((match) => match[1]));
  const unknownIds = [...configuredIds].filter((id) => !catalogIds.has(id));

  assert.deepEqual(unknownIds, []);
});

test('the React toolbar docs report command results and preserve the controller through replacement', async () => {
  const example = await readFile(reactToolbarExampleUrl, 'utf8');
  const guide = await readFile(reactToolbarGuideUrl, 'utf8');

  assert.match(example, /result === false/);
  assert.match(example, /typeof result === 'object' && !result\.success/);
  assert.match(example, /setSuperDoc\(readySuperDoc\)/);
  assert.doesNotMatch(example, /void ui\?\.commands\.executeAsync/);
  assert.match(guide, /await superdoc\.replaceFile\(file\)/);
  assert.match(guide, /state !== 'review-ready' && state !== 'editing-ready'/);
  assert.match(guide, /Keep the existing provider binding/);
});

test('the custom comments composer preserves the Editor selection before focus moves', async () => {
  const example = await readFile(customCommentsExampleUrl, 'utf8');

  assert.match(example, /capturedSelection = ui\.selection\.capture\(\)/);
  assert.match(example, /ui\.comments\.createFromCapture\(capturedSelection/);
  assert.doesNotMatch(example, /ui\.comments\.createFromSelection/);
});

test('the selection overlay uses public targets and painted viewport geometry', async () => {
  const example = await readFile(selectionViewportExampleUrl, 'utf8');

  assert.match(example, /capture = ui\.selection\.capture\(\)/);
  assert.match(example, /ui\.viewport\.getRect\(\{ target, relativeTo: editorShell \}\)/);
  assert.match(example, /ui\.viewport\.observe\(positionOverlay\)/);
  assert.match(example, /ui\.selection\.restore\(capture\)/);
  assert.doesNotMatch(example, /window\.getSelection|getBoundingClientRect|editor\.state|editor\.view/);
});

test('the built-in find example enables the surface behind its visible control', async () => {
  const example = await readFile(builtInFindReplaceExampleUrl, 'utf8');

  // The toolbar draws its Search button either way, so an example that omits
  // the switch would render a control that does nothing when clicked.
  assert.match(example, /ui:\s*\{[\s\S]*search: true/);
});

test('the custom search example observes settlement and awaits mutations', async () => {
  const example = await readFile(customSearchExampleUrl, 'utf8');

  assert.match(example, /ui\.search\.observe\(render\)/);
  assert.match(example, /render\(ui\.search\.search\(/);
  assert.match(example, /await ui\.search\.replace\(replacement\.value\)/);
  assert.match(example, /await ui\.search\.replaceAll\(replacement\.value\)/);
  assert.match(example, /replace\.disabled = !search\.canReplace/);
  assert.doesNotMatch(example, /editor\.state|editor\.view|querySelectorAll\([^)]*\.search-result/);
});

test('the custom tracked-change review awaits explicit decisions', async () => {
  const example = await readFile(customTrackedReviewExampleUrl, 'utf8');

  assert.match(example, /ui\.trackChanges\.observe\(render\)/);
  assert.match(example, /ui\.trackChanges\.setActive\(id\)/);
  assert.match(example, /await ui\.trackChanges\.scrollTo\(id\)/);
  assert.match(example, /await ui\.commands\.executeAsync\(decision, \{ id \}\)/);
  assert.doesNotMatch(example, /ui\.trackChanges\.(?:accept|reject)\(/);
  assert.doesNotMatch(example, /editor\.state|editor\.view|querySelectorAll\([^)]*track/);
});

test('the custom content-control panel uses UI state and Document API mutations', async () => {
  const example = await readFile(customContentControlsExampleUrl, 'utf8');

  assert.match(example, /ui\.contentControls\.list\(\)/);
  assert.match(example, /ui\.contentControls\.observe\(render\)/);
  assert.match(example, /await ui\.contentControls\.focus\(\{ id, block: 'center', behavior: 'smooth' \}\)/);
  assert.match(example, /await doc\.contentControls\.text\.setValue\(\{ target: control\.target, value \}\)/);
  assert.match(example, /control\.controlType !== 'text'/);
  assert.doesNotMatch(example, /editor\.state|editor\.view|querySelectorAll\([^)]*content-control/);
});

test('the custom table controls use routed commands and public table context', async () => {
  const example = await readFile(customTableControlsExampleUrl, 'utf8');
  const catalog = await readFile(commandCatalogUrl, 'utf8');
  const configuredIds = [...example.matchAll(/ui\.commands\.get\('([^']+)'\)/gu)].map((match) => match[1]);
  const catalogIds = new Set([...catalog.matchAll(/\bid:\s*'([^']+)'/gu)].map((match) => match[1]));

  assert.deepEqual(
    configuredIds.filter((id) => !catalogIds.has(id)),
    [],
  );
  assert.match(example, /ui\.tables\.getContext\(\)/);
  assert.match(example, /await addRow\.executeAsync\(\)/);
  assert.match(example, /await deleteRow\.executeAsync\(\)/);
  assert.match(example, /addRow\.observe\(render\)/);
  assert.match(example, /deleteRow\.observe\(render\)/);
  assert.doesNotMatch(example, /editor\.state|editor\.view|querySelectorAll\([^)]*table/);
});

test('the custom formatting controls preserve picker and style semantics', async () => {
  const example = await readFile(customFormattingControlsExampleUrl, 'utf8');
  const catalog = await readFile(commandCatalogUrl, 'utf8');
  const configuredIds = [...example.matchAll(/ui\.commands\.get\('([^']+)'\)/gu)].map((match) => match[1]);
  const catalogIds = new Set([...catalog.matchAll(/\bid:\s*'([^']+)'/gu)].map((match) => match[1]));

  assert.deepEqual(
    configuredIds.filter((id) => !catalogIds.has(id)),
    [],
  );
  assert.match(example, /ui\.fonts\.getSnapshot\(\)/);
  assert.match(example, /ui\.styles\.getSnapshot\(\)/);
  assert.match(example, /ui\.document\.getSnapshot\(\)/);
  assert.match(example, /await fontFamily\.executeAsync\(fontFamilySelect\.value\)/);
  assert.match(example, /await fontSize\.executeAsync\(fontSizeSelect\.value\)/);
  assert.match(example, /await paragraphStyle\.executeAsync\(paragraphStyleSelect\.value\)/);
  assert.match(example, /await documentMode\.executeAsync\(documentModeSelect\.value\)/);
  assert.doesNotMatch(example, /editor\.state|editor\.view|getComputedStyle/);
});

test('durable review highlights separate stored identity from render-only paint', async () => {
  const example = await readFile(reviewHighlightsExampleUrl, 'utf8');

  assert.match(example, /metadata\.attach\(/);
  assert.match(example, /id: FINDING_ID/);
  assert.match(example, /metadata\.list\(\{ namespace: NAMESPACE \}\)/);
  assert.match(example, /metadata\.resolve\(\{ id: item\.id \}\)/);
  assert.match(example, /metadata\.remove\(\s*\{ id: FINDING_ID \}/);
  // Both mutations must be revision-guarded against the read that preceded
  // them: an unguarded write applies a target the document has moved past.
  assert.match(example, /expectedRevision: overlapping\.evaluatedRevision/);
  assert.match(example, /expectedRevision: current\.evaluatedRevision/);
  assert.match(example, /ctx\.visuals\.highlight\('findings'/);
  assert.match(example, /layer\.replace\(visualStore\.read\(\)\)/);
  assert.match(example, /ctx\.onSourceComplete/);
  assert.match(example, /ctx\.onMutation/);
  assert.doesNotMatch(example, /activeEditor\.state|editor\.state|editor\.view|ProseMirror/);
});

test('the application-owned context menu uses public context and fail-closed actions', async () => {
  const example = await readFile(customContextMenuExampleUrl, 'utf8');

  assert.match(example, /ui: \{ contextMenu: false \}/);
  assert.match(example, /ui\.viewport\.contextAt\(point\)/);
  assert.match(example, /entity\.type === 'trackedChange'/);
  assert.match(example, /context\.selection\.quotedText/);
  assert.match(example, /ui\.commands\.executeAsync\(command, changeTarget\)/);
  assert.match(example, /event\.key === 'ContextMenu'/);
  assert.match(example, /event\.shiftKey && event\.key === 'F10'/);
  assert.match(example, /editorHost\.removeEventListener\('contextmenu', handleContextMenu\)/);
  assert.doesNotMatch(example, /activeEditor|editor\.state|editor\.view|posAtCoords/);
});

test('the custom document controls observe state and handle unavailable export', async () => {
  const example = await readFile(customZoomDocumentExampleUrl, 'utf8');

  assert.match(example, /ui\.zoom\.getSnapshot\(\)/);
  assert.match(example, /ui\.zoom\.setMode\('fit-width'\)/);
  assert.match(example, /ui\.zoom\.observe\(render\)/);
  assert.match(example, /ui\.document\.observe\(render\)/);
  assert.match(example, /ui\.document\.export\(\{ exportType: \['docx'\] \}\)/);
  assert.match(example, /if \(!pendingExport\)/);
});

test('the custom command owns state, execution, keyboard binding, and cleanup', async () => {
  const example = await readFile(customCommandExampleUrl, 'utf8');

  assert.match(example, /ui\.commands\.register<\{ text: string \}>/);
  assert.match(example, /shortcut: 'Mod-Shift-K'/);
  assert.match(example, /execute: \(\{ payload, insertText \}\) => insertText/);
  assert.match(example, /await command\.executeAsync/);
  assert.match(example, /window\.addEventListener\('keydown', runShortcut\)/);
  assert.match(example, /disposeCommand = registration\.unregister/);
});

test('the command failure example uses stable reasons and receipt success', async () => {
  const example = await readFile(commandFailuresExampleUrl, 'utf8');

  assert.match(example, /Partial<Record<SuperDocUIReason, string>>/);
  assert.match(example, /'document-readonly'/);
  assert.match(example, /'table-context-unavailable'/);
  assert.match(example, /if \(!result\.success\)/);
  assert.doesNotMatch(example, /throw result|catch \{/);
});

test('the generated reference model mirrors the canonical operation inventory', async () => {
  const generator = await readFile(new URL('../scripts/generate-document-api-reference.ts', import.meta.url), 'utf8');
  const model = JSON.parse(await readFile(documentApiReferenceModelUrl, 'utf8'));
  const contractOperationIds = await readContractOperationIds();
  const modelOperationIds = Object.keys(model.operations).sort();
  const operationPaths = Object.values(model.operations).map((operation) => operation.path);

  assert.deepEqual(modelOperationIds, [...contractOperationIds].sort());
  assert.equal(modelOperationIds.length, 423);
  assert.equal(new Set(operationPaths).size, modelOperationIds.length);
  assert.equal(model.operations.formatRange.path, 'format/format-range');
  assert.equal(model.operations['format.apply'].path, 'format/apply');
  assert.equal(model.groups.find((group) => group.key === 'index').path, 'document-index/index');
  assert.equal(model.operations['index.list'].path, 'document-index/list');
  assert.equal(model.operations['query.match'].metadata.throws.preApply[0], 'MATCH_NOT_FOUND');
  assert.equal(model.operations['query.match'].metadata.throws.preApply[1], 'AMBIGUOUS_MATCH');
  assert.match(generator, /validateReferencePaths\(model\);\s+\n\s+await rm\(referenceRoot/);
});

test('the generated reference navigation does not repeat page-tree entries', async () => {
  const metadata = JSON.parse(
    await readFile(new URL('../content/docs/document-api/reference/meta.json', import.meta.url), 'utf8'),
  );

  assert.equal(new Set(metadata.pages).size, metadata.pages.length);
  assert.ok(metadata.pages.includes('document-index'));
});

test('Document API operations are alphabetical within reference views', async () => {
  const reference = await import('../lib/document-api-reference/model.ts');
  const curation = await import('../lib/document-api-reference/curation.ts');
  const model = reference.getReferenceModel();
  const alphabetize = (operationIds) => [...operationIds].sort((left, right) => left.localeCompare(right));
  const summaryIds = reference.getOperationSummaries().map((operation) => operation.operationId);

  assert.deepEqual(summaryIds, alphabetize(summaryIds));

  for (const group of model.groups) {
    const operationIds = reference.getGroupOperations(group).map((operation) => operation.operationId);
    assert.deepEqual(operationIds, alphabetize(operationIds), group.key);

    for (const job of curation.getNamespaceJobs(group.key, operationIds) ?? []) {
      assert.deepEqual(job.operationIds, alphabetize(job.operationIds), `${group.key}:${job.id}`);
    }
  }
});

test('the reference generator emits raw schemas as same-origin artifacts', async () => {
  const model = JSON.parse(await readFile(documentApiReferenceModelUrl, 'utf8'));
  const query = model.operations['query.match'];
  const rawSchemas = JSON.parse(
    await readFile(new URL(`../public/reference/document-api/${query.path}.json`, import.meta.url), 'utf8'),
  );

  assert.equal(rawSchemas.operationId, 'query.match');
  assert.equal(rawSchemas.$schema, model.schemaDialect);
  assert.deepEqual(rawSchemas.schemas, query.schemas);
  const references = [...JSON.stringify(rawSchemas).matchAll(/"#\/\$defs\/([^"]+)"/gu)].map((match) => match[1]);
  assert.ok(references.length > 0);
  assert.ok(Object.keys(rawSchemas.$defs).length < Object.keys(model.definitions).length);
  assert.deepEqual(
    references.filter((reference) => !Object.hasOwn(rawSchemas.$defs, reference)),
    [],
  );
});

test('the reference generator emits lightweight MDX stubs without synthetic examples', async () => {
  const landing = await readFile(new URL('../content/docs/document-api/reference/index.mdx', import.meta.url), 'utf8');
  const namespace = await readFile(
    new URL('../content/docs/document-api/reference/content-controls/index.mdx', import.meta.url),
    'utf8',
  );
  const operation = await readFile(
    new URL('../content/docs/document-api/reference/query/match.mdx', import.meta.url),
    'utf8',
  );

  assert.match(landing, /<DocumentApiReferenceLanding \/>/);
  assert.match(namespace, /<DocumentApiNamespace namespace="contentControls" \/>/);
  assert.match(operation, /<DocumentApiOperation operationId="query\.match" \/>/);
  assert.doesNotMatch(`${landing}\n${namespace}\n${operation}`, /Example request|block-abc123|__img\d+/);
});

test('the initial reference example is typechecked and revision guarded without overclaiming provenance', async () => {
  const example = await readFile(referenceQueryMatchExampleUrl, 'utf8');
  const component = await readFile(new URL('../components/document-api-reference/index.tsx', import.meta.url), 'utf8');
  const model = JSON.parse(await readFile(documentApiReferenceModelUrl, 'utf8'));
  const generatedExample = model.examples['query.match'];

  assert.match(example, /import type \{ DocumentApi \}/);
  assert.match(example, /match\.matchKind !== 'text'/);
  assert.match(example, /target: match\.target/);
  assert.match(example, /expectedRevision: result\.evaluatedRevision/);
  assert.match(component, /Typechecked example/);
  assert.match(generatedExample.provenance, /Runtime validation is tracked separately/);
  assert.equal(generatedExample.code, example.trim());
  assert.doesNotMatch(`${component}\n${generatedExample.provenance}`, /fixture-backed|Executable example/);
});

test('the Markdown reference exports standalone input and output schemas', async () => {
  const markdown = await readFile(new URL('../lib/document-api-reference/markdown.ts', import.meta.url), 'utf8');
  const { collectReferencedDefinitions } = await import('../lib/document-api-reference/schema.ts');
  const model = JSON.parse(await readFile(documentApiReferenceModelUrl, 'utf8'));
  const operation = model.operations['format.apply'];

  assert.match(markdown, /\$defs: collectReferencedDefinitions\(operation\.schemas\.input, model\.definitions\)/);
  assert.match(markdown, /\$defs: collectReferencedDefinitions\(operation\.schemas\.output, model\.definitions\)/);
  for (const schema of [operation.schemas.input, operation.schemas.output]) {
    const definitions = collectReferencedDefinitions(schema, model.definitions);
    const references = [...JSON.stringify({ $defs: definitions, ...schema }).matchAll(/"#\/\$defs\/([^"]+)"/gu)].map(
      (match) => match[1],
    );
    assert.deepEqual(
      references.filter((reference) => !Object.hasOwn(definitions, reference)),
      [],
    );
  }
});

test('the Content Controls curation covers every operation exactly once', async () => {
  const model = JSON.parse(await readFile(documentApiReferenceModelUrl, 'utf8'));
  const curation = await import('../lib/document-api-reference/curation.ts');
  const operationIds = model.groups.find((group) => group.key === 'contentControls').operationIds;
  const curatedIds = curation.getNamespaceJobs('contentControls', operationIds).flatMap((job) => job.operationIds);

  assert.equal(new Set(curatedIds).size, curatedIds.length);
  assert.deepEqual([...curatedIds].sort(), [...operationIds].sort());
  const tracked = operationIds.filter((operationId) => model.operations[operationId].metadata.supportsTrackedMode);
  assert.deepEqual(tracked, ['contentControls.move', 'contentControls.replaceContent']);
});

test('reference unions prefer discriminating constants and required fields', async () => {
  const model = JSON.parse(await readFile(documentApiReferenceModelUrl, 'utf8'));
  const { schemaDescription, schemaProperties, schemaType, variantLabels } = await import(
    '../lib/document-api-reference/schema.ts'
  );

  assert.deepEqual(variantLabels(model.definitions.StoryLocator.oneOf, model.definitions), [
    'body',
    'headerFooterSlot',
    'headerFooterPart',
    'footnote',
    'endnote',
    'textbox',
  ]);
  assert.deepEqual(variantLabels(model.operations.formatRange.schemas.input.oneOf, model.definitions), [
    'target',
    'ref',
  ]);
  assert.deepEqual(variantLabels(model.operations['format.apply'].schemas.input.oneOf, model.definitions), [
    'target',
    'ref',
  ]);
  assert.deepEqual(variantLabels(model.operations.insert.schemas.input.oneOf, model.definitions), [
    'target / ref / value',
    'content',
  ]);
  assert.equal(
    schemaType(model.operations['query.match'].schemas.input.properties.select, model.definitions),
    'text | node',
  );
  assert.equal(
    schemaType(model.operations['styles.getCatalog'].schemas.output.properties.revision, model.definitions),
    'string | null',
  );
  assert.equal(model.operations['format.apply'].schemas.output.oneOf.length, 2);
  const listCreateFields = schemaProperties(model.operations['lists.create'].schemas.input, model.definitions);
  assert.deepEqual(
    listCreateFields.filter((field) => field.conditionallyRequired).map((field) => field.name),
    ['at', 'target'],
  );
  const formatTarget = model.operations['format.apply'].schemas.input.oneOf[0].properties.target;
  assert.match(schemaDescription(formatTarget, model.definitions), /Use 'ref' instead/);
  assert.equal(
    Object.values(model.operations)
      .map((operation) => Object.values(operation.schemas.input.properties ?? {}))
      .flat()
      .filter((field) => field.type !== undefined)
      .some((field) => Array.isArray(field.type)),
    true,
  );
});

test('the reference renderer preserves optional-only inputs, output unions, and copy reset ownership', async () => {
  const component = await readFile(new URL('../components/document-api-reference/index.tsx', import.meta.url), 'utf8');
  const search = await readFile(
    new URL('../components/document-api-reference/reference-search.tsx', import.meta.url),
    'utf8',
  );
  const copyButton = await readFile(
    new URL('../components/document-api-reference/copy-button.tsx', import.meta.url),
    'utf8',
  );

  assert.match(component, /selectedPrimaryFields\.length > 0 \? selectedPrimaryFields : inputFields/);
  assert.match(component, /outputVariants\.length > 0/);
  assert.match(component, /idPrefix='output'/);
  assert.match(copyButton, /window\.clearTimeout\(resetTimer\.current\)/);
  assert.match(copyButton, /resetTimer\.current = null/);
  assert.doesNotMatch(search, /toLocaleLowerCase/);
  assert.match(search, /toLowerCase\(\)/);
});

test('the built-in link and context-menu example uses public external renderers', async () => {
  const example = await readFile(builtInLinksContextExampleUrl, 'utf8');

  assert.match(example, /type LinkPopoverResolver/);
  assert.match(example, /type: 'external'/);
  assert.match(example, /rel = 'noopener noreferrer'/);
  assert.match(example, /satisfies ContextMenuConfig/);
  assert.match(example, /showWhen: \(\{ hasSelection \}\) => hasSelection/);
});

test('the built-in structured-content example uses catalogued toolbar items', async () => {
  const example = await readFile(builtInStructuredContentExampleUrl, 'utf8');
  const catalog = await readFile(toolbarCatalogUrl, 'utf8');
  const configuredItems = [...example.matchAll(/'([^']+)'/gu)]
    .map((match) => match[1])
    .filter((value) => ['link', 'image', 'table', 'tableActions'].includes(value));
  const catalogItems = new Set([...catalog.matchAll(/\bname:\s*'([^']+)'/gu)].map((match) => match[1]));

  assert.deepEqual(
    configuredItems.filter((item) => !catalogItems.has(item)),
    [],
  );
  assert.match(example, /contentControls: \{ chrome: 'default' \}/);
  assert.match(example, /handleImageUpload: async/);
});

test('the responsive built-in example refits after fullscreen changes', async () => {
  const example = await readFile(responsiveBuiltInExampleUrl, 'utf8');

  assert.match(example, /contained: true/);
  assert.match(example, /mode: 'fit-width'/);
  assert.match(example, /responsiveToContainer: true/);
  assert.match(example, /comments: \{ displayMode: 'auto' \}/);
  assert.match(example, /document\.addEventListener\('fullscreenchange', refit\)/);
  assert.match(example, /superdoc\.setZoomMode\('fit-width'\)/);
});

test('the Editor platform examples use public lifecycle and file boundaries', async () => {
  const configuration = await readFile(editorConfigurationExampleUrl, 'utf8');
  const lifecycle = await readFile(editorLifecycleExampleUrl, 'utf8');
  const files = await readFile(documentManagementExampleUrl, 'utf8');

  assert.match(configuration, /satisfies Config/);
  assert.match(configuration, /onReady:/);
  assert.match(lifecycle, /onContentError:/);
  assert.match(lifecycle, /superdoc\.off\('document-mode-change', handleModeChange\)/);
  assert.match(files, /setControlsBusy\(\)/);
  assert.match(files, /fileInput\.disabled = false/);
  assert.match(files, /saveButton\.disabled = !documentReady/);
  assert.match(files, /const openDocument = \(document: string \| File\)/);
  assert.match(files, /try \{\s+superdoc = new SuperDoc\(/);
  assert.match(files, /catch \(error\) \{\s+superdoc = null;\s+handleRuntimeError\(error\)/);
  assert.match(files, /onReady:/);
  assert.match(files, /onContentError:/);
  assert.match(files, /onException:/);
  assert.match(files, /if \(documentReady\) return;\s+requiresRecreation = true;\s+setControlsIdle\(\)/);
  assert.match(files, /if \(requiresRecreation\) \{\s+openDocument\(file\);\s+return;/);
  assert.match(files, /documentReady = true/);
  assert.match(files, /const result = await superdoc\.replaceFile\(file\)/);
  assert.match(files, /replacementState !== 'review-ready' && replacementState !== 'editing-ready'/);
  assert.match(files, /'mount' in replacementResult && replacementResult\.mount === null/);
  assert.match(files, /documentReady = false;\s+requiresRecreation = true/);
  assert.match(files, /showError\(new Error\('SuperDoc could not open the selected DOCX\.'\)\);\s+return/);
  assert.match(files, /catch \(error\) \{\s+documentReady = false;\s+requiresRecreation = true;\s+showError\(error\)/);
  assert.match(files, /triggerDownload: false/);
  assert.match(files, /if \(!response\.ok\)/);
  assert.match(files, /catch \(error\)/);
  assert.match(files, /finally/);
});

test('the external surface example handles lifecycle outcomes', async () => {
  const example = await readFile(externalSurfaceExampleUrl, 'utf8');

  assert.match(example, /superdoc\.openSurface<\{ confirmed: true \}>/);
  assert.match(example, /const outcome = await handle\.result/);
  assert.match(example, /outcome\.status === 'submitted'/);
  assert.doesNotMatch(example, /innerHTML/);
});

test('the theme, font, and proofing examples preserve their data boundaries', async () => {
  const theme = await readFile(themeAndFontsExampleUrl, 'utf8');
  const proofing = await readFile(proofingProviderExampleUrl, 'utf8');

  assert.match(theme, /createTheme\(/);
  assert.match(theme, /fonts\.add\(/);
  assert.match(theme, /fonts\.map\(\{ Calibri: 'Product Sans' \}\)/);
  assert.match(theme, /await readySuperDoc\.fonts\.preload\(\['Calibri'\]\)/);
  assert.match(proofing, /requiresNetwork: false/);
  assert.match(proofing, /segments\.flatMap/);
  assert.match(proofing, /onProofingError:/);
});

test('the React quickstart owns one stable SuperDoc v2 lifecycle', async () => {
  const example = await readFile(reactQuickstartExampleUrl, 'utf8');

  assert.match(example, /import \{ SuperDoc \} from 'superdoc'/u);
  assert.match(example, /export default function App\(\)/u);
  assert.match(example, /new SuperDoc\(/u);
  assert.match(example, /onReady:/u);
  assert.match(example, /superdocRef\.current\?\.export\(/u);
  assert.match(example, /active = false/u);
  assert.match(example, /superdoc\.destroy\(\)/u);
  assert.doesNotMatch(example, /@superdoc-dev\/react|ProseMirror/u);
});

test('the comment-thread example uses direct targets and current revision guards', async () => {
  const example = await readFile(commentThreadExampleUrl, 'utf8');

  assert.match(example, /target: clause\.target/);
  assert.match(example, /expectedRevision: match\.evaluatedRevision/);
  assert.match(example, /parentCommentId: createReceipt\.id/);
  assert.match(example, /expectedRevision: afterReply\.evaluatedRevision/);
  assert.doesNotMatch(example, /highlightRange/);
});

test('the Python SDK example owns the document and host lifecycles', async () => {
  const example = await readFile(pythonSdkExampleUrl, 'utf8');

  assert.match(example, /from superdoc import SuperDocClient/u);
  assert.match(example, /with SuperDocClient\(\) as client:/u);
  assert.match(example, /document\.track_changes\.decide/u);
  assert.match(example, /"out": "\.\/contract\.accepted\.docx"/u);
  assert.match(example, /finally:\s+document\.close\(\{"discard": True\}\)/u);
});

test('the CLI example owns the document session lifecycle', async () => {
  const example = await readFile(cliExampleUrl, 'utf8');

  assert.match(example, /superdoc open \.\/contract\.docx/u);
  assert.match(example, /superdoc track-changes accept-all/u);
  assert.match(example, /superdoc save --out \.\/contract\.accepted\.docx/u);
  assert.match(example, /trap 'superdoc close --discard [^']+' EXIT/u);
  assert.doesNotMatch(example, /--in-place/u);
});

test('every meta.json page entry resolves to real content', async () => {
  // A renamed section leaves the parent meta.json pointing at a directory that
  // no longer exists. Nothing else catches it: the build silently drops the
  // missing entry, so the section just stops appearing in the sidebar.
  const unresolved = [];

  async function checkMeta(directory) {
    const entries = await readdir(directory, { withFileTypes: true });

    if (entries.some((entry) => entry.name === 'meta.json')) {
      const metaUrl = new URL('meta.json', directory);
      const meta = JSON.parse(await readFile(metaUrl, 'utf8'));

      for (const page of meta.pages ?? []) {
        // Fumadocs control entries (separators, rest globs) name no file.
        if (typeof page !== 'string' || page.startsWith('...') || page.startsWith('---')) continue;

        const candidates = [`${page}.mdx`, `${page}/meta.json`, `${page}/index.mdx`];
        const resolved = await Promise.all(candidates.map((path) => pathExists(new URL(path, directory))));
        if (!resolved.some(Boolean)) unresolved.push(`${metaUrl.pathname}: "${page}"`);
      }
    }

    for (const entry of entries) {
      if (entry.isDirectory()) await checkMeta(new URL(`${entry.name}/`, directory));
    }
  }

  await checkMeta(contentRoot);
  assert.deepEqual(unresolved, []);
});

test('the sidebar section picker matches the root navigation sections', async () => {
  const layout = await readFile(layoutUrl, 'utf8');
  const links = layout.match(/links:\s*\[([\s\S]*?)\],\s*nav:/u)?.[1] ?? '';
  const linkedSections = new Set(
    [...links.matchAll(/url:\s*'\/([^/'#?]+)(?:\/[^']*)?'/gu)].map(([, section]) => section),
  );
  const rootSections = new Set();

  for (const entry of await readdir(contentRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const metaUrl = new URL(`${entry.name}/meta.json`, contentRoot);
    if (!(await pathExists(metaUrl))) continue;
    const meta = JSON.parse(await readFile(metaUrl, 'utf8'));
    if (meta.root === true) rootSections.add(entry.name);
  }

  assert.deepEqual([...linkedSections].sort(), [...rootSections].sort());
});

test('the agent example allows exactly the tracked-capable actions', async () => {
  // The example refuses edits that cannot record a suggestion. That allowlist
  // is a copy of which actions accept `changeMode`, so it has to be pinned to
  // the SDK or it will silently drift into permitting untracked edits.
  const actionsSource = await readFile(
    new URL('../../../packages/sdk/langs/node/src/agent/actions.ts', import.meta.url),
    'utf8',
  );
  const actionArgs = actionsSource.match(/export const ACTION_ARGS[^=]*=\s*\{([\s\S]*?)\n\};/u)?.[1] ?? '';
  const hints = actionsSource.match(/export const ACTION_HINTS[^=]*=\s*\{([\s\S]*?)\n\};/u)?.[1] ?? '';
  // An action can declare changeMode and still refuse to honor it. move_range
  // is the current example: its hint says tracked mode fails without mutating.
  const directOnly = new Set(
    [...hints.matchAll(/\n {2}([a-z0-9_]+):\s*'((?:[^'\\]|\\.)*)'/gu)]
      .filter(([, , hint]) => /direct-only|tracked["']?\s*(?:mode\s*)?fails|cannot be tracked/iu.test(hint))
      .map(([, name]) => name),
  );
  const supported = new Set(
    [...actionArgs.matchAll(/\n {2}([a-z0-9_]+):\s*\[([\s\S]*?)\],/gu)]
      .filter(([, name, args]) => args.includes('changeMode') && !directOnly.has(name))
      .map(([, name]) => name),
  );

  const example = await readFile(new URL('../snippets/agents/agent-loop.mjs', import.meta.url), 'utf8');
  const declared = new Set(
    [
      ...(example.match(/const TRACKED_CAPABLE_ACTIONS = new Set\(\[([\s\S]*?)\]\)/u)?.[1] ?? '').matchAll(
        /'([a-z0-9_]+)'/gu,
      ),
    ].map(([, name]) => name),
  );

  assert.ok(supported.size > 0, 'no changeMode-capable actions found in the SDK');
  assert.deepEqual([...declared].sort(), [...supported].sort());
});

test('MDX components and demo presets use the supported authoring vocabulary', async () => {
  const unsupported = [];

  for (const file of await collectMdxFiles(contentRoot)) {
    const markdown = await readFile(file, 'utf8');
    const prose = markdown.replace(/```[\s\S]*?```/g, '');
    const components = [...prose.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)].map((match) => match[1]);

    for (const component of new Set(components)) {
      if (!registeredComponents.has(component)) unsupported.push(`${file.pathname}: <${component}>`);
    }

    for (const match of prose.matchAll(/<EditorDemo\b[^>]*\bpreset=['"]([^'"]+)['"]/g)) {
      if (!editorDemoPresets.has(match[1])) unsupported.push(`${file.pathname}: EditorDemo preset ${match[1]}`);
    }
  }

  assert.deepEqual(unsupported, []);
});

test('Document API calls in code examples match the generated contract', async () => {
  const operationIds = await readContractOperationIds();
  const callableAliases = new Map([['capabilities', 'capabilities.get']]);
  const documentHandleMethods = new Set(['close', 'invoke', 'save']);
  const unknownCalls = [];

  for (const file of await collectMdxFiles(contentRoot)) {
    const markdown = await readFile(file, 'utf8');
    const codeBlocks = collectFencedCode(markdown);

    for (const example of collectCodeIncludes(markdown, file)) {
      codeBlocks.push(await readFile(example, 'utf8'));
    }

    for (const code of codeBlocks) {
      for (const match of code.matchAll(/\b(?:editor\.)?doc\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/gu)) {
        const call = match[1];
        const operationId = callableAliases.get(call) ?? call;
        if (!operationIds.has(operationId) && !documentHandleMethods.has(call)) {
          unknownCalls.push(`${file.pathname}: doc.${call}()`);
        }
      }
    }
  }

  for (const example of await collectReferenceExampleSources()) {
    const code = await readFile(example, 'utf8');
    for (const match of code.matchAll(/\b(?:editor\.)?doc\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/gu)) {
      const call = match[1];
      const operationId = callableAliases.get(call) ?? call;
      if (!operationIds.has(operationId) && !documentHandleMethods.has(call)) {
        unknownCalls.push(`${example.pathname}: doc.${call}()`);
      }
    }
  }

  assert.deepEqual(unknownCalls, []);
});

test('included code resolves inside a typechecked source directory', async () => {
  const invalidIncludes = [];
  const includedSnippets = new Set();

  for (const file of await collectMdxFiles(contentRoot)) {
    const markdown = await readFile(file, 'utf8');

    for (const example of collectCodeIncludes(markdown, file)) {
      const examplePath = fileURLToPath(example);
      const isTypecheckedSource =
        examplePath.startsWith(snippetsRootPrefix) || examplePath.startsWith(examplesRootPrefix);
      if (!isTypecheckedSource || !(await pathExists(example))) {
        invalidIncludes.push(`${file.pathname}: ${example.pathname}`);
        continue;
      }

      includedSnippets.add(examplePath);

      if (/\.(?:js|mjs|cjs)$/u.test(examplePath)) {
        const syntax = spawnSync(process.execPath, ['--check', examplePath], { encoding: 'utf8' });
        if (syntax.status !== 0) invalidIncludes.push(`${file.pathname}: ${syntax.stderr.trim()}`);
      }
    }
  }

  const referenceModel = JSON.parse(await readFile(documentApiReferenceModelUrl, 'utf8'));
  for (const example of Object.values(referenceModel.examples)) {
    const exampleUrl = new URL(`../${example.sourcePath}`, import.meta.url);
    const examplePath = fileURLToPath(exampleUrl);
    if (!examplePath.startsWith(snippetsRootPrefix) || !(await pathExists(exampleUrl))) {
      invalidIncludes.push(`${documentApiReferenceModelUrl.pathname}: ${example.sourcePath}`);
      continue;
    }
    includedSnippets.add(examplePath);
  }

  for (const example of await collectSnippetFiles(new URL('../snippets/', import.meta.url))) {
    const examplePath = fileURLToPath(example);
    if (!examplePath.endsWith('.d.ts') && !includedSnippets.has(examplePath)) {
      invalidIncludes.push(`${example.pathname}: snippet source is not included by a documentation page`);
    }
  }

  assert.deepEqual(invalidIncludes, []);
});

async function collectSnippetFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = new URL(entry.name, directory);
      if (entry.isDirectory()) return collectSnippetFiles(new URL(`${entry.name}/`, directory));
      return /\.(?:ts|js|mjs|cjs)$/u.test(entry.name) ? [path] : [];
    }),
  );
  return files.flat();
}

async function collectReferenceExampleSources() {
  const model = JSON.parse(await readFile(documentApiReferenceModelUrl, 'utf8'));
  return Object.values(model.examples).map((example) => new URL(`../${example.sourcePath}`, import.meta.url));
}

test('fenced code fragments parse and shell examples use pnpm', async () => {
  const issues = [];

  for (const file of await collectMdxFiles(contentRoot)) {
    const markdown = await readFile(file, 'utf8');

    for (const block of collectFencedCodeBlocks(markdown)) {
      if (['ts', 'tsx', 'typescript', 'js', 'jsx', 'javascript'].includes(block.language)) {
        const result = ts.transpileModule(block.code, {
          fileName: `${file.pathname}.${block.language}`,
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            jsx: ts.JsxEmit.ReactJSX,
          },
          reportDiagnostics: true,
        });

        for (const diagnostic of result.diagnostics ?? []) {
          if (diagnostic.category === ts.DiagnosticCategory.Error) {
            issues.push(`${file.pathname}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
          }
        }
      }

      if (block.language === 'bash') {
        const syntax = spawnSync('bash', ['-n'], { input: block.code, encoding: 'utf8' });
        if (syntax.status !== 0) issues.push(`${file.pathname}: ${syntax.stderr.trim()}`);
        if (/\b(?:npm|npx|yarn)\b/u.test(block.code)) {
          issues.push(`${file.pathname}: shell setup examples must use pnpm`);
        }
      }

      if (block.language === 'html') {
        for (const issue of validateHtmlFragment(block.code)) issues.push(`${file.pathname}: ${issue}`);
      }
    }
  }

  assert.deepEqual(issues, []);
});

function validateHtmlFragment(html) {
  const issues = [];
  const stack = [];
  const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source']);
  const ids = new Set();

  for (const match of html.matchAll(/<\/?([a-z][a-z0-9-]*)\b[^>]*>/giu)) {
    const tag = match[1].toLowerCase();
    const token = match[0];

    if (!token.startsWith('</')) {
      const id = token.match(/\bid=["']([^"']+)["']/u)?.[1];
      if (id && ids.has(id)) issues.push(`duplicate HTML id "${id}"`);
      if (id) ids.add(id);
      if (!voidElements.has(tag) && !token.endsWith('/>')) stack.push(tag);
      continue;
    }

    if (stack.pop() !== tag) issues.push(`unbalanced HTML tag </${tag}>`);
  }

  if (stack.length > 0) issues.push(`unclosed HTML tag <${stack.at(-1)}>`);
  return issues;
}

function collectCodeIncludes(markdown, file) {
  return [...markdown.matchAll(/<include(?:\s[^>]*)?>([^<]+)<\/include>/gu)].map((match) => {
    const reference = match[1].trim().split('#')[0];
    return new URL(reference, file);
  });
}

function collectFencedCode(markdown) {
  return collectFencedCodeBlocks(markdown).map((block) => block.code);
}

function collectFencedCodeBlocks(markdown) {
  const blocks = [];
  let marker;
  let language = '';
  let lines = [];

  for (const line of markdown.split('\n')) {
    const fence = line.match(/^\s*(`{3,}|~{3,})([^`]*)$/u);

    if (!marker && fence) {
      marker = fence[1];
      language = fence[2].trim().split(/\s+/u)[0] ?? '';
      lines = [];
      continue;
    }

    if (marker && fence && fence[1][0] === marker[0] && fence[1].length >= marker.length) {
      blocks.push({ language, code: lines.join('\n') });
      marker = undefined;
      language = '';
      lines = [];
      continue;
    }

    if (marker) lines.push(line);
  }

  return blocks;
}

test('derives search terms from a requested path', async () => {
  const { searchTermsFromPath } = await import('../lib/site-url.ts');

  // A 404 already knows what the reader wanted; it is in the URL. These become
  // the search query so nobody has to retype it.
  assert.equal(searchTermsFromPath('/ai/agents/architecture'), 'ai agents architecture');
  assert.equal(searchTermsFromPath('/editor/custom-ui/controller-setup'), 'editor custom ui controller setup');
  // A file extension is noise in a search query.
  assert.equal(searchTermsFromPath('/md/editor/quickstart.md'), 'md editor quickstart');
  assert.equal(searchTermsFromPath('/'), '');
});
