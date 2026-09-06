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
const customBoldDemoUrl = new URL('../components/embeds/custom-bold-demo.tsx', import.meta.url);
const customUiMetaUrl = new URL('../content/docs/editor/custom-ui/meta.json', import.meta.url);
const customUiSetupPageUrl = new URL('../content/docs/editor/custom-ui/controller-setup.mdx', import.meta.url);
const customToolbarPageUrl = new URL('../content/docs/editor/custom-ui/formatting-controls.mdx', import.meta.url);
const customCommentsPageUrl = new URL('../content/docs/editor/custom-ui/comments.mdx', import.meta.url);
const customCommentsDemoUrl = new URL('../components/embeds/custom-comments-demo.tsx', import.meta.url);
const customTrackChangesPageUrl = new URL('../content/docs/editor/custom-ui/tracked-changes.mdx', import.meta.url);
const customTrackChangesDemoUrl = new URL('../components/embeds/custom-track-changes-demo.tsx', import.meta.url);
const customContentControlsPageUrl = new URL(
  '../content/docs/editor/custom-ui/content-controls.mdx',
  import.meta.url,
);
const customContentControlsDemoUrl = new URL(
  '../components/embeds/custom-content-controls-demo.tsx',
  import.meta.url,
);
const templatePopulationDemoUrl = new URL(
  '../components/embeds/template-population-demo.tsx',
  import.meta.url,
);
const contentControlAuthoringDemoUrl = new URL(
  '../components/embeds/content-control-authoring-demo.tsx',
  import.meta.url,
);
const contentControlAuthoringFixtureUrl = new URL('../public/fixtures/service-agreement-draft.docx', import.meta.url);
const contentControlAuthoringExampleFixtureUrl = new URL(
  '../../../examples/content-controls/public/service-agreement-draft.docx',
  import.meta.url,
);
const contentControlLocksDemoUrl = new URL(
  '../components/embeds/content-control-locks-demo.tsx',
  import.meta.url,
);
const editorDemoViewControlsUrl = new URL(
  '../components/embeds/editor-demo-view-controls.tsx',
  import.meta.url,
);
const docsComponentsCssUrl = new URL('../components/docs-components.css', import.meta.url);
const pinnedV2MajorPackageInstall =
  /\b(?:pnpm add(?:\s+--global)?|npm (?:install|i|add)|yarn add|bun add)[^\n]*\s(?:superdoc|@superdoc\/[a-z0-9-]+)@(?:\^|~)?2(?:[.\w-]*)?(?=\s|$)/mu;
const focusedToolbarExampleUrl = new URL('../snippets/editor/focused-built-in-toolbar.ts', import.meta.url);
const focusedReactToolbarExampleUrl = new URL('../snippets/editor/react-focused-built-in-toolbar.tsx', import.meta.url);
const builtInToolbarPageUrl = new URL(
  '../content/docs/editor/built-in-ui/configure-the-toolbar.mdx',
  import.meta.url,
);
const redirectsConfigUrl = new URL('../config/redirects.json', import.meta.url);
const builtInEditorDemoDataUrl = new URL('../lib/built-in-editor-demos.ts', import.meta.url);
const customUiControllerExampleUrl = new URL('../snippets/editor/custom-ui-controller.ts', import.meta.url);
const reactToolbarExampleUrl = new URL('../snippets/editor/react-custom-toolbar.tsx', import.meta.url);
const customToolbarExampleUrl = new URL('../snippets/editor/custom-toolbar.ts', import.meta.url);
const reactCustomToolbarExampleUrl = new URL(
  '../snippets/editor/react-custom-formatting-toolbar.tsx',
  import.meta.url,
);
const customCommentsExampleUrl = new URL('../snippets/editor/custom-comments.ts', import.meta.url);
const customCommentsHtmlUrl = new URL('../snippets/editor/custom-comments.html', import.meta.url);
const reactCustomCommentsExampleUrl = new URL('../snippets/editor/react-custom-comments.tsx', import.meta.url);
const customTrackedReviewExampleUrl = new URL('../snippets/editor/custom-tracked-review.ts', import.meta.url);
const customTrackedReviewHtmlUrl = new URL('../snippets/editor/custom-tracked-review.html', import.meta.url);
const reactCustomTrackedReviewExampleUrl = new URL(
  '../snippets/editor/react-custom-tracked-review.tsx',
  import.meta.url,
);
const customContentControlsExampleUrl = new URL('../snippets/editor/custom-content-controls.ts', import.meta.url);
const reactCustomContentControlsExampleUrl = new URL(
  '../snippets/editor/react-custom-content-controls.tsx',
  import.meta.url,
);
const reactBuiltInCommentsExampleUrl = new URL('../snippets/editor/react-built-in-comments.tsx', import.meta.url);
const builtInContentControlsPageUrl = new URL(
  '../content/docs/editor/built-in-ui/content-controls.mdx',
  import.meta.url,
);
const builtInContentControlsExampleUrl = new URL('../snippets/editor/built-in-content-controls.ts', import.meta.url);
const reactBuiltInContentControlsExampleUrl = new URL(
  '../snippets/editor/react-built-in-content-controls.tsx',
  import.meta.url,
);
const reactBuiltInSearchExampleUrl = new URL('../snippets/editor/react-built-in-find-replace.tsx', import.meta.url);
const customSearchExampleUrl = new URL('../snippets/editor/custom-search.ts', import.meta.url);
const reactCustomSearchExampleUrl = new URL('../snippets/editor/react-custom-search.tsx', import.meta.url);
const customSearchPageUrl = new URL('../content/docs/editor/custom-ui/search.mdx', import.meta.url);
const customSearchDemoUrl = new URL('../components/embeds/custom-search-demo.tsx', import.meta.url);
const customSearchTrackedDeletionsUrl = new URL(
  '../snippets/editor/custom-search-tracked-deletions.ts',
  import.meta.url,
);
const reactBuiltInHyperlinksExampleUrl = new URL('../snippets/editor/react-built-in-hyperlinks.tsx', import.meta.url);
const builtInContextMenuExampleUrl = new URL('../snippets/editor/built-in-context-menu.ts', import.meta.url);
const reactBuiltInContextMenuExampleUrl = new URL('../snippets/editor/react-built-in-context-menu.tsx', import.meta.url);
const customContextMenuExampleUrl = new URL('../snippets/editor/custom-context-menu.ts', import.meta.url);
const reactCustomContextMenuExampleUrl = new URL(
  '../snippets/editor/react-custom-context-menu.tsx',
  import.meta.url,
);
const documentApiReferenceModelUrl = new URL('../generated/document-api-reference.json', import.meta.url);
const generatedProofingConfigUrl = new URL('../generated/proofing-config-reference.json', import.meta.url);
const generatedSearchConfigUrl = new URL('../generated/search-config-reference.json', import.meta.url);
const generatedSearchFloatingConfigUrl = new URL('../generated/search-floating-config-reference.json', import.meta.url);
const generatedSearchStringsUrl = new URL('../generated/search-strings-reference.json', import.meta.url);
const generatedHyperlinksConfigUrl = new URL('../generated/hyperlinks-config-reference.json', import.meta.url);
const generatedLoadingConfigUrl = new URL('../generated/loading-config-reference.json', import.meta.url);
const generatedRulerUiConfigUrl = new URL('../generated/ruler-ui-config-reference.json', import.meta.url);
const generatedRulerEditorConfigUrl = new URL('../generated/ruler-editor-config-reference.json', import.meta.url);
const generatedContextMenuConfigUrl = new URL('../generated/context-menu-config-reference.json', import.meta.url);
const generatedToolbarConfigUrl = new URL('../generated/toolbar-config-reference.json', import.meta.url);
const generatedCommentsConfigUrl = new URL('../generated/comments-config-reference.json', import.meta.url);
const generatedCommentsResponsiveConfigUrl = new URL(
  '../generated/comments-responsive-config-reference.json',
  import.meta.url,
);
const generatedCommentInteractionConfigUrl = new URL(
  '../generated/comment-interaction-config-reference.json',
  import.meta.url,
);
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

