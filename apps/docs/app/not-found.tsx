import type { Metadata } from 'next';
import { NotFoundRecovery } from '@/components/not-found-recovery';

export const metadata: Metadata = {
  title: 'Page not found',
  // A 404 that gets indexed competes with the pages that do exist.
  robots: { index: false, follow: true },
};

/**
 * The page served for any URL this site does not publish.
 *
 * Next.js exports this as `404.html`, which Cloudflare Pages serves with a real
 * 404 status. That status is the point: a redirect to the homepage would tell
 * crawlers the URL is fine and hide the broken link from whoever should fix it.
 */
export default function NotFound() {
  return (
    <main>
      <h1>Page not found</h1>
      <NotFoundRecovery />
    </main>
  );
}
