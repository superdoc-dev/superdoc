import { llms } from 'fumadocs-core/source';
import { source } from '@/lib/source';

export const dynamic = 'force-static';

export function GET() {
  const pageIndex = llms(source).index().trimEnd();
  const machineReadableExports = [
    '## Machine-readable exports',
    '',
    '- [Guide corpus](/llms-full.txt): All authored guides in one file, without the generated API reference.',
    '- [Document API reference corpus](/llms-reference.txt): A large, exhaustive generated reference. Prefer focused reference pages when only a few operations are needed.',
  ].join('\n');

  return new Response(`${pageIndex}\n\n${machineReadableExports}\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
