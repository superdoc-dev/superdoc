/**
 * Maps a documentation page route to its Markdown route.
 *
 * Client-safe by design: `lib/llm-text.ts` reaches `collections/server` through
 * `lib/source.ts`, so a client component importing this from there would pull
 * the Fumadocs server entry into the browser graph just to format a string.
 */
export function getMarkdownUrl(pageUrl: string) {
  const slug = pageUrl.replace(/^\/+/, '').replace(/\/$/, '');
  return `/md/${slug}.md`;
}
