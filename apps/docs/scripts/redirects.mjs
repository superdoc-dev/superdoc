#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultOutputDirectory = resolve(scriptDirectory, '../out');
const defaultRedirectsPath = resolve(scriptDirectory, '../config/redirects.json');
const defaultRoutesPath = resolve(scriptDirectory, '../config/routes.json');
// Where the export writes documentation pages, relative to the export root.
// `.` once the pages own the root namespace.
const defaultDocumentationRoot = '.';
const allowedStatuses = new Set([301, 302]);
const execFileAsync = promisify(execFile);

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validatePath(path, label) {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new Error(`${label} must be a root-relative path.`);
  }
  if (path.length > 1 && path.includes('//')) {
    throw new Error(`${label} must not contain repeated slashes: ${path}`);
  }
  if (/[\s?#*:]/u.test(path)) {
    throw new Error(`${label} must be a static path without whitespace, parameters, queries, or fragments: ${path}`);
  }
  if (path.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`${label} must not contain relative path segments: ${path}`);
  }
}

// Root paths the export owns for something other than a documentation page.
// Once pages are served from the root namespace, a page whose first segment is
// one of these would collide with the search endpoint, the machine-readable
// routes, or the metadata files Next.js generates from app/robots.ts and
// app/sitemap.ts.
const reservedRootSegments = new Set([
  'api',
  'md',
  'llms.txt',
  'llms-full.txt',
  'llms-reference.txt',
  'robots.txt',
  'sitemap.xml',
]);

// The exact routes the export owns under those segments. Only these are skipped
// during discovery; anything else beneath a reserved segment is an authored page
// colliding with them, which has to be reported rather than dropped. A page
// silently omitted here would have no route history and no sitemap entry, and
// would still ship.
const machineReadableRoutes = new Set(['/api/search/']);

// Pages Next.js generates for itself. They are exported as directory indexes
// exactly like a documentation page, so root discovery would otherwise record
// them as routes: the manifest would gain entries nobody authored, and the
// sitemap would advertise an error page. Under a namespace they never appeared,
// because they are written to the export root rather than into it.
const generatedRootRoutes = new Set(['/404/', '/_not-found/']);

function validateDocumentationPageRoute(path, label, documentationRoot = defaultDocumentationRoot) {
  validatePath(path, label);
  if (!path.endsWith('/')) {
    throw new Error(`${label} must be a canonical documentation page route ending in a slash: ${path}`);
  }
  if (path === '/') {
    // `/` is the documentation home only once the pages own the root. Under a
    // namespace it is the application root, which discovery never emits as a
    // page, so accepting it there would generate a root redirect for something
    // that is not a documentation route.
    if (documentationRoot !== '.') {
      throw new Error(`${label} is not a documentation page route while the pages live under /${documentationRoot}/.`);
    }
    // It carries no segment to reserve.
    return;
  }
  const [firstSegment] = path.slice(1).split('/');
  if (reservedRootSegments.has(firstSegment)) {
    throw new Error(`${label} uses a reserved root namespace (${firstSegment}): ${path}`);
  }
}

/**
 * Maps a documentation page route to its Markdown route, or `undefined` for a
 * namespace root.
 *
 * `namespacePrefixes` lists every prefix a page route may carry, longest match
 * first. A page move can cross namespaces: when pages move to the root, the
 * source still carries the retired prefix while the destination does not.
 * Stripping only the configured root would emit a redirect from a Markdown path
 * that never existed and leave the real one returning 404 -- which the
 * destination check cannot catch, because the destination is correct either
 * way.
 *
 * The home page has no per-page Markdown export: `app/md/[...slug]` needs at
 * least one slug segment, so a root would map to the nonexistent `/md/.md`.
 * The whole-corpus text routes cover that content instead.
 *
 * Mirrors `lib/markdown-url.ts`, which does the same mapping for the rendered
 * page.
 */
export function markdownPathForDocumentationRoute(route, namespacePrefixes) {
  const prefix = namespacePrefixes.find((candidate) => route.startsWith(candidate)) ?? '/';
  const slug = route.slice(prefix.length, -1);
  return slug.length === 0 ? undefined : `/md/${slug}.md`;
}

