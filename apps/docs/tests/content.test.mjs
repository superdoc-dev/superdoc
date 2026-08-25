import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const contentRoot = new URL('../content/docs/', import.meta.url);
const snippetsRoot = fileURLToPath(new URL('../snippets/', import.meta.url));
const snippetsRootPrefix = snippetsRoot.endsWith('/') ? snippetsRoot : `${snippetsRoot}/`;
// Runnable examples own their typecheck and are included directly so the guide cannot drift from the app.
const examplesRoot = fileURLToPath(new URL('../../../examples/', import.meta.url));
const examplesRootPrefix = examplesRoot.endsWith('/') ? examplesRoot : `${examplesRoot}/`;
const runtimeConfigUrl = new URL('../config/editor-demo-runtime.json', import.meta.url);
const layoutUrl = new URL('../lib/layout.tsx', import.meta.url);
const docsHomeUrl = new URL('../components/docs-home.tsx', import.meta.url);
const builtInUiMetaUrl = new URL('../content/docs/editor/built-in-ui/meta.json', import.meta.url);
const builtInUiMapUrl = new URL('../components/embeds/built-in-ui-map.tsx', import.meta.url);
const editorDemoUrl = new URL('../components/embeds/editor-demo.tsx', import.meta.url);
const docsComponentsCssUrl = new URL('../components/docs-components.css', import.meta.url);
const pinnedV2MajorPackageInstall =
  /\b(?:pnpm add(?:\s+--global)?|npm (?:install|i|add)|yarn add|bun add)[^\n]*\s(?:superdoc|@superdoc\/[a-z0-9-]+)@(?:\^|~)?2(?:[.\w-]*)?(?=\s|$)/mu;
const focusedToolbarExampleUrl = new URL('../snippets/editor/focused-built-in-toolbar.ts', import.meta.url);
const focusedReactToolbarExampleUrl = new URL('../snippets/editor/react-focused-built-in-toolbar.tsx', import.meta.url);
const builtInEditorDemoDataUrl = new URL('../lib/built-in-editor-demos.ts', import.meta.url);
const reactToolbarExampleUrl = new URL('../snippets/editor/react-custom-toolbar.tsx', import.meta.url);
const reactBuiltInCommentsExampleUrl = new URL('../snippets/editor/react-built-in-comments.tsx', import.meta.url);
const reactBuiltInSearchExampleUrl = new URL('../snippets/editor/react-built-in-find-replace.tsx', import.meta.url);
const reactBuiltInHyperlinksExampleUrl = new URL('../snippets/editor/react-built-in-hyperlinks.tsx', import.meta.url);
const builtInContextMenuExampleUrl = new URL('../snippets/editor/built-in-context-menu.ts', import.meta.url);
const reactBuiltInContextMenuExampleUrl = new URL('../snippets/editor/react-built-in-context-menu.tsx', import.meta.url);
const documentApiReferenceModelUrl = new URL('../generated/document-api-reference.json', import.meta.url);
const generatedProofingConfigUrl = new URL('../generated/proofing-config-reference.json', import.meta.url);
const superdocCoreTypesUrl = new URL('../../../packages/superdoc/src/core/types/index.ts', import.meta.url);
const reviewHighlightsExampleUrl = new URL('../snippets/editor/review-highlights.ts', import.meta.url);
const commentThreadExampleUrl = new URL('../snippets/document-api/comment-thread.ts', import.meta.url);
const documentStorageExampleUrl = new URL('../snippets/editor/document-storage.ts', import.meta.url);
const reactDocumentStorageExampleUrl = new URL('../snippets/editor/react-document-storage.tsx', import.meta.url);
const versionHistoryExampleUrl = new URL('../snippets/editor/editor-version-history.ts', import.meta.url);
const vanillaQuickstartExampleUrl = new URL('../../../examples/vanilla/src/main.ts', import.meta.url);
const reactQuickstartExampleUrl = new URL('../../../examples/react/src/App.tsx', import.meta.url);
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
  'BuiltInUiMap',
  'CommandStateDemo',
  'ConfigReference',
  'CustomBoldDemo',
  'CustomUiArchitecture',
  'DocumentPreview',
  'DocumentApiNamespace',
  'DocumentApiOperation',
  'DocumentApiReferenceLanding',
  'DocsHome',
  'EditorDemo',
  'FileDownload',
  'FrameworkExample',
  'FrameworkExampleTabs',
  'InterfaceOwnership',
  'LifecycleJourney',
  'MigrationAgentPrompt',
  'MigrationExplorer',
  'MigrationExample',
  'MigrationExampleTabs',
  'ProofingConfigReference',
  'ReceiptBar',
  'RuntimeExample',
  'RuntimeExampleTabs',
]);
const editorDemoPresets = new Set([
  'comments',
  'context-menu',
  'document-modes',
  'hyperlinks',
  'proofing',
  'search',
  'toolbar',
  'tracked-review',
]);

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

