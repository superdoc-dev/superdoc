/**
 * Checks that unknown URLs stay unknown.
 *
 * The recovery page is only useful if the platform still reports the URL as
 * missing. A 200, a redirect to the home page, or a client-side jump would each
 * tell a crawler the broken link is fine and hide it from whoever should fix it,
 * so those are the failures worth catching automatically.
 *
 * The search results themselves are rendered in the browser from the static
 * index, so they cannot be asserted here. What can be asserted is that the
 * document ships the pieces the browser needs.
 *
 * Usage: node scripts/verify-not-found.mjs [origin]
 */
import { archiveHost } from './v1-routes.mjs';

const origin = new URL(process.argv[2] ?? 'https://superdoc-docs-next.pages.dev').origin;

const unknownPaths = [
  '/this/does/not/exist/',
  '/ai/agents/architecture-xyz/',
  '/getting-started/nope/',
  '/docs/editor/quickstart-gone/',
];

// A trailing-slash 404 is served from 404.html; the slashless form may be
// normalized first. Both have to end in a 404 either way.
const navigationPatterns = [
  /location\.href\s*=/u,
  /location\.replace\(/u,
  /location\.assign\(/u,
  /<meta[^>]+http-equiv=["']?refresh/iu,
];

const failures = [];

for (const path of unknownPaths) {
  const url = `${origin}${path}`;
  let response;
  try {
    response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    failures.push(`${path}: request failed: ${error.message}`);
    continue;
  }

  if (response.status !== 404) {
    failures.push(`${path}: expected 404, got ${response.status} at ${response.url}`);
    continue;
  }

  const body = await response.text();

  for (const pattern of navigationPatterns) {
    if (pattern.test(body)) failures.push(`${path}: the document navigates away (${pattern})`);
  }
  if (!/noindex/iu.test(body)) failures.push(`${path}: missing noindex`);
  if (!body.includes(archiveHost)) failures.push(`${path}: no ${archiveHost} recovery link`);
  // The search UI is a client component; its hydration payload has to be present
  // for the reader to get results at all.
  if (!/_next\/static/u.test(body)) failures.push(`${path}: no client bundle, so search cannot run`);
}

// The recovery page searches the same prebuilt index the site's own search box
// uses, so an empty or missing index would leave every 404 with no suggestions.
const searchIndex = await fetch(`${origin}/api/search`, { signal: AbortSignal.timeout(30_000) });
if (!searchIndex.ok) {
  failures.push(`/api/search: expected 200, got ${searchIndex.status}`);
} else if ((await searchIndex.text()).length < 1000) {
  failures.push('/api/search: the index is too small to contain the documentation');
}

for (const failure of failures) process.stdout.write(`  ${failure}\n`);
process.stdout.write(
  failures.length === 0
    ? `${unknownPaths.length}/${unknownPaths.length} unknown URLs return 404 with recovery and no redirect\n`
    : `\n${failures.length} problems across ${unknownPaths.length} unknown URLs\n`,
);

if (failures.length > 0) process.exit(1);
