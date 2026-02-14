import { defineStory } from '@superdoc-testing/helpers';
import { reloadDocument, waitForCommentPanelStable } from '../../helpers/index.js';
import { expect, Locator } from '@playwright/test';
import { basename } from 'node:path';
import { withGoogleDocs } from '../../helpers/google-docs-helpers.js';

interface BaseHighlight {
  text: string;
  comments: ConversationItem[];
}

interface ConversationItem {
  author: string;
  comment: string;
}

interface CommentInfo extends BaseHighlight {
  type: 'comment';
}

interface InsertionInfo extends BaseHighlight {
  type: 'insertion';
  author: string;
}

type Highlight = CommentInfo | InsertionInfo;
type ChangeInfo = InsertionInfo;

type RegressionTest = {
  document: string;
  expectedHighlights: Builder<Highlight>[];
};

function expectComment(text: string) {
  return new Builder<CommentInfo>({ type: 'comment', text });
}

function expectInsertion(text: string, { author }) {
  return new Builder<InsertionInfo>({ type: 'insertion', text, author });
}

function isTrackedChange(highlight: Highlight): highlight is ChangeInfo {
  return highlight.type === 'insertion';
}

class Builder<T extends Highlight> {
  instance: T;

  constructor(instance: Omit<T, 'comments'>) {
    this.instance = { comments: [] as ConversationItem[], ...instance } as T;
  }

  withComment(comment: string, { author }: { author: string }) {
    this.instance.comments.push({ comment, author });
    return this;
  }

  build() {
    return this.instance;
  }
}

const TESTS: RegressionTest[] = [
  {
    document: 'test-docs/comments-tcs/GD Open Comment with thread.docx',
    expectedHighlights: [
      expectComment('comment')
        .withComment('Here is a comment', { author: 'Missy Fox (imported)' })
        .withComment('with a thread', { author: 'Missy Fox (imported)' }),
    ],
  },
  {
    document: 'test-docs/comments-tcs/GD Open Comment.docx',
    expectedHighlights: [
      expectComment('Open comment ').withComment('Here is a comment', { author: 'Missy Fox (imported)' }),
    ],
  },
  {
    document: 'test-docs/comments-tcs/GD Open tracked addition with a thread.docx',
    expectedHighlights: [
      expectInsertion('new text', { author: 'Missy Fox (imported)' }).withComment('here is a thread', {
        author: 'Missy Fox (imported)',
      }),
    ],
  },
  {
    document: 'test-docs/comments-tcs/GD Open tracked addition.docx',
    expectedHighlights: [],
  },
  {
    document: 'test-docs/comments-tcs/GD Open tracked deletion with a thread.docx',
    expectedHighlights: [],
  },
  {
    document: 'test-docs/comments-tcs/GD Open tracked deletion.docx',
    expectedHighlights: [],
  },
  {
    document: 'test-docs/comments-tcs/GD Open tracked replacement with a thread.docx',
    expectedHighlights: [],
  },
  {
    document: 'test-docs/comments-tcs/GD Open tracked replacement.docx',
    expectedHighlights: [],
  },
  {
    document: 'test-docs/comments-tcs/GD Tracked style change with thread.docx',
    expectedHighlights: [],
  },
  {
    document: 'test-docs/comments-tcs/GD Tracked style change.docx',
    expectedHighlights: [],
  },
  {
    document: 'test-docs/comments-tcs/SD Open comment with thread.docx',
    expectedHighlights: [],
  },
  {
    document: 'test-docs/comments-tcs/SD Open comment.docx',
    expectedHighlights: [],
  },
  {
    document: 'test-docs/comments-tcs/SD Open tracked addition with thread.docx',
    expectedHighlights: [],
  },
  {
    document: 'test-docs/comments-tcs/SD Open tracked addition.docx',
    expectedHighlights: [],
  },
  {
    document: 'test-docs/comments-tcs/SD Open tracked deletion with thread.docx',
    expectedHighlights: [],
  },
  {
    document: 'test-docs/comments-tcs/SD Open tracked deletion.docx',
    expectedHighlights: [],
  },
  {
    document: 'test-docs/comments-tcs/SD Open tracked replacement with thread.docx',
    expectedHighlights: [],
  },
  {
    document: 'test-docs/comments-tcs/SD Open tracked replacement.docx',
    expectedHighlights: [],
  },
  {
    document: 'test-docs/comments-tcs/SD Tracked style change with thread.docx',
    expectedHighlights: [],
  },
  {
    document: 'test-docs/comments-tcs/SD Tracked style change.docx',
    expectedHighlights: [],
  },
  {
    document: 'test-docs/comments-tcs/Word Open comment with thread.docx',
    expectedHighlights: [],
  },
  {
    document: 'test-docs/comments-tcs/Word Open comment.docx',
    expectedHighlights: [],
  },
  {
    document: 'test-docs/comments-tcs/Word Open tracked addition.docx',
    expectedHighlights: [],
  },
  {
    document: 'test-docs/comments-tcs/Word Open tracked deletion.docx',
    expectedHighlights: [],
  },
  {
    document: 'test-docs/comments-tcs/Word Open tracked replacement.docx',
    expectedHighlights: [],
  },
  {
    document: 'test-docs/comments-tcs/Word Tracked style change.docx',
    expectedHighlights: [],
  },
];

function getExpectedComments(highlight: Highlight): ConversationItem[] {
  if (highlight.type === 'insertion') {
    return [{ comment: `Added: ${highlight.text}`, author: highlight.author }, ...highlight.comments];
  } else {
    return highlight.comments;
  }
}

