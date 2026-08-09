#!/usr/bin/env node

import { stat, readFile, readdir } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultOutputDirectory = resolve(scriptDirectory, '../out');
const localOrigin = 'https://docs.local';
const productionDocsHostname = 'docs.superdoc.dev';
const referenceAttributesByElement = new Map([
  ['a', ['href']],
  ['area', ['href']],
  ['audio', ['src']],
  ['iframe', ['src']],
  ['img', ['src', 'srcset']],
  ['object', ['data']],
  ['source', ['src', 'srcset']],
  ['track', ['src']],
  ['video', ['src', 'poster']],
]);

export const minimumHtmlPageCount = 500;

async function collectHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = resolve(directory, entry.name);
      if (entry.isDirectory()) return collectHtmlFiles(entryPath);
      return entry.name.endsWith('.html') ? [entryPath] : [];
    }),
  );
  return files.flat();
}

function pageRoute(outputDirectory, htmlFile) {
  const outputRelativePath = relative(outputDirectory, htmlFile).split(sep).join('/');
  if (outputRelativePath === 'index.html') return '/';
  if (outputRelativePath.endsWith('/index.html')) {
    return `/${outputRelativePath.slice(0, -'index.html'.length)}`;
  }
  return `/${outputRelativePath}`;
}

function collectSrcsetReferences(srcset) {
  const references = [];
  let position = 0;

  while (position < srcset.length) {
    while (position < srcset.length && /[\s,]/u.test(srcset[position])) position += 1;
    if (position >= srcset.length) break;

    const start = position;
    const dataUrl = srcset.startsWith('data:', position);
    while (position < srcset.length && !/\s/u.test(srcset[position])) {
      if (!dataUrl && srcset[position] === ',') break;
      position += 1;
    }

    const reference = srcset.slice(start, position).replace(/,+$/u, '');
    if (reference) references.push(reference);

    while (position < srcset.length && srcset[position] !== ',') position += 1;
    if (position < srcset.length) position += 1;
  }

  return references;
}

function collectReferences(document) {
  const references = [];
  const pending = [document];

  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) continue;

    const attributeNames = referenceAttributesByElement.get(node.tagName);
    if (attributeNames) {
      for (const attribute of node.attrs ?? []) {
        if (!attributeNames.includes(attribute.name)) continue;
        if (attribute.name === 'srcset') references.push(...collectSrcsetReferences(attribute.value));
        else references.push(attribute.value);
      }
    }

    pending.push(...(node.childNodes ?? []));
    if (node.content) pending.push(node.content);
  }

  return references;
}

function resolveReference(reference, sourceRoute) {
  let destination;
  try {
    destination = new URL(reference, new URL(sourceRoute, localOrigin));
  } catch {
    return { destination: reference, kind: 'invalid' };
  }

  if (!['http:', 'https:'].includes(destination.protocol)) return null;
  if (destination.hostname === productionDocsHostname) {
    return { destination: destination.href, kind: 'absolute-internal' };
  }
  if (destination.origin !== localOrigin) return null;

  try {
    return { destination: decodeURIComponent(destination.pathname), kind: 'internal' };
  } catch {
    return { destination: destination.pathname, kind: 'invalid' };
  }
}

function destinationCandidates(outputDirectory, pathname) {
  const relativePath = pathname.replace(/^\/+/u, '');
  const literalPath = resolve(outputDirectory, relativePath);
  const outputPrefix = `${resolve(outputDirectory)}${sep}`;

  if (literalPath !== resolve(outputDirectory) && !literalPath.startsWith(outputPrefix)) return [];

  if (pathname.endsWith('/')) return [resolve(literalPath, 'index.html')];
  return [literalPath, `${literalPath}.html`, resolve(literalPath, 'index.html')];
}

async function isFile(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

async function destinationExists(outputDirectory, pathname) {
  for (const candidate of destinationCandidates(outputDirectory, pathname)) {
    if (await isFile(candidate)) return true;
  }
  return false;
}

function recordFailure(failuresByDestination, destination, kind, sourceRoute) {
  const key = `${kind}\0${destination}`;
  const failure = failuresByDestination.get(key) ?? { destination, kind, sources: new Set() };
  failure.sources.add(sourceRoute);
  failuresByDestination.set(key, failure);
}

export async function checkLinks({
  outputDirectory = defaultOutputDirectory,
  minimumPages = minimumHtmlPageCount,
} = {}) {
  let htmlFiles;
  try {
    htmlFiles = await collectHtmlFiles(outputDirectory);
  } catch {
    throw new Error(`Static documentation output is missing: ${outputDirectory}`);
  }

  if (htmlFiles.length < minimumPages) {
    throw new Error(
      `Expected at least ${minimumPages} rendered HTML pages in ${outputDirectory}, but found ${htmlFiles.length}.`,
    );
  }

  const failuresByDestination = new Map();
  let checkedReferenceCount = 0;

  for (const htmlFile of htmlFiles) {
    const sourceRoute = pageRoute(outputDirectory, htmlFile);
    const document = parse(await readFile(htmlFile, 'utf8'));

    for (const reference of collectReferences(document)) {
      const resolvedReference = resolveReference(reference, sourceRoute);
      if (!resolvedReference) continue;

      checkedReferenceCount += 1;
      if (resolvedReference.kind !== 'internal') {
        recordFailure(failuresByDestination, resolvedReference.destination, resolvedReference.kind, sourceRoute);
      } else if (!(await destinationExists(outputDirectory, resolvedReference.destination))) {
        recordFailure(failuresByDestination, resolvedReference.destination, 'missing', sourceRoute);
      }
    }
  }

  const failures = [...failuresByDestination.values()]
    .map(({ destination, kind, sources }) => ({ destination, kind, sources: [...sources].sort() }))
    .sort((left, right) => left.destination.localeCompare(right.destination));

  return {
    checkedReferenceCount,
    failures,
    htmlPageCount: htmlFiles.length,
  };
}

export function formatFailures(failures, maximumSources = 3) {
  const lines = ['Documentation link check failed:', ''];

  for (const failure of failures) {
    lines.push(`  ${failure.destination}`);
    if (failure.kind === 'absolute-internal') {
      lines.push('    internal documentation links must use relative paths');
    } else if (failure.kind === 'invalid') {
      lines.push('    link is not a valid internal URL');
    }
    lines.push(`    referenced from ${failure.sources.length} page${failure.sources.length === 1 ? '' : 's'}:`);
    for (const source of failure.sources.slice(0, maximumSources)) lines.push(`    - ${source}`);
    if (failure.sources.length > maximumSources) {
      lines.push(`    - and ${failure.sources.length - maximumSources} more`);
    }
    lines.push('');
  }

  lines.push(`Found ${failures.length} invalid or broken destination${failures.length === 1 ? '' : 's'}.`);
  return lines.join('\n');
}

const invokedScript = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedScript === fileURLToPath(import.meta.url)) {
  try {
    const result = await checkLinks();
    if (result.failures.length > 0) {
      console.error(formatFailures(result.failures));
      process.exitCode = 1;
    } else {
      console.log(
        `Checked ${result.htmlPageCount} rendered HTML pages and ${result.checkedReferenceCount} internal references.`,
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
