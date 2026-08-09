import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { checkLinks, formatFailures } from '../scripts/check-links.mjs';

async function createOutput(t, files) {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'superdoc-docs-links-'));
  t.after(() => rm(outputDirectory, { force: true, recursive: true }));

  for (const [file, contents] of Object.entries(files)) {
    const filePath = join(outputDirectory, file);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
  }

  return outputDirectory;
}

test('accepts rendered pages, Markdown exports, root files, media, and external links', async (t) => {
  const outputDirectory = await createOutput(t, {
    'index.html': `
      <a href="/guide/">Guide</a>
      <a href="/md/guide.md?download=1#example">Markdown</a>
      <a href="/llms-reference.txt">Reference corpus</a>
      <a href="https://example.com/reference">External reference</a>
      <a href="mailto:docs@example.com">Email</a>
      <img src="/media/diagram.svg">
    `,
    'guide/index.html': `
      <a href="/">Home</a>
      <a href="../../llms-reference.txt">Reference corpus</a>
    `,
    'llms-reference.txt': 'Reference',
    'md/guide.md': '# Guide',
    'media/diagram.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  });

  const result = await checkLinks({ minimumPages: 2, outputDirectory });

  assert.equal(result.htmlPageCount, 2);
  assert.equal(result.checkedReferenceCount, 6);
  assert.deepEqual(result.failures, []);
});

test('groups missing destinations by destination and deduplicates source pages', async (t) => {
  const outputDirectory = await createOutput(t, {
    'index.html': `
      <a href="/missing/">Missing</a>
      <a href="/missing/">Missing again</a>
      <img src="/media/missing.png">
    `,
    'guide/index.html': '<a href="/missing/">Missing</a>',
  });

  const result = await checkLinks({ minimumPages: 2, outputDirectory });

  assert.deepEqual(result.failures, [
    {
      destination: '/media/missing.png',
      kind: 'missing',
      sources: ['/'],
    },
    {
      destination: '/missing/',
      kind: 'missing',
      sources: ['/', '/guide/'],
    },
  ]);
  assert.match(formatFailures(result.failures), /\/missing\/\n {4}referenced from 2 pages:/u);
});

test('limits repeated source pages in failure output', () => {
  const output = formatFailures([
    {
      destination: '/missing/',
      kind: 'missing',
      sources: ['/a/', '/b/', '/c/', '/d/'],
    },
  ]);

  assert.match(output, /- and 1 more/u);
  assert.doesNotMatch(output, /\/d\//u);
});

test('rejects absolute links to the production documentation origin', async (t) => {
  const outputDirectory = await createOutput(t, {
    'index.html': '<a href="https://docs.superdoc.dev/docs/guide/">Guide</a>',
    'guide/index.html': '<p>Guide</p>',
  });

  const result = await checkLinks({ minimumPages: 2, outputDirectory });

  assert.deepEqual(result.failures, [
    {
      destination: 'https://docs.superdoc.dev/docs/guide/',
      kind: 'absolute-internal',
      sources: ['/'],
    },
  ]);
  assert.match(formatFailures(result.failures), /internal documentation links must use relative paths/u);
});

test('validates responsive image and picture source candidates', async (t) => {
  const outputDirectory = await createOutput(t, {
    'index.html': `
      <picture>
        <source srcset="/media/small.webp 1x, /media/missing.webp 2x">
        <img
          src="/media/fallback.png"
          srcset="data:image/svg+xml,%3Csvg%3E 1x, /media/large.png 960w"
        >
      </picture>
    `,
    'media/fallback.png': 'fallback',
    'media/large.png': 'large',
    'media/small.webp': 'small',
  });

  const result = await checkLinks({ minimumPages: 1, outputDirectory });

  assert.deepEqual(result.failures, [
    {
      destination: '/media/missing.webp',
      kind: 'missing',
      sources: ['/'],
    },
  ]);
});

test('fails when the static output directory is missing', async () => {
  await assert.rejects(
    checkLinks({ minimumPages: 1, outputDirectory: '/path/that/does/not/exist' }),
    /Static documentation output is missing/u,
  );
});

test('fails when the static output contains fewer pages than expected', async (t) => {
  const outputDirectory = await createOutput(t, {
    'index.html': '<a href="/">Home</a>',
  });

  await assert.rejects(checkLinks({ minimumPages: 2, outputDirectory }), /Expected at least 2 rendered HTML pages/u);
});
