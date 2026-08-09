import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/site-url';

export const dynamic = 'force-static';

/**
 * Allows indexing and points crawlers at the sitemap.
 *
 * This file is deliberately permissive. Preview and staging deployments are
 * kept out of search results by the `X-Robots-Tag: noindex` header Cloudflare
 * Pages serves on every non-production alias, not by shipping a different
 * robots.txt per environment: a static export produces one artifact, and the
 * production build must not carry a rule that would suppress production.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: new URL('/sitemap.xml', siteOrigin).href,
  };
}
