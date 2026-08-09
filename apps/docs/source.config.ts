import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { pageSchema } from 'fumadocs-core/source/schema';
import { llmPlaceholderComponents } from './lib/llm-markdown';

const docsPageSchema = pageSchema.extend({
  navTitle: pageSchema.shape.title.optional(),
});

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: docsPageSchema,
    postprocess: {
      includeProcessedMarkdown: {
        mdxAsPlaceholder: [...llmPlaceholderComponents],
      },
    },
  },
});

export default defineConfig();
