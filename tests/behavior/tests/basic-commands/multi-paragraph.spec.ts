import { test } from '../../fixtures/superdoc.js';

const CONTENT_LINES = [
  'Heading: Introduction to SuperDoc',
  '',
  'SuperDoc is a powerful document editor that provides rich text editing capabilities. It supports various formatting options, tables, images, and more.',
  '',
  'Key features include:',
  '- Real-time collaboration',
  '- Track changes and comments',
  '- Export to multiple formats',
  '',
  'Start creating your documents today!',
];

test('type a multi-paragraph sample document', async ({ superdoc }) => {
  for (let i = 0; i < CONTENT_LINES.length; i += 1) {
    const line = CONTENT_LINES[i];
    const isLast = i === CONTENT_LINES.length - 1;

    if (line.length === 0) {
      await superdoc.newLine();
      continue;
    }

    await superdoc.type(line);
    if (!isLast) {
      await superdoc.newLine();
    }
  }

  await superdoc.waitForStable();

  await superdoc.assertTextContains('Heading: Introduction to SuperDoc');
  await superdoc.assertTextContains('Key features include:');
  await superdoc.assertTextContains('- Track changes and comments');
  await superdoc.assertTextContains('Start creating your documents today!');
});
