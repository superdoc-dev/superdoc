#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultPublicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const reservedFirstSegments = new Set(['404', 'api', 'assets', 'docs', 'health', 'index', 'live', 'source']);
const compatibilityAliases = {
  react: 'examples/react',
  vanilla: 'examples/vanilla',
};

function readJson(file, label, problems) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    problems.push(`${label}: invalid JSON (${error.message})`);
    return null;
  }
}

function readJsonText(text, label, problems) {
  try {
    return JSON.parse(text);
  } catch (error) {
    problems.push(`${label}: invalid JSON (${error.message})`);
    return null;
  }
}

function runGit(cwd, args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

function resolveGitRef(publicRoot, ref, label, problems) {
  const resolvedPublicRoot = realpathSync(publicRoot);
  const repoRootResult = runGit(resolvedPublicRoot, ['rev-parse', '--show-toplevel']);
  if (repoRootResult.status !== 0) {
    problems.push(`go-links/published-routes.json: cannot find the Git repository for ${label} '${ref}'`);
    return null;
  }

  const repoRoot = realpathSync(repoRootResult.stdout.trim());
  const commitResult = runGit(repoRoot, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]);
  if (commitResult.status !== 0) {
    problems.push(`go-links/published-routes.json: ${label} '${ref}' does not exist`);
    return null;
  }

  const publishedPath = path.relative(repoRoot, path.join(resolvedPublicRoot, 'go-links', 'published-routes.json'));
  return {
    commit: commitResult.stdout.trim(),
    publishedPath: publishedPath.split(path.sep).join('/'),
    repoRoot,
  };
}

function readPublishedRoutesAtObject(context, commit, label, problems) {
  const { publishedPath, repoRoot } = context;
  const object = `${commit}:${publishedPath}`;
  const existsResult = runGit(repoRoot, ['cat-file', '-e', object]);
  if (existsResult.status !== 0) return null;

  const showResult = runGit(repoRoot, ['show', object]);
  if (showResult.status !== 0) {
    problems.push(`go-links/published-routes.json: cannot read permanent routes from ${label}`);
    return null;
  }

  const published = readJsonText(showResult.stdout, `go-links/published-routes.json at ${label}`, problems);
  if (!Array.isArray(published) || published.some((route) => typeof route !== 'string')) {
    problems.push(`go-links/published-routes.json at ${label}: expected an array of route strings`);
    return null;
  }
  return published;
}

function readPublishedRoutesAtRef(publicRoot, baselineRef, problems) {
  const context = resolveGitRef(publicRoot, baselineRef, 'baseline ref', problems);
  if (!context) return null;
  return readPublishedRoutesAtObject(context, context.commit, `baseline '${baselineRef}'`, problems);
}

function readPublishedRouteHistory(publicRoot, historyRef, problems) {
  const context = resolveGitRef(publicRoot, historyRef, 'history ref', problems);
  if (!context) return null;

  const { commit, publishedPath, repoRoot } = context;
  const historyResult = runGit(repoRoot, ['rev-list', commit, '--', publishedPath]);
  if (historyResult.status !== 0) {
    problems.push(`go-links/published-routes.json: cannot read route history from '${historyRef}'`);
    return null;
  }

  const routes = new Set();
  for (const historicalCommit of historyResult.stdout.trim().split('\n').filter(Boolean)) {
    const published = readPublishedRoutesAtObject(
      context,
      historicalCommit,
      `commit '${historicalCommit}' in history '${historyRef}'`,
      problems,
    );
    for (const route of published ?? []) routes.add(route);
  }
  return [...routes];
}

function effectiveDestination(entry, defaults) {
  return JSON.stringify({
    repository: entry.repository ?? defaults.repository,
    ref: entry.ref ?? defaults.ref,
    path: entry.path,
  });
}

