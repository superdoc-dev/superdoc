import { defineStory } from '@superdoc-testing/helpers';

export default defineStory({
  name: 'bold-italic-formatting',
  description: 'Type text and apply bold/italic formatting via keyboard shortcuts.',
  startDocument: null,

  async run(_page, helpers): Promise<void> {
    const { type, newLine, bold, italic, tripleClickLine, milestone, waitForStable } = helpers;

    await type('This text will be bold.');
    await newLine();
    await type('This text will be italic.');
    await newLine();
    await type('This text will be both bold and italic.');

    // Wait for layout to render all lines
    await waitForStable();

    // Select line 0 and make it bold
    await tripleClickLine(0);
    await bold();

    // Select line 1 and make it italic
    await tripleClickLine(1);
    await italic();

    // Select line 2 and make it bold + italic
    await tripleClickLine(2);
    await bold();
    await italic();

    await milestone(undefined, 'Applied bold, italic, and bold+italic formatting to three lines.');
  },
});
