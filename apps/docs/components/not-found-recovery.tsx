'use client';

import { useEffect, useState } from 'react';
import { useDocsSearch } from 'fumadocs-core/search/client';
import { oramaStaticClient } from 'fumadocs-core/search/client/orama-static';
import { archiveOrigin, repositoryUrl, searchTermsFromPath } from '@/lib/site-url';
import styles from './not-found-recovery.module.css';

const searchClient = oramaStaticClient();
const resultLimit = 3;

/**
 * Recovery options for a URL this site does not serve.
 *
 * The requested path is read in the browser rather than passed in, because a
 * static export renders one 404 document for every unmatched URL and cannot know
 * at build time which one was asked for.
 *
 * Nothing here redirects. A 404 that forwards to a guessed destination hides the
 * broken link from whoever should fix it, and search engines read an unrelated
 * redirect as a soft 404. The page keeps its status and offers the reader the
 * three things that actually help: what V2 has on this subject, the same path on
 * the V1 archive, and a way to report the link.
 */
export function NotFoundRecovery() {
  const [pathname, setPathname] = useState('');
  const { search, setSearch, query } = useDocsSearch({ client: searchClient });

  useEffect(() => {
    const requested = window.location.pathname;
    setPathname(requested);
    const terms = searchTermsFromPath(requested);
    if (terms.length > 0) setSearch(terms);
  }, [setSearch]);

  const results = query.data !== 'empty' && Array.isArray(query.data) ? query.data.slice(0, resultLimit) : [];
  // The archive keeps V1's own paths, so the same path is the useful guess for
  // someone who followed an old link.
  const archiveUrl = pathname ? `${archiveOrigin}${pathname}` : archiveOrigin;

  return (
    <div className={styles.recovery}>
      {pathname ? (
        <p className={styles.requested}>
          Nothing is published at <code>{pathname}</code>.
        </p>
      ) : null}

      {results.length > 0 ? (
        <section>
          <h2 className={styles.heading}>Closest matches in these docs</h2>
          <ul className={styles.results}>
            {results.map((result) => (
              <li key={result.id}>
                <a href={result.url}>{result.content}</a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className={styles.heading}>If you followed a link to the older docs</h2>
        <p>
          SuperDoc v1 documentation moved to a separate site and kept its own paths.{' '}
          <a href={archiveUrl} rel='nofollow'>
            Try this page on the v1 archive
          </a>
          .
        </p>
      </section>

      <p className={styles.actions}>
        <a href='/'>Documentation home</a>
        <a
          href={`${repositoryUrl}/issues/new?title=${encodeURIComponent(
            `Broken documentation link: ${pathname || 'unknown path'}`,
          )}`}
          rel='nofollow'
        >
          Report a broken link
        </a>
      </p>
    </div>
  );
}