export function findGoLinkProblems(publicRoot = defaultPublicRoot, { baselineRef, historyRef } = {}) {
  const problems = [];
  const goLinksRoot = path.join(publicRoot, 'go-links');
  const config = readJson(path.join(goLinksRoot, 'linkkeeper.json'), 'go-links/linkkeeper.json', problems);
  const registry = readJson(path.join(goLinksRoot, 'links.json'), 'go-links/links.json', problems);
  const published = readJson(
    path.join(goLinksRoot, 'published-routes.json'),
    'go-links/published-routes.json',
    problems,
  );

  if (config && (config.links?.repo !== 'superdoc/docx-editor' || config.links?.file !== 'go-links/links.json')) {
    problems.push('go-links/linkkeeper.json: must read go-links/links.json from superdoc/docx-editor');
  }
  if (!registry || !published) return problems;
  if (!Array.isArray(published) || published.some((route) => typeof route !== 'string')) {
    problems.push('go-links/published-routes.json: expected an array of route strings');
    return problems;
  }
  if (!registry.links || typeof registry.links !== 'object' || Array.isArray(registry.links)) {
    problems.push('go-links/links.json: links must be an object');
    return problems;
  }

  const routes = Object.keys(registry.links).sort();
  const recorded = [...published].sort();
  if (new Set(recorded).size !== recorded.length) {
    problems.push('go-links/published-routes.json: routes must be unique');
  }
  if (JSON.stringify(published) !== JSON.stringify(recorded)) {
    problems.push('go-links/published-routes.json: routes must be sorted');
  }

  for (const route of recorded.filter((route) => !routes.includes(route))) {
    problems.push(`${route}: published route is missing from go-links/links.json`);
  }
  for (const route of routes.filter((route) => !recorded.includes(route))) {
    problems.push(`${route}: add new route to go-links/published-routes.json before publishing it`);
  }

  if (baselineRef) {
    const baselineRoutes = readPublishedRoutesAtRef(publicRoot, baselineRef, problems);
    for (const route of baselineRoutes ?? []) {
      if (!recorded.includes(route)) {
        problems.push(`${route}: permanent route was removed from go-links/published-routes.json`);
      }
    }
  }
  if (historyRef) {
    const historicalRoutes = readPublishedRouteHistory(publicRoot, historyRef, problems);
    for (const route of historicalRoutes ?? []) {
      if (!recorded.includes(route)) {
        problems.push(`${route}: permanent route was removed from go-links/published-routes.json`);
      }
    }
  }

  const defaults = registry.defaults ?? {};
  for (const [route, entry] of Object.entries(registry.links)) {
    if (!routePattern.test(route)) {
      problems.push(`${route}: route must contain lowercase kebab-case path segments`);
    } else if (reservedFirstSegments.has(route.split('/')[0])) {
      problems.push(`${route}: first segment is reserved for the link service`);
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.path !== 'string') {
      problems.push(`${route}: destination must be an object with a path`);
      continue;
    }

    const repository = entry.repository ?? defaults.repository;
    if (repository !== 'superdoc/docx-editor') continue;

    const target = path.resolve(publicRoot, entry.path);
    const relative = path.relative(publicRoot, target);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      problems.push(`${route}: local path must stay inside the public repository`);
    } else if (!existsSync(target)) {
      problems.push(`${route}: local destination '${entry.path}' does not exist`);
    }
  }

  for (const [alias, canonical] of Object.entries(compatibilityAliases)) {
    const aliasEntry = registry.links[alias];
    const canonicalEntry = registry.links[canonical];
    if (!aliasEntry || !canonicalEntry) {
      problems.push(`${alias}: compatibility route and ${canonical} must both exist`);
      continue;
    }
    if (effectiveDestination(aliasEntry, defaults) !== effectiveDestination(canonicalEntry, defaults)) {
      problems.push(`${alias}: compatibility route must match ${canonical}`);
    }
  }

  return problems;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const problems = findGoLinkProblems(defaultPublicRoot, {
    baselineRef: process.env.GO_LINKS_BASE_REF,
    historyRef: process.env.GO_LINKS_HISTORY_REF,
  });
  if (problems.length > 0) {
    console.error(problems.map((problem) => `- ${problem}`).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Go links: registry and permanent routes are valid.');
  }
}