test('the editor demo runtime uses exact stable packages', async () => {
  const runtimeConfig = JSON.parse(await readFile(runtimeConfigUrl, 'utf8'));
  const superdocPackage = JSON.parse(await readFile(superdocPackageUrl, 'utf8'));
  const engineSpecifier = superdocPackage.dependencies?.[runtimeConfig.enginePackage];

  assert.equal(runtimeConfig.runtimePackage, superdocPackage.name);
  assert.match(runtimeConfig.runtimeVersion, /^2\.\d+\.\d+$/u);
  assert.match(runtimeConfig.engineVersion, /^\d+\.\d+\.\d+$/u);
  assert.ok(engineSpecifier, `${runtimeConfig.enginePackage} must remain a SuperDoc dependency`);
  assert.equal(runtimeConfig.uiModulePath, superdocPackage.exports?.['./ui']?.import?.slice(1));
});

test('the built-in toolbar example uses item names from the v2 toolbar catalog', async () => {
  const examples = await Promise.all(
    [focusedToolbarExampleUrl, focusedReactToolbarExampleUrl].map((url) => readFile(url, 'utf8')),
  );
  const catalog = await readFile(toolbarCatalogUrl, 'utf8');
  const demoData = await readFile(builtInEditorDemoDataUrl, 'utf8');
  const catalogItems = new Set([...catalog.matchAll(/\bname:\s*'([^']+)'/gu)].map((match) => match[1]));

  for (const example of examples) {
    const groups = example.match(/groups:\s*\{([\s\S]*?)\n\s*\},/u)?.[1];

    assert.ok(groups, 'The focused toolbar example must define an explicit groups allowlist.');

    const configuredItems = [...groups.matchAll(/'([^']+)'/gu)].map((match) => match[1]);
    const unknownItems = configuredItems.filter((item) => !catalogItems.has(item));

    assert.deepEqual(unknownItems, []);
    assert.ok(!configuredItems.includes('overflow'), 'Grouped toolbars should list controls, not overflow chrome.');
  }

  const demoGroups = demoData.match(/toolbarDemoGroups = \{([\s\S]*?)\n\} as const/u)?.[1];
  assert.ok(demoGroups, 'The toolbar demo must define the grouped toolbar it renders.');
  const demoItems = new Set([...demoGroups.matchAll(/'([^']+)'/gu)].map((match) => match[1]));
  const unknownDemoItems = [...demoItems].filter((item) => !catalogItems.has(item));

  assert.deepEqual(unknownDemoItems, []);
  assert.ok(!demoItems.has('overflow'), 'The toolbar demo data should not expose overflow chrome.');
  assert.match(demoData, /toolbarDemoExcludedItems = \['bold', 'italic'\] as const/u);
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

test('the React comments example keeps restart-sensitive config identities stable', async () => {
  const example = await readFile(reactBuiltInCommentsExampleUrl, 'utf8');

  assert.match(example, /const editorConfig = \{/u);
  assert.match(example, /user=\{editorConfig\.user\}/u);
  assert.match(example, /ui=\{editorConfig\.ui\}/u);
  assert.doesNotMatch(example, /\b(?:user|ui)=\{\{/u);
});

test('the React search example enables the built-in search surface with stable config', async () => {
  const example = await readFile(reactBuiltInSearchExampleUrl, 'utf8');

  assert.match(example, /const editorConfig = \{/u);
  assert.match(example, /search: true/u);
  assert.match(example, /ui=\{editorConfig\.ui\}/u);
  assert.doesNotMatch(example, /\bui=\{\{/u);
});

test('the React hyperlinks example keeps restart-sensitive config identities stable', async () => {
  const example = await readFile(reactBuiltInHyperlinksExampleUrl, 'utf8');

  assert.match(example, /const editorConfig = \{/u);
  assert.match(example, /hyperlinks=\{editorConfig\.hyperlinks\}/u);
  assert.match(example, /ui=\{editorConfig\.ui\}/u);
  assert.doesNotMatch(example, /\b(?:hyperlinks|ui)=\{\{/u);
});

test('the context menu examples use the canonical composition fields', async () => {
  const examples = await Promise.all(
    [builtInContextMenuExampleUrl, reactBuiltInContextMenuExampleUrl].map((url) => readFile(url, 'utf8')),
  );

  for (const example of examples) {
    assert.match(example, /\bsections:\s*\[/u);
    assert.doesNotMatch(example, /\b(?:customItems|includeDefaultItems)\b/u);
  }
});

test('the built-in Editor demos keep focused controls and restart-safe configuration changes', async () => {
  const demo = await readFile(editorDemoUrl, 'utf8');

  assert.match(demo, /groups: \{ left: \['search'\] \}/u);
  assert.match(demo, /search: \{ replaceEnabled: initialReplaceEnabled \}/u);
  assert.match(demo, /toolbar: getToolbarOptions\(initialToolbarStrategy, builtInToolbar!\)/u);
  assert.match(
    demo,
    /interaction:\s+preset === 'comments' \? \{ comments: getCommentsInteractionOptions\(initialCommentsLevel\) \} : undefined/u,
  );
  assert.match(demo, /readOnly: level === 'read'/u);
  assert.match(demo, /allowResolve: level === 'resolve'/u);
  assert.match(demo, /export\(\{ exportType: \['docx'\], triggerDownload: false \}\)/u);
  assert.match(demo, /const currentDocumentMode = instance\.config\.documentMode/u);
  assert.match(demo, /const hadMountedEditor = instanceRef\.current !== null/u);
  assert.match(demo, /setState\(replacedEditor \|\| !hadMountedEditor \? 'error' : 'ready'\)/u);
  assert.match(
    demo,
    /commentsLayout,\s+commentsLevel,\s+contextMenuStrategy,\s+documentMode: currentDocumentMode,\s+hyperlinkBehavior,\s+replaceEnabled,\s+toolbarStrategy,/u,
  );
  assert.match(
    demo,
    /setDemoInteractionBlocked\(true\)[\s\S]*Promise\.all\([\s\S]*finally \{\s+if \(mountedRef\.current && loadId === loadIdRef\.current\) setDemoInteractionBlocked\(false\);/u,
  );
  assert.match(demo, /setDemoInteractionBlocked\(true\)[\s\S]*instance\.export/u);
  assert.match(demo, /retryMountRef\.current = retry/u);
  assert.match(demo, /document\.documentElement\.requestFullscreen\(\)/u);
  assert.match(demo, /finally \{\s+setDemoInteractionBlocked\(false\)/u);
  assert.match(demo, /onZoomChange: \(\{ zoom: nextZoom \}\)/u);
  assert.match(demo, /label='Mode'[\s\S]*options=\{documentModes\}/u);
  assert.match(demo, /documentMode === 'viewing'[\s\S]*label='Changes'[\s\S]*options=\{viewingTrackedChangesModes\}/u);
  assert.match(demo, /instance\.setViewingOptions\(\{ trackedChanges: mode \}\)/u);
  assert.match(demo, /className='sd-editor-demo-config-reset'/u);
  assert.doesNotMatch(demo, /sd-editor-demo-mode-(?:header|footer|switcher)/u);
  assert.match(demo, /label='Toolbar'[\s\S]*options=\{toolbarDemoStrategies\}/u);
  assert.match(demo, /label='Layout'[\s\S]*options=\{commentsDemoLayouts\}/u);
  assert.match(demo, /label='Actions'[\s\S]*options=\{commentsDemoLevels\}/u);
  assert.match(demo, /label='Menu'[\s\S]*options=\{contextMenuDemoStrategies\}/u);
  assert.match(demo, /label='Activation'[\s\S]*options=\{hyperlinkDemoBehaviors\}/u);
  assert.match(demo, /label='Replacement'/u);
  assert.equal([...demo.matchAll(/<DemoViewControls\b/gu)].length, 2);
});

test('the generated reference model mirrors the canonical operation inventory', async () => {
  const model = JSON.parse(await readFile(documentApiReferenceModelUrl, 'utf8'));
  const contractOperationIds = await readContractOperationIds();
  const modelOperationIds = Object.keys(model.operations).sort();
  const operationPaths = Object.values(model.operations).map((operation) => operation.path);

  assert.deepEqual(modelOperationIds, [...contractOperationIds].sort());
  assert.equal(new Set(operationPaths).size, modelOperationIds.length);
});

test('the generated reference navigation does not repeat page-tree entries', async () => {
  const metadata = JSON.parse(
    await readFile(new URL('../content/docs/document-api/reference/meta.json', import.meta.url), 'utf8'),
  );

  assert.equal(new Set(metadata.pages).size, metadata.pages.length);
  assert.ok(metadata.pages.includes('document-index'));
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

test('the Content Controls curation covers every operation exactly once', async () => {
  const model = JSON.parse(await readFile(documentApiReferenceModelUrl, 'utf8'));
  const curation = await import('../lib/document-api-reference/curation.ts');
  const operationIds = model.groups.find((group) => group.key === 'contentControls').operationIds;
  const curatedIds = curation.getNamespaceJobs('contentControls', operationIds).flatMap((job) => job.operationIds);

  assert.equal(new Set(curatedIds).size, curatedIds.length);
  assert.deepEqual([...curatedIds].sort(), [...operationIds].sort());
});

test('the generated proofing reference mirrors the exported fields', async () => {
  const generatedProofingConfig = JSON.parse(await readFile(generatedProofingConfigUrl, 'utf8'));
  const superdocTypes = await readFile(superdocCoreTypesUrl, 'utf8');

  const configBody = superdocTypes.match(/export interface ProofingConfig \{([\s\S]*?)\n\}/u)?.[1] ?? '';
  const providerBody = superdocTypes.match(/export interface ProofingProvider \{([\s\S]*?)\n\}/u)?.[1] ?? '';
  const configFields = [...configBody.matchAll(/^\s{2}(\w+)\??:/gmu)].map((match) => match[1]).sort();
  const documentedFields = generatedProofingConfig.fields.map((field) => field.name).sort();
  assert.deepEqual(documentedFields, configFields);
  assert.equal(new Set(documentedFields).size, documentedFields.length);
  assert.ok(generatedProofingConfig.fields.every((field) => field.type && field.description));

  const providerField = generatedProofingConfig.fields.find((field) => field.name === 'provider');
  const providerTypeName = configBody.match(/^\s{2}provider\??:\s*([^;]+);/mu)?.[1];
  const providerCheck = providerBody.match(/^\s{2}check:\s*([^;]+);/mu)?.[1];
  const providerFields = [...providerBody.matchAll(/^\s{2}(\w+)\??:/gmu)].map((match) => match[1]).sort();
  const documentedProviderFields = [...(providerField?.type ?? '').matchAll(/^\s{2}(\w+)\??:/gmu)]
    .map((match) => match[1])
    .sort();

  assert.ok(providerField);
  assert.equal(providerField.typeName, providerTypeName);
  assert.deepEqual(documentedProviderFields, providerFields);
  assert.ok(providerCheck && providerField.type.includes(`check: ${providerCheck};`));
});

test('the Editor configuration reference starts with concise essential fields', async () => {
  const { editorConfigExplorer } = await import('../lib/editor-config-explorer.ts');
  const { configTemplate, renderConfigReferenceMarkdown } = await import('../lib/config-explorer.ts');
  const essentials = editorConfigExplorer.fields
    .filter((field) => field.group === 'essentials')
    .map((field) => field.name);
  const lifecycle = editorConfigExplorer.fields
    .filter((field) => field.group === 'lifecycle')
    .map((field) => field.name);

  assert.deepEqual(essentials, ['selector', 'document', 'documentMode', 'user']);
  assert.ok(['onReady', 'onContentError', 'onException'].every((field) => lifecycle.includes(field)));
  const copiedSetup = configTemplate(editorConfigExplorer);
  assert.match(copiedSetup, /onReady:/u);
  assert.match(copiedSetup, /onContentError:/u);
  assert.match(copiedSetup, /onException:/u);
  assert.ok(editorConfigExplorer.fields.every((field) => field.summary?.length));
  assert.ok(editorConfigExplorer.fields.every((field) => !field.summary?.includes('Painter plan')));
  assert.equal(editorConfigExplorer.fields.find((field) => field.name === 'onSidebarToggle')?.type, '(isOpened: boolean) => void');
  assert.equal(
    editorConfigExplorer.fields.find((field) => field.name === 'onException')?.type,
    '(params: SuperDocExceptionPayload) => void',
  );
  assert.equal(
    editorConfigExplorer.fields.find((field) => field.name === 'rulerContainer')?.deprecatedReplacement,
    'ui.ruler.container',
  );
  assert.match(renderConfigReferenceMarkdown(editorConfigExplorer), /Deprecated\. Use `ui\.ruler\.container` instead/u);
});

test('the lifecycle journey maps the application states to public Editor signals', async () => {
  const { lifecycleFailure, lifecycleStages, renderLifecycleJourneyMarkdown } =
    await import('../lib/lifecycle-journey.ts');

  assert.deepEqual(
    lifecycleStages.map((stage) => stage.id),
    ['mount', 'ready', 'edit', 'save', 'unmount'],
  );
  assert.deepEqual(
    lifecycleStages.map((stage) => stage.signal),
    ['new SuperDoc()', 'onReady', 'onEditorUpdate', 'export() + fetch()', 'destroy()'],
  );
  assert.match(lifecycleFailure.signal, /onContentError.*onException/u);

  const markdown = renderLifecycleJourneyMarkdown();
  assert.match(markdown, /Mark the document saved only after your backend accepts them/u);
  assert.match(markdown, /Show a retry path instead of an empty mount point/u);
});

test('the document storage example preserves unsaved state and reports failures', async () => {
  const [storage, reactStorage] = await Promise.all(
    [documentStorageExampleUrl, reactDocumentStorageExampleUrl].map((url) => readFile(url, 'utf8')),
  );

  assert.match(storage, /const savedRevision = editRevision/u);
  assert.match(storage, /editRevision === savedRevision \? 'Saved' : 'Unsaved changes'/u);
  assert.match(storage, /Could not open the document\. Reload to try again\./u);
  assert.match(storage, /Save failed\. Try again\./u);
  assert.match(reactStorage, /if \(savingRef\.current\) return;/u);
  assert.match(reactStorage, /savingRef\.current = true;[\s\S]*finally \{\s+savingRef\.current = false;/u);
  assert.match(reactStorage, /const savedRevision = editRevisionRef\.current/u);
  assert.match(reactStorage, /editRevisionRef\.current === savedRevision \? 'Saved' : 'Unsaved changes'/u);
  assert.match(reactStorage, /setSaveStatus\('Save failed\. Try again\.'\)/u);
  assert.match(reactStorage, /<output aria-live='polite'>/u);
  assert.match(reactStorage, /onContentError/u);
  assert.match(reactStorage, /onException/u);
});

test('the version history example rolls back a failed restore', async () => {
  const example = await readFile(versionHistoryExampleUrl, 'utf8');
  const capture = example.indexOf('const activeDocx = await exportDocx(superdoc)');
  const openSnapshot = example.indexOf('await openDocument(superdoc, docx)');

  assert.ok(capture >= 0 && capture < openSnapshot);
  assert.match(example, /try \{\s+await openDocument\(superdoc, docx\)/u);
  assert.match(example, /const current = await fetch\(documentEndpoint\)\.catch\(\(\) => null\)/u);
  assert.match(example, /current\?\.ok[\s\S]*: activeDocx/u);
  assert.match(example, /await openDocument\(superdoc, rollbackDocx\)/u);
});

test('Quickstart examples report both document failure paths', async () => {
  const [vanilla, react] = await Promise.all(
    [vanillaQuickstartExampleUrl, reactQuickstartExampleUrl].map((url) => readFile(url, 'utf8')),
  );

  for (const example of [vanilla, react]) {
    assert.match(example, /onContentError/u);
    assert.match(example, /onException/u);
  }
});

test('mutation and headless examples keep their safety guards', async () => {
  const [reviewHighlights, commentThread, pythonSdk, cli] = await Promise.all(
    [reviewHighlightsExampleUrl, commentThreadExampleUrl, pythonSdkExampleUrl, cliExampleUrl].map((url) =>
      readFile(url, 'utf8'),
    ),
  );

  assert.match(reviewHighlights, /expectedRevision: overlapping\.evaluatedRevision/u);
  assert.match(reviewHighlights, /expectedRevision: current\.evaluatedRevision/u);
  assert.match(commentThread, /expectedRevision: match\.evaluatedRevision/u);
  assert.match(commentThread, /expectedRevision: afterCreate\.evaluatedRevision/u);
  assert.match(commentThread, /expectedRevision: afterReply\.evaluatedRevision/u);
  assert.match(pythonSdk, /try:[\s\S]*finally:\s+document\.close\(\{"discard": True\}\)/u);
  assert.match(cli, /trap 'superdoc close --discard [^']+' EXIT/u);
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
    [...links.matchAll(/(?:href=|url:\s*)'\/([^/'#?]+)(?:\/[^']*)?'/gu)].map(([, section]) => section),
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

test('the built-in UI map follows its section navigation', async () => {
  const meta = JSON.parse(await readFile(builtInUiMetaUrl, 'utf8'));
  const { builtInUiSurfaces } = await import('../lib/built-in-ui-map.ts');
  const guideSlugs = builtInUiSurfaces.map((surface) => surface.slug);

  assert.deepEqual(guideSlugs, meta.pages.slice(1));
  assert.deepEqual(
    builtInUiSurfaces.map((surface) => surface.href),
    guideSlugs.map((slug) => `/editor/built-in-ui/${slug}`),
  );
});

test('the built-in UI map keeps its vertical tab semantics at responsive widths', async () => {
  const source = await readFile(builtInUiMapUrl, 'utf8');
  const css = await readFile(docsComponentsCssUrl, 'utf8');
  const tabRules = [...css.matchAll(/\.sd-builtin-map-tabs\s*\{([^}]*)\}/g)];

  assert.match(source, /orientation='vertical'/);
  assert.ok(tabRules.length > 0, 'the built-in UI map must define its tab layout');
  assert.match(tabRules[0][1], /display:\s*flex/);
  assert.match(tabRules[0][1], /flex-direction:\s*column/);
  for (const rule of tabRules.slice(1)) {
    assert.doesNotMatch(rule[1], /display:\s*grid|grid-template-columns/);
  }
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

test('fenced code fragments parse', async () => {
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