/**
 * Every prefix a page route may carry, longest first so the retired namespace
 * wins over the bare root during a launch epoch.
 */
function namespacePrefixesFor(documentationRoot, launchEpoch) {
  const configured = documentationRoot === '.' ? '/' : `/${documentationRoot}/`;
  return [...new Set([launchEpoch?.retiredPrefix, configured, '/'].filter(Boolean))].sort(
    (left, right) => right.length - left.length,
  );
}

function parseLaunchEpoch(value, label) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  const { retiredPrefix, reason } = value;
  validatePath(retiredPrefix, `${label}.retiredPrefix`);
  // A namespace, not a subtree. The epoch exempts everything under its prefix
  // from the append-only guard, so accepting `/docs/editor/quickstart/` or
  // `/editor/platform/` would let a single page or an arbitrary branch of the
  // tree be deleted under cover of a migration. Only a top-level segment is a
  // namespace the site can stop serving as a whole.
  if (!/^\/[^/]+\/$/u.test(retiredPrefix)) {
    throw new Error(`${label}.retiredPrefix must be a single top-level namespace, such as /docs/: ${retiredPrefix}`);
  }
  if (reservedRootSegments.has(retiredPrefix.slice(1, -1))) {
    throw new Error(`${label}.retiredPrefix must not name a reserved root namespace: ${retiredPrefix}`);
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new Error(`${label}.reason must explain why the namespace was retired before launch.`);
  }

  return { retiredPrefix, reason };
}

function parseRedirectConfig(value, documentationRoot = defaultDocumentationRoot) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Redirect configuration must be an object.');
  }

  const launchEpoch = parseLaunchEpoch(value.launchEpoch, 'launchEpoch');
  const namespacePrefixes = namespacePrefixesFor(documentationRoot, launchEpoch);
  const pageMoves = value.pageMoves;
  const configuredRedirects = value.redirects;
  const retiredRoutes = value.retiredRoutes;
  if (!Array.isArray(pageMoves)) throw new Error('Redirect configuration must contain a pageMoves array.');
  if (!Array.isArray(configuredRedirects)) {
    throw new Error('Redirect configuration must contain a redirects array.');
  }
  if (!Array.isArray(retiredRoutes)) {
    throw new Error('Redirect configuration must contain a retiredRoutes array.');
  }

  const parsedPageMoves = pageMoves.map((pageMove, index) => {
    if (!pageMove || typeof pageMove !== 'object' || Array.isArray(pageMove)) {
      throw new Error(`pageMoves[${index}] must be an object.`);
    }

    const { source, destination, reason } = pageMove;
    validateDocumentationPageRoute(source, `pageMoves[${index}].source`, documentationRoot);
    validateDocumentationPageRoute(destination, `pageMoves[${index}].destination`, documentationRoot);
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      throw new Error(`pageMoves[${index}].reason must explain why the page moved.`);
    }
    if (source === destination) {
      throw new Error(`Page move source and destination must differ: ${source}`);
    }

    return { source, destination, reason };
  });

  const redirects = [
    ...configuredRedirects,
    ...parsedPageMoves.flatMap(({ source, destination, reason }) => {
      const markdownSource = markdownPathForDocumentationRoute(source, namespacePrefixes);
      const markdownDestination = markdownPathForDocumentationRoute(destination, namespacePrefixes);
      return [
        // `/` has no slashless form to redirect; slicing it would emit an empty
        // source.
        ...(source === '/' ? [] : [{ source: source.slice(0, -1), destination, status: 301, reason }]),
        { source, destination, status: 301, reason },
        // No Markdown redirect when a page only changed namespace, because the
        // namespace was never part of its Markdown path and the rule would
        // point a live path at itself. None either when a namespace root is
        // involved, since a root has no per-page Markdown export to redirect.
        ...(markdownSource === undefined || markdownDestination === undefined || markdownSource === markdownDestination
          ? []
          : [{ source: markdownSource, destination: markdownDestination, status: 301, reason }]),
      ];
    }),
  ];

  if (redirects.length > 2000) {
    throw new Error('Redirect configuration exceeds the Cloudflare Pages limit of 2,000 static redirects.');
  }

  const sources = new Set();
  const parsedRedirects = redirects.map((redirect, index) => {
    if (!redirect || typeof redirect !== 'object' || Array.isArray(redirect)) {
      throw new Error(`redirects[${index}] must be an object.`);
    }

    const { source, destination, status, reason } = redirect;
    validatePath(source, `redirects[${index}].source`);
    validatePath(destination, `redirects[${index}].destination`);
    if (!allowedStatuses.has(status)) {
      throw new Error(`redirects[${index}].status must be 301 or 302.`);
    }
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      throw new Error(`redirects[${index}].reason must explain why the redirect exists.`);
    }
    if (source === destination) {
      throw new Error(`Redirect source and destination must differ: ${source}`);
    }
    if (`${source} ${destination} ${status}`.length > 1000) {
      throw new Error(`Redirect exceeds the Cloudflare Pages limit of 1,000 characters: ${source}`);
    }
    // AIDEV-NOTE: Cloudflare Pages matches redirect sources exactly.
    // `/old` and `/old/` are intentionally distinct registry keys.
    if (sources.has(source)) throw new Error(`Redirect source is duplicated: ${source}`);
    sources.add(source);

    return { source, destination, status, reason };
  });

  const retiredPaths = new Set();
  const parsedRetiredRoutes = retiredRoutes.map((retiredRoute, index) => {
    if (!retiredRoute || typeof retiredRoute !== 'object' || Array.isArray(retiredRoute)) {
      throw new Error(`retiredRoutes[${index}] must be an object.`);
    }

    const { path, reason } = retiredRoute;
    validatePath(path, `retiredRoutes[${index}].path`);
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      throw new Error(`retiredRoutes[${index}].reason must explain why the route was retired.`);
    }
    if (retiredPaths.has(path)) throw new Error(`Retired route is duplicated: ${path}`);
    if (sources.has(path)) throw new Error(`Route cannot be both redirected and retired: ${path}`);
    retiredPaths.add(path);

    return { path, reason };
  });

  for (const redirect of parsedRedirects) {
    if (sources.has(redirect.destination)) {
      throw new Error(
        `Redirect chains are not allowed: ${redirect.source} points to redirect source ${redirect.destination}. Update the earlier entry to point directly to the final destination.`,
      );
    }
  }

  return {
    launchEpoch,
    pageMoves: parsedPageMoves,
    redirects: parsedRedirects,
    retiredRoutes: parsedRetiredRoutes,
  };
}

function parseRouteManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.routes)) {
    throw new Error('Route manifest must be an object with a routes array.');
  }

  const routes = new Set();
  for (const [index, route] of value.routes.entries()) {
    validatePath(route, `routes[${index}]`);
    // Deliberately looser than validateDocumentationPageRoute: this also parses
    // the base-ref manifest during the launch-epoch migration, which still holds
    // the pre-migration namespace. Rejecting that shape here would fail while
    // reading history rather than while validating the change.
    if (!route.endsWith('/')) {
      throw new Error(`routes[${index}] must be a canonical documentation page route: ${route}`);
    }
    if (routes.has(route)) throw new Error(`Route manifest contains a duplicate route: ${route}`);
    routes.add(route);
  }
  return routes;
}

export function validateRouteHistory(knownRoutes, baseRoutes, launchEpoch, redirectState = {}) {
  // A launch epoch is the single point where the manifest may shrink: the site
  // changed which namespace it serves before any of those routes shipped as
  // canonical URLs. It is declared in config/redirects.json and names the exact
  // prefix being retired, so the exception is reviewable and cannot quietly
  // cover an unrelated deletion.
  //
  // It applies to exactly one transition: the one that empties the namespace.
  // This runs before the no-removals shortcut below, because a change that only
  // ADDS a route under the retired prefix removes nothing and would otherwise
  // skip the check entirely -- repopulating the namespace and leaving the
  // declaration free to excuse deleting it again later.
  if (launchEpoch) {
    const retained = [...knownRoutes].filter((route) => route.startsWith(launchEpoch.retiredPrefix)).sort();
    if (retained.length > 0) {
      throw new Error(
        [
          `The ${launchEpoch.retiredPrefix} launch epoch retires the whole namespace, but these routes remain:`,
          ...retained.map((route) => `- ${route}`),
          '',
          'Migrate them too, or remove the launchEpoch declaration.',
        ].join('\n'),
      );
    }

    // The epoch is spent once the base manifest no longer carries its prefix:
    // the transition it describes has already happened, so it has nothing left
    // to excuse and must not be able to cover a later deletion.
    const baseCarriesPrefix = [...baseRoutes].some((route) => route.startsWith(launchEpoch.retiredPrefix));
    if (!baseCarriesPrefix) {
      throw new Error(
        [
          `The ${launchEpoch.retiredPrefix} launch epoch has already been applied: the previous manifest`,
          'no longer records that namespace.',
          '',
          'Remove the launchEpoch declaration from config/redirects.json.',
        ].join('\n'),
      );
    }
  }

  const removedRoutes = [...baseRoutes].filter((route) => !knownRoutes.has(route)).sort();
  if (removedRoutes.length === 0) return;

  if (launchEpoch) {
    const { redirectSources = new Set(), retiredPaths = new Set(), supersededPaths = new Set() } = redirectState;
    // Retiring a namespace moves its pages; it does not delete them. Each route
    // must still exist somewhere, or a page accidentally dropped from the new
    // build would leave with the namespace and take its 404 with it.
    //
    // Routes the previous configuration had already superseded are the
    // exception: a page move or retirement recorded before the epoch took them
    // out of service while the namespace still existed, and the epoch retires
    // that record along with the namespace it points into.
    const stranded = removedRoutes.filter((route) => {
      if (!route.startsWith(launchEpoch.retiredPrefix)) return false;
      if (supersededPaths.has(route)) return false;
      const migrated = `/${route.slice(launchEpoch.retiredPrefix.length)}`;
      // The counterpart has to be new. A route that already existed at the
      // migrated path before the epoch is a coincidence, not evidence that this
      // page survived: an accidentally deleted /docs/editor/lost/ would be
      // waved through by an unrelated /editor/lost/ that predates it.
      const arrived = knownRoutes.has(migrated) && !baseRoutes.has(migrated);
      return !arrived && !redirectSources.has(route) && !retiredPaths.has(route);
    });
    const unexplained = removedRoutes.filter((route) => !route.startsWith(launchEpoch.retiredPrefix));
    if (unexplained.length === 0 && stranded.length === 0) return;

    throw new Error(
      [
        ...(unexplained.length > 0
          ? [
              `config/routes.json is append-only outside the ${launchEpoch.retiredPrefix} launch epoch.`,
              'Restore these removed routes:',
              ...unexplained.map((route) => `- ${route}`),
            ]
          : []),
        ...(stranded.length > 0
          ? [
              `The ${launchEpoch.retiredPrefix} launch epoch moves routes; it does not delete them.`,
              'These routes left the retired namespace without arriving anywhere.',
              'Record the new route, redirect it, or retire it explicitly:',
              ...stranded.map((route) => `- ${route}`),
            ]
          : []),
      ].join('\n'),
    );
  }

  throw new Error(
    [
      'config/routes.json is append-only. Restore these removed routes:',
      ...removedRoutes.map((route) => `- ${route}`),
    ].join('\n'),
  );
}

