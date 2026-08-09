import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectDocumentationRoutes } from '../scripts/redirects.mjs';

const faviconHashes = {
  'android-chrome-192x192.png': '05858f553676edda50791eedacc05cf520e7cc826be9a4940ad711c15f342528',
  'android-chrome-512x512.png': '67f91f0e1b042623d37488ee2a068c0e90b0f6ff64205859bd4795cfa92f99f4',
  'apple-touch-icon.png': '35500dcee200115f8cf5447561046dab53adf93bb45d585555833a61dc42e40d',
  'favicon-16x16.png': '588881e0078c19022ea60be6c28be24214cb07a0271280203e8fb57d13ef2399',
  'favicon-32x32.png': '17720914a2e634d76acb0c747b8d439ed86b9fe745b5c6a7d96adc57c41616b6',
  'favicon.ico': '79211a3a079b08a2194872bc7f53878efa96ec13596ac226e0e29fb2610f4722',
};

const routes = [
  ['index.html', 'SuperDoc'],
  ['start/features-and-surfaces/index.html', 'Features and surfaces'],
  ['editor/index.html', 'Editor overview'],
  ['editor/quickstart/index.html', 'Editor quickstart'],
  ['editor/frameworks/react/index.html', 'Mount SuperDoc in React'],
  ['editor/ui/choose-an-interface/index.html', 'Choose your editor interface'],
  ['editor/built-in-ui/overview/index.html', 'Built-in UI overview'],
  ['editor/built-in-ui/configure-the-toolbar/index.html', 'Configure the built-in toolbar'],
  ['editor/built-in-ui/comments/index.html', 'Comments in the built-in UI'],
  ['editor/built-in-ui/search-and-replace/index.html', 'Find and replace in the built-in UI'],
  ['editor/built-in-ui/links-and-context-menus/index.html', 'Links and context menus'],
  ['editor/built-in-ui/structured-content/index.html', 'Work with structured content'],
  ['editor/built-in-ui/responsive-layout/index.html', 'Build a responsive Editor layout'],
  ['editor/custom-ui/overview/index.html', 'Custom UI overview'],
  ['editor/custom-ui/controller-setup/index.html', 'Custom UI controller setup'],
  ['editor/custom-ui/react-setup/index.html', 'React custom UI setup'],
  ['editor/custom-ui/commands-and-state/index.html', 'Commands and state'],
  ['editor/custom-ui/failures-and-capabilities/index.html', 'Handle unavailable commands'],
  ['editor/custom-ui/custom-commands/index.html', 'Register custom commands'],
  ['editor/custom-ui/zoom-and-document-state/index.html', 'Control zoom and document state'],
  ['editor/custom-ui/formatting-controls/index.html', 'Build formatting controls'],
  ['editor/custom-ui/selection-and-viewport/index.html', 'Preserve selections and position UI'],
  ['editor/custom-ui/comments/index.html', 'Build a custom comments UI'],
  ['editor/custom-ui/tracked-changes/index.html', 'Build tracked-change review controls'],
  ['editor/custom-ui/content-controls/index.html', 'Build a content-control panel'],
  ['editor/custom-ui/tables/index.html', 'Build contextual table controls'],
  ['editor/custom-ui/search/index.html', 'Build custom search controls'],
  ['editor/platform/configuration/index.html', 'Configure the Editor'],
  ['editor/platform/lifecycle-and-events/index.html', 'Handle lifecycle and events'],
  ['editor/platform/document-management/index.html', 'Manage document files'],
  ['editor/platform/dialogs-and-floating-surfaces/index.html', 'Open dialogs and floating surfaces'],
  ['editor/platform/themes-and-fonts/index.html', 'Theme UI and resolve document fonts'],
  ['editor/platform/proofing/index.html', 'Add spelling and grammar proofing'],
  ['editor/platform/accessibility-and-keyboard/index.html', 'Build accessible Editor experiences'],
  ['editor/platform/secure-integration/index.html', 'Secure browser document workflows'],
  ['editor/review/tracked-changes/index.html', 'Review tracked changes'],
  ['editor/load-and-save-documents/index.html', 'Load and save documents'],
  ['editor/document-modes/index.html', 'Document modes'],
  ['editor/migrate-from-v1/overview/index.html', 'Migrate from v1'],
  ['agents/overview/index.html', 'Overview'],
  ['agents/build/build-an-agent/index.html', 'Build an agent'],
  ['agents/build/tools/index.html', 'Tools and presets'],
  ['agents/build/legacy-tools/index.html', 'Legacy tools'],
  ['agents/automation/node-sdk/index.html', 'Automate a DOCX with Node.js'],
  ['agents/automation/python-sdk/index.html', 'Automate a DOCX with Python'],
  ['agents/automation/cli/index.html', 'Automate a DOCX from the CLI'],
  ['agents/workflows/review-tracked-changes/index.html', 'Review tracked changes'],
  ['agents/operate/safety/index.html', 'Safety'],
  ['document-api/mental-model/index.html', 'Document API mental model'],
  ['document-api/application-data/index.html', 'Store application data in DOCX'],
  ['document-api/query-content/index.html', 'Query document content'],
  ['document-api/replace-delete-content/index.html', 'Replace and delete content'],
  ['document-api/mutation-plans/index.html', 'Preview and apply mutation plans'],
  ['document-api/tracked-changes/index.html', 'Work with tracked changes'],
  ['document-api/comments/index.html', 'Create and resolve comment threads'],
  ['document-api/receipts-and-errors/index.html', 'Receipts and errors'],
  ['document-api/reference/index.html', 'Document API reference'],
  ['document-api/reference/content-controls/index.html', 'Content Controls operations'],
  ['document-api/reference/query/match/index.html', 'query.match'],
  ['resources/license/index.html', 'Licensing'],
  ['resources/security/index.html', 'Trust &amp; Security'],
  ['resources/docx-engine-license/index.html', 'SuperDoc DOCX Engine Proprietary License'],
];

