import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 500;
const START_DOC = 'test-docs/comments-tcs/sd-tracked-style-change.docx';

interface SearchMatch {
  id: string;
  text: string;
  from: number;
  to: number;
  ranges?: Array<{ from: number; to: number }>;
}

export default defineStory({
  name: 'programmatic-tracked-change',
  description: 'Test insertTrackedChange command: replacements, deletions, insertions, comments, and addToHistory',
  startDocument: START_DOC,
  layout: true,
  comments: 'panel',
  hideCaret: true,
  hideSelection: false,

  async run(page, helpers): Promise<void> {
    const { step, waitForStable, milestone, undo, focus } = helpers;

    await step('Wait for document to load', async () => {
      await page.waitForSelector('.superdoc-page', { timeout: 30_000 });
      await waitForStable(WAIT_MS);
      await milestone('document-loaded', 'Initial tracked-changes document loaded.');
    });

    // =========================================
    // REPLACEMENT WITHOUT COMMENT
    // =========================================
    await step('Replacement without comment: "a tracked style" -> "new fancy"', async () => {
      const matches = await page.evaluate((query) => {
        const editor = (window as { editor?: { commands?: { search?: (q: string) => SearchMatch[] } } }).editor;
        const results = editor?.commands?.search?.(query);
        return Array.isArray(results) ? results : [];
      }, 'a tracked style');

      if (matches.length === 0) {
        throw new Error('No matches found for "a tracked style"');
      }

      const match = matches[0];

      // Navigate to and select the search result
      await page.evaluate((m) => {
        const editor = (window as { editor?: { commands?: { goToSearchResult?: (m: unknown) => void } } }).editor;
        editor?.commands?.goToSearchResult?.(m);
      }, match);

      await waitForStable(WAIT_MS);

      const result = await page.evaluate(() => {
        const editor = (
          window as {
            editor?: {
              commands?: {
                insertTrackedChange?: (options: { text: string; user: { name: string; email: string } }) => boolean;
              };
            };
          }
        ).editor;

        if (!editor?.commands?.insertTrackedChange) {
          throw new Error('insertTrackedChange command not available');
        }

        return editor.commands.insertTrackedChange({
          text: 'new fancy',
          user: { name: 'AI Bot', email: 'ai@superdoc.dev' },
        });
      });

      await waitForStable(WAIT_MS);
      await milestone('replacement-without-comment', 'Replaced "a tracked style" with "new fancy" (no comment).');
    });

    // =========================================
    // DELETION WITH COMMENT
    // =========================================
    await step('Deletion with comment: delete "Here"', async () => {
      const matches = await page.evaluate((query) => {
        const editor = (window as { editor?: { commands?: { search?: (q: string) => SearchMatch[] } } }).editor;
        const results = editor?.commands?.search?.(query);
        return Array.isArray(results) ? results : [];
      }, 'Here');

      if (matches.length === 0) {
        throw new Error('No matches found for "Here"');
      }

      const match = matches[0];

      await page.evaluate((m) => {
        const editor = (window as { editor?: { commands?: { goToSearchResult?: (m: unknown) => void } } }).editor;
        editor?.commands?.goToSearchResult?.(m);
      }, match);

      await waitForStable(WAIT_MS);

      const result = await page.evaluate(() => {
        const editor = (
          window as {
            editor?: {
              commands?: {
                insertTrackedChange?: (options: { text: string; comment: string; user: { name: string } }) => boolean;
              };
            };
          }
        ).editor;

        if (!editor?.commands?.insertTrackedChange) {
          throw new Error('insertTrackedChange command not available');
        }

        return editor.commands.insertTrackedChange({
          text: '',
          comment: 'Removing unnecessary word',
          user: { name: 'Deletion Bot' },
        });
      });

      await waitForStable(WAIT_MS);
      await milestone('deletion-with-comment', 'Deleted "Here" with a comment.');
    });

    // =========================================
    // INSERTION WITHOUT COMMENT (position-based)
    // =========================================
    await step('Insertion without comment: insert "ABC" at position 9', async () => {
      const result = await page.evaluate(() => {
        const editor = (
          window as {
            editor?: {
              commands?: {
                insertTrackedChange?: (options: {
                  from: number;
                  to: number;
                  text: string;
                  user: { name: string };
                }) => boolean;
              };
            };
          }
        ).editor;

        if (!editor?.commands?.insertTrackedChange) {
          throw new Error('insertTrackedChange command not available');
        }

        return editor.commands.insertTrackedChange({
          from: 9,
          to: 9,
          text: 'ABC',
          user: { name: 'Insert Bot' },
        });
      });

      await waitForStable(WAIT_MS);
      await milestone('insertion-without-comment', 'Inserted "ABC" at position 9 (no comment).');
    });

    // =========================================
    // INSERTION WITH COMMENT (position-based)
    // =========================================
    await step('Insertion with comment: insert "XYZ" at position 15', async () => {
      const result = await page.evaluate(() => {
        const editor = (
          window as {
            editor?: {
              commands?: {
                insertTrackedChange?: (options: {
                  from: number;
                  to: number;
                  text: string;
                  comment: string;
                  user: { name: string };
                }) => boolean;
              };
            };
          }
        ).editor;

        if (!editor?.commands?.insertTrackedChange) {
          throw new Error('insertTrackedChange command not available');
        }

        return editor.commands.insertTrackedChange({
          from: 15,
          to: 15,
          text: 'XYZ',
          comment: 'Adding important text',
          user: { name: 'Insert Bot' },
        });
      });

      await waitForStable(WAIT_MS);
      await milestone('insertion-with-comment', 'Inserted "XYZ" at position 15 with a comment.');
    });

    // =========================================
    // ADDTOHISTORY TEST
    // =========================================
    await step('addToHistory test: insert "PERSISTENT" with addToHistory: false', async () => {
      const result = await page.evaluate(() => {
        const editor = (
          window as {
            editor?: {
              commands?: {
                insertTrackedChange?: (options: {
                  from: number;
                  to: number;
                  text: string;
                  user: { name: string };
                  addToHistory: boolean;
                }) => boolean;
              };
            };
          }
        ).editor;

        if (!editor?.commands?.insertTrackedChange) {
          throw new Error('insertTrackedChange command not available');
        }

        return editor.commands.insertTrackedChange({
          from: 1,
          to: 1,
          text: 'PERSISTENT ',
          user: { name: 'No-History Bot' },
          addToHistory: false,
        });
      });

      await waitForStable(WAIT_MS);
      await milestone('before-undo', 'Inserted "PERSISTENT " with addToHistory disabled.');
    });

    await step('Undo - PERSISTENT should remain (was not in history)', async () => {
      // Focus the editor first - page.evaluate() may have caused focus loss
      await focus();
      await waitForStable(100);

      await undo();
      await waitForStable(WAIT_MS);
      await milestone('after-undo', 'Undo executed; PERSISTENT text should remain.');
    });

    await step('Verify PERSISTENT text remains after undo', async () => {
      const docText = await page.evaluate(() => {
        const editor = (
          window as {
            editor?: {
              state?: {
                doc?: {
                  textContent?: string;
                };
              };
            };
          }
        ).editor;
        return editor?.state?.doc?.textContent ?? '';
      });

      const hasPersistent = docText.includes('PERSISTENT');

      if (!hasPersistent) {
        throw new Error('PERSISTENT text was undone but should have remained (addToHistory: false)');
      }

      await milestone('verification-complete', 'Verified PERSISTENT text remains after undo.');
    });
  },
});
