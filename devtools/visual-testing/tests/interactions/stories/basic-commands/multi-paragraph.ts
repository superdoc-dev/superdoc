import { defineStory } from '@superdoc-testing/helpers';

const CONTENT_LINES = [
  'Heading: Introduction to SuperDoc',
  '',
  'SuperDoc is a powerful document editor that provides rich text editing capabilities. ' +
    'It supports various formatting options, tables, images, and more.',
  '',
  'Key features include:',
  '- Real-time collaboration',
  '- Track changes and comments',
  '- Export to multiple formats',
  '',
  'Start creating your documents today!',
];

export default defineStory({
  name: 'multi-paragraph',
  description: 'Create a document with multiple paragraphs.',
  startDocument: null,

  async run(_page, helpers): Promise<void> {
    const { type, newLine, milestone } = helpers;

    for (let i = 0; i < CONTENT_LINES.length; i += 1) {
      const line = CONTENT_LINES[i];
      const isLast = i === CONTENT_LINES.length - 1;

      if (line.length === 0) {
        await newLine();
        continue;
      }

      await type(line);
      if (!isLast) {
        await newLine();
      }
    }

    await milestone(undefined, 'Typed a multi-paragraph sample with heading and bullet list.');
  },
});
