import { source } from '@/lib/source';
import { renderLLMMarkdown } from '@/lib/llm-markdown';

type DocumentationPage = NonNullable<ReturnType<typeof source.getPage>>;

export async function getLLMText(page: DocumentationPage) {
  const markdown = await renderLLMMarkdown(await page.data.getText('processed'));
  const description = page.data.description ? `\n> ${page.data.description}\n` : '';

  return `# ${page.data.title}\n${description}\n${markdown}`;
}

export { getMarkdownUrl } from '@/lib/markdown-url';