for (const [outputPath, expectedText] of routes) {
  test(`exports ${outputPath}`, async () => {
    const html = await readFile(new URL(`../out/${outputPath}`, import.meta.url), 'utf8');
    assert.match(html, new RegExp(expectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
}

test('exports the homepage without the documentation sidebar', async () => {
  const homepage = await readFile(new URL('../out/index.html', import.meta.url), 'utf8');
  const article = await readFile(new URL('../out/editor/quickstart/index.html', import.meta.url), 'utf8');

  assert.match(homepage, /id="nd-home-layout"/);
  assert.doesNotMatch(homepage, /id="nd-sidebar"/);
  assert.match(article, /id="nd-docs-layout"/);
  assert.match(article, /id="nd-sidebar"/);
});

test('keeps the DOCX Engine license out of Resources navigation', async () => {
  const security = await readFile(new URL('../out/resources/security/index.html', import.meta.url), 'utf8');

  assert.doesNotMatch(security, /href="\/resources\/docx-engine-license\/?"/u);
});

test('exports agent prompts that resolve against the serving origin', async () => {
  const homepage = await readFile(new URL('../out/index.html', import.meta.url), 'utf8');

  assert.match(homepage, /Point your agent at the right guide/);
  assert.match(homepage, /source of truth for SuperDoc v2/);
  // The prompt is rebuilt from the serving origin once hydrated, so a preview
  // or local build hands out its own Markdown routes instead of production's.
  assert.doesNotMatch(homepage, /https:\/\/docs\.superdoc\.dev\/(?:md|llms)/);
});

test('loads production analytics without counting preview traffic', async () => {
  const homepage = await readFile(new URL('../out/index.html', import.meta.url), 'utf8');

  assert.match(homepage, /https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-E4T80WRJGS/u);
  assert.match(homepage, /window\.location\.hostname === 'docs\.superdoc\.dev'/u);
  assert.match(homepage, /gtag\('config', 'G-E4T80WRJGS'\)/u);
});

test('exports the shared SuperDoc favicon bundle', async () => {
  const homepage = await readFile(new URL('../out/index.html', import.meta.url), 'utf8');
  const manifest = JSON.parse(await readFile(new URL('../out/site.webmanifest', import.meta.url), 'utf8'));

  assert.match(homepage, /<link rel="manifest" href="\/site\.webmanifest"\/>/u);
  assert.match(homepage, /<link rel="icon" href="\/favicon\.ico" sizes="any"\/>/u);
  assert.match(homepage, /<link rel="icon" href="\/favicon-16x16\.png" sizes="16x16" type="image\/png"\/>/u);
  assert.match(homepage, /<link rel="icon" href="\/favicon-32x32\.png" sizes="32x32" type="image\/png"\/>/u);
  assert.match(
    homepage,
    /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png" sizes="180x180" type="image\/png"\/>/u,
  );
  assert.equal(manifest.name, 'SuperDoc');
  assert.equal(manifest.short_name, 'SuperDoc');
  assert.deepEqual(
    manifest.icons.map(({ src, sizes, type }) => ({ src, sizes, type })),
    [
      { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  );

  for (const [filename, expectedHash] of Object.entries(faviconHashes)) {
    const asset = await readFile(new URL(`../out/${filename}`, import.meta.url));
    assert.equal(createHash('sha256').update(asset).digest('hex'), expectedHash, filename);
  }
});

test('exports one page-context control with clean Markdown and AI routes', async () => {
  const article = await readFile(new URL('../out/editor/quickstart/index.html', import.meta.url), 'utf8');

  assert.match(article, /Copy page/);
  assert.match(article, /aria-label="More page formats"/);
  assert.match(article, /View as Markdown/);
  assert.match(article, /href="\/md\/editor\/quickstart\.md"/);
  assert.match(article, /Open in ChatGPT/);
  assert.match(article, /Open in Claude/);
  assert.match(article, /href="\/llms-full\.txt"/);
});

test('exports a canonical URL on every page shape', async () => {
  const homepage = await readFile(new URL('../out/index.html', import.meta.url), 'utf8');
  const article = await readFile(new URL('../out/editor/quickstart/index.html', import.meta.url), 'utf8');
  const reference = await readFile(
    new URL('../out/document-api/reference/blocks/split/index.html', import.meta.url),
    'utf8',
  );

  // Every alias Cloudflare Pages serves the export from would otherwise
  // advertise itself as canonical and compete with production in search.
  assert.match(homepage, /<link rel="canonical" href="https:\/\/docs\.superdoc\.dev\/"\/>/u);
  assert.match(article, /<link rel="canonical" href="https:\/\/docs\.superdoc\.dev\/editor\/quickstart\/"\/>/u);
  assert.match(
    reference,
    /<link rel="canonical" href="https:\/\/docs\.superdoc\.dev\/document-api\/reference\/blocks\/split\/"\/>/u,
  );
});

test('exports a sitemap covering every live documentation route', async () => {
  const sitemap = await readFile(new URL('../out/sitemap.xml', import.meta.url), 'utf8');
  const redirects = await readFile(new URL('../out/_redirects', import.meta.url), 'utf8');

  const listed = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(([, url]) => url));
  const redirectSources = new Set(redirects.split('\n').map((line) => line.split(' ')[0]));

  // config/routes.json is an append-only history, so it still records routes
  // that have since moved or retired. The sitemap must advertise what the
  // export actually serves: a listed redirect source would send crawlers to a
  // hop, and a missing live page would go unindexed.
  const built = [...(await collectDocumentationRoutes(fileURLToPath(new URL('../out', import.meta.url))))].sort();
  const missing = built.filter((route) => !listed.has(`https://docs.superdoc.dev${route}`));

  assert.deepEqual(missing, [], 'every exported documentation page belongs in the sitemap');
  assert.equal(listed.size, built.length);

  for (const url of listed) {
    const path = url.replace('https://docs.superdoc.dev', '');
    // trailingSlash: true means the served URL always ends in a slash. An
    // entry without one points at a redirect rather than the page itself.
    assert.match(url, /\/$/u, `sitemap entry must be the served URL: ${url}`);
    assert.ok(!redirectSources.has(path), `sitemap must not list a redirect source: ${path}`);
  }
});

test('exports a robots policy that allows indexing and finds the sitemap', async () => {
  const robots = await readFile(new URL('../out/robots.txt', import.meta.url), 'utf8');

  assert.match(robots, /User-Agent: \*/u);
  assert.match(robots, /Allow: \//u);
  assert.match(robots, /Sitemap: https:\/\/docs\.superdoc\.dev\/sitemap\.xml/u);
  // Preview aliases are excluded by Cloudflare's X-Robots-Tag header. A
  // disallow rule here would ship in the production artifact too.
  assert.doesNotMatch(robots, /Disallow: \/\s*$/mu);
});

test('exports the tracked-changes fixture', async () => {
  const fixture = await stat(new URL('../out/fixtures/tracked-changes.docx', import.meta.url));
  assert.ok(fixture.size > 0);
});

test('exports the editor quickstart sample document', async () => {
  const fixture = await stat(new URL('../out/fixtures/sample-nda.docx', import.meta.url));
  assert.ok(fixture.size > 0);
});

test('the editor quickstart offers the clean sample and no review markup', async () => {
  const article = await readFile(new URL('../out/editor/quickstart/index.html', import.meta.url), 'utf8');

  assert.match(article, /Download the sample document/);
  assert.match(article, /href="\/fixtures\/sample-nda\.docx"/);
  // The tracked-changes fixture is reserved for review guidance, so the
  // quickstart must not reintroduce it through a download or an embed.
  assert.doesNotMatch(article, /tracked-changes\.docx/);
  assert.doesNotMatch(article, /cdn\.jsdelivr\.net/);
});

test('exports the tracked-review workflow with local-file fallback', async () => {
  const article = await readFile(
    new URL('../out/agents/workflows/review-tracked-changes/index.html', import.meta.url),
    'utf8',
  );

  assert.match(article, /review-workflow\.[a-zA-Z0-9_-]+\.svg/);
  assert.match(article, /Open your DOCX/);
  assert.match(article, /Files stay in this browser/);
  assert.match(article, /changeMode/);
  assert.match(article, /tracked/);
  assert.doesNotMatch(article, /cdn\.jsdelivr\.net/);
});

test('exports the document modes guide with an interactive mode switcher', async () => {
  const article = await readFile(new URL('../out/editor/document-modes/index.html', import.meta.url), 'utf8');
  const markdown = await readFile(new URL('../out/md/editor/document-modes.md', import.meta.url), 'utf8');

  assert.match(article, /Try document modes/);
  assert.match(article, /data-preset="document-modes"/);
  assert.match(markdown, /Mode switching: viewing, editing, and suggesting\./);
  assert.doesNotMatch(markdown, /<EditorDemo\b/);
});

test('exports the custom UI command-state model with a Markdown fallback', async () => {
  const article = await readFile(new URL('../out/editor/custom-ui/overview/index.html', import.meta.url), 'utf8');
  const markdown = await readFile(new URL('../out/md/editor/custom-ui/overview.md', import.meta.url), 'utf8');

  assert.match(article, /data-command-state-demo="true"/);
  assert.match(article, /Selection drives command state/);
  assert.match(article, /Toggle bold for the simulated selection/);
  assert.match(markdown, /> \*\*Interactive model: selection drives command state\*\*/);
  assert.match(markdown, /A locked heading reports `enabled: false`, `active: false`, and a disabled reason/);
  assert.doesNotMatch(markdown, /<CommandStateDemo\b/);
});

test('exports the focused built-in toolbar example as clean Markdown', async () => {
  const article = await readFile(
    new URL('../out/editor/built-in-ui/configure-the-toolbar/index.html', import.meta.url),
    'utf8',
  );
  const markdown = await readFile(
    new URL('../out/md/editor/built-in-ui/configure-the-toolbar.md', import.meta.url),
    'utf8',
  );

  assert.match(article, /responsiveToContainer/);
  assert.match(article, /documentMode/);
  assert.match(markdown, /const toolbar: ToolbarConfig/);
  assert.match(markdown, /groups: \{/);
  assert.match(markdown, /The toolbar is configuration, not authorization/);
  assert.doesNotMatch(markdown, /<include>/);
});

test('exports the React custom UI example as clean Markdown', async () => {
  const article = await readFile(new URL('../out/editor/custom-ui/react-setup/index.html', import.meta.url), 'utf8');
  const markdown = await readFile(new URL('../out/md/editor/custom-ui/react-setup.md', import.meta.url), 'utf8');

  assert.match(article, /SuperDocUIProvider/);
  assert.match(article, /useSuperDocCommand/);
  assert.match(markdown, /document: '\/contract\.docx'/);
  assert.match(markdown, /useSetSuperDoc/);
  assert.match(markdown, /The React component still owns the Editor instance/);
  assert.doesNotMatch(markdown, /<include>/);
});

test('exports the custom UI command-state contract without a copied command matrix', async () => {
  const markdown = await readFile(new URL('../out/md/editor/custom-ui/commands-and-state.md', import.meta.url), 'utf8');

  assert.match(markdown, /`enabled`/);
  assert.match(markdown, /`active`/);
  assert.match(markdown, /`value`/);
  assert.match(markdown, /`reason`/);
  assert.match(markdown, /`supported`/);
  assert.match(markdown, /BUILT_IN_COMMAND_IDS/);
  assert.match(markdown, /Do not render every recognized command automatically/);
  assert.match(markdown, /For a receipt, inspect `success` before continuing/);
});

test('exports the Editor tracked-change review workflow with the existing review demo', async () => {
  const article = await readFile(new URL('../out/editor/review/tracked-changes/index.html', import.meta.url), 'utf8');
  const markdown = await readFile(new URL('../out/md/editor/review/tracked-changes.md', import.meta.url), 'utf8');

  assert.match(article, /Review a tracked change/);
  assert.match(article, /data-preset="tracked-review"/);
  assert.match(article, /Accept/);
  assert.match(article, /Reject/);
  assert.match(markdown, /Tracked-change review: accept or reject the sample change/);
  assert.match(markdown, /Editor modes and client-side review controls are not an authorization boundary/);
  assert.doesNotMatch(markdown, /<EditorDemo\b/);
});

test('exports the custom tracked-change review workflow as clean Markdown', async () => {
  const markdown = await readFile(new URL('../out/md/editor/custom-ui/tracked-changes.md', import.meta.url), 'utf8');

  assert.match(markdown, /ui\.trackChanges\.observe\(render\)/);
  assert.match(markdown, /ui\.trackChanges\.setActive\(id\)/);
  assert.match(markdown, /await ui\.trackChanges\.scrollTo\(id\)/);
  assert.match(markdown, /await ui\.commands\.executeAsync\(decision, \{ id \}\)/);
  assert.match(markdown, /client-side controls can prevent a normal interaction/);
  assert.doesNotMatch(markdown, /<include>/);
});

test('exports the custom content-control workflow as clean Markdown', async () => {
  const markdown = await readFile(new URL('../out/md/editor/custom-ui/content-controls.md', import.meta.url), 'utf8');

  assert.match(markdown, /ui\.contentControls\.observe\(render\)/);
  assert.match(markdown, /await ui\.contentControls\.focus/);
  assert.match(markdown, /await doc\.contentControls\.text\.setValue/);
  assert.match(markdown, /Focus is navigation/);
  assert.doesNotMatch(markdown, /<include>/);
});

test('exports the custom table-controls workflow as clean Markdown', async () => {
  const markdown = await readFile(new URL('../out/md/editor/custom-ui/tables.md', import.meta.url), 'utf8');

  assert.match(markdown, /ui\.tables\.getContext\(\)/);
  assert.match(markdown, /await addRow\.executeAsync\(\)/);
  assert.match(markdown, /await deleteRow\.executeAsync\(\)/);
  assert.match(markdown, /table-context-unavailable/);
  assert.doesNotMatch(markdown, /<include>/);
});

test('exports the custom formatting-controls workflow as clean Markdown', async () => {
  const markdown = await readFile(
    new URL('../out/md/editor/custom-ui/formatting-controls.md', import.meta.url),
    'utf8',
  );

  assert.match(markdown, /ui\.fonts\.getSnapshot\(\)/);
  assert.match(markdown, /ui\.styles\.getSnapshot\(\)/);
  assert.match(markdown, /await paragraphStyle\.executeAsync/);
  assert.match(markdown, /Applying the style ID preserves the document's style relationship/);
  assert.doesNotMatch(markdown, /<include>/);
});

test('exports custom document controls as clean Markdown', async () => {
  const markdown = await readFile(
    new URL('../out/md/editor/custom-ui/zoom-and-document-state.md', import.meta.url),
    'utf8',
  );

  assert.match(markdown, /ui\.zoom\.setMode\('fit-width'\)/);
  assert.match(markdown, /ui\.document\.observe\(render\)/);
  assert.match(markdown, /if \(!pendingExport\)/);
  assert.match(markdown, /dirty.*prompt to save or export/s);
  assert.doesNotMatch(markdown, /<include>/);
});

test('exports custom command registration as clean Markdown', async () => {
  const markdown = await readFile(new URL('../out/md/editor/custom-ui/custom-commands.md', import.meta.url), 'utf8');

  assert.match(markdown, /ui\.commands\.register<\{ text: string \}>/);
  assert.match(markdown, /shortcut.*application still owns the keyboard listener/s);
  assert.match(markdown, /registration\.unregister/);
  assert.match(markdown, /Custom commands do not create an authorization boundary/);
  assert.doesNotMatch(markdown, /<include>/);
});

test('exports command failure guidance as clean Markdown', async () => {
  const markdown = await readFile(
    new URL('../out/md/editor/custom-ui/failures-and-capabilities.md', import.meta.url),
    'utf8',
  );

  assert.match(markdown, /Partial<Record<SuperDocUIReason, string>>/);
  assert.match(markdown, /State is a snapshot, not a guarantee/);
  assert.match(markdown, /Do not render every ID from the command catalog as a toolbar/);
  assert.match(markdown, /do not infer success from the absence of an exception/);
  assert.doesNotMatch(markdown, /<include>/);
});

test('exports the comments workflow through each canonical surface', async () => {
  const builtIn = await readFile(new URL('../out/md/editor/built-in-ui/comments.md', import.meta.url), 'utf8');
  const customUI = await readFile(new URL('../out/md/editor/custom-ui/comments.md', import.meta.url), 'utf8');
  const documentApi = await readFile(new URL('../out/md/document-api/comments.md', import.meta.url), 'utf8');

  assert.match(builtIn, /displayMode: 'auto'/);
  assert.match(builtIn, /browser behavior[\s\S]*do not authorize access/);
  assert.match(customUI, /ui\.comments\.createFromCapture/);
  assert.match(customUI, /ui\.comments\.createFromSelection/);
  assert.match(customUI, /ui\.comments\.scrollTo/);
  assert.match(documentApi, /target: clause\.target/);
  assert.match(documentApi, /parentCommentId: createReceipt\.id/);
  assert.match(documentApi, /expectedRevision: afterReply\.evaluatedRevision/);
  assert.doesNotMatch(builtIn, /<include>/);
  assert.doesNotMatch(customUI, /<include>/);
  assert.doesNotMatch(documentApi, /<include>/);
});

test('exports the custom selection and viewport workflow as clean Markdown', async () => {
  const markdown = await readFile(
    new URL('../out/md/editor/custom-ui/selection-and-viewport.md', import.meta.url),
    'utf8',
  );

  assert.match(markdown, /capture = ui\.selection\.capture\(\)/);
  assert.match(markdown, /ui\.viewport\.getRect\(\{ target, relativeTo: editorShell \}\)/);
  assert.match(markdown, /ui\.viewport\.observe\(positionOverlay\)/);
  assert.match(markdown, /ui\.selection\.restore\(capture\)/);
  assert.match(markdown, /Do not cache rectangle coordinates as document identity/);
  assert.doesNotMatch(markdown, /<include>/);
});

test('exports built-in and custom search without duplicating Document API queries', async () => {
  const builtIn = await readFile(
    new URL('../out/md/editor/built-in-ui/search-and-replace.md', import.meta.url),
    'utf8',
  );
  const customUI = await readFile(new URL('../out/md/editor/custom-ui/search.md', import.meta.url), 'utf8');

  assert.match(builtIn, /search: true/);
  assert.match(builtIn, /browser keeps its native page search shortcut/);
  assert.match(customUI, /ui\.search\.observe\(render\)/);
  assert.match(customUI, /await ui\.search\.replaceAll\(replacement\.value\)/);
  assert.match(customUI, /\[Document API queries\]\(\/document-api\/query-content\)/);
  assert.doesNotMatch(builtIn, /<include>/);
  assert.doesNotMatch(customUI, /<include>/);
});

test('exports the remaining built-in UI workflows as clean Markdown', async () => {
  const links = await readFile(
    new URL('../out/md/editor/built-in-ui/links-and-context-menus.md', import.meta.url),
    'utf8',
  );
  const structured = await readFile(
    new URL('../out/md/editor/built-in-ui/structured-content.md', import.meta.url),
    'utf8',
  );
  const responsive = await readFile(
    new URL('../out/md/editor/built-in-ui/responsive-layout.md', import.meta.url),
    'utf8',
  );

  assert.match(links, /satisfies ContextMenuConfig/);
  assert.match(links, /Context-menu visibility is not authorization/);
  assert.match(structured, /handleImageUpload/);
  assert.match(structured, /object URLs.*browser session/s);
  assert.match(responsive, /mode: 'fit-width'/);
  assert.match(responsive, /fullscreenchange/);
  assert.match(responsive, /Avoid nesting the Editor inside another horizontal scroller/);
  assert.doesNotMatch(`${links}\n${structured}\n${responsive}`, /<include>/);
});

test('exports the Editor platform guidance as clean Markdown', async () => {
  const pages = await Promise.all(
    [
      'configuration',
      'lifecycle-and-events',
      'document-management',
      'dialogs-and-floating-surfaces',
      'themes-and-fonts',
      'proofing',
      'accessibility-and-keyboard',
      'secure-integration',
    ].map((slug) => readFile(new URL(`../out/md/editor/platform/${slug}.md`, import.meta.url), 'utf8')),
  );
  const corpus = pages.join('\n');

  assert.match(corpus, /satisfies Config/);
  assert.match(corpus, /superdoc\.off\('document-mode-change'/);
  assert.match(corpus, /triggerDownload: false/);
  assert.match(corpus, /await handle\.result/);
  assert.match(corpus, /fonts\.map\(\{ Calibri: 'Product Sans' \}\)/);
  assert.match(corpus, /requiresNetwork: false/);
  assert.match(corpus, /Accessibility remains a shared responsibility/);
  assert.match(corpus, /client code a trusted authorization boundary/);
  assert.doesNotMatch(corpus, /<include>/);
});

test('exports every generated Document API reference route', async () => {
  const model = JSON.parse(
    await readFile(new URL('../generated/document-api-reference.json', import.meta.url), 'utf8'),
  );
  const paths = [
    ...model.groups.map((group) => group.path),
    ...Object.values(model.operations).map((operation) => operation.path),
  ];

  for (const path of paths) {
    const route = path.endsWith('/index') ? path.slice(0, -'/index'.length) : path;
    const html = await stat(new URL(`../out/document-api/reference/${route}/index.html`, import.meta.url));
    const markdown = await stat(new URL(`../out/md/document-api/reference/${route}.md`, import.meta.url));
    assert.ok(html.size > 0, route);
    assert.ok(markdown.size > 0, route);
  }
});

test('renders input fields for every operation with a non-empty input schema', async () => {
  const model = JSON.parse(
    await readFile(new URL('../generated/document-api-reference.json', import.meta.url), 'utf8'),
  );
  const incorrectPages = [];

  for (const operation of Object.values(model.operations)) {
    if (!schemaAcceptsInput(operation.schemas.input, model.definitions)) continue;
    const route = operation.path.endsWith('/index') ? operation.path.slice(0, -'/index'.length) : operation.path;
    const html = await readFile(new URL(`../out/document-api/reference/${route}/index.html`, import.meta.url), 'utf8');
    if (html.includes('This operation takes no input fields.')) incorrectPages.push(operation.operationId);
  }

  assert.deepEqual(incorrectPages, []);
});

test('exports the searchable reference experience from contract data', async () => {
  const landing = await readFile(new URL('../out/document-api/reference/index.html', import.meta.url), 'utf8');
  const namespace = await readFile(
    new URL('../out/document-api/reference/content-controls/index.html', import.meta.url),
    'utf8',
  );
  const operation = await readFile(
    new URL('../out/document-api/reference/query/match/index.html', import.meta.url),
    'utf8',
  );
  const landingText = landing.replaceAll('<!-- -->', '');
  const namespaceText = namespace.replaceAll('<!-- -->', '');
  const operationText = operation.replaceAll('<!-- -->', '');

  assert.match(landingText, /Search all 423 operations in contract 0\.1\.0/);
  assert.match(landing, /Search operation names, paths, and descriptions/);
  assert.match(landing, /contentControls/);
  assert.match(namespaceText, /55 operations/);
  assert.match(namespace, /contentControls\.move/);
  assert.match(namespace, /contentControls\.replaceContent/);
  assert.match(namespace, /tracked/);
  assert.match(operationText, /Typechecked example/);
  assert.match(operationText, /Runtime validation is tracked separately/);
  assert.match(operationText, /additional input fields/);
  assert.match(operationText, /evaluatedRevision/);
  assert.match(operationText, /MATCH_NOT_FOUND/);
  assert.match(operationText, /AMBIGUOUS_MATCH/);
  assert.match(operationText, /Query content guide/);
  assert.match(operationText, /View raw JSON schemas/);
  assert.doesNotMatch(operationText, /fixture-backed|Example request|block-abc123/);

  const rawSchemas = JSON.parse(
    await readFile(new URL('../out/reference/document-api/query/match.json', import.meta.url), 'utf8'),
  );
  assert.equal(rawSchemas.operationId, 'query.match');
  assert.equal(rawSchemas.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.ok(rawSchemas.$defs.SelectionTarget);
  assert.ok(rawSchemas.schemas.input);
  assert.ok(rawSchemas.schemas.output);
});

test('exports exact reference Markdown separately from the guide corpus', async () => {
  const operation = await readFile(new URL('../out/md/document-api/reference/query/match.md', import.meta.url), 'utf8');
  const fullGuides = await readFile(new URL('../out/llms-full.txt', import.meta.url), 'utf8');
  const fullReference = await readFile(new URL('../out/llms-reference.txt', import.meta.url), 'utf8');

  assert.match(operation, /^# query\.match/m);
  assert.match(operation, /\*\*Typechecked example:\*\*/);
  assert.match(operation, /"evaluatedRevision"/);
  assert.match(operation, /`MATCH_NOT_FOUND`/);
  assert.doesNotMatch(operation, /<DocumentApiOperation|<include>/);
  for (const heading of ['Input', 'Output']) {
    const schemaJson = operation.match(
      new RegExp('## ' + heading + ' schema\\n\\n```json\\n([\\s\\S]*?)\\n```', 'u'),
    )?.[1];
    assert.ok(schemaJson);
    const schema = JSON.parse(schemaJson);
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    const references = [...JSON.stringify(schema).matchAll(/"#\/\$defs\/([^"]+)"/gu)].map((match) => match[1]);
    assert.deepEqual(
      references.filter((reference) => !Object.hasOwn(schema.$defs, reference)),
      [],
    );
  }
  assert.doesNotMatch(fullGuides, /^## query\.match$/m);
  assert.doesNotMatch(fullGuides, /^# Document API reference$/m);
  assert.match(fullReference, /^## query\.match$/m);
  assert.match(fullReference, /^### Expected result$/m);
  assert.doesNotMatch(fullReference, /^## Expected result$/m);
  assert.match(fullReference, /^## contentControls\.replaceContent$/m);
});

test('exports the machine-readable documentation files', async () => {
  const llmsIndex = await readFile(new URL('../out/llms.txt', import.meta.url), 'utf8');
  const fullCorpus = await readFile(new URL('../out/llms-full.txt', import.meta.url), 'utf8');
  const editorMarkdown = await readFile(new URL('../out/md/editor/quickstart.md', import.meta.url), 'utf8');
  const surfacesMarkdown = await readFile(new URL('../out/md/start/features-and-surfaces.md', import.meta.url), 'utf8');
  const modesMarkdown = await readFile(new URL('../out/md/editor/document-modes.md', import.meta.url), 'utf8');
  const interfaceMarkdown = await readFile(
    new URL('../out/md/editor/ui/choose-an-interface.md', import.meta.url),
    'utf8',
  );
  const customUISetupMarkdown = await readFile(
    new URL('../out/md/editor/custom-ui/controller-setup.md', import.meta.url),
    'utf8',
  );
  const migrationMarkdown = await readFile(
    new URL('../out/md/editor/migrate-from-v1/overview.md', import.meta.url),
    'utf8',
  );
  const queryMarkdown = await readFile(new URL('../out/md/document-api/query-content.md', import.meta.url), 'utf8');
  const mutationMarkdown = await readFile(
    new URL('../out/md/document-api/replace-delete-content.md', import.meta.url),
    'utf8',
  );
  const receiptsMarkdown = await readFile(
    new URL('../out/md/document-api/receipts-and-errors.md', import.meta.url),
    'utf8',
  );
  const trackedChangesMarkdown = await readFile(
    new URL('../out/md/document-api/tracked-changes.md', import.meta.url),
    'utf8',
  );
  const mutationPlansMarkdown = await readFile(
    new URL('../out/md/document-api/mutation-plans.md', import.meta.url),
    'utf8',
  );
  const reviewMarkdown = await readFile(
    new URL('../out/md/agents/workflows/review-tracked-changes.md', import.meta.url),
    'utf8',
  );
  const agentsOverviewMarkdown = await readFile(new URL('../out/md/agents/overview.md', import.meta.url), 'utf8');

  assert.match(llmsIndex, /^# SuperDoc/m);
  assert.match(llmsIndex, /\[Guide corpus\]\(\/llms-full\.txt\)/);
  assert.match(llmsIndex, /\[Document API reference corpus\]\(\/llms-reference\.txt\)/);
  assert.match(llmsIndex, /Prefer focused reference pages/);
  assert.match(fullCorpus, /^# Editor quickstart/m);
  assert.match(editorMarkdown, /^# Editor quickstart/m);
  assert.match(editorMarkdown, /\[Download the sample document\]\(\/fixtures\/sample-nda\.docx\)/);
  // The quickstart's Markdown must carry the layout contract, since that is
  // the part a reader cannot infer from the code alone.
  assert.match(editorMarkdown, /Setting a height without `contained: true` does not constrain the document/);
  assert.match(surfacesMarkdown, /^# Features and surfaces/m);
  assert.match(surfacesMarkdown, /> \*\*Diagram:\*\* People, services, CI, and agents use different SuperDoc surfaces/);
  assert.match(
    surfacesMarkdown,
    /Headless code does not have a toolbar, viewport, DOM selection, or visual review surface/,
  );
  assert.match(surfacesMarkdown, /The Document API is an operation contract, not another runtime/);
  assert.match(modesMarkdown, /^# Document modes/m);
  assert.match(modesMarkdown, /Document modes control editor behavior in the browser/);
  assert.doesNotMatch(modesMarkdown, /<Callout\b/);
  assert.match(interfaceMarkdown, /^# Choose your editor interface/m);
  assert.match(interfaceMarkdown, /> \*\*Diagram:\*\* The built-in UI and a custom application UI/);
  assert.match(interfaceMarkdown, /A custom UI means you build the controls and workflow around SuperDoc/);
  assert.doesNotMatch(interfaceMarkdown, /<Callout\b/);
  assert.match(customUISetupMarkdown, /^# Custom UI controller setup/m);
  assert.match(customUISetupMarkdown, /createSuperDocUI/);
  assert.match(customUISetupMarkdown, /await bold\.executeAsync\(\)/);
  assert.doesNotMatch(customUISetupMarkdown, /<include>/);
  assert.match(migrationMarkdown, /^# Migrate from v1/m);
  assert.match(migrationMarkdown, /Do not connect a v2 editor[\s>]+directly to an existing v1 collaboration room/);
  assert.match(migrationMarkdown, /superdoc\/ui\/react/);
  assert.doesNotMatch(migrationMarkdown, /<Callout\b/);
  assert.match(queryMarkdown, /^# Query document content/m);
  assert.match(queryMarkdown, /> \*\*Diagram:\*\* Highlighted text in a DOCX becomes query result items/);
  assert.match(queryMarkdown, /evaluatedRevision/);
  assert.doesNotMatch(queryMarkdown, /<Callout\b/);
  assert.match(mutationMarkdown, /^# Replace and delete content/m);
  assert.match(mutationMarkdown, /expectedRevision: companyMatch\.evaluatedRevision/);
  assert.match(mutationMarkdown, /behavior: 'exact'/);
  assert.doesNotMatch(mutationMarkdown, /<Callout\b/);
  assert.match(receiptsMarkdown, /^# Receipts and errors/m);
  assert.match(receiptsMarkdown, /> \*\*Diagram:\*\* A successful mutation continues/);
  assert.match(receiptsMarkdown, /REVISION_MISMATCH/);
  assert.match(receiptsMarkdown, /Do not log full document contents/);
  assert.doesNotMatch(receiptsMarkdown, /<Callout\b/);
  assert.match(trackedChangesMarkdown, /^# Work with tracked changes/m);
  assert.match(trackedChangesMarkdown, /\[Review tracked changes\]\(\/editor\/review\/tracked-changes\)/);
  assert.match(trackedChangesMarkdown, /target: \{ kind: 'id', id: detail\.id \}/);
  assert.match(trackedChangesMarkdown, /A review decision resolves an existing change/);
  assert.doesNotMatch(trackedChangesMarkdown, /<EditorDemo\b/);
  assert.match(mutationPlansMarkdown, /^# Preview and apply mutation plans/m);
  assert.match(mutationPlansMarkdown, /const preview = await doc\.mutations\.preview\(plan\)/);
  assert.match(mutationPlansMarkdown, /const receipt = await doc\.mutations\.apply\(plan\)/);
  assert.match(mutationPlansMarkdown, /> \*\*Diagram:\*\* Two query references become one atomic plan/);
  assert.doesNotMatch(mutationPlansMarkdown, /<include>/);
  assert.match(reviewMarkdown, /^# Review tracked changes/m);
  assert.match(reviewMarkdown, /changeMode: 'tracked'/);
  assert.match(reviewMarkdown, /The documentation site does not upload it/);
  assert.match(agentsOverviewMarkdown, /^# Overview/m);
  assert.match(agentsOverviewMarkdown, /@superdoc\/sdk/);
  assert.doesNotMatch(agentsOverviewMarkdown, /\bMCP\b/u);
  assert.match(agentsOverviewMarkdown, /Do not import `@superdoc\/headless`/);
  assert.match(agentsOverviewMarkdown, /no toolbar, document canvas, viewport/);
});

test('exports the Cloudflare Pages configuration', async () => {
  const config = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const headers = await readFile(new URL('../out/_headers', import.meta.url), 'utf8');
  const redirects = await readFile(new URL('../out/_redirects', import.meta.url), 'utf8');
  const editorRuntime = JSON.parse(
    await readFile(new URL('../config/editor-demo-runtime.json', import.meta.url), 'utf8'),
  );
  const contentSecurityPolicy = headers.match(/Content-Security-Policy: ([^\n]+)/u)?.[1];
  assert.ok(contentSecurityPolicy, 'The exported headers must include a Content-Security-Policy.');
  const directives = contentSecurityPolicy.split(';').map((directive) => directive.trim());
  const directiveSources = (name) =>
    directives
      .find((directive) => directive.startsWith(`${name} `))
      ?.split(/\s+/u)
      .slice(1) ?? [];
  const workerDirective = directives.find((directive) => directive.startsWith('worker-src '));
  const workerSources = workerDirective?.split(/\s+/u).slice(1) ?? [];
  const imageSources = directiveSources('img-src');
  const scriptSources = directiveSources('script-src').filter((source) => source.startsWith('https://'));
  const styleSources = directiveSources('style-src').filter((source) => source.startsWith('https://'));
  const connectSources = directiveSources('connect-src').filter((source) => source.startsWith('https://'));
  const runtimeSource = `${editorRuntime.cdnOrigin}/${editorRuntime.runtimePackage}@${editorRuntime.runtimeVersion}/`;
  const engineSource = `${editorRuntime.cdnOrigin}/${editorRuntime.enginePackage}@${editorRuntime.engineVersion}/dist-cdn/`;
  const engineWorkerSource = `${editorRuntime.cdnOrigin}/${editorRuntime.enginePackage}@${editorRuntime.engineVersion}/dist-cdn/assets/`;
  const externalWorkerSources = workerSources.filter((source) => source.startsWith('https://'));

  assert.match(config, /"pages_build_output_dir": "\.\/out"/u);
  assert.match(config, /"compatibility_date": "\d{4}-\d{2}-\d{2}"/u);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /Content-Security-Policy: default-src 'self'/);
  assert.deepEqual(scriptSources, [runtimeSource, engineSource, 'https://www.googletagmanager.com']);
  assert.deepEqual(styleSources, [runtimeSource, engineSource]);
  assert.deepEqual(connectSources, [
    engineSource,
    'https://api.github.com',
    'https://*.google-analytics.com',
    'https://*.analytics.google.com',
    'https://www.googletagmanager.com',
  ]);
  assert.ok(workerSources.includes("'self'"));
  assert.ok(workerSources.includes('blob:'));
  assert.deepEqual(externalWorkerSources, [engineWorkerSource]);
  assert.ok(imageSources.includes('blob:'));
  assert.ok(imageSources.includes('https://*.google-analytics.com'));
  assert.ok(imageSources.includes('https://www.googletagmanager.com'));
  assert.match(headers, /Cache-Control: public, max-age=31536000, immutable/);
  // The documentation home is the site root now, so there is no landing
  // redirect to assert. What the file must contain is the V1 route rules.
  assert.match(redirects, /^\/getting-started\/quickstart \/editor\/quickstart\/ 301$/mu);
  assert.match(redirects, /^\/modules\/\* https:\/\/docs-v1\.superdoc\.dev\/editor\/built-in-ui\/:splat 302$/mu);
});

test('exports clean Markdown across the machine-readable corpus', async () => {
  const markdownRoot = new URL('../out/md/', import.meta.url);
  const markdownFiles = await collectFiles(markdownRoot, '.md');
  const fullCorpusUrl = new URL('../out/llms-full.txt', import.meta.url);
  const outputs = [...markdownFiles, fullCorpusUrl];
  const contentFiles = await collectFiles(new URL('../content/docs/', import.meta.url), '.mdx');
  const componentNames = new Set();

  for (const contentFile of contentFiles) {
    const source = withoutFencedCode(await readFile(contentFile, 'utf8'));
    for (const match of source.matchAll(/<([A-Z][A-Za-z0-9]*)\b/gu)) componentNames.add(match[1]);
  }

  componentNames.delete('DocsHome');
  const unresolvedComponent = new RegExp(`</?(?:${[...componentNames, 'img'].join('|')})\\b`, 'u');

  for (const output of outputs) {
    const markdown = await readFile(output, 'utf8');
    const prose = withoutFencedCode(markdown);

    assert.doesNotMatch(prose, /__img\d+/u, output.pathname);
    assert.doesNotMatch(prose, /\0/u, output.pathname);
    assert.doesNotMatch(prose, unresolvedComponent, output.pathname);
  }

  const mentalModel = await readFile(new URL('../out/md/document-api/mental-model.md', import.meta.url), 'utf8');
  const reviewWorkflow = await readFile(
    new URL('../out/md/agents/workflows/review-tracked-changes.md', import.meta.url),
    'utf8',
  );

  assert.match(mentalModel, /^### Browser$/m);
  assert.match(mentalModel, /\[Mount an editor\]\(\/editor\/quickstart\)/);
  assert.match(mentalModel, /^- \[Run a headless operation\]/m);
  assert.match(reviewWorkflow, /\[Download the tracked-changes fixture\]\(\/fixtures\/tracked-changes\.docx\)/);
  assert.match(reviewWorkflow, /Local DOCX selection: enabled\. Files remain in the browser\./);

  const productOverview = await readFile(new URL('../out/md/start/what-superdoc-does.md', import.meta.url), 'utf8');
  assert.match(productOverview, /Interactive editor: Try SuperDoc in the browser/);
  assert.match(productOverview, /Tracked-change review: accept or reject the sample change\./);
});

/**
 * AIDEV-NOTE: The agent-facing corpus must be plain Markdown. Two classes of
 * MDX have leaked into it before:
 *
 *   - Author comments. `{/* Generated by scripts/... *\/}` is a note to whoever
 *     edits the page. An agent reading `/md/...` has no use for it, and it is
 *     not Markdown. Stripped by `stripMdxComments` in lib/llm-markdown.ts.
 *   - Component tags. A component rendered on the page but missing from
 *     `llmPlaceholderComponents` passes through as a literal `<Tag />`.
 *
 * Both were caught by reading output rather than by a test. This checks the
 * whole corpus, so the next one fails in CI instead.
 */
test('agent-facing Markdown contains no raw MDX', async () => {
  const files = await collectFiles(new URL('../out/md/', import.meta.url), '.md');
  assert.ok(files.length > 0, 'no exported Markdown found; the build must run before this test');

  const offenders = [];
  for (const file of files) {
    // Fenced code legitimately contains JSX: the custom-UI guides show React.
    const prose = withoutFencedCode(await readFile(file, 'utf8'));
    const route = file.pathname.split('/out/md/')[1];

    for (const [, comment] of prose.matchAll(/(\{\/\*[\s\S]*?\*\/\})/g)) {
      offenders.push(`${route}: MDX comment ${comment.slice(0, 60)}`);
    }
    for (const [, tag] of prose.matchAll(/(?:^|\n)\s*<([A-Z][A-Za-z0-9]*)[\s/>]/g)) {
      offenders.push(`${route}: unrendered <${tag}>, add it to llmPlaceholderComponents`);
    }
  }

  assert.deepEqual(offenders, []);
});

/**
 * AIDEV-NOTE: A placeholder that emits a heading silently inverts the outline.
 * `MigrationExample` rendered `### V2` beneath `#### getText`, which closed the
 * operation section before its own examples and left all 44 snippets as peers
 * of the API categories in every machine-readable projection.
 *
 * Checks the property directly: a placeholder's output belongs INSIDE the
 * section it was written under, so it must not out-rank the nearest heading
 * above it in the source MDX. An earlier version of this test guessed at the
 * shape from the exported Markdown alone and could not tell a real `###`
 * section from an injected one.
 */
test('component placeholders do not out-rank their source heading', async () => {
  const pages = await collectFiles(new URL('../content/docs/', import.meta.url), '.mdx');
  const offenders = [];

  for (const page of pages) {
    const route = page.pathname.split('/content/docs/')[1].replace(/\.mdx$/u, '');
    const exported = new URL(`../out/md/${route}.md`, import.meta.url);

    let markdown;
    try {
      markdown = withoutFencedCode(await readFile(exported, 'utf8'));
    } catch {
      continue; // Not every content file is a routed page.
    }

    const source = withoutFencedCode(await readFile(page, 'utf8'));
    // The exporter appends a `[#anchor]` slug to every heading, so compare on
    // the text alone. Matching the raw line finds nothing and silently disables
    // this check — which is exactly how an earlier version of it passed while
    // the defect it was written for was present.
    // Also drop Markdown backslash escapes: the exporter escapes `.` and `[`
    // in heading text, so `getSnapshot().pages[index]` comes back as
    // `getSnapshot().pages\[index]` and would read as an unauthored heading.
    const headingText = (text) =>
      text
        .replace(/\s*\[#[^\]]*\]\s*$/u, '')
        .replace(/\\(.)/gu, '$1')
        .trim();

    const sourceHeadings = [...source.matchAll(/^(#{1,6}) (.+)$/gm)].map(([, hashes, text]) => ({
      level: hashes.length,
      text: headingText(text),
    }));

    // Any heading in the export that the author did not write came from a
    // placeholder. It must sit deeper than the section it was rendered inside.
    const authored = new Set(sourceHeadings.map(({ text }) => text));
    let enclosing = 0;
    let sourceIndex = 0;

    for (const [, hashes, rawText] of markdown.matchAll(/^(#{1,6}) (.+)$/gm)) {
      const text = headingText(rawText);
      const level = hashes.length;

      if (authored.has(text)) {
        const match = sourceHeadings.slice(sourceIndex).findIndex((heading) => heading.text === text);
        if (match >= 0) sourceIndex += match + 1;
        enclosing = level;
        continue;
      }

      if (enclosing > 0 && level <= enclosing) {
        offenders.push(`${route}: generated "${text}" is h${level} inside an h${enclosing} section`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});

async function collectFiles(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const url = new URL(entry.name, directory);
      if (entry.isDirectory()) return collectFiles(new URL(`${entry.name}/`, directory), extension);
      return entry.name.endsWith(extension) ? [url] : [];
    }),
  );
  return files.flat();
}

function schemaAcceptsInput(schema, definitions, visitedReferences = new Set()) {
  if (typeof schema.$ref === 'string') {
    const reference = schema.$ref.match(/^#\/\$defs\/(.+)$/u)?.[1];
    if (reference && definitions[reference] && !visitedReferences.has(reference)) {
      const nextVisited = new Set(visitedReferences);
      nextVisited.add(reference);
      return schemaAcceptsInput(definitions[reference], definitions, nextVisited);
    }
  }

  if (schema.properties && typeof schema.properties === 'object' && Object.keys(schema.properties).length > 0) {
    return true;
  }

  const variants = Array.isArray(schema.oneOf)
    ? schema.oneOf
    : Array.isArray(schema.anyOf)
      ? schema.anyOf
      : Array.isArray(schema.allOf)
        ? schema.allOf
        : [];
  if (variants.some((variant) => schemaAcceptsInput(variant, definitions, visitedReferences))) return true;

  return (
    (schema.additionalProperties !== undefined && schema.additionalProperties !== false) ||
    schema.const !== undefined ||
    Array.isArray(schema.enum) ||
    (schema.type !== undefined && schema.type !== 'object')
  );
}

function withoutFencedCode(markdown) {
  const output = [];
  let fence;

  for (const line of markdown.split('\n')) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/u)?.[1];
    if (marker && !fence) {
      fence = marker[0];
      continue;
    }
    if (marker && fence === marker[0]) {
      fence = undefined;
      continue;
    }
    if (!fence) output.push(line);
  }

  return output.join('\n');
}

test('exports a recovery page that keeps its 404 status', async () => {
  const notFound = await readFile(new URL('../out/404.html', import.meta.url), 'utf8');

  // Cloudflare Pages serves this file with a real 404. A redirect to the
  // homepage would tell crawlers the URL is fine and hide the broken link from
  // whoever should fix it, so the page must not navigate anywhere on its own.
  assert.doesNotMatch(notFound, /http-equiv="refresh"/iu);
  assert.doesNotMatch(notFound, /window\.location\.(?:replace|assign|href\s*=)/u);

  // A 404 that gets indexed competes with the pages that do exist.
  assert.match(notFound, /noindex/u);

  // The three recovery routes: what V2 has, the V1 archive, and a way to report
  // the link.
  assert.match(notFound, /Page not found/u);
  assert.match(notFound, /v1 archive/u);
  assert.match(notFound, /Report a broken link/u);
  // The repository moved and the old path still redirects, so a stale link here
  // would keep working and never surface as a failure.
  assert.match(notFound, /github\.com\/superdoc\/docx-editor/u);
  assert.doesNotMatch(notFound, /superdoc-dev\/superdoc/u);
});
