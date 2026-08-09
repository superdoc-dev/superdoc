import { getLLMText } from '@/lib/llm-text';
import { source } from '@/lib/source';

export const dynamic = 'force-static';

export async function GET() {
  const articles = source.getPages().filter((page) => {
    const slug = page.slugs.join('/');
    return page.slugs.length > 0 && slug !== 'document-api/reference' && !slug.startsWith('document-api/reference/');
  });
  const pages = await Promise.all(articles.map(getLLMText));

  return new Response(pages.join('\n\n---\n\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