async function readFileAtRef(filePath, baseRef) {
  const { stdout: repositoryRoot } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
    cwd: scriptDirectory,
  });
  const root = repositoryRoot.trim();
  const repositoryPath = relative(root, filePath).split(sep).join('/');
  await execFileAsync('git', ['cat-file', '-e', `${baseRef}^{commit}`], { cwd: root });
  const { stdout: listed } = await execFileAsync('git', ['ls-tree', '--name-only', baseRef, '--', repositoryPath], {
    cwd: root,
  });
  if (listed.trim().length === 0) return undefined;

  const { stdout } = await execFileAsync('git', ['show', `${baseRef}:${repositoryPath}`], { cwd: root });
  return JSON.parse(stdout);
}

async function readBaseRoutes(routesPath, baseRef) {
  const manifest = await readFileAtRef(routesPath, baseRef);
  return manifest === undefined ? new Set() : parseRouteManifest(manifest);
}

/**
 * Routes the base configuration had already taken out of service.
 *
 * A launch epoch retires the page moves and retirements that point into its
 * namespace, so the routes they superseded have nowhere left to arrive. They
 * were already not being served before the migration, which is why they are not
 * treated as accidentally dropped.
 */
async function readBaseSupersededPaths(redirectsPath, baseRef) {
  const config = await readFileAtRef(redirectsPath, baseRef);
  if (!config) return new Set();
  const pageMoves = Array.isArray(config.pageMoves) ? config.pageMoves : [];
  const retiredRoutes = Array.isArray(config.retiredRoutes) ? config.retiredRoutes : [];
  return new Set([
    ...pageMoves.map((pageMove) => pageMove?.source).filter((source) => typeof source === 'string'),
    ...retiredRoutes.map((retiredRoute) => retiredRoute?.path).filter((path) => typeof path === 'string'),
  ]);
}