async function matchHighlights(actualHighlights: Locator[], expectedHighlights: Highlight[]) {
  const remainder = [...expectedHighlights];
  const extraActual: string[] = [];
  const map = new Map<Highlight, Locator>();

  for (const actualHighlight of actualHighlights) {
    const actualText = await actualHighlight.textContent();
    const index = remainder.findIndex((expectedHighlight) => expectedHighlight.text === actualText);
    if (index === -1) {
      extraActual.push(actualText ?? '(null)');
      continue;
    }
    const [match] = remainder.splice(index, 1);
    map.set(match, actualHighlight);
  }

  expect(extraActual, { message: 'Found unexpected highlights in document' }).toEqual([]);
  expect(remainder, { message: 'Missing expected highlights in document' }).toEqual([]);

  return map;
}

async function expectConversation(commentsDialog: Locator, highlight: Highlight) {
  const conversations = await commentsDialog.locator('.conversation-item').all();
  const actualThread = await Promise.all(
    conversations.map(async (conversation) => ({
      author: await conversation.locator('.user-name').textContent(),
      comment: await conversation.locator('.comment-body').textContent(),
    })),
  );

  expect(actualThread).toEqual(getExpectedComments(highlight));
}

function buildTest(test: RegressionTest) {
  return defineStory({
    name: `regression-tests/${basename(test.document, '.docx')}`,
    description: 'Regression test for comments and track changes',
    startDocument: test.document,
    layout: true,
    comments: 'panel',
    hideCaret: true,
    hideSelection: false,

    async run(page, helpers): Promise<void> {
      const { step, waitForStable, captureError } = helpers;

      // Set a reasonable timeout for expectations
      page.setDefaultTimeout(2000);

      const expectedHighlights = test.expectedHighlights.map((b) => b.build());

      const trackedChanges = expectedHighlights.filter(isTrackedChange);
      const justComments = expectedHighlights.filter((item) => !isTrackedChange(item));

      const canvas = page.locator('.harness-main');
      let highlightMap: Map<Highlight, Locator>;

      const activeCommentsDialog = canvas.locator('.comments-dialog.is-active').filter({ visible: true });

      const openComments = async (actualHighlight: Locator, expectedHighlight: Highlight) => {
        await actualHighlight.click();

        // BUG: [SD-1902] Comments dialog doesn't become active after clicking an insertion.
        if (expectedHighlight.type === 'insertion') {
          await page.locator('.comments-dialog').filter({ visible: true }).click();
        }

        expect(activeCommentsDialog).toBeVisible();
        await waitForCommentPanelStable(page);
      };

      const tryStep = async <T>(label: string, action: () => Promise<T> | T) => {
        try {
          return await step(label, action);
        } catch (e) {
          await captureError(e as Error);
        }
      };

      await tryStep('expect comment(s) to be visible', async () => {
        const actualHighlights = await canvas.locator('.superdoc-comment-highlight').all();

        highlightMap = await matchHighlights(actualHighlights, expectedHighlights);

        for (const [expectedHighlight, actualHighlight] of highlightMap.entries()) {
          await openComments(actualHighlight, expectedHighlight);
          await expectConversation(activeCommentsDialog, expectedHighlight);
        }
      });

      await tryStep('preserved on export in Google Docs', async () => {});

      await tryStep('preserved on export in Word', async () => {});

      if (justComments.length > 0) {
        // BUG: [SD-1428] Can't resolve comments
        await tryStep('can resolve', async () => {
          await reloadDocument(page);
          for (const highlight of justComments) {
            const highlightLocator = highlightMap.get(highlight)!;
            await openComments(highlightLocator, highlight);
            await activeCommentsDialog.getByLabel('Resolve').click();
            expect(activeCommentsDialog).not.toBeVisible();
            await waitForStable();
            expect(highlightLocator).not.toBeVisible();
          }
        });

        await tryStep('preserve resolved in Google Docs', async () => {});

        await tryStep('preserve resolved in Word', async () => {});
      }

      if (trackedChanges.length > 0) {
        await tryStep('can accept', async () => {
          await reloadDocument(page);
          for (const highlight of trackedChanges) {
            const highlightLocator = highlightMap.get(highlight)!;
            await openComments(highlightLocator, highlight);
            await activeCommentsDialog.getByLabel('Accept').click();
            expect(activeCommentsDialog).not.toBeVisible();
            await waitForStable();

            if (highlight.type === 'insertion') {
              expect(highlightLocator).toBeVisible();
            }
          }
        });

        await tryStep('preserve accepted in Google Docs', async () => {});

        await tryStep('preserve accepted in Word', async () => {});

        await tryStep('can reject', async () => {
          await reloadDocument(page);
          for (const highlight of trackedChanges) {
            const highlightLocator = highlightMap.get(highlight)!;
            await openComments(highlightLocator, highlight);
            await activeCommentsDialog.getByLabel('Reject').click();
            expect(activeCommentsDialog).not.toBeVisible();
            await waitForStable();

            if (highlight.type === 'insertion') {
              expect(highlightLocator).not.toBeVisible();
            }
          }
        });

        await tryStep('preserve rejected in Google Docs', async () => {});

        await tryStep('preserve rejected in Word', async () => {});
      }

      await tryStep('can reply', async () => {
        await reloadDocument(page);
        for (const highlight of expectedHighlights) {
          const highlightLocator = highlightMap.get(highlight)!;
          await openComments(highlightLocator, highlight);
          await activeCommentsDialog.locator('[contenteditable]').fill('New comment text!');
          await activeCommentsDialog.getByRole('button', { name: 'Comment' }).click();
        }
      });

      await tryStep('preserve replies in Google Docs', async () => {
        await withGoogleDocs(page.context().browser()!, async ({ page }) => {
          // Assert that replies show up in Google Docs
        });
      });

      await tryStep('preserve replies in Word', async () => {});
    },
  });
}

export default TESTS.map((testDescriptor) => buildTest(testDescriptor));
