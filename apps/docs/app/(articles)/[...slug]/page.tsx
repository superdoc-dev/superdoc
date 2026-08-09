import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import { ArticleActions } from '@/components/article-actions';
import { getMDXComponents } from '@/mdx-components';
import { getMarkdownUrl } from '@/lib/llm-text';
import { canonicalPath } from '@/lib/site-url';
import { source } from '@/lib/source';
import styles from './article.module.css';

type PageProps = {
  params: Promise<{ slug: string[] }>;
};

export default async function DocumentationPage({ params }: PageProps) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  const Mdx = page.data.body;
  const markdownUrl = getMarkdownUrl(page.url);
  return (
    <DocsPage className={styles.page} toc={page.data.toc} full={page.data.full}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <DocsTitle className={styles.title}>{page.data.title}</DocsTitle>
          <DocsDescription className={styles.description}>{page.data.description}</DocsDescription>
        </div>
        <ArticleActions markdownUrl={markdownUrl} />
      </header>
      <DocsBody className={styles.body}>
        <Mdx components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug);

  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: { canonical: canonicalPath(page.url) },
  };
}

export function generateStaticParams() {
  return source.generateParams().filter(({ slug }) => slug.length > 0);
}