async function collectIndexFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = resolve(directory, entry.name);
      if (entry.isDirectory()) return collectIndexFiles(entryPath);
      return entry.name === 'index.html' ? [entryPath] : [];
    }),
  );
  return files.flat();
}

async function collectOutputFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = resolve(directory, entry.name);
      return entry.isDirectory() ? collectOutputFiles(entryPath) : [entryPath];
    }),
  );
  return files.flat();
}

export async function collectBuiltPaths(outputDirectory = defaultOutputDirectory) {
  let files;
  try {
    files = await collectOutputFiles(outputDirectory);
  } catch {
    throw new Error(`Built documentation output is missing: ${outputDirectory}`);
  }

  return new Set(
    files.map((file) => {
      const path = `/${relative(outputDirectory, file).split(sep).join('/')}`;
      return path.endsWith('/index.html') ? path.slice(0, -'index.html'.length) : path;
    }),
  );
}

/**
 * Finds every exported documentation page route.
 *
 * `documentationRoot` is the directory the pages are exported into, relative to
 * the export root. It is a parameter rather than a constant so the same
 * discovery works before and after the pages move out of their own namespace.
 *
 * The export writes the search endpoint and the machine-readable routes beside
 * the pages once they own the root. Those exact paths are skipped; any other
 * index under a reserved segment is an authored page colliding with them, and
 * is reported rather than quietly dropped.
 */
export async function collectDocumentationRoutes(
  outputDirectory = defaultOutputDirectory,
  documentationRoot = defaultDocumentationRoot,
) {
  const rootDirectory = resolve(outputDirectory, documentationRoot);
  let indexFiles;
  try {
    indexFiles = await collectIndexFiles(rootDirectory);
  } catch {
    throw new Error(`Built documentation routes are missing: ${rootDirectory}`);
  }

  const routePrefix = documentationRoot === '.' ? '' : `/${documentationRoot}`;
  const routes = indexFiles
    .map((file) => {
      const routeSuffix = relative(rootDirectory, dirname(file)).split(sep).join('/');
      return routeSuffix.length === 0 ? `${routePrefix}/` : `${routePrefix}/${routeSuffix}/`;
    })
    .filter((route) => !generatedRootRoutes.has(route) && !machineReadableRoutes.has(route));

  const colliding = routes.filter((route) => reservedRootSegments.has(route.slice(1).split('/')[0])).sort();
  if (colliding.length > 0) {
    throw new Error(
      [
        'These exported pages occupy a reserved root namespace:',
        ...colliding.map((route) => `- ${route}`),
        '',
        `Reserved segments: ${[...reservedRootSegments].sort().join(', ')}. Move the pages, or the export will`,
        'overwrite the search endpoint or the machine-readable routes.',
      ].join('\n'),
    );
  }

  return new Set(routes);
}

