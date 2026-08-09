import { notFound } from 'next/navigation';
import { getLLMText } from '@/lib/llm-text';
import { source } from '@/lib/source';

type RouteContext = {
  params: Promise<{ slug: string[] }>;
};

export const dynamic = 'force-static';

export async function GET(_request: Request, { params }: RouteContext) {
  const { slug } = await params;
  const pageSlug = withoutMarkdownExtension(slug);
  if (!pageSlug) notFound();

  const page = source.getPage(pageSlug);
  if (!page) notFound();

  return new Response(await getLLMText(page), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
}

export function generateStaticParams() {
  return source.generateParams().flatMap(({ slug }) => {
    const filename = slug.at(-1);
    if (!filename) return [];

    return [{ slug: [...slug.slice(0, -1), `${filename}.md`] }];
  });
}

function withoutMarkdownExtension(slug: string[]) {
  const filename = slug.at(-1);
  if (!filename?.endsWith('.md')) return;

  return [...slug.slice(0, -1), filename.slice(0, -3)];
}
