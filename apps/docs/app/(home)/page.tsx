import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { canonicalPath } from '@/lib/site-url';
import { source } from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';

export default function DocumentationHomePage() {
  const page = source.getPage([]);
  if (!page) notFound();

  const Mdx = page.data.body;
  return <Mdx components={getMDXComponents()} />;
}

export function generateMetadata(): Metadata {
  const page = source.getPage([]);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: { canonical: canonicalPath(page.url) },
  };
}