export function validateRedirectState({
  redirectConfig,
  knownRoutes,
  activeRoutes,
  builtPaths = activeRoutes,
  documentationRoot = defaultDocumentationRoot,
  requireCurrentManifest = false,
}) {
  const { launchEpoch, pageMoves, redirects, retiredRoutes } = parseRedirectConfig(redirectConfig, documentationRoot);
  const manifestRoutes = parseRouteManifest({ routes: [...knownRoutes] });
  const currentRoutes = new Set(activeRoutes);
  const redirectSources = new Set(redirects.map((redirect) => redirect.source));
  const retiredPaths = new Set(retiredRoutes.map((retiredRoute) => retiredRoute.path));

  for (const pageMove of pageMoves) {
    // A launch epoch retires its namespace outright, so a page move that starts
    // there is retired with it: the destination is reached by the new route, not
    // by replaying a pre-launch rename. Keeping such a move would fail the
    // manifest check below, since the reset removed its source.
    if (launchEpoch && pageMove.source.startsWith(launchEpoch.retiredPrefix)) {
      throw new Error(
        `Page move source belongs to the retired ${launchEpoch.retiredPrefix} namespace: ${pageMove.source}. ` +
          'Remove the move with the namespace, or record its destination as a route.',
      );
    }
    if (!manifestRoutes.has(pageMove.source)) {
      throw new Error(`Page move source was never recorded in the route manifest: ${pageMove.source}`);
    }
  }

  for (const redirect of redirects) {
    if (currentRoutes.has(redirect.source)) {
      throw new Error(`Redirect source is still an active documentation route: ${redirect.source}`);
    }
    if (!builtPaths.has(redirect.destination)) {
      throw new Error(`Redirect destination does not exist in the built documentation: ${redirect.destination}`);
    }
  }

  for (const retiredRoute of retiredRoutes) {
    if (launchEpoch && retiredRoute.path.startsWith(launchEpoch.retiredPrefix)) {
      throw new Error(
        `Retired route belongs to the retired ${launchEpoch.retiredPrefix} namespace: ${retiredRoute.path}. ` +
          'The namespace already retires it; remove the entry with the namespace.',
      );
    }
    if (!manifestRoutes.has(retiredRoute.path)) {
      throw new Error(`Retired route was never recorded in the route manifest: ${retiredRoute.path}`);
    }
    if (currentRoutes.has(retiredRoute.path)) {
      throw new Error(`Retired route is still active: ${retiredRoute.path}`);
    }
  }

  for (const route of manifestRoutes) {
    if (currentRoutes.has(route) || redirectSources.has(route) || retiredPaths.has(route)) continue;
    // The launch epoch retires a whole namespace at once, before any of its
    // routes shipped as canonical URLs, so those disappearances are the point
    // of the change rather than an accident. Anything outside the retired
    // prefix still needs an explicit redirect or retirement.
    if (launchEpoch && route.startsWith(launchEpoch.retiredPrefix)) continue;
    throw new Error(`Known documentation route disappeared without a redirect or retirement: ${route}`);
  }

  if (requireCurrentManifest) {
    const unrecordedRoutes = [...currentRoutes].filter((route) => !manifestRoutes.has(route)).sort();
    if (unrecordedRoutes.length > 0) {
      throw new Error(
        [
          'Built documentation routes are missing from config/routes.json:',
          ...unrecordedRoutes.map((route) => `- ${route}`),
          '',
          'Run pnpm --filter @superdoc/docs generate:routes after the build.',
        ].join('\n'),
      );
    }
  }

  return { pageMoves, redirects, retiredRoutes };
}

export function renderRedirects(redirects) {
  return `${[...redirects]
    .sort((left, right) => (left.source < right.source ? -1 : left.source > right.source ? 1 : 0))
    .map(({ source, destination, status }) => `${source} ${destination} ${status}`)
    .join('\n')}\n`;
}

async function loadState({ redirectsPath, routesPath, outputDirectory, documentationRoot }) {
  const [redirectConfig, routeManifest, activeRoutes, builtPaths] = await Promise.all([
    readJson(redirectsPath, 'redirect configuration'),
    readJson(routesPath, 'route manifest'),
    collectDocumentationRoutes(outputDirectory, documentationRoot),
    collectBuiltPaths(outputDirectory),
  ]);

  return {
    activeRoutes,
    builtPaths,
    documentationRoot,
    knownRoutes: parseRouteManifest(routeManifest),
    redirectConfig,
  };
}

export async function generateRedirects({
  redirectsPath = defaultRedirectsPath,
  routesPath = defaultRoutesPath,
  outputDirectory = defaultOutputDirectory,
  documentationRoot = defaultDocumentationRoot,
} = {}) {
  const state = await loadState({ redirectsPath, routesPath, outputDirectory, documentationRoot });
  const { redirects } = validateRedirectState(state);
  const outputPath = resolve(outputDirectory, '_redirects');
  const contents = renderRedirects(redirects);
  await writeFile(outputPath, contents);
  return { outputPath, redirectCount: redirects.length };
}

