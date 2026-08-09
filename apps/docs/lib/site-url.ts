/**
 * The production origin for the documentation site.
 *
 * Canonical URLs, the sitemap, and robots.txt all have to agree on one origin,
 * and every preview and staging deployment has to point at it rather than at
 * itself. Otherwise each Cloudflare Pages alias would advertise itself as the
 * canonical copy and compete with production in search results.
 */
export const siteOrigin = 'https://docs.superdoc.dev';

/**
 * Where the V1 documentation lives now.
 *
 * The route registry redirects V1 URLs with no V2 replacement here, and the
 * not-found page offers the same path as a fallback: a reader who followed an
 * old link is usually looking for content that still exists, just not in V2.
 */
export const archiveOrigin = 'https://docs-v1.superdoc.dev';

/**
 * The public repository, for links that send a reader to the source or an issue.
 *
 * The repository was transferred, and the old path still redirects, so a stale
 * link keeps working and nothing fails loudly enough to notice. Naming it once
 * is what keeps the next copy from drifting back.
 */
export const repositoryUrl = 'https://github.com/superdoc/docx-editor';

/**
 * The API endpoint for that repository, spelled out rather than derived.
 *
 * Deriving it by rewriting the web URL works until the web URL changes shape,
 * and then it fails as a silent fetch error rather than a build break.
 */
export const repositoryApiUrl = 'https://api.github.com/repos/superdoc/docx-editor';

/**
 * Turns a requested path into search terms.
 *
 * A 404 already knows what the reader wanted -- it is in the URL. Splitting the
 * path into words gives a usable query without asking them to retype it, and
 * without guessing at a destination: `/ai/agents/architecture` becomes
 * "ai agents architecture" rather than a redirect to a page we hope is right.
 */
export function searchTermsFromPath(pathname: string) {
  return pathname
    .replace(/\.[a-z0-9]+$/iu, '')
    .split('/')
    .flatMap((segment) => segment.split(/[-_]/u))
    .filter((word) => word.length > 0)
    .join(' ');
}

/**
 * Normalizes a route to the exact path the static export serves.
 *
 * `next.config.mjs` sets `trailingSlash: true`, so every documentation page is
 * exported as a directory index and served with a trailing slash. Fumadocs
 * hands back `page.url` without one. Emitting the un-normalized form as a
 * canonical would point search engines at a URL that redirects, so the
 * canonical and the served URL have to be made identical here.
 *
 * Derived from `page.url` rather than a hardcoded prefix, so it keeps working
 * when the source `baseUrl` changes.
 */
export function canonicalPath(pageUrl: string) {
  return pageUrl.endsWith('/') ? pageUrl : `${pageUrl}/`;
}
