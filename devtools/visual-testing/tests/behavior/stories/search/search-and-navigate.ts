import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 500;
const START_DOC = 'test-docs/basic/longer-header.docx';

// First search query - cross-paragraph search
const SEARCH_QUERY_1 = 'works of the Licensed Material; (b) distribute, sell,';

// Second search query - spans multiple paragraphs across sections 9 and 10
const SEARCH_QUERY_2 = `Law This Agreement shall be governed by and construed in accordance with the laws of the State of _______ , without regard to its conflict of law principles. Any legal action or proceeding arising under this Agreement will be brought exclusively in the federal or state courts located in _________________, and the parties hereby consent to the personal jurisdiction and venue therein.

10. Entire Agreement This Agreement constitutes the entire agreement between the parties regarding the subject matter hereof and supersedes all prior agreements and understandings, whether written or oral, relating to such subject matter. Any modifications or amendments to this Agreement must be in writing and signed by both parties.`;

interface SearchMatch {
  id: string;
  text: string;
  from: number;
  to: number;
  ranges?: Array<{ from: number; to: number }>;
}

export default defineStory({
  name: 'search-and-navigate',
  description: 'Search for text in document and navigate to results, including cross-paragraph searches',
  startDocument: START_DOC,
  layout: true,
  hideCaret: true,
  hideSelection: false, // Show selection after goToSearchResult

  async run(page, helpers): Promise<void> {
    const { step, waitForStable, milestone } = helpers;

    await step('Wait for document to fully load', async () => {
      await page.waitForSelector('.superdoc-page', { timeout: 30_000 });
      await waitForStable(WAIT_MS);
      await milestone('document-loaded', 'Initial document loaded.');
    });

    // First search - cross-paragraph
    await step('Search for first query (cross-paragraph)', async () => {
      const matches = await page.evaluate((query) => {
        const editor = (window as { editor?: { commands?: { search?: (q: string) => SearchMatch[] } } }).editor;
        const results = editor?.commands?.search?.(query);
        return Array.isArray(results) ? results : [];
      }, SEARCH_QUERY_1);

      console.log(`  Found ${matches.length} match(es) for first query`);

      if (matches.length === 0) {
        throw new Error(`No matches found for first search query`);
      }

      const firstMatch = matches[0];
      console.log(`  First match: from=${firstMatch.from}, to=${firstMatch.to}`);
      if (firstMatch.ranges) {
        console.log(`  Ranges: ${firstMatch.ranges.length} segment(s)`);
      }

      await page.evaluate((match) => {
        const editor = (window as { editor?: { commands?: { goToSearchResult?: (m: unknown) => void } } }).editor;
        editor?.commands?.goToSearchResult?.(match);
      }, firstMatch);

      await waitForStable(WAIT_MS);
      await milestone('first-search-result', 'Navigated to the first cross-paragraph search result.');
    });

    // Second search - multi-paragraph spanning sections
    await step('Search for second query (multi-paragraph)', async () => {
      const matches = await page.evaluate((query) => {
        const editor = (window as { editor?: { commands?: { search?: (q: string) => SearchMatch[] } } }).editor;
        const results = editor?.commands?.search?.(query);
        return Array.isArray(results) ? results : [];
      }, SEARCH_QUERY_2);

      console.log(`  Found ${matches.length} match(es) for second query`);

      if (matches.length === 0) {
        throw new Error(`No matches found for second search query`);
      }

      const firstMatch = matches[0];
      console.log(`  First match: from=${firstMatch.from}, to=${firstMatch.to}`);
      if (firstMatch.ranges) {
        console.log(`  Ranges: ${firstMatch.ranges.length} segment(s)`);
      }

      await page.evaluate((match) => {
        const editor = (window as { editor?: { commands?: { goToSearchResult?: (m: unknown) => void } } }).editor;
        editor?.commands?.goToSearchResult?.(match);
      }, firstMatch);

      await waitForStable(WAIT_MS);
      await milestone('second-search-result', 'Navigated to the first multi-paragraph search result.');
    });

    // Add a comment on the current selection
    await step('Add comment on selection', async () => {
      await page.evaluate(() => {
        const editor = (window as { editor?: { commands?: { addComment?: (text: string) => boolean } } }).editor;
        editor?.commands?.addComment?.('some comment text!');
      });

      await waitForStable(WAIT_MS);
      await milestone('comment-added', 'Added a comment on the current selection.');
    });
  },
});