export async function checkRedirects({
  redirectsPath = defaultRedirectsPath,
  routesPath = defaultRoutesPath,
  outputDirectory = defaultOutputDirectory,
  documentationRoot = defaultDocumentationRoot,
  baseRef = process.env.DOCS_REDIRECT_BASE_REF,
  // How the previous manifest and redirect configuration are read. Defaults to
  // git, and is injectable so a test can supply a fixed prior state instead of
  // depending on repository history it would also be rewriting.
  readBase = { routes: readBaseRoutes, supersededPaths: readBaseSupersededPaths },
} = {}) {
  const state = await loadState({ redirectsPath, routesPath, outputDirectory, documentationRoot });
  if (baseRef) {
    const { launchEpoch, redirects, retiredRoutes } = parseRedirectConfig(
      state.redirectConfig,
      state.documentationRoot,
    );
    validateRouteHistory(state.knownRoutes, await readBase.routes(routesPath, baseRef), launchEpoch, {
      redirectSources: new Set(redirects.map((redirect) => redirect.source)),
      retiredPaths: new Set(retiredRoutes.map((retiredRoute) => retiredRoute.path)),
      supersededPaths: launchEpoch ? await readBase.supersededPaths(redirectsPath, baseRef) : new Set(),
    });
  }
  const { redirects } = validateRedirectState({ ...state, requireCurrentManifest: true });
  const outputPath = resolve(outputDirectory, '_redirects');
  const expected = renderRedirects(redirects);
  const actual = await readFile(outputPath, 'utf8').catch(() => '');
  // The V1 disposition rules are appended to this file after generation, so the
  // check verifies that this tooling's own rules are present and current rather
  // than that it owns the whole file.
  if (!actual.startsWith(expected)) {
    throw new Error(`Generated redirect output is missing or stale: ${outputPath}`);
  }

  return {
    activeRouteCount: state.activeRoutes.size,
    redirectCount: redirects.length,
  };
}

export async function generateRouteManifest({
  redirectsPath = defaultRedirectsPath,
  routesPath = defaultRoutesPath,
  outputDirectory = defaultOutputDirectory,
  documentationRoot = defaultDocumentationRoot,
} = {}) {
  const state = await loadState({ redirectsPath, routesPath, outputDirectory, documentationRoot });
  validateRedirectState(state);
  const { launchEpoch } = parseRedirectConfig(state.redirectConfig, state.documentationRoot);
  // A launch epoch retires a namespace outright, so its routes must not be
  // carried into the manifest it is retiring them from.
  const retained = launchEpoch
    ? [...state.knownRoutes].filter((route) => !route.startsWith(launchEpoch.retiredPrefix))
    : [...state.knownRoutes];
  const routes = [...new Set([...retained, ...state.activeRoutes])].sort();
  await writeFile(routesPath, `${JSON.stringify({ routes }, null, 2)}\n`);
  return {
    addedRouteCount: routes.filter((route) => !state.knownRoutes.has(route)).length,
    retiredRouteCount: state.knownRoutes.size - retained.length,
    routeCount: routes.length,
  };
}

async function run() {
  const command = process.argv[2];
  if (command === 'generate') {
    const result = await generateRedirects();
    console.log(
      `Generated ${result.redirectCount} documentation redirect rule${result.redirectCount === 1 ? '' : 's'}.`,
    );
    return;
  }
  if (command === 'check') {
    const result = await checkRedirects();
    console.log(
      `Checked ${result.activeRouteCount} documentation routes and ${result.redirectCount} redirect rule${result.redirectCount === 1 ? '' : 's'}.`,
    );
    return;
  }
  if (command === 'routes') {
    const result = await generateRouteManifest();
    console.log(`Recorded ${result.routeCount} documentation routes (${result.addedRouteCount} new).`);
    return;
  }
  throw new Error('Usage: redirects.mjs <generate|check|routes>');
}

const invokedScript = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedScript === fileURLToPath(import.meta.url)) {
  try {
    await run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
