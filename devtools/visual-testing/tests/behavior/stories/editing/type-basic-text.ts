import { defineStory } from '@superdoc-testing/helpers';

export default defineStory({
  name: 'type-basic-text',
  description: 'Type a simple paragraph into a blank document.',
  startDocument: null,

  async run(_page, helpers): Promise<void> {
    const { type, newLine, milestone } = helpers;
    await type('Hello, SuperDoc!');
    await newLine();
    await type('This is a simple paragraph of text.');
    await milestone(undefined, 'Typed a two-line greeting paragraph.');
  },
});
