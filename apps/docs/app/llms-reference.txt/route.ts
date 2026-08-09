import { renderFullReferenceMarkdown } from '@/lib/document-api-reference/markdown';

export const dynamic = 'force-static';

export function GET() {
  return new Response(renderFullReferenceMarkdown(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
