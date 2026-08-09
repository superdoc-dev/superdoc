import type { MetadataRoute } from 'next';
import { canonicalPath, siteOrigin } from '@/lib/site-url';
import { source } from '@/lib/source';

export const dynamic = 'force-static';

/**
 * Lists every documentation page for search engines.
 *
 * Derived from the same page source the site renders from, so a new page is
 * listed as soon as it exists and a removed one stops being advertised. The
 * generated Document API reference is included: those pages are the bulk of
 * the corpus and are exactly what people search for by operation name.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return source.getPages().map((page) => ({
    url: new URL(canonicalPath(page.url), siteOrigin).href,
  }));
}
