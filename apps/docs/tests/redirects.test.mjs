import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  checkRedirects,
  generateRedirects,
  generateRouteManifest,
  markdownPathForDocumentationRoute,
  renderRedirects,
  validateRouteHistory,
  validateRedirectState,
} from '../scripts/redirects.mjs';

async function createFixture(t, { redirects, routes, pages, files = [], documentationRoot }) {
  const root = await mkdtemp(join(tmpdir(), 'superdoc-docs-redirects-'));
  t.after(() => rm(root, { force: true, recursive: true }));

  const redirectsPath = join(root, 'redirects.json');
  const routesPath = join(root, 'routes.json');
  const outputDirectory = join(root, 'out');
  await writeFile(redirectsPath, `${JSON.stringify(redirects, null, 2)}\n`);
  await writeFile(routesPath, `${JSON.stringify({ routes }, null, 2)}\n`);

  for (const page of pages) {
    // A page route maps to the directory the export writes it into. With the
    // pages at the root that is the route itself; under a namespace the route
    // already carries it.
    const outputPath = join(outputDirectory, page.replace(/^\//u, ''), 'index.html');
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, '<p>Page</p>');
  }

  for (const file of files) {
    const outputPath = join(outputDirectory, file.replace(/^\//u, ''));
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, 'Export');
  }

  return { outputDirectory, redirectsPath, routesPath, ...(documentationRoot ? { documentationRoot } : {}) };
}

const emptyConfigSections = { pageMoves: [], retiredRoutes: [] };

test('generates and checks static redirects against built routes', async (t) => {
  const fixture = await createFixture(t, {
    redirects: {
      redirects: [
        {
          source: '/docs/old/',
          destination: '/docs/new/',
          status: 301,
          reason: 'The guide moved.',
        },
        {
          source: '/',
          destination: '/docs/',
          status: 302,
          reason: 'Documentation landing page.',
        },
      ],
      ...emptyConfigSections,
    },
    routes: ['/docs/', '/docs/new/', '/docs/old/'],
    pages: ['/docs/', '/docs/new/'],
  });

  const generated = await generateRedirects(fixture);
  assert.equal(generated.redirectCount, 2);
  assert.equal(
    await readFile(join(fixture.outputDirectory, '_redirects'), 'utf8'),
    '/ /docs/ 302\n/docs/old/ /docs/new/ 301\n',
  );

  const checked = await checkRedirects(fixture);
  assert.deepEqual(checked, { activeRouteCount: 2, redirectCount: 2 });
});

test('expands one page move into HTML and Markdown redirects', async (t) => {
  const fixture = await createFixture(t, {
    documentationRoot: 'docs',
    redirects: {
      pageMoves: [
        {
          source: '/docs/old/',
          destination: '/docs/new/',
          reason: 'The guide moved.',
        },
      ],
      redirects: [],
      retiredRoutes: [],
    },
    routes: ['/docs/new/', '/docs/old/'],
    pages: ['/docs/new/'],
    files: ['/md/new.md'],
  });

  const generated = await generateRedirects(fixture);
  assert.equal(generated.redirectCount, 3);
  assert.equal(
    await readFile(join(fixture.outputDirectory, '_redirects'), 'utf8'),
    ['/docs/old /docs/new/ 301', '/docs/old/ /docs/new/ 301', '/md/old.md /md/new.md 301', ''].join('\n'),
  );
  assert.deepEqual(await checkRedirects(fixture), { activeRouteCount: 1, redirectCount: 3 });
});

test('redirects moved Markdown exports without adding them to route history', async (t) => {
  const fixture = await createFixture(t, {
    redirects: {
      redirects: [
        {
          source: '/md/old.md',
          destination: '/md/new.md',
          status: 301,
          reason: 'The Markdown export moved with its guide.',
        },
      ],
      ...emptyConfigSections,
    },
    routes: ['/docs/new/'],
    pages: ['/docs/new/'],
    files: ['/md/new.md'],
  });

  await assert.doesNotReject(generateRedirects(fixture));
  assert.equal(await readFile(join(fixture.outputDirectory, '_redirects'), 'utf8'), '/md/old.md /md/new.md 301\n');
  assert.deepEqual(await checkRedirects(fixture), { activeRouteCount: 1, redirectCount: 1 });
});

test('rejects duplicate sources and redirect chains', () => {
  assert.throws(
    () =>
      validateRedirectState({
        activeRoutes: new Set(['/docs/a/', '/docs/b/']),
        knownRoutes: new Set(),
        redirectConfig: {
          redirects: [
            { source: '/old/', destination: '/docs/a/', status: 301, reason: 'First.' },
            { source: '/old/', destination: '/docs/b/', status: 301, reason: 'Second.' },
          ],
          ...emptyConfigSections,
        },
      }),
    /Redirect source is duplicated/u,
  );

  assert.throws(
    () =>
      validateRedirectState({
        activeRoutes: new Set(['/docs/new/']),
        knownRoutes: new Set(),
        redirectConfig: {
          redirects: [
            { source: '/docs/old/', destination: '/docs/middle/', status: 301, reason: 'First move.' },
            { source: '/docs/middle/', destination: '/docs/new/', status: 301, reason: 'Second move.' },
          ],
          ...emptyConfigSections,
        },
      }),
    /Redirect chains are not allowed/u,
  );
});

test('validates page moves and collisions with manual redirects', () => {
  assert.throws(
    () =>
      validateRedirectState({
        activeRoutes: new Set(['/docs/new/']),
        knownRoutes: new Set(['/docs/old/', '/docs/new/']),
        redirectConfig: {
          pageMoves: [{ source: '/docs/old', destination: '/docs/new/', reason: 'Moved.' }],
          redirects: [],
          retiredRoutes: [],
        },
      }),
    /must be a canonical documentation page route/u,
  );

  assert.throws(
    () =>
      validateRedirectState({
        activeRoutes: new Set(['/docs/new/']),
        knownRoutes: new Set(['/docs/new/']),
        redirectConfig: {
          pageMoves: [{ source: '/docs/old/', destination: '/docs/new/', reason: 'Moved.' }],
          redirects: [],
          retiredRoutes: [],
        },
      }),
    /source was never recorded in the route manifest/u,
  );

  assert.throws(
    () =>
      validateRedirectState({
        activeRoutes: new Set(['/docs/new/']),
        builtPaths: new Set(['/docs/new/', '/md/new.md']),
        knownRoutes: new Set(['/docs/old/', '/docs/new/']),
        redirectConfig: {
          pageMoves: [{ source: '/docs/old/', destination: '/docs/new/', reason: 'Moved.' }],
          redirects: [{ source: '/docs/old', destination: '/docs/new/', status: 301, reason: 'Duplicate.' }],
          retiredRoutes: [],
        },
      }),
    /Redirect source is duplicated/u,
  );
});

test('requires page-move HTML and Markdown destinations and rejects chains', () => {
  assert.throws(
    () =>
      validateRedirectState({
        documentationRoot: 'docs',
        activeRoutes: new Set(['/docs/new/']),
        builtPaths: new Set(['/docs/new/']),
        knownRoutes: new Set(['/docs/old/', '/docs/new/']),
        redirectConfig: {
          pageMoves: [{ source: '/docs/old/', destination: '/docs/new/', reason: 'Moved.' }],
          redirects: [],
          retiredRoutes: [],
        },
      }),
    /destination does not exist[\s\S]*\/md\/new\.md/u,
  );

  assert.throws(
    () =>
      validateRedirectState({
        documentationRoot: 'docs',
        activeRoutes: new Set(['/docs/final/']),
        knownRoutes: new Set(['/docs/old/', '/docs/middle/', '/docs/final/']),
        redirectConfig: {
          pageMoves: [
            { source: '/docs/old/', destination: '/docs/middle/', reason: 'First move.' },
            { source: '/docs/middle/', destination: '/docs/final/', reason: 'Second move.' },
          ],
          redirects: [],
          retiredRoutes: [],
        },
      }),
    /Redirect chains are not allowed[\s\S]*point directly to the final destination/u,
  );
});

test('keeps trailing-slash source variants distinct', () => {
  assert.doesNotThrow(() =>
    validateRedirectState({
      activeRoutes: new Set(['/docs/a/', '/docs/b/']),
      knownRoutes: new Set(),
      redirectConfig: {
        redirects: [
          { source: '/old', destination: '/docs/a/', status: 301, reason: 'No-slash route.' },
          { source: '/old/', destination: '/docs/b/', status: 301, reason: 'Slash route.' },
        ],
        ...emptyConfigSections,
      },
    }),
  );
});

test('renders redirects in locale-independent code-point order', () => {
  assert.equal(
    renderRedirects([
      { source: '/ä/', destination: '/docs/a/', status: 301 },
      { source: '/z/', destination: '/docs/z/', status: 301 },
    ]),
    '/z/ /docs/z/ 301\n/ä/ /docs/a/ 301\n',
  );
});

test('rejects unsupported statuses and non-static paths', () => {
  assert.throws(
    () =>
      validateRedirectState({
        activeRoutes: new Set(['/docs/new/']),
        knownRoutes: new Set(),
        redirectConfig: {
          redirects: [{ source: '/docs/old/', destination: '/docs/new/', status: 308, reason: 'Moved.' }],
          ...emptyConfigSections,
        },
      }),
    /status must be 301 or 302/u,
  );

  assert.throws(
    () =>
      validateRedirectState({
        activeRoutes: new Set(['/docs/new/']),
        knownRoutes: new Set(),
        redirectConfig: {
          redirects: [{ source: '/docs/:slug', destination: '/docs/new/', status: 301, reason: 'Moved.' }],
          ...emptyConfigSections,
        },
      }),
    /must be a static path/u,
  );

  assert.throws(
    () =>
      validateRedirectState({
        activeRoutes: new Set(['/docs/new/']),
        knownRoutes: new Set(),
        redirectConfig: {
          redirects: Array.from({ length: 2001 }, (_, index) => ({
            source: `/old-${index}/`,
            destination: '/docs/new/',
            status: 301,
            reason: 'Moved.',
          })),
          ...emptyConfigSections,
        },
      }),
    /limit of 2,000 static redirects/u,
  );
});

test('rejects missing destinations and active redirect sources', () => {
  assert.throws(
    () =>
      validateRedirectState({
        activeRoutes: new Set(['/docs/current/']),
        knownRoutes: new Set(),
        redirectConfig: {
          redirects: [{ source: '/docs/old/', destination: '/docs/missing/', status: 301, reason: 'Moved.' }],
          ...emptyConfigSections,
        },
      }),
    /destination does not exist/u,
  );

  assert.throws(
    () =>
      validateRedirectState({
        activeRoutes: new Set(['/docs/current/', '/docs/new/']),
        knownRoutes: new Set(),
        redirectConfig: {
          redirects: [{ source: '/docs/current/', destination: '/docs/new/', status: 301, reason: 'Invalid.' }],
          ...emptyConfigSections,
        },
      }),
    /source is still an active documentation route/u,
  );
});

test('requires disappeared routes to be redirected or explicitly retired', () => {
  const state = {
    activeRoutes: new Set(['/docs/current/']),
    knownRoutes: new Set(['/docs/current/', '/docs/removed/']),
  };

  assert.throws(
    () =>
      validateRedirectState({
        ...state,
        redirectConfig: { redirects: [], ...emptyConfigSections },
      }),
    /disappeared without a redirect or retirement/u,
  );

  assert.doesNotThrow(() =>
    validateRedirectState({
      ...state,
      redirectConfig: {
        pageMoves: [],
        redirects: [],
        retiredRoutes: [{ path: '/docs/removed/', reason: 'The unsupported workflow was removed.' }],
      },
    }),
  );
});

test('requires new routes to be recorded and keeps route history append-only', async (t) => {
  const fixture = await createFixture(t, {
    redirects: { redirects: [], ...emptyConfigSections },
    routes: ['/docs/existing/'],
    pages: ['/docs/existing/', '/docs/new/'],
  });
  await generateRedirects(fixture);

  await assert.rejects(checkRedirects(fixture), /missing from config\/routes\.json/u);

  const result = await generateRouteManifest(fixture);
  assert.deepEqual(result, { addedRouteCount: 1, retiredRouteCount: 0, routeCount: 2 });
  assert.deepEqual(JSON.parse(await readFile(fixture.routesPath, 'utf8')), {
    routes: ['/docs/existing/', '/docs/new/'],
  });
  await assert.doesNotReject(checkRedirects(fixture));
});

test('rejects deleting routes from the previous manifest', () => {
  assert.throws(
    () => validateRouteHistory(new Set(['/docs/current/']), new Set(['/docs/current/', '/docs/removed/'])),
    /config\/routes\.json is append-only[\s\S]*\/docs\/removed\//u,
  );
});

test('serves documentation pages from the root namespace', async (t) => {
  const fixture = await createFixture(t, {
    documentationRoot: '.',
    redirects: { redirects: [], ...emptyConfigSections },
    routes: ['/editor/quickstart/'],
    pages: ['/editor/quickstart/'],
  });

  await generateRedirects(fixture);
  await assert.doesNotReject(checkRedirects(fixture));
});

test('keeps reserved root namespaces out of the page routes', async (t) => {
  const fixture = await createFixture(t, {
    documentationRoot: '.',
    redirects: { redirects: [], ...emptyConfigSections },
    routes: ['/editor/quickstart/'],
    pages: ['/editor/quickstart/'],
    // The machine-readable export writes alongside the pages once they own the
    // root. Neither is a page, so neither may be recorded as a route.
    files: ['/md/editor/quickstart.md', '/llms.txt', '/api/search/index.html'],
  });

  await generateRedirects(fixture);
  await assert.doesNotReject(checkRedirects(fixture));
});

test('rejects a page route that would occupy a reserved root namespace', () => {
  assert.throws(
    () =>
      validateRedirectState({
        redirectConfig: {
          pageMoves: [
            { source: '/md/guide/', destination: '/guide/', reason: 'The guide moved out of the Markdown namespace.' },
          ],
          redirects: [],
          retiredRoutes: [],
        },
        documentationRoot: '.',
        knownRoutes: new Set(['/md/guide/']),
        activeRoutes: new Set(['/guide/']),
      }),
    /reserved root namespace \(md\)/u,
  );
});

test('lets a declared launch epoch retire a namespace that never shipped', () => {
  const launchEpoch = { retiredPrefix: '/docs/', reason: 'The pages moved to the root before launch.' };

  assert.doesNotThrow(() =>
    validateRouteHistory(new Set(['/editor/quickstart/']), new Set(['/docs/editor/quickstart/']), launchEpoch),
  );

  // The exception is scoped to the named prefix. Anything else disappearing is
  // still the bug the append-only guard exists to catch.
  assert.throws(
    () =>
      validateRouteHistory(
        new Set(['/editor/quickstart/']),
        new Set(['/docs/editor/quickstart/', '/guides/unrelated/']),
        launchEpoch,
      ),
    /append-only outside the \/docs\/ launch epoch[\s\S]*\/guides\/unrelated\//u,
  );
});

test('requires a launch epoch to explain itself', () => {
  // The prefix shape is covered by the top-level namespace test above.
  assert.throws(
    () =>
      validateRedirectState({
        redirectConfig: {
          pageMoves: [],
          redirects: [],
          retiredRoutes: [],
          launchEpoch: { retiredPrefix: '/docs/', reason: '  ' },
        },
        knownRoutes: new Set(),
        activeRoutes: new Set(),
      }),
    /must explain why/u,
  );
});

test('drops the retired namespace when regenerating the manifest', async (t) => {
  const fixture = await createFixture(t, {
    documentationRoot: '.',
    redirects: {
      redirects: [],
      ...emptyConfigSections,
      launchEpoch: { retiredPrefix: '/docs/', reason: 'The pages moved to the root before launch.' },
    },
    routes: ['/docs/editor/quickstart/'],
    pages: ['/editor/quickstart/'],
  });

  const result = await generateRouteManifest(fixture);
  assert.deepEqual(result, { addedRouteCount: 1, retiredRouteCount: 1, routeCount: 1 });
  assert.deepEqual(JSON.parse(await readFile(fixture.routesPath, 'utf8')), {
    routes: ['/editor/quickstart/'],
  });
});

test('derives Markdown redirects from the namespace each route carries', () => {
  // A cross-namespace move is expressed as a raw redirect, not a page move: a
  // launch epoch retires its own page moves along with the namespace. What is
  // under test here is the Markdown mapping, which has to read the namespace
  // off each route rather than off the configured root.
  const namespacePrefixes = ['/docs/', '/'];

  assert.equal(markdownPathForDocumentationRoute('/docs/foo/', namespacePrefixes), '/md/foo.md');
  assert.equal(markdownPathForDocumentationRoute('/foo/', namespacePrefixes), '/md/foo.md');
  assert.equal(
    markdownPathForDocumentationRoute('/docs/editor/quickstart/', namespacePrefixes),
    '/md/editor/quickstart.md',
  );

  // Deriving both sides from the configured root produced /md/docs/foo.md, a
  // path that never existed, while the real /md/foo.md kept returning 404.
  assert.notEqual(markdownPathForDocumentationRoute('/docs/foo/', namespacePrefixes), '/md/docs/foo.md');

  // Within one namespace, a renamed page still redirects its Markdown export.
  const slugChange = validateRedirectState({
    documentationRoot: 'docs',
    redirectConfig: {
      pageMoves: [{ source: '/docs/old/', destination: '/docs/new/', reason: 'The guide was renamed.' }],
      redirects: [],
      retiredRoutes: [],
    },
    knownRoutes: new Set(['/docs/old/', '/docs/new/']),
    activeRoutes: new Set(['/docs/new/']),
    builtPaths: new Set(['/docs/new/', '/md/new.md']),
  });
  assert.ok(
    slugChange.redirects.some((r) => r.source === '/md/old.md' && r.destination === '/md/new.md'),
    'a real slug change keeps its Markdown redirect',
  );
});

test('retires page moves and retirements along with their namespace', () => {
  const launchEpoch = { retiredPrefix: '/docs/', reason: 'The pages moved to the root before launch.' };
  const withConfig = (extra) =>
    validateRedirectState({
      redirectConfig: { pageMoves: [], redirects: [], retiredRoutes: [], launchEpoch, ...extra },
      documentationRoot: '.',
      knownRoutes: new Set(['/new/']),
      activeRoutes: new Set(['/new/']),
      builtPaths: new Set(['/new/', '/md/new.md']),
    });

  // The manifest reset removes the retired namespace, so an entry still pointing
  // into it could never satisfy the "was it ever recorded" check. Saying so
  // directly beats failing later with a confusing message about route history.
  assert.throws(
    () => withConfig({ pageMoves: [{ source: '/docs/old/', destination: '/new/', reason: 'Renamed.' }] }),
    /Page move source belongs to the retired \/docs\/ namespace/u,
  );
  assert.throws(
    () => withConfig({ retiredRoutes: [{ path: '/docs/gone/', reason: 'Withdrawn.' }] }),
    /Retired route belongs to the retired \/docs\/ namespace/u,
  );
});

test('requires every route leaving a retired namespace to arrive somewhere', () => {
  const launchEpoch = { retiredPrefix: '/docs/', reason: 'The pages moved to the root before launch.' };
  const baseRoutes = new Set(['/docs/editor/kept/', '/docs/editor/lost/']);

  // Retiring a namespace moves its pages; it does not delete them. A page
  // dropped from the new build would otherwise leave with the namespace and
  // take its 404 with it, with no redirect, retirement, or replacement.
  assert.throws(
    () => validateRouteHistory(new Set(['/editor/kept/']), baseRoutes, launchEpoch),
    /launch epoch moves routes[\s\S]*\/docs\/editor\/lost\//u,
  );

  assert.doesNotThrow(() => validateRouteHistory(new Set(['/editor/kept/', '/editor/lost/']), baseRoutes, launchEpoch));
  assert.doesNotThrow(() =>
    validateRouteHistory(new Set(['/editor/kept/']), baseRoutes, launchEpoch, {
      redirectSources: new Set(['/docs/editor/lost/']),
    }),
  );
  assert.doesNotThrow(() =>
    validateRouteHistory(new Set(['/editor/kept/']), baseRoutes, launchEpoch, {
      retiredPaths: new Set(['/docs/editor/lost/']),
    }),
  );
});

test('completes the real launch-epoch transition through the CI path', async (t) => {
  // The migration this tooling exists for, driven by a frozen copy of the
  // manifest and redirect configuration as they stood before the move. Reading
  // the live config/ would make this test assert against a file the migration
  // itself rewrites, so it would stop testing the transition the moment the
  // transition landed.
  const priorState = JSON.parse(await readFile(new URL('./fixtures/pre-launch-routes.json', import.meta.url), 'utf8'));
  const baseRoutes = new Set(priorState.routes);
  // The manifest is append-only, so it still records the routes the six
  // staging-era moves and one retirement took out of service. Only what the
  // export still builds migrates to the root.
  const supersededRoutes = new Set([
    ...priorState.pageMoves.map((pageMove) => pageMove.source),
    ...priorState.retiredRoutes.map((retiredRoute) => retiredRoute.path),
  ]);
  const migrated = [...baseRoutes]
    .filter((route) => !supersededRoutes.has(route))
    .map((route) => `/${route.slice('/docs/'.length)}`);
  const launchEpoch = { retiredPrefix: '/docs/', reason: 'The pages moved to the root before launch.' };

  const fixture = await createFixture(t, {
    documentationRoot: '.',
    redirects: { redirects: [], pageMoves: [], retiredRoutes: [], launchEpoch },
    routes: [...baseRoutes],
    pages: migrated,
    // Next.js writes these beside the pages once they own the root. Neither is
    // an authored page, so neither may enter the manifest or the sitemap.
    files: ['/404/index.html', '/_not-found/index.html'],
  });

  const generated = await generateRouteManifest(fixture);
  assert.equal(generated.routeCount, 520);
  assert.equal(generated.retiredRouteCount, baseRoutes.size);
  assert.equal(generated.addedRouteCount, 520);

  const { routes: newRoutes } = JSON.parse(await readFile(fixture.routesPath, 'utf8'));
  assert.equal(newRoutes.length, 520);
  assert.ok(!newRoutes.some((route) => route.startsWith('/docs/')), 'the retired namespace is gone');
  assert.ok(!newRoutes.includes('/404/') && !newRoutes.includes('/_not-found/'), 'generated pages stay out');

  await generateRedirects(fixture);
  // Through checkRedirects with a base ref, which is how CI runs it: the same
  // call resolves the launch epoch, reads the prior superseded routes, and runs
  // the append-only history check.
  await assert.doesNotReject(
    checkRedirects({
      ...fixture,
      baseRef: 'pre-launch',
      readBase: {
        routes: async () => baseRoutes,
        supersededPaths: async () => supersededRoutes,
      },
    }),
  );
});

test('reports authored pages that collide with a reserved root namespace', async (t) => {
  const fixture = await createFixture(t, {
    documentationRoot: '.',
    redirects: { redirects: [], ...emptyConfigSections },
    routes: ['/editor/quickstart/'],
    // A page authored at /md/guide/ would overwrite the Markdown namespace.
    // Skipping it during discovery would hide the collision: generate:routes
    // omits it, check:redirects sees no active route to report, and the page
    // ships with no route history and no sitemap entry.
    pages: ['/editor/quickstart/', '/md/guide/'],
  });

  await assert.rejects(generateRedirects(fixture), /reserved root namespace[\s\S]*\/md\/guide\//u);
});

test('keeps the machine-readable export out of the page routes', async (t) => {
  const fixture = await createFixture(t, {
    documentationRoot: '.',
    redirects: { redirects: [], ...emptyConfigSections },
    routes: ['/editor/quickstart/'],
    // The search endpoint is exported as an index beside the pages. It is the
    // export's own route, not a collision.
    pages: ['/editor/quickstart/', '/api/search/'],
    files: ['/md/editor/quickstart.md', '/llms.txt'],
  });

  await generateRedirects(fixture);
  await assert.doesNotReject(checkRedirects(fixture));
});

test('spends the launch epoch on exactly one transition', () => {
  const launchEpoch = { retiredPrefix: '/docs/', reason: 'The pages moved to the root before launch.' };

  // The transition the epoch exists for.
  assert.doesNotThrow(() =>
    validateRouteHistory(new Set(['/foo/', '/bar/']), new Set(['/docs/foo/', '/docs/bar/']), launchEpoch),
  );

  // Reusing it takes two steps, and neither survives. Step one repopulates the
  // retired namespace: it removes nothing, so the check has to run before the
  // no-removals shortcut or it would be skipped entirely.
  assert.throws(
    () => validateRouteHistory(new Set(['/foo/', '/docs/foo/']), new Set(['/foo/']), launchEpoch),
    /retires the whole namespace, but these routes remain[\s\S]*\/docs\/foo\//u,
  );

  // Step two would delete it again. Unreachable now, and refused on its own
  // terms: a declaration whose namespace is already gone from the previous
  // manifest has been spent and must be removed.
  assert.throws(
    () => validateRouteHistory(new Set(['/foo/']), new Set(['/foo/', '/other/']), launchEpoch),
    /has already been applied/u,
  );

  // Which also means the declaration cannot be left behind as a standing
  // exception once the migration has landed.
  assert.throws(
    () => validateRouteHistory(new Set(['/foo/']), new Set(['/foo/']), launchEpoch),
    /has already been applied/u,
  );
});

test('leaves the namespace root out of the Markdown redirects', () => {
  // app/md/[...slug] needs at least one slug segment, so a root has no
  // per-page Markdown export. Mapping it anyway produced /md/.md: a bogus
  // redirect source when moving the home away, and a missing destination that
  // rejected the move when pointing at it.
  assert.equal(markdownPathForDocumentationRoute('/docs/', ['/docs/', '/']), undefined);
  assert.equal(markdownPathForDocumentationRoute('/', ['/']), undefined);
  assert.equal(
    markdownPathForDocumentationRoute('/docs/editor/quickstart/', ['/docs/', '/']),
    '/md/editor/quickstart.md',
  );

  const movedHome = validateRedirectState({
    documentationRoot: 'docs',
    redirectConfig: {
      pageMoves: [{ source: '/docs/', destination: '/docs/start/', reason: 'The home moved into the section.' }],
      redirects: [],
      retiredRoutes: [],
    },
    knownRoutes: new Set(['/docs/', '/docs/start/']),
    activeRoutes: new Set(['/docs/start/']),
    builtPaths: new Set(['/docs/start/', '/md/start.md']),
  });
  assert.deepEqual(
    movedHome.redirects.map(({ source, destination }) => `${source} -> ${destination}`),
    ['/docs -> /docs/start/', '/docs/ -> /docs/start/'],
  );

  // And a move onto the home is accepted rather than failing on a Markdown
  // destination that the export never produces.
  assert.doesNotThrow(() =>
    validateRedirectState({
      documentationRoot: 'docs',
      redirectConfig: {
        pageMoves: [{ source: '/docs/start/', destination: '/docs/', reason: 'The section became the home.' }],
        redirects: [],
        retiredRoutes: [],
      },
      knownRoutes: new Set(['/docs/', '/docs/start/']),
      activeRoutes: new Set(['/docs/']),
      builtPaths: new Set(['/docs/']),
    }),
  );
});

test('limits the launch epoch to a single top-level namespace', () => {
  const withPrefix = (retiredPrefix) =>
    validateRedirectState({
      redirectConfig: { pageMoves: [], redirects: [], retiredRoutes: [], launchEpoch: { retiredPrefix, reason: 'x' } },
      knownRoutes: new Set(),
      activeRoutes: new Set(),
    });

  assert.doesNotThrow(() => withPrefix('/docs/'));

  // The epoch exempts everything under its prefix from the append-only guard.
  // A page or an arbitrary branch would let part of the tree be deleted under
  // cover of a migration; only a whole namespace can stop being served at once.
  assert.throws(() => withPrefix('/docs/editor/quickstart/'), /single top-level namespace/u);
  assert.throws(() => withPrefix('/editor/platform/'), /single top-level namespace/u);
  assert.throws(() => withPrefix('/'), /single top-level namespace/u);
  assert.throws(() => withPrefix('/md/'), /must not name a reserved root namespace/u);
});

test('accepts the root home as a page move endpoint', () => {
  // Root discovery emits `/` for the home once the pages own the root, so a
  // move to or from it has to be expressible.
  const moved = validateRedirectState({
    redirectConfig: {
      pageMoves: [{ source: '/', destination: '/start/', reason: 'The home moved into the section.' }],
      redirects: [],
      retiredRoutes: [],
    },
    documentationRoot: '.',
    knownRoutes: new Set(['/', '/start/']),
    activeRoutes: new Set(['/start/']),
    builtPaths: new Set(['/start/', '/md/start.md']),
  });

  // `/` has no slashless form, so only the one rule is emitted, and the root
  // has no per-page Markdown export to redirect.
  assert.deepEqual(
    moved.redirects.map(({ source, destination }) => `${source} -> ${destination}`),
    ['/ -> /start/'],
  );
});

test('requires a migrated route to be new, not a coincidental match', () => {
  const launchEpoch = { retiredPrefix: '/docs/', reason: 'The pages moved to the root before launch.' };

  assert.doesNotThrow(() =>
    validateRouteHistory(new Set(['/editor/lost/']), new Set(['/docs/editor/lost/']), launchEpoch),
  );

  // /editor/lost/ already existed before the epoch, so it is not evidence that
  // /docs/editor/lost/ survived the migration: an accidental deletion would be
  // waved through by an unrelated route that happens to share the suffix.
  assert.throws(
    () =>
      validateRouteHistory(new Set(['/editor/lost/']), new Set(['/docs/editor/lost/', '/editor/lost/']), launchEpoch),
    /moves routes; it does not delete them[\s\S]*\/docs\/editor\/lost\//u,
  );
});

test('reserves the generated metadata routes', async (t) => {
  for (const artifact of ['sitemap.xml', 'robots.txt']) {
    const fixture = await createFixture(t, {
      documentationRoot: '.',
      redirects: { redirects: [], ...emptyConfigSections },
      routes: ['/guide/'],
      // app/robots.ts and app/sitemap.ts write these at the export root, so an
      // authored page underneath either would collide with them.
      pages: ['/guide/', `/${artifact}/guide/`],
    });

    await assert.rejects(generateRedirects(fixture), /reserved root namespace/u);
  }
});

test('accepts the root as a page route only where it is one', () => {
  const move = (documentationRoot, destination) =>
    validateRedirectState({
      redirectConfig: {
        pageMoves: [{ source: '/', destination, reason: 'The home moved into the section.' }],
        redirects: [],
        retiredRoutes: [],
      },
      documentationRoot,
      knownRoutes: new Set(['/', destination]),
      activeRoutes: new Set([destination]),
      builtPaths: new Set([destination, '/md/start.md']),
    });

  assert.doesNotThrow(() => move('.', '/start/'));

  // Under a namespace, `/` is the application root rather than the
  // documentation home. Discovery never emits it as a page there, so accepting
  // it would generate a root redirect for something that is not a route.
  assert.throws(() => move('docs', '/docs/start/'), /not a documentation page route while the pages live under/u);
});