function compileImageMimeNormalizer(example) {
  const source = example.match(/function withImageMimeType\(file: File\): Blob \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(source, 'The toolbar example must define withImageMimeType.');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return Function(`${javascript}\nreturn withImageMimeType;`)();
}

const registeredComponents = new Set([
  'Card',
  'Cards',
  'Callout',
  'BuiltInUiMap',
  'ClauseLibraryDemo',
  'CommandStateDemo',
  'ContentControlAuthoringDemo',
  'ContentControlLocksDemo',
  'ContentControlPatterns',
  'CommentsConfigReference',
  'ConfigReference',
  'ContextMenuConfigReference',
  'CustomBoldDemo',
  'CustomCommentsDemo',
  'CustomContentControlsDemo',
  'CustomSearchDemo',
  'CustomTrackChangesDemo',
  'CustomToolbarDemo',
  'CustomUiArchitecture',
  'CollaborationOverview',
  'CollaborationDemo',
  'DocumentPreview',
  'DocumentApiNamespace',
  'DocumentApiOperation',
  'DocumentApiReferenceLanding',
  'DocsHome',
  'EditorDemo',
  'FileDownload',
  'FrameworkExample',
  'FrameworkExampleTabs',
  'HyperlinksConfigReference',
  'InterfaceOwnership',
  'LifecycleJourney',
  'LoadingConfigReference',
  'MigrationAgentPrompt',
  'MigrationExplorer',
  'MigrationExample',
  'MigrationExampleTabs',
  'ProofingConfigReference',
  'ReceiptBar',
  'RuntimeExample',
  'RuntimeExampleTabs',
  'RulerConfigReference',
  'SearchConfigReference',
  'ToolbarConfigReference',
  'TemplatePopulationDemo',
]);
const editorDemoPresets = new Set([
  'comments',
  'content-controls',
  'context-menu',
  'document-modes',
  'hyperlinks',
  'loading',
  'proofing',
  'ruler',
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

test('the custom UI overview demo uses the Editor-owned controller', async () => {
  const demo = await readFile(customBoldDemoUrl, 'utf8');

  assert.match(demo, /const ui = instance\.ui/u);
  assert.doesNotMatch(demo, /\b(?:createSuperDocUI|loadUIModule)\b/u);
});

test('the custom UI setup demo shows one control changing ownership', async () => {
  const [page, demo] = await Promise.all(
    [customUiSetupPageUrl, customBoldDemoUrl].map((url) => readFile(url, 'utf8')),
  );

  assert.match(page, /<CustomBoldDemo variant='handoff' \/>/u);
  assert.match(page, /Only the visible Bold control changed owner/u);
  assert.match(demo, /excludeItems: \['bold'\]/u);
  assert.match(demo, /const toolbarContainer = builtInToolbarRef\.current/u);
  assert.match(demo, /container: toolbarContainer/u);
  assert.match(demo, /data-variant=\{variant\}/u);
  assert.match(
    demo,
    /\{isHandoffVariant \? \([\s\S]*\{applicationControls\}[\s\S]*\{builtInControls\}[\s\S]*\) : null\}\s*<CollapsibleEditorPreview/u,
  );
  assert.match(demo, /<CollapsibleEditorPreview[\s\S]*\{!isHandoffVariant \? applicationControls : null\}/u);
});

test('the built-in toolbar examples use canonical public item ids', async () => {
  const examples = await Promise.all(
    [focusedToolbarExampleUrl, focusedReactToolbarExampleUrl].map((url) => readFile(url, 'utf8')),
  );
  const publicTypes = await readFile(superdocCoreTypesUrl, 'utf8');
  const demoData = await readFile(builtInEditorDemoDataUrl, 'utf8');
  const itemType = publicTypes.match(/export type ToolbarItemId =([\s\S]*?);/u)?.[1];

  assert.ok(itemType, 'ToolbarItemId must remain a named public union.');
  const publicItems = new Set([...itemType.matchAll(/'([^']+)'/gu)].map((match) => match[1]));

  for (const example of examples) {
    const items = example.match(/items:\s*\{([\s\S]*?)\n\s*\},/u)?.[1];

    assert.ok(items, 'The focused toolbar example must define an explicit items allowlist.');

    const configuredItems = [...items.matchAll(/'([^']+)'/gu)].map((match) => match[1]);
    const unknownItems = configuredItems.filter((item) => !publicItems.has(item));

    assert.deepEqual(unknownItems, []);
    assert.ok(!configuredItems.includes('overflow'), 'Focused toolbars should list controls, not overflow chrome.');
  }

  const demoConfig = demoData.match(/toolbarDemoItems = \{([\s\S]*?)\n\} as const/u)?.[1];
  assert.ok(demoConfig, 'The toolbar demo must define the focused toolbar it renders.');
  const demoItems = new Set([...demoConfig.matchAll(/'([^']+)'/gu)].map((match) => match[1]));
  const unknownDemoItems = [...demoItems].filter((item) => !publicItems.has(item));

  assert.deepEqual(unknownDemoItems, []);
  assert.ok(!demoItems.has('overflow'), 'The toolbar demo data should not expose overflow chrome.');
  assert.match(demoData, /toolbarDemoExcludedItems = \['bold', 'italic'\] as const/u);
});

test('the toolbar guide preserves the built-in image upload workflow', async () => {
  const [page, vanillaExample, reactExample, redirectsConfig] = await Promise.all([
    readFile(builtInToolbarPageUrl, 'utf8'),
    readFile(focusedToolbarExampleUrl, 'utf8'),
    readFile(focusedReactToolbarExampleUrl, 'utf8'),
    readFile(redirectsConfigUrl, 'utf8').then(JSON.parse),
  ]);

  for (const example of [vanillaExample, reactExample]) {
    assert.match(example, /center: \[[^\]]*'image'/u);
    assert.match(example, /handleImageUpload/u);
    assert.match(example, /new FileReader\(\)/u);
    assert.match(example, /file\.slice\(0, file\.size, 'image\/png'\)/u);
    assert.match(example, /file\.slice\(0, file\.size, 'image\/jpeg'\)/u);
    assert.match(example, /readAsDataURL\(withImageMimeType\(file\)\)/u);
    assert.doesNotMatch(example, /URL\.(?:create|revoke)ObjectURL/u);

    const withImageMimeType = compileImageMimeNormalizer(example);
    const typedPng = { name: 'typed.png', size: 4, type: 'image/png' };
    const typedJpeg = { name: 'typed.jpg', size: 4, type: 'image/jpeg' };
    assert.equal(withImageMimeType(typedPng), typedPng);
    assert.equal(withImageMimeType(typedJpeg), typedJpeg);

    const sliceCalls = [];
    const emptyTypeFile = (name) => ({
      name,
      size: 4,
      type: '',
      slice(start, end, type) {
        sliceCalls.push({ start, end, type });
        return { type };
      },
    });
    assert.deepEqual(withImageMimeType(emptyTypeFile('scan.PNG')), { type: 'image/png' });
    assert.deepEqual(withImageMimeType(emptyTypeFile('photo.JpEg')), { type: 'image/jpeg' });
    assert.deepEqual(sliceCalls, [
      { start: 0, end: 4, type: 'image/png' },
      { start: 0, end: 4, type: 'image/jpeg' },
    ]);
    assert.throws(() => withImageMimeType({ name: 'notes.txt', size: 4, type: '' }), /PNG or JPEG/u);
    assert.throws(() => withImageMimeType({ name: 'notes.png', size: 4, type: 'text/plain' }), /PNG or JPEG/u);
  }

  assert.match(page, /handleImageUpload/u);
  assert.match(page, /examples return data URLs/iu);
  assert.match(page, /no backend or temporary object URL/iu);
  assert.match(page, /extension-accepted PNG and JPEG files[^.]*browser leaves `file\.type` empty/iu);
  assert.match(page, /immediately fetches object or HTTP URLs/iu);
  assert.match(page, /embeds the image in the\s+DOCX/iu);
  assert.match(page, /same-origin/iu);
  assert.match(page, /public or presigned URL/iu);
  assert.match(page, /without cross-origin\s+cookies or custom authorization headers/iu);
  assert.match(page, /cross-origin requests \(CORS\)/iu);
  assert.match(page, /CORS[^.]*application's origin/iu);
  assert.doesNotMatch(page, /persistent (?:storage|URL)/iu);
  assert.match(page, /\[Configure content controls\]\(\/editor\/built-in-ui\/content-controls\)/u);

  const legacyRoute = redirectsConfig.pageMoves.find(
    ({ source }) => source === '/editor/built-in-ui/structured-content/',
  );
  assert.equal(legacyRoute?.destination, '/editor/built-in-ui/configure-the-toolbar/');
  assert.match(legacyRoute?.reason ?? '', /image/u);
});

test('the redirected toolbar guide preserves the built-in table controls', async () => {
  const [page, vanillaExample, reactExample, redirectsConfig] = await Promise.all([
    readFile(builtInToolbarPageUrl, 'utf8'),
    readFile(focusedToolbarExampleUrl, 'utf8'),
    readFile(focusedReactToolbarExampleUrl, 'utf8'),
    readFile(redirectsConfigUrl, 'utf8').then(JSON.parse),
  ]);

  for (const example of [vanillaExample, reactExample]) {
    assert.match(example, /center: \[[^\]]*'table'[^\]]*'table-actions'/u);
  }

  assert.match(page, /\*\*Table\*\* inserts a table/iu);
  assert.match(page, /\*\*Table actions\*\*[^.]*selection is inside a table/iu);

  const legacyRoute = redirectsConfig.pageMoves.find(
    ({ source }) => source === '/editor/built-in-ui/structured-content/',
  );
  assert.equal(legacyRoute?.destination, '/editor/built-in-ui/configure-the-toolbar/');
  assert.match(legacyRoute?.reason ?? '', /table/u);
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

test('the custom UI setup preserves selection and shares the Editor-owned controller', async () => {
  const markupUrl = new URL('../snippets/editor/custom-ui-controller.html', import.meta.url);
  const [markup, vanilla, react] = await Promise.all(
    [markupUrl, customUiControllerExampleUrl, reactToolbarExampleUrl].map((url) => readFile(url, 'utf8')),
  );

  for (const example of [vanilla, react]) {
    assert.match(example, /excludeItems: \['bold'\]/u);
    assert.match(example, /preventDefault\(\)/u);
    assert.doesNotMatch(example, /toolbar: false/u);
  }

  assert.match(markup, /id="toolbar"/u);
  assert.match(vanilla, /container: '#toolbar'/u);
  assert.match(vanilla, /ui: editorUi/u);
  assert.match(vanilla, /readySuperDoc\.ui\.commands\.get\('bold'\)/u);
  assert.match(vanilla, /bold\.executeAsync\(\)/u);
  assert.doesNotMatch(react, /container: '#toolbar'/u);
  assert.match(react, /useSuperDocCommand\('bold'\)/u);
  assert.match(react, /bold\.executeAsync\(\)/u);
  assert.match(react, /disabled=\{!bold\.enabled \|\| pending\}/u);
  assert.match(react, /setStatus\(\(current\) => \(\{ id: current\.id \+ 1,/u);
  assert.match(react, /<span key=\{status\.id\}>\{status\.message\}<\/span>/u);
  assert.match(react, /onReady=\{\(\{ superdoc \}\) => setSuperDoc\(superdoc\)\}/u);
  assert.doesNotMatch(react, /\bui=\{\{/u);
});

test('the custom toolbar continues the setup project with selection-aware controls', async () => {
  const [vanilla, react] = await Promise.all(
    [customToolbarExampleUrl, reactCustomToolbarExampleUrl].map((url) => readFile(url, 'utf8')),
  );

  for (const example of [vanilla, react]) {
    assert.match(example, /document(?:=|:)\s*['"]\/sample\.docx['"]/u);
    assert.match(example, /toolbar: false/u);
    assert.match(example, /useSuperDocCommand|get\('bold'\)/u);
    assert.match(example, /font-family/u);
    assert.match(example, /font-size/u);
    assert.doesNotMatch(example, /contract\.docx|document-mode|paragraph-style/u);
  }

  assert.match(vanilla, /ui\.fonts\.observe\(render\)/u);
  assert.match(react, /fontFamily\.executeAsync\(event\.target\.value\)/u);
  assert.match(react, /fontSize\.executeAsync\(event\.target\.value\)/u);

  // `Mixed` reports an indeterminate selection; choosing it would dispatch an
  // empty payload, so both examples keep it visible but not selectable.
  assert.match(vanilla, /mixed\.disabled = true/u);
  assert.equal(react.match(/<option disabled value=''>/gu)?.length, 2);

  // A uniform value outside the preset list is one value, not a mixed one.
  assert.match(vanilla, /\[\{ value: selected, label: selected \}, \.\.\.options\]/u);
  assert.match(react, /getPickerChoices\(fontOptions, fontFamily\.value\)/u);
  assert.match(react, /getPickerChoices\(sizeOptions, fontSize\.value\)/u);

  // Commands run one at a time, as the setup guide's control does.
  assert.match(vanilla, /boldButton\.disabled = pending \|\| !boldState\.enabled/u);
  assert.match(vanilla, /if \(pending\) return;/u);
  // The select is rebuilt when a command starts, so the chosen value is read first.
  assert.match(vanilla, /const value = fontFamilySelect\.value;\s+return run\(\(\) => fontFamily\.executeAsync\(value\)/u);
  assert.match(vanilla, /const value = fontSizeSelect\.value;\s+return run\(\(\) => fontSize\.executeAsync\(value\)/u);
  assert.match(react, /disabled=\{pending \|\| !bold\.enabled\}/u);
  assert.match(react, /if \(pending\) return;/u);
});

test('the custom UI navigation has no internal section separators', async () => {
  const { pages } = JSON.parse(await readFile(customUiMetaUrl, 'utf8'));

  assert.deepEqual(
    pages.filter((page) => typeof page === 'string' && page.startsWith('---')),
    [],
  );
});

test('the custom toolbar demo proves toggle, picker, and mixed selection state', async () => {
  const [page, demo] = await Promise.all(
    [customToolbarPageUrl, customBoldDemoUrl].map((url) => readFile(url, 'utf8')),
  );

  assert.match(page, /<CustomToolbarDemo \/>/u);
  assert.match(page, /Extend that formatted selection into the next plain sentence and the pickers show/u);
  assert.match(demo, /variant\?: 'standalone' \| 'handoff' \| 'toolbar'/u);
  assert.match(demo, /editorUi = \{ \.\.\.editorUi, toolbar: false \}/u);
  assert.match(demo, /ui\.fonts\.observe/u);
  assert.match(demo, /observerCleanupRef\.current/u);
  assert.match(demo, /ui\.commands\.get\(id\)\.executeAsync\(value\)/u);
  assert.match(demo, /runPickerCommand\('font-family'/u);
  assert.match(demo, /runPickerCommand\('font-size'/u);
  assert.match(demo, /fontSizeValue && !hasPickerOption\(fontSizeOptions, fontSizeValue\)/u);
  assert.equal(demo.match(/<option disabled value=''>/gu)?.length, 2);
});

test('the React comments example keeps restart-sensitive config identities stable', async () => {
  const example = await readFile(reactBuiltInCommentsExampleUrl, 'utf8');

  assert.match(example, /const editorConfig = \{/u);
  assert.match(example, /user=\{editorConfig\.user\}/u);
  assert.match(example, /ui=\{editorConfig\.ui\}/u);
  assert.doesNotMatch(example, /\b(?:user|ui)=\{\{/u);
});

test('the custom comments examples replace one surface with a focused workflow', async () => {
  const [page, demo, html, vanilla, react] = await Promise.all(
    [
      customCommentsPageUrl,
      customCommentsDemoUrl,
      customCommentsHtmlUrl,
      customCommentsExampleUrl,
      reactCustomCommentsExampleUrl,
    ].map((url) => readFile(url, 'utf8')),
  );

  assert.match(page, /<CustomCommentsDemo \/>/u);
  assert.match(page, /built-in comments UI/u);
  assert.match(page, /Document API comments/u);
  assert.doesNotMatch(page, /<CommentsConfigReference\b/u);
  assert.match(html, /id="toolbar"/u);

  for (const example of [vanilla, react]) {
    assert.match(example, /document(?:=|:)\s*['"]\/sample\.docx['"]/u);
    assert.match(example, /comments: false/u);
    assert.match(example, /selection\.capture\(\)/u);
    assert.match(example, /comments\.createFromCapture/u);
    assert.match(example, /comments\.setActive/u);
    assert.match(example, /comments\.scrollTo/u);
    assert.match(example, /comments\.resolve/u);
    assert.match(example, /comments\.reopen/u);
    assert.match(example, /Alex Rivera/u);
    assert.match(example, /parentCommentId/u);
    assert.doesNotMatch(example, /contract\.docx|comments\.(?:reply|edit|delete)\(/u);
  }

  assert.match(vanilla, /addEventListener\('mousedown', captureSelection\)/u);
  assert.match(vanilla, /toolbar: \{ container: toolbar, responsiveTo: 'container' \}/u);
  assert.match(vanilla, /startComment\.focus\(\)/u);
  assert.match(react, /onMouseDown=\{captureSelection\}/u);
  assert.match(react, /startCommentRef\.current\?\.focus\(\)/u);
  assert.match(react, /ref=\{startCommentRef\}/u);

  assert.match(page, /document moves between the first and final pages/u);
  assert.match(demo, /DEMO_DOCUMENT = '\/fixtures\/custom-comments-workflow\.docx'/u);
  assert.match(demo, /comments: false/u);
  assert.match(demo, /toolbar: \{ container: toolbarContainer/u);
  assert.match(demo, /EditorDemoViewControls/u);
  assert.match(demo, /contentClassName='sd-custom-comments-demo-workspace'/u);
  assert.match(demo, /expandedMaxHeight='80rem'/u);
  assert.match(demo, /value: 80/u);
  assert.match(demo, /instance\.ui\.zoom\.set\(INITIAL_ZOOM\.value\)/u);
  assert.match(demo, /instance\.ui\.comments\.observe/u);
  assert.match(demo, /instance\.ui\.zoom\.observe/u);
  assert.match(demo, /ui\.zoom\.setMode\('fit-width'\)/u);
  assert.match(demo, /comments\.createFromCapture/u);
  assert.match(demo, /commentsHandle\?\.setActive/u);
  assert.match(demo, /commentsHandle\.scrollTo/u);
  assert.match(demo, /commentsHandle\.resolve/u);
  assert.match(demo, /commentsHandle\.reopen/u);
  assert.match(demo, /observerCleanupRef\.current/u);
  assert.match(demo, /capture\.quotedText/u);
  assert.match(demo, /key=\{thread\.address\.entityId\}/u);

  // Creation settles asynchronously. The composer must lock until the receipt
  // arrives so one draft cannot be submitted twice.
  assert.match(vanilla, /if \(!capture \|\| pendingCapture\) return;/u);
  assert.match(vanilla, /pendingCapture = capture;/u);
  assert.match(react, /if \(!ui \|\| !capture \|\| pending\) return;/u);
  assert.match(react, /disabled=\{pending \|\| text\.trim\(\)\.length === 0\}/u);
});

test('the custom tracked-change examples build one application-owned review panel', async () => {
  const [page, demo, html, vanilla, react] = await Promise.all(
    [
      customTrackChangesPageUrl,
      customTrackChangesDemoUrl,
      customTrackedReviewHtmlUrl,
      customTrackedReviewExampleUrl,
      reactCustomTrackedReviewExampleUrl,
    ].map((url) => readFile(url, 'utf8')),
  );

  assert.match(page, /<CustomTrackChangesDemo \/>/u);
  assert.match(page, /custom-track-changes-workflow\.docx/u);
  assert.match(page, /A successful decision should remove one row and decrease the count/u);
  assert.match(page, /build a content-control panel/u);
  assert.match(html, /id="toolbar"/u);
  assert.match(html, /id="previous-change"/u);
  assert.match(html, /id="next-change"/u);

  for (const example of [vanilla, react]) {
    assert.match(example, /document(?:=|:)\s*['"]\/contract\.docx['"]/u);
    assert.match(example, /comments: false/u);
    // Show in document pins the clicked occurrence for both focus and reveal.
    assert.match(example, /trackChanges\.setActive\(target\)/u);
    assert.match(example, /trackChanges\.scrollTo\(target\)/u);
    assert.match(example, /trackChanges\.navigatePrevious/u);
    assert.match(example, /trackChanges\.navigateNext/u);
    // Decisions await settlement so a late failure clears the pending state.
    assert.match(example, /await ui\.trackChanges\.acceptAsync\(target\)/u);
    assert.match(example, /await ui\.trackChanges\.rejectAsync\(target\)/u);
    assert.doesNotMatch(example, /trackChanges\.accept\(|trackChanges\.reject\(/u);
    // A row decides its exact occurrence: id plus story for non-body changes.
    assert.match(example, /const story = change\.address\?\.story;/u);
    assert.match(example, /Alex Rivera/u);
    assert.doesNotMatch(example, /commands\.executeAsync|acceptAllAsync|rejectAllAsync/u);
  }

  assert.match(vanilla, /trackChanges\.observe\(render\)/u);
  assert.match(vanilla, /toolbar: \{ container: toolbar, responsiveTo: 'container' \}/u);
  // Pending rerenders reuse the observed directory, not the page-bounded passive snapshot.
  assert.match(vanilla, /lastChanges = changes;/u);
  assert.doesNotMatch(vanilla, /trackChanges\.getSnapshot\(\)/u);
  assert.match(react, /useSuperDocTrackChanges\(\)/u);
  assert.match(react, /key=\{rowKey\(change\)\}/u);
  // Active and pending state are tracked per occurrence, not per id, so a
  // same-id body and footnote row never light up together.
  for (const example of [vanilla, react]) {
    assert.match(example, /function isActiveRow\(/u);
    assert.match(example, /activeRow\.key === rowKey\(change\)/u);
    assert.doesNotMatch(example, /change\.id === (?:changes|trackChanges)\.activeId|activeId === change\.id/u);
  }
  assert.match(vanilla, /pendingDecision = \{ key: rowKey\(change\), decision \}/u);
  assert.match(react, /setPendingKey\(rowKey\(change\)\)/u);
  assert.match(react, /onContentError=\{\(\) => onLoadError\(/u);
  assert.match(demo, /key=\{rowKey\(change\)\}/u);
  assert.match(demo, /isActiveRow\(change, trackChanges\.activeId, activeRow\)/u);
  assert.match(demo, /pendingDecision\?\.key === rowKey\(change\)/u);
  assert.doesNotMatch(demo, /change\.id === trackChanges\.activeId/u);
  assert.match(demo, /DEMO_DOCUMENT = '\/fixtures\/custom-track-changes-workflow\.docx'/u);
  assert.match(demo, /comments: false/u);
  assert.match(demo, /toolbar: \{ container: toolbarContainer/u);
  assert.match(demo, /EditorDemoViewControls/u);
  assert.match(demo, /contentClassName='sd-custom-track-changes-demo-workspace'/u);
  assert.match(demo, /expandedMaxHeight='80rem'/u);
  assert.match(demo, /value: 80/u);
  assert.match(demo, /instance\.ui\.zoom\.set\(INITIAL_ZOOM\.value\)/u);
  assert.match(demo, /instance\.ui\.trackChanges\.observe/u);
  assert.match(demo, /instance\.ui\.zoom\.observe/u);
  assert.match(demo, /ui\.zoom\.setMode\('fit-width'\)/u);
  assert.match(demo, /trackChangesHandle\.navigatePrevious/u);
  assert.match(demo, /trackChangesHandle\.navigateNext/u);
  // The demo awaits the one Document API operation a decision routes to, so
  // it never dispatches twice or waits on the pinned runtime's selection read.
  assert.match(demo, /await doc\.trackChanges\.decide\(\{\s+decision,\s+target: story \? \{ kind: 'id', id: change\.id, story \}/u);
  assert.doesNotMatch(demo, /commands\.executeAsync|trackChangesHandle\.accept\(|handle\.accept\(/u);
  // A rejected operation must still clear the pending state and report.
  assert.match(demo, /try \{\s+const receipt = await doc\.trackChanges\.decide\(/u);
  assert.match(demo, /\} catch \(cause\) \{[\s\S]{0,400}setPendingDecision\(null\)/u);
  assert.match(demo, /trackChangesHandle\?\.setActive\(target\)/u);
  assert.match(demo, /observerCleanupRef\.current/u);
  assert.match(demo, /disabled=\{pendingDecision !== null\}/u);
});

test('the custom content-control examples build one application-owned field panel', async () => {
  const [page, demo, vanilla, react] = await Promise.all(
    [
      customContentControlsPageUrl,
      customContentControlsDemoUrl,
      customContentControlsExampleUrl,
      reactCustomContentControlsExampleUrl,
    ].map((url) => readFile(url, 'utf8')),
  );

  assert.match(page, /<CustomContentControlsDemo \/>/u);
  assert.match(page, /custom-content-controls-workflow\.docx/u);
  assert.match(page, /observer returns the updated value/u);
  assert.match(page, /build custom search controls/u);

  assert.match(demo, /value: 80/u);
  assert.match(demo, /instance\.ui\.zoom\.set\(INITIAL_ZOOM\.value\)/u);
  assert.match(demo, /instance\.ui\.contentControls\.observe/u);
  assert.match(demo, /instance\.ui\.zoom\.observe/u);
  assert.match(demo, /ui\.zoom\.setMode\('fit-width'\)/u);
  assert.match(demo, /textControls\.setValue/u);
  assert.match(demo, /checkboxes\.setState/u);
  assert.match(demo, /mutationIsObserved/u);
  assert.match(demo, /observerCleanupRef\.current/u);
  assert.match(demo, /pendingMutation !== null/u);

  for (const example of [vanilla, react]) {
    assert.match(example, /document(?:=|:)\s*['"]\/contract\.docx['"]/u);
    assert.match(example, /contentControls\.focus/u);
    assert.match(example, /contentControls.*text/u);
    assert.match(example, /\.setValue/u);
    assert.match(example, /contentControls.*checkbox/u);
    assert.match(example, /\.setState/u);
    assert.match(example, /controlType === 'text'/u);
    assert.match(example, /controlType === 'checkbox'/u);
    assert.match(example, /contentLocked/u);
    assert.doesNotMatch(example, /querySelector.*\[data-|contentControls\.list\(\)/u);
  }

  assert.match(vanilla, /contentControls\.observe\(render\)/u);
  // A failed update keeps the submitted draft instead of resetting the input.
  assert.match(vanilla, /drafts\.set\(control\.id, value\);\s+pendingMutation = \{ controlId/u);
  assert.match(vanilla, /lastControls = controls;/u);
  assert.doesNotMatch(vanilla, /contentControls\.getSnapshot\(\)/u);
  // A successful update clears the draft so later document changes show through.
  assert.match(vanilla, /drafts\.delete\(completedMutation\.controlId\)/u);
  assert.match(react, /delete next\[pendingMutation\.controlId\]/u);
  assert.match(react, /useSuperDocContentControls\(\)/u);
  assert.match(react, /useSuperDocHost\(\)/u);
  // The demo reports a refresh failure separately from the mutation receipt.
  assert.match(demo, /refreshPinnedRuntimeCatalog\(instance, mutation\)/u);
  assert.match(demo, /The field list will refresh on the next change\./u);

  assert.match(vanilla, /mutationIsObserved/u);
  assert.match(vanilla, /if \(!receipt\.success\) failMutation/u);
  assert.doesNotMatch(vanilla, /finally \{\s*pendingMutation = null;/u);
  assert.match(react, /mutationIsObserved/u);
  assert.match(react, /if \(!receipt\.success\) \{\s*setPendingMutation\(null\);/u);
  assert.doesNotMatch(react, /finally \{\s*setPendingMutation\(null\);/u);
});

test('the content-control examples use the canonical chrome config and typed click payload', async () => {
  const [page, vanilla, react] = await Promise.all(
    [builtInContentControlsPageUrl, builtInContentControlsExampleUrl, reactBuiltInContentControlsExampleUrl].map((url) =>
      readFile(url, 'utf8'),
    ),
  );

  assert.match(page, /href='\/fixtures\/content-controls-sample\.docx'/u);
  assert.match(page, /public\/content-controls-sample\.docx/u);
  for (const example of [vanilla, react]) {
    assert.match(example, /document(?:=|:)\s*['"]\/content-controls-sample\.docx['"]/u);
    assert.match(example, /contentControls: true/u);
    assert.match(example, /target\.alias/u);
    assert.match(example, /target\.tag/u);
    assert.match(example, /target\.controlType/u);
    assert.doesNotMatch(example, /\b(?:modules\.contentControls|chrome:)\b/u);
  }
  assert.match(vanilla, /onContentControlClick/u);
  assert.match(react, /ContentControlClickPayload/u);
  assert.match(react, /onContentControlClick=\{handleContentControlClick\}/u);
  assert.doesNotMatch(react, /\bui=\{\{/u);
});

test('the React search example enables the built-in search surface with stable config', async () => {
  const example = await readFile(reactBuiltInSearchExampleUrl, 'utf8');

  assert.match(example, /const editorConfig = \{/u);
  assert.match(example, /search: true/u);
  assert.match(example, /ui=\{editorConfig\.ui\}/u);
  assert.doesNotMatch(example, /\bui=\{\{/u);
});

test('the custom Search examples replace only the built-in surface', async () => {
  const [page, demo, vanilla, react] = await Promise.all(
    [customSearchPageUrl, customSearchDemoUrl, customSearchExampleUrl, reactCustomSearchExampleUrl].map((url) =>
      readFile(url, 'utf8'),
    ),
  );

  assert.match(page, /<CustomSearchDemo \/>/u);
  assert.match(page, /replaces only the Search surface/u);
  assert.match(page, /Gate \*\*Replace\s+all\*\* on `canReplaceAll`/u);
  assert.match(page, /disabled unless there is a match/u);
  assert.match(page, /application-owned context menu/u);

  assert.match(demo, /DEMO_DOCUMENT = '\/fixtures\/search-sample\.docx'/u);
  assert.match(demo, /search: false/u);
  assert.match(demo, /toolbar: \{ container: toolbarContainer/u);
  assert.match(demo, /EditorDemoViewControls/u);
  assert.match(demo, /contentClassName='sd-custom-search-demo-workspace'/u);
  assert.match(demo, /value: 80/u);
  assert.match(demo, /instance\.ui\.zoom\.set\(INITIAL_ZOOM\.value\)/u);
  assert.match(demo, /clientWidth.*NARROW_DEMO_WIDTH/u);
  assert.match(demo, /instance\.ui\.search\.observe/u);
  assert.match(demo, /instance\.ui\.zoom\.observe/u);
  assert.match(demo, /ui\.zoom\.setMode\('fit-width'\)/u);
  assert.match(demo, /ui\.search\.close\(\)/u);
  assert.match(demo, /replacementPending/u);

  for (const example of [vanilla, react]) {
    assert.match(example, /document(?:=|:)\s*['"]\/search-sample\.docx['"]/u);
    assert.match(example, /const editorUi = \{ search: false \} satisfies UIConfig/u);
    assert.match(example, /\bsearch\.find\(/u);
    assert.match(example, /\bsearch\.previous\(\)/u);
    assert.match(example, /\bsearch\.next\(\)/u);
    assert.match(example, /\bsearch\.replace\(/u);
    assert.match(example, /\bsearch\.replaceAll\(/u);
    assert.match(example, /canReplace/u);
    // Replace needs a match: canReplace alone is document mutability.
    assert.match(example, /!hasMatches \|\| !(?:snapshot|search)\.canReplace \|\| replacementPending/u);
    // Replace all has its own capability: a truncated session refuses it.
    assert.match(example, /canReplaceAll/u);
    assert.match(example, /replacementPending/u);
    assert.match(example, /runReplacement/u);
    assert.doesNotMatch(example, /\/contract\.docx|includeDeletedText/u);
  }

  assert.match(vanilla, /search\.observe\(render\)/u);
  assert.match(react, /useSuperDocSearch\(\)/u);

  // Both examples expose the tracked-deletion option the verification step needs.
  for (const example of [vanilla, react]) {
    assert.match(example, /includeTrackedDeletions: include/u);
  }
  assert.match(page, /Include pending deletions\*\* and search for `Legacy`/u);
  // Text typed before the Editor is ready still searches once it is.
  assert.match(vanilla, /includeDeletions\.addEventListener\('change', runSearch\);\s+\/\/[^\n]*\n\s+runSearch\(\);/u);
});

test('the custom Search example can include tracked deletions per query', async () => {
  const example = await readFile(customSearchTrackedDeletionsUrl, 'utf8');

  assert.match(example, /superdoc\.ui\.search\.find\('Legacy',/u);
  assert.match(example, /includeTrackedDeletions: true/u);
  assert.doesNotMatch(example, /\bincludeDeletedText\b/u);
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

test('the custom context-menu examples replace only the built-in surface', async () => {
  const examples = await Promise.all(
    [customContextMenuExampleUrl, reactCustomContextMenuExampleUrl].map((url) => readFile(url, 'utf8')),
  );

  for (const example of examples) {
    assert.match(example, /document(?:=|:)\s*['"]\/contract\.docx['"]/u);
    assert.match(example, /const editorUi = \{ contextMenu: false \} satisfies UIConfig/u);
    assert.match(example, /contextMenu\.contextAt\(point\)/u);
    assert.match(example, /trackChanges\.acceptAsync/u);
    assert.match(example, /trackChanges\.rejectAsync/u);
    assert.match(example, /event\.shiftKey && event\.key === 'F10'/u);
    // A decision in flight disables both buttons, and a late decision closes
    // only the menu that started it.
    assert.match(example, /decisionPending/u);
    assert.match(example, /menuId(?:Ref\.current)? === (?:menuId|startedFrom)/u);
    // Dismissal retires the open menu so a late action cannot steal focus.
    assert.match(example, /closeMenu[\s\S]{0,200}menuId(?:Ref\.current)? \+= 1/u);
    assert.doesNotMatch(example, /viewport\.contextAt|commands\.executeAsync/u);
  }

  const [vanilla, react] = examples;
  // Copy follows the live selection rather than the snapshot taken at open time.
  assert.match(vanilla, /ui\.selection\.observe\(/u);
  assert.match(react, /useSuperDocSelection\(\)/u);
  // Only events from inside the editor container open the document menu.
  assert.match(react, /closest\('\.superdoc-editor-container'\)/u);
  assert.match(vanilla, /editorHost\.addEventListener\('contextmenu'/u);

  const html = await readFile(new URL('../snippets/editor/custom-context-menu.html', import.meta.url), 'utf8');
  assert.match(html, /<script type="module" src="\/src\/main\.ts"><\/script>/u);
});

test('the built-in Editor demos keep focused controls and restart-safe configuration changes', async () => {
  const demo = await readFile(editorDemoUrl, 'utf8');

  assert.match(demo, /getPinnedFocusedToolbarOptions\(builtInToolbar!, \{ left: \['search'\] \}\)/u);
  assert.match(
    demo,
    /search:\s*\{\s*replaceEnabled: initialReplaceControls,\s*includeDeletedText: initialIncludeTrackedDeletions,/u,
  );
  assert.match(demo, /toolbar: getPinnedToolbarOptions\(initialToolbarStrategy, builtInToolbar!\)/u);
  assert.match(
    demo,
    /interaction:\s+preset === 'comments' \? \{ comments: \{ level: initialCommentsLevel \} \} : undefined/u,
  );
  assert.match(demo, /getPinnedCommentsOptions\(preset === 'comments' \? initialCommentsLayout : 'inline'\)/u);
  assert.match(demo, /return \{ displayMode: layout \}/u);
  assert.match(demo, /export\(\{ exportType: \['docx'\], triggerDownload: false \}\)/u);
  assert.match(demo, /const currentDocumentMode = instance\.config\.documentMode/u);
  assert.match(demo, /const hadMountedEditor = instanceRef\.current !== null/u);
  assert.match(demo, /setState\(replacedEditor \|\| !hadMountedEditor \? 'error' : 'ready'\)/u);
  assert.match(
    demo,
    /commentsLayout,\s+commentsLevel,\s+contentControlChrome,\s+contextMenuStrategy,\s+documentMode: currentDocumentMode,\s+hyperlinkBehavior,\s+includeTrackedDeletions,\s+replaceControls,\s+toolbarStrategy,/u,
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
  assert.match(demo, /label='Built-in chrome'[\s\S]*value=\{contentControlChrome \? 'show' : 'hide'\}/u);
  assert.match(demo, /label='Menu'[\s\S]*options=\{contextMenuDemoStrategies\}/u);
  assert.match(demo, /label='Activation'[\s\S]*options=\{hyperlinkDemoBehaviors\}/u);
  assert.match(demo, /preset === 'ruler' \? \{ comments: false, ruler: true \} : \{\}/u);
  assert.match(demo, /instanceRef\.current\?\.toggleRuler\(\)/u);
  assert.match(demo, /instanceRef\.current\?\.setMeasurementUnit\(unit\)/u);
  assert.match(demo, /ui\.selection\.observe[\s\S]*setRulerActive\(hasRulerSelection\(snapshot\)\)/u);
  assert.match(demo, /getRulerHint\(rulerActive\)/u);
  assert.match(demo, /label='Ruler'[\s\S]*label='Measurements'/u);
  assert.match(demo, /label='Replace controls'/u);
  assert.match(demo, /label='Tracked deletions'/u);
});

test('the shared Editor demo view controls preserve every interaction contract', async () => {
  const { Window } = await import('happy-dom');
  const browserWindow = new Window({ url: 'https://docs.superdoc.dev/' });
  const globalNames = ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'];
  const originalGlobals = new Map(globalNames.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: browserWindow },
    document: { configurable: true, value: browserWindow.document },
    navigator: { configurable: true, value: browserWindow.navigator },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });

  const [{ act, createElement }, { createRoot }, { EditorDemoViewControls }] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import(editorDemoViewControlsUrl),
  ]);
  const interactions = [];
  const container = browserWindow.document.createElement('div');
  browserWindow.document.body.append(container);
  const root = createRoot(container);

  const render = async (overrides = {}) => {
    await act(async () =>
      root.render(
        createElement(EditorDemoViewControls, {
      disabled: false,
      fitActive: false,
      isFullscreen: false,
      onFit: () => interactions.push('fit'),
      onFullscreen: () => interactions.push('fullscreen'),
      onZoom: (direction) => interactions.push(direction),
      zoom: { max: 150, min: 50, mode: 'manual', value: 100 },
      ...overrides,
        }),
      ),
    );
  };
  const button = (label) => {
    const match = container.querySelector(`button[aria-label='${label}']`);
    assert.ok(match instanceof browserWindow.HTMLButtonElement, `Missing ${label} button.`);
    return match;
  };
  const click = (label) => act(async () => button(label).click());

  try {
    await render();
    await click('Zoom out');
    await click('Fit document to width');
    await click('Zoom in');
    await click('Enter fullscreen');

    assert.deepEqual(interactions, [-1, 'fit', 1, 'fullscreen']);
    assert.equal(button('Fit document to width').getAttribute('aria-pressed'), 'false');
    assert.equal(button('Fit document to width').textContent, '100%');

    await render({ fitActive: true, isFullscreen: true });
    assert.equal(button('Fit document to width').getAttribute('aria-pressed'), 'true');
    assert.equal(button('Fit document to width').textContent, 'Fit');
    button('Exit fullscreen');

    await render({ zoom: { max: 150, min: 50, mode: 'manual', value: 50 } });
    assert.equal(button('Zoom out').disabled, true);
    assert.equal(button('Zoom in').disabled, false);

    await render({ zoom: { max: 150, min: 50, mode: 'manual', value: 150 } });
    assert.equal(button('Zoom out').disabled, false);
    assert.equal(button('Zoom in').disabled, true);

    await render({ disabled: true });
    assert.ok([...container.querySelectorAll('button')].every((control) => control.disabled));
  } finally {
    await act(async () => root.unmount());
    browserWindow.close();
    for (const [name, descriptor] of originalGlobals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

test('the Ruler demo derives its live hint from the current selection', async () => {
  const { getRulerHint, hasRulerSelection } = await import('../lib/built-in-editor-demos.ts');

  assert.equal(hasRulerSelection({}), false);
  assert.equal(getRulerHint(hasRulerSelection({})), 'Click in the document to enable the margin handles.');
  assert.equal(hasRulerSelection({ target: { from: 1, to: 1 } }), true);
  assert.equal(
    getRulerHint(hasRulerSelection({ target: { from: 1, to: 1 } })),
    'Drag either margin handle to reflow the page.',
  );
  assert.equal(hasRulerSelection({ selectionTarget: { from: 1, to: 1 } }), true);
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

test('the generated Search reference mirrors every canonical nested field', async () => {
  const [generatedSearchConfig, generatedSearchFloatingConfig, generatedSearchStrings, superdocTypes] =
    await Promise.all([
      readFile(generatedSearchConfigUrl, 'utf8').then(JSON.parse),
      readFile(generatedSearchFloatingConfigUrl, 'utf8').then(JSON.parse),
      readFile(generatedSearchStringsUrl, 'utf8').then(JSON.parse),
      readFile(superdocCoreTypesUrl, 'utf8'),
    ]);

  const sourceFields = (typeName) => {
    const body = superdocTypes.match(new RegExp(`export interface ${typeName}(?: extends [^{]+)? \\{([\\s\\S]*?)\\n\\}`, 'u'))?.[1] ?? '';
    return [...body.matchAll(/^\s{2}(\w+)\??:/gmu)].map((match) => match[1]);
  };
  const generatedFields = (reference) => reference.fields.map((field) => field.name);

  assert.deepEqual(generatedFields(generatedSearchConfig), sourceFields('SearchConfig'));
  assert.deepEqual(generatedFields(generatedSearchFloatingConfig), sourceFields('SearchFloatingConfig'));
  assert.deepEqual(generatedFields(generatedSearchStrings), sourceFields('SearchStrings'));
  assert.ok(
    [generatedSearchConfig, generatedSearchFloatingConfig, generatedSearchStrings].every((reference) =>
      reference.fields.every((field) => field.type && field.description && !field.deprecated),
    ),
  );
});

test('the generated Hyperlinks reference mirrors every canonical field', async () => {
  const [generatedHyperlinksConfig, superdocTypes] = await Promise.all([
    readFile(generatedHyperlinksConfigUrl, 'utf8').then(JSON.parse),
    readFile(superdocCoreTypesUrl, 'utf8'),
  ]);
  const configBody = superdocTypes.match(/export interface HyperlinksConfig \{([\s\S]*?)\n\}/u)?.[1] ?? '';
  const sourceFields = [...configBody.matchAll(/^\s{2}(\w+)\??:/gmu)].map((match) => match[1]);
  const generatedFields = generatedHyperlinksConfig.fields.map((field) => field.name);

  assert.deepEqual(generatedFields, sourceFields);
  assert.equal(new Set(generatedFields).size, generatedFields.length);
  assert.ok(generatedHyperlinksConfig.fields.every((field) => field.type && field.description && !field.deprecated));
});

test('the Loading configuration explorer mirrors UIConfig.loading', async () => {
  const [generatedLoadingConfig, superdocTypes] = await Promise.all([
    readFile(generatedLoadingConfigUrl, 'utf8').then(JSON.parse),
    readFile(superdocCoreTypesUrl, 'utf8'),
  ]);
  const { loadingConfigExplorer } = await import('../lib/loading-config-explorer.ts');
  const { configFieldTemplate, renderConfigReferenceMarkdown } = await import('../lib/config-explorer.ts');
  const uiConfigBody = superdocTypes.match(/export interface UIConfig \{([\s\S]*?)\n\}/u)?.[1] ?? '';
  const loadingDeclaration = uiConfigBody.match(/^\s{2}loading\??:\s*([^;]+);/mu);
  const field = loadingConfigExplorer.fields[0];
  const group = loadingConfigExplorer.groups[0];

  assert.ok(loadingDeclaration, 'UIConfig.loading must remain public.');
  assert.deepEqual(generatedLoadingConfig.fields.map((candidate) => candidate.name), ['loading']);
  assert.equal(field.name, 'loading');
  assert.equal(field.type, loadingDeclaration[1].trim());
  assert.equal(field.default, 'true');
  assert.equal(
    configFieldTemplate(loadingConfigExplorer, group, field),
    ['ui: {', '  loading: false', '}'].join('\n'),
  );
  assert.match(renderConfigReferenceMarkdown(loadingConfigExplorer), /\| `loading` \| `boolean` \| `true` \|/u);
});

test('the Hyperlinks configuration explorer renders the canonical activation result', async () => {
  const { hyperlinksConfigExplorer } = await import('../lib/hyperlinks-config-explorer.ts');
  const { configFieldTemplate, renderConfigReferenceMarkdown } = await import('../lib/config-explorer.ts');
  const field = hyperlinksConfigExplorer.fields[0];
  const group = hyperlinksConfigExplorer.groups[0];

  assert.equal(field.name, 'onActivate');
  assert.equal(field.default, 'undefined');
  assert.match(configFieldTemplate(hyperlinksConfigExplorer, group, field), /type: 'suppress'/u);
  assert.match(renderConfigReferenceMarkdown(hyperlinksConfigExplorer), /\| `onActivate` \|/u);
  assert.doesNotMatch(renderConfigReferenceMarkdown(hyperlinksConfigExplorer), /type: 'none'/u);
});

test('the generated Context menu reference mirrors every canonical field', async () => {
  const [generatedContextMenuConfig, superdocTypes] = await Promise.all([
    readFile(generatedContextMenuConfigUrl, 'utf8').then(JSON.parse),
    readFile(superdocCoreTypesUrl, 'utf8'),
  ]);
  const configBody = superdocTypes.match(/export interface ContextMenuConfig \{([\s\S]*?)\n\}/u)?.[1] ?? '';
  const compatibilityFields = new Set(['customItems', 'includeDefaultItems']);
  const sourceFields = [...configBody.matchAll(/^\s{2}(?:readonly\s+)?(\w+)\??:/gmu)]
    .map((match) => match[1])
    .filter((name) => !compatibilityFields.has(name));
  const generatedFields = generatedContextMenuConfig.fields.map((field) => field.name);

  assert.deepEqual(generatedFields, sourceFields);
  assert.equal(new Set(generatedFields).size, generatedFields.length);
  assert.ok(generatedContextMenuConfig.fields.every((field) => field.type && field.description && !field.deprecated));
  assert.match(configBody, /@deprecated replaceWith=`sections`/u);
  assert.match(configBody, /@deprecated replaceWith=`defaultItems`/u);
});

test('the Ruler configuration explorer mirrors the canonical UI and Editor fields', async () => {
  const [{ rulerConfigExplorer }, { renderConfigReferenceMarkdown }, generatedUi, generatedEditor] = await Promise.all([
    import('../lib/ruler-config-explorer.ts'),
    import('../lib/config-explorer.ts'),
    readFile(generatedRulerUiConfigUrl, 'utf8').then(JSON.parse),
    readFile(generatedRulerEditorConfigUrl, 'utf8').then(JSON.parse),
  ]);

  assert.deepEqual(generatedUi.fields.map((field) => field.name), ['ruler']);
  assert.deepEqual(
    generatedEditor.fields.map((field) => field.name).sort(),
    ['measurementUnit', 'onPageMarginsChange'],
  );
  assert.deepEqual(
    rulerConfigExplorer.fields.map((field) => field.name),
    ['ui.ruler', 'measurementUnit', 'onPageMarginsChange'],
  );
  assert.deepEqual(
    rulerConfigExplorer.groups.map((group) => group.label),
    ['Ruler', 'Measurements', 'Events'],
  );
  const markdown = renderConfigReferenceMarkdown(rulerConfigExplorer);
  assert.match(markdown, /\| `ui\.ruler` \|/u);
  assert.match(markdown, /\| `onPageMarginsChange` \|/u);
  assert.doesNotMatch(markdown, /\| `rulers` \||\| `rulerContainer` \|/u);
});

test('the Context menu configuration explorer renders valid canonical examples', async () => {
  const { contextMenuConfigExplorer } = await import('../lib/context-menu-config-explorer.ts');
  const { configFieldTemplate, renderConfigReferenceMarkdown } = await import('../lib/config-explorer.ts');
  const field = (name) => contextMenuConfigExplorer.fields.find((candidate) => candidate.name === name);
  const group = (id) => contextMenuConfigExplorer.groups.find((candidate) => candidate.id === id);
  const markdown = renderConfigReferenceMarkdown(contextMenuConfigExplorer);

  assert.deepEqual(
    contextMenuConfigExplorer.fields.map((candidate) => candidate.name),
    ['openOnSlash', 'sections', 'defaultItems', 'menuProvider'],
  );
  assert.match(configFieldTemplate(contextMenuConfigExplorer, group('items'), field('sections')), /ui: \{/u);
  assert.match(configFieldTemplate(contextMenuConfigExplorer, group('items'), field('sections')), /onSelect:/u);
  assert.match(configFieldTemplate(contextMenuConfigExplorer, group('advanced'), field('menuProvider')), /item\.disabled/u);
  assert.doesNotMatch(markdown, /customItems|includeDefaultItems/u);
});

test('the Search configuration explorer renders valid nested examples', async () => {
  const { searchConfigExplorer } = await import('../lib/search-config-explorer.ts');
  const { configFieldTemplate, renderConfigReferenceMarkdown } = await import('../lib/config-explorer.ts');
  const names = searchConfigExplorer.fields.map((field) => field.name);
  const field = (name) => searchConfigExplorer.fields.find((candidate) => candidate.name === name);
  const group = (id) => searchConfigExplorer.groups.find((candidate) => candidate.id === id);

  assert.equal(names.length, 34);
  assert.equal(new Set(names).size, names.length);
  assert.ok(searchConfigExplorer.fields.every((candidate) => candidate.summary?.length));
  assert.deepEqual(
    searchConfigExplorer.groups.map((candidate) => candidate.id),
    ['behavior', 'position', 'focus', 'text', 'accessibility'],
  );
  assert.equal(field('replaceControls')?.default, 'true');
  assert.equal(field('floating.placement')?.default, "'top-right'");
  assert.equal(field('strings.noResults')?.default, "'No results'");

  const positionExample = configFieldTemplate(searchConfigExplorer, group('position'), field('floating.placement'));
  assert.equal(
    positionExample,
    [
      'ui: {',
      '  search: {',
      '    floating: {',
      "      placement: 'bottom-right'",
      '    },',
      '  },',
      '}',
    ].join('\n'),
  );
  const textExample = configFieldTemplate(searchConfigExplorer, group('text'), field('strings.noResults'));
  assert.match(textExample, /strings: \{\n\s+noResults: 'No matches'/u);
  assert.doesNotMatch(textExample, /noResultsLabel/u);

  const markdown = renderConfigReferenceMarkdown(searchConfigExplorer);
  assert.match(markdown, /\| `replaceControls` \| `boolean` \| `true` \|/u);
  assert.match(markdown, /\| `floating\.placement` \|/u);
  assert.match(markdown, /\| `strings\.findAriaLabel` \|/u);
  assert.doesNotMatch(markdown, /replaceEnabled|includeDeletedText|noResultsLabel/u);
});

test('the Toolbar configuration explorer covers every canonical option', async () => {
  const generatedToolbarConfig = JSON.parse(await readFile(generatedToolbarConfigUrl, 'utf8'));
  const { toolbarConfigExplorer } = await import('../lib/toolbar-config-explorer.ts');
  const { configFieldTemplate, renderConfigReferenceMarkdown } = await import('../lib/config-explorer.ts');
  const generatedNames = generatedToolbarConfig.fields.map((field) => field.name);
  const names = toolbarConfigExplorer.fields.map((field) => field.name);
  const field = (name) => toolbarConfigExplorer.fields.find((candidate) => candidate.name === name);
  const group = (id) => toolbarConfigExplorer.groups.find((candidate) => candidate.id === id);

  assert.deepEqual(generatedNames, [
    'container',
    'items',
    'excludeItems',
    'icons',
    'strings',
    'overflow',
    'responsiveTo',
    'fontOptions',
    'customItems',
    'includeItems',
  ]);
  assert.deepEqual([...names].sort(), [...generatedNames].sort());
  assert.equal(new Set(names).size, names.length);
  assert.ok(toolbarConfigExplorer.fields.every((candidate) => candidate.summary?.length));
  assert.ok(generatedToolbarConfig.fields.every((candidate) => candidate.type && candidate.description && !candidate.deprecated));
  assert.deepEqual(
    toolbarConfigExplorer.groups.map((candidate) => candidate.id),
    ['controls', 'layout', 'appearance'],
  );
  assert.equal(field('overflow')?.default, "'menu'");
  assert.equal(field('responsiveTo')?.default, "'viewport'");
  assert.match(field('container')?.summary ?? '', /Leave this unset to let React's SuperDocEditor/u);

  const items = field('items');
  const controls = group('controls');
  assert.ok(items && controls);
  assert.equal(
    configFieldTemplate(toolbarConfigExplorer, controls, items),
    [
      'ui: {',
      '  toolbar: {',
      "    items: { left: ['undo', 'redo'], center: ['bold', 'italic'], right: ['document-mode'] }",
      '  },',
      '}',
    ].join('\n'),
  );

  const markdown = renderConfigReferenceMarkdown(toolbarConfigExplorer);
  assert.match(markdown, /\| `items` \|/u);
  assert.match(markdown, /\| `customItems` \|/u);
  assert.match(markdown, /\| `responsiveTo` \| `"container" \\| "viewport"` \| `'viewport'` \|/u);
  assert.doesNotMatch(
    markdown,
    /\| `(?:groups|texts|hideButtons|responsiveToContainer|fonts|customButtons|showFormattingMarksButton|showTableOfContentsButton)` \|/u,
  );
});

test('the Comments configuration explorer keeps layout and actions in their canonical namespaces', async () => {
  const [generatedCommentsConfig, generatedCommentsResponsiveConfig, generatedCommentInteractionConfig] =
    await Promise.all([
      readFile(generatedCommentsConfigUrl, 'utf8').then(JSON.parse),
      readFile(generatedCommentsResponsiveConfigUrl, 'utf8').then(JSON.parse),
      readFile(generatedCommentInteractionConfigUrl, 'utf8').then(JSON.parse),
    ]);
  const { commentsConfigExplorer } = await import('../lib/comments-config-explorer.ts');
  const { configFieldTemplate, renderConfigReferenceMarkdown } = await import('../lib/config-explorer.ts');
  const field = (name) => commentsConfigExplorer.fields.find((candidate) => candidate.name === name);
  const group = (id) => commentsConfigExplorer.groups.find((candidate) => candidate.id === id);

  assert.deepEqual(
    generatedCommentsConfig.fields.map((candidate) => candidate.name),
    ['layout', 'responsive'],
  );
  assert.deepEqual(
    generatedCommentsResponsiveConfig.fields.map((candidate) => candidate.name),
    ['target', 'breakpoint'],
  );
  assert.deepEqual(
    generatedCommentInteractionConfig.fields.map((candidate) => candidate.name),
    ['level'],
  );
  assert.deepEqual(
    commentsConfigExplorer.fields.map((candidate) => candidate.name),
    [
      'ui.comments.layout',
      'ui.comments.responsive.target',
      'ui.comments.responsive.breakpoint',
      'interaction.comments.level',
    ],
  );
  assert.ok(commentsConfigExplorer.fields.every((candidate) => candidate.summary?.length));
  assert.deepEqual(commentsConfigExplorer.sources, [
    'CommentsConfig',
    'CommentsResponsiveConfig',
    'CommentInteractionConfig',
  ]);
  assert.equal(field('ui.comments.layout')?.default, "'sidebar'");
  assert.equal(field('interaction.comments.level')?.default, "'resolve'");

  const level = field('interaction.comments.level');
  const actions = group('actions');
  assert.ok(level && actions);
  assert.equal(
    configFieldTemplate(commentsConfigExplorer, actions, level),
    ['interaction: {', '  comments: {', "    level: 'write'", '  },', '}'].join('\n'),
  );

  const markdown = renderConfigReferenceMarkdown(commentsConfigExplorer);
  assert.match(markdown, /\| `ui\.comments\.layout` \|/u);
  assert.match(markdown, /\| `ui\.comments\.responsive\.breakpoint` \|/u);
  assert.match(markdown, /\| `interaction\.comments\.level` \|/u);
  assert.doesNotMatch(markdown, /\b(?:displayMode|readOnly|allowResolve|compactBreakpointPx)\b/u);
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
  const onExceptionDescription =
    editorConfigExplorer.fields.find((field) => field.name === 'onException')?.description ?? '';
  assert.match(onExceptionDescription, /can accompany a legacy exception payload/iu);
  assert.match(onExceptionDescription, /filters unsupported internal records/iu);
  assert.match(
    onExceptionDescription,
    /translated package and readiness records[^.]*at most one structured diagnostic for each `\(documentId, generation, internalCode\)` tuple/iu,
  );
  assert.match(onExceptionDescription, /suppresses a generic boot diagnostic when a more specific package diagnostic/iu);
  assert.doesNotMatch(onExceptionDescription, /one per underlying internal record/iu);
  assert.doesNotMatch(onExceptionDescription, /emitted in addition to, not instead of/iu);
  const interactionType = editorConfigExplorer.fields.find((field) => field.name === 'interaction')?.type ?? '';
  assert.match(interactionType, /comments\?: \{ level\?: CommentInteractionLevel; \}/u);
  assert.doesNotMatch(interactionType, /CommentInteractionConfig|readOnly|allowResolve/u);
  const permissionResolver = editorConfigExplorer.fields.find((field) => field.name === 'permissionResolver');
  assert.equal(permissionResolver?.summary, 'Customize client-side permission decisions.');
  assert.match(permissionResolver?.description ?? '', /^Customize client-side permission decisions\./u);
  assert.doesNotMatch(permissionResolver?.description ?? '', /comment and tracked-change permission decisions/iu);
  const fieldNames = new Set(editorConfigExplorer.fields.map((field) => field.name));
  for (const legacyField of [
    'comments',
    'conversations',
    'editorExtensions',
    'format',
    'html',
    'jsonOverride',
    'markdown',
    'onEditorBeforeCreate',
    'onEditorDestroy',
    'onFontsResolved',
    'onListDefinitionsChange',
    'onTransaction',
    'onUnsupportedContent',
    'rulerContainer',
    'rulers',
    'suppressDefaultDocxStyles',
    'trackChanges',
    'warnOnUnsupportedContent',
  ]) {
    assert.equal(fieldNames.has(legacyField), false, `${legacyField} should not appear in the current Config Explorer`);
  }
  assert.equal(fieldNames.has('experimental'), false);
  const useLayoutEngine = editorConfigExplorer.fields.find((field) => field.name === 'useLayoutEngine');
  assert.equal(useLayoutEngine?.type, 'boolean');
  assert.match(useLayoutEngine?.description ?? '', /omit `layoutEngineOptions`/u);
  assert.match(useLayoutEngine?.description ?? '', /initial non-default zoom/u);
  assert.match(useLayoutEngine?.description ?? '', /does not select a different DOCX renderer/u);
  assert.doesNotMatch(useLayoutEngine?.description ?? '', /Whether DOCX documents use the layout engine/u);
  assert.equal(useLayoutEngine?.deprecated, undefined);
  assert.equal(
    editorConfigExplorer.fields.find((field) => field.name === 'modules')?.type,
    '{\n  trackChanges?: TrackChangesModuleConfig;\n}',
  );
  assert.doesNotMatch(renderConfigReferenceMarkdown(editorConfigExplorer), /Deprecated\./u);
});

test('deprecated HTML and Markdown initializers name complete body replacements', async () => {
  const superdocTypes = await readFile(superdocCoreTypesUrl, 'utf8');
  assert.ok(
    superdocTypes.includes(
      "@deprecated replaceWith=`doc.replace({ target: { kind: 'story', storyType: 'body' }, type: 'html', value }) after onReady` removeIn=v3.0",
    ),
  );
  assert.ok(
    superdocTypes.includes(
      "@deprecated replaceWith=`doc.replace({ target: { kind: 'story', storyType: 'body' }, type: 'markdown', value }) after onReady` removeIn=v3.0",
    ),
  );
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

test('the Content controls feature maps control shapes to focused workflows', async () => {
  const page = await readFile(new URL('../content/docs/editor/content-controls/index.mdx', import.meta.url), 'utf8');
  const { contentControlPatterns, renderContentControlPatternsMarkdown } = await import(
    '../lib/content-control-patterns.ts',
  );
  const markdown = renderContentControlPatternsMarkdown();

  assert.deepEqual(
    contentControlPatterns.map(({ id }) => id),
    ['inline', 'block', 'repeating'],
  );
  assert.match(page, /<ContentControlPatterns \/>/u);
  assert.match(page, /\/editor\/content-controls\/add-fields-to-a-docx-template/u);
  assert.match(page, /\/editor\/content-controls\/fill-a-docx-template/u);
  assert.match(page, /\/editor\/content-controls\/replace-clauses-from-your-application/u);
  assert.match(page, /\/editor\/content-controls\/lock-template-fields/u);
  assert.match(page, /\/editor\/custom-ui\/content-controls/u);
  assert.match(markdown, /Block-level/u);
  assert.match(markdown, /Repeating section/u);
  assert.doesNotMatch(markdown, /<ContentControlPatterns/u);
});

test('the Content controls template guides stay focused and agent-readable', async () => {
  const authoring = await readFile(
    new URL('../content/docs/editor/content-controls/add-fields-to-a-docx-template.mdx', import.meta.url),
    'utf8',
  );
  const fill = await readFile(
    new URL('../content/docs/editor/content-controls/fill-a-docx-template.mdx', import.meta.url),
    'utf8',
  );
  const clauses = await readFile(
    new URL('../content/docs/editor/content-controls/replace-clauses-from-your-application.mdx', import.meta.url),
    'utf8',
  );
  const locks = await readFile(
    new URL('../content/docs/editor/content-controls/lock-template-fields.mdx', import.meta.url),
    'utf8',
  );
  const { renderClauseLibraryMarkdown } = await import('../lib/clause-library.ts');
  const { contentControlLockModes, getContentControlLockMode, renderContentControlLocksMarkdown } = await import(
    '../lib/content-control-locks.ts'
  );
  const { renderContentControlAuthoringMarkdown } = await import('../lib/content-control-authoring.ts');
  const { renderTemplatePopulationMarkdown, templatePopulationFields } = await import('../lib/template-population.ts');
  const authoringMarkdown = renderContentControlAuthoringMarkdown();
  const populationMarkdown = renderTemplatePopulationMarkdown();
  const clauseMarkdown = renderClauseLibraryMarkdown();
  const lockMarkdown = renderContentControlLocksMarkdown();

  assert.match(authoring, /<ContentControlAuthoringDemo \/>/u);
  assert.match(authoring, /snippets\/editor\/add-template-fields\.ts/u);
  assert.match(authoring, /examples\/content-controls/u);
  assert.match(fill, /<TemplatePopulationDemo \/>/u);
  assert.match(fill, /examples\/content-controls\/src\/field-schema\.ts/u);
  assert.match(fill, /examples\/content-controls\/src\/template-fields\.ts/u);
  assert.doesNotMatch(fill, /examples\/template-population/u);
  assert.match(clauses, /<ClauseLibraryDemo \/>/u);
  assert.match(clauses, /snippets\/editor\/replace-clause\.ts/u);
  assert.match(locks, /<ContentControlLocksDemo \/>/u);
  assert.match(locks, /snippets\/editor\/set-template-field-lock\.ts/u);
  assert.match(authoringMarkdown, /`client\.legalName`/u);
  assert.match(authoringMarkdown, /inline text field/u);
  assert.match(populationMarkdown, /`client\.legalName`/u);
  assert.match(
    populationMarkdown,
    new RegExp(`${templatePopulationFields.clientLegalName.occurrences} document occurrences`),
  );
  assert.match(clauseMarkdown, /`agreement\.confidentiality`/u);
  assert.deepEqual(
    contentControlLockModes.map(({ lockMode }) => lockMode),
    ['unlocked', 'sdtLocked', 'contentLocked', 'sdtContentLocked'],
  );
  assert.equal(getContentControlLockMode({ cannotDelete: true, cannotEdit: false }), 'sdtLocked');
  assert.equal(getContentControlLockMode({ cannotDelete: false, cannotEdit: true }), 'contentLocked');
  assert.match(lockMarkdown, /Content control cannot be deleted/u);
  assert.match(lockMarkdown, /Contents cannot be edited/u);
  assert.doesNotMatch(authoringMarkdown, /<ContentControlAuthoringDemo/u);
  assert.doesNotMatch(populationMarkdown, /<TemplatePopulationDemo/u);
  assert.doesNotMatch(clauseMarkdown, /<ClauseLibraryDemo/u);
  assert.doesNotMatch(lockMarkdown, /<ContentControlLocksDemo/u);
});

test('the content-control authoring demo uses real Document API mutations', async () => {
  const demo = await readFile(contentControlAuthoringDemoUrl, 'utf8');
  const { getReadyAuthoringTarget } = await import('../lib/content-control-authoring.ts');
  const selectionTarget = {
    kind: 'selection',
    start: { kind: 'text', blockId: 'client-name', offset: 0 },
    end: { kind: 'text', blockId: 'client-name', offset: 19 },
  };

  assert.match(demo, /create\.contentControl/u);
  assert.match(demo, /kind: 'inline'/u);
  assert.match(demo, /kind: 'block'/u);
  assert.match(demo, /service-agreement-draft\.docx/u);
  assert.match(demo, /const canExport = hasClientField && hasClauseField;/u);
  assert.match(demo, /disabled=\{disabled \|\| !canExport\} onClick=\{\(\) => void exportDocument\(\)\}/u);
  assert.match(demo, /createdTags\.has\('client\.legalName'\) \|\|\s+controls\.some/u);
  assert.match(demo, /createdTags\.has\('agreement\.confidentiality'\) \|\|\s+controls\.some/u);
  for (const [handler, nextHandler, tag] of [
    ['addInlineField', 'addBlockField', 'client.legalName'],
    ['addBlockField', 'changeZoom', 'agreement.confidentiality'],
  ]) {
    const body = demo.slice(demo.indexOf(`async function ${handler}()`), demo.indexOf(`function ${nextHandler}(`));
    const receipt = body.indexOf('if (!receipt.success)');
    const lock = body.indexOf(`setCreatedTags((current) => new Set(current).add('${tag}'))`);
    const refresh = body.indexOf('await refreshControls()');

    assert.ok(receipt >= 0 && receipt < lock && lock < refresh, `${handler} must lock its tag before refresh`);
    assert.match(body, /field added, but the detected-fields list could not be refreshed\./u);
  }
  assert.match(
    demo,
    /selection\.observe\(\(snapshot\) => \{\s*latestSelectionRef\.current = snapshot;\s*\}\)/u,
    'the observer must replace the cached selection even when the snapshot is stale or targetless',
  );
  assert.equal(
    getReadyAuthoringTarget({ status: 'pending', empty: false, selectionTarget }, false),
    null,
  );
  assert.equal(
    getReadyAuthoringTarget({ status: 'stale', empty: false, selectionTarget }, false),
    null,
  );
  assert.equal(
    getReadyAuthoringTarget({ status: 'ready', empty: false, selectionTarget }, false),
    selectionTarget,
  );
  assert.equal(
    getReadyAuthoringTarget({ status: 'ready', empty: true, selectionTarget }, true),
    selectionTarget,
  );
  assert.equal(getReadyAuthoringTarget({ status: 'ready', empty: false, selectionTarget }, true), null);
  assert.deepEqual(
    await readFile(contentControlAuthoringFixtureUrl),
    await readFile(contentControlAuthoringExampleFixtureUrl),
  );
});

test('the content-control lock demo uses real Document API mutations', async () => {
  const demo = await readFile(contentControlLocksDemoUrl, 'utf8');

  assert.match(demo, /contentControls\.setLockMode/u);
  assert.match(demo, /contentControls\.text\.setValue/u);
  assert.match(demo, /contentControls\.delete/u);
  assert.match(demo, /fieldTag = 'client\.address'/u);
  assert.match(demo, /service-agreement-template\.docx/u);
});

test('the template population demo flushes document updates before export', async () => {
  const demo = await readFile(templatePopulationDemoUrl, 'utf8');
  const exportBody = demo.match(/async function exportDocument\(\) \{([\s\S]*?)\n  \}/u)?.[1] ?? '';

  const flush = exportBody.indexOf('flushTextUpdate()');
  const wait = exportBody.indexOf('await updateQueueRef.current.wait()');
  const failureGate = exportBody.indexOf('updateQueueRef.current.hasFailures()');
  const download = exportBody.indexOf('await instance.export');

  assert.ok(flush >= 0 && flush < wait && wait < failureGate && failureGate < download);
  assert.match(demo, /inputTimerRef\.current = window\.setTimeout\(flushTextUpdate, 250\)/u);
  assert.match(demo, /await queueUpdate\('autoRenew', \(context\) => updateAutoRenew\(context, checked\)\)/u);
  assert.match(demo, /updateQueueRef\.current\.activate\(doc\)/u);
  assert.match(demo, /function resetDocument\(\) \{\s+updateQueueRef\.current\.invalidate\(\)/u);
  assert.match(demo, /if \(!isCurrent\(\)\) return false;/u);
  assert.match(demo, /inputTimerRef\.current = null;\s+pendingTextRef\.current = null;\s+destroyEditor\(\)/u);
});

test('the template population update queue drops reset-era work and retains failures until retry', async () => {
  const { createTemplatePopulationUpdateQueue } = await import('../lib/template-population.ts');
  const updates = createTemplatePopulationUpdateQueue();
  const originalDocument = { id: 'original' };
  const replacementDocument = { id: 'replacement' };
  let releaseFirstUpdate;
  const firstUpdateBlocked = new Promise((resolve) => {
    releaseFirstUpdate = resolve;
  });
  let firstUpdateStarted;
  const firstUpdateDidStart = new Promise((resolve) => {
    firstUpdateStarted = resolve;
  });
  const mutatedDocuments = [];

  updates.activate(originalDocument);
  const firstUpdate = updates.enqueue('clientLegalName', async ({ document, isCurrent }) => {
    firstUpdateStarted();
    await firstUpdateBlocked;
    if (!isCurrent()) return false;
    mutatedDocuments.push(document);
    return true;
  });
  const staleCheckboxUpdate = updates.enqueue('autoRenew', async ({ document }) => {
    mutatedDocuments.push(document);
    return true;
  });

  await firstUpdateDidStart;
  updates.invalidate();
  updates.activate(replacementDocument);
  releaseFirstUpdate();
  await Promise.all([firstUpdate, staleCheckboxUpdate]);

  assert.deepEqual(mutatedDocuments, [], 'queued work from the old document must not run after reset');

  await updates.enqueue('autoRenew', async () => {
    throw new Error('selection failed');
  });
  await updates.wait();
  assert.equal(updates.hasFailures(), true, 'a rejected document update must keep export blocked');

  await updates.enqueue('autoRenew', async ({ document }) => {
    mutatedDocuments.push(document);
    return true;
  });
  assert.equal(updates.hasFailures(), false, 'a successful retry must clear the failed field');
  assert.deepEqual(mutatedDocuments, [replacementDocument]);
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
