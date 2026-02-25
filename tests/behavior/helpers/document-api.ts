import type { Page } from '@playwright/test';
import type {
  TextAddress,
  MatchContext,
  TrackChangeType,
  CommentsListResult,
  TrackChangesListResult,
  TextMutationReceipt,
} from '@superdoc/document-api';
import type { ListsListResult } from '@superdoc/document-api';

export type { TextAddress, TextMutationReceipt, TrackChangeType };
export type ChangeMode = 'direct' | 'tracked';

export async function assertDocumentApiReady(page: Page): Promise<void> {
  await page.evaluate(() => {
    const docApi = (window as any).editor?.doc;
    if (!docApi) {
      throw new Error('Document API is unavailable: expected editor.doc.');
    }

    const required: Array<[string, unknown]> = [
      ['editor.doc.getText', docApi.getText],
      ['editor.doc.find', docApi.find],
      ['editor.doc.comments.list', docApi.comments?.list],
      ['editor.doc.comments.create', docApi.comments?.create],
      ['editor.doc.trackChanges.list', docApi.trackChanges?.list],
    ];

    for (const [methodPath, method] of required) {
      if (typeof method !== 'function') {
        throw new Error(`Document API is unavailable: expected ${methodPath}().`);
      }
    }
  });
}

export async function getDocumentText(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).editor.doc.getText({}));
}

export async function findTextContexts(
  page: Page,
  pattern: string,
  options: { mode?: 'contains' | 'exact' | 'regex'; caseSensitive?: boolean } = {},
): Promise<MatchContext[]> {
  return page.evaluate(
    ({ searchPattern, searchMode, caseSensitive }) => {
      const result = (window as any).editor.doc.find({
        select: { type: 'text', pattern: searchPattern, mode: searchMode, caseSensitive },
      });
      return result?.context ?? [];
    },
    {
      searchPattern: pattern,
      searchMode: options.mode ?? 'contains',
      caseSensitive: options.caseSensitive ?? true,
    },
  );
}

export async function findFirstTextRange(
  page: Page,
  pattern: string,
  options: {
    occurrence?: number;
    rangeIndex?: number;
    mode?: 'contains' | 'exact' | 'regex';
    caseSensitive?: boolean;
  } = {},
): Promise<TextAddress | null> {
  const contexts = await findTextContexts(page, pattern, {
    mode: options.mode,
    caseSensitive: options.caseSensitive,
  });
  const context = contexts[options.occurrence ?? 0];
  return context?.textRanges?.[options.rangeIndex ?? 0] ?? null;
}

export async function addComment(page: Page, input: { target: TextAddress; text: string }): Promise<void> {
  await page.evaluate((payload) => (window as any).editor.doc.comments.create(payload), input);
}

export async function addCommentByText(
  page: Page,
  input: {
    pattern: string;
    text: string;
    occurrence?: number;
    mode?: 'contains' | 'exact' | 'regex';
    caseSensitive?: boolean;
  },
): Promise<string> {
  const commentId = await page.evaluate((payload) => {
    const docApi = (window as any).editor.doc;
    type ReceiptLike = {
      success?: boolean;
      inserted?: Array<{ entityType?: string; entityId?: string }>;
      failure?: { code?: string; message?: string };
    };
    const found = docApi.find({
      select: {
        type: 'text',
        pattern: payload.pattern,
        mode: payload.mode ?? 'contains',
        caseSensitive: payload.caseSensitive ?? true,
      },
    });
    const target = found?.context?.[payload.occurrence ?? 0]?.textRanges?.[0];
    if (!target) throw new Error(`No text range found for pattern "${payload.pattern}".`);
    const receipt = docApi.comments.create({ target, text: payload.text }) as ReceiptLike | undefined;
    if (!receipt || receipt.success !== true) {
      const failureCode = receipt?.failure?.code ?? 'UNKNOWN';
      const failureMessage = receipt?.failure?.message ?? 'comments.create returned a non-success receipt';
      throw new Error(`comments.create failed: ${failureCode} ${failureMessage}`);
    }
    const insertedEntity = Array.isArray(receipt.inserted)
      ? receipt.inserted.find((entry) => entry?.entityType === 'comment' && typeof entry?.entityId === 'string')
      : null;
    if (!insertedEntity) {
      throw new Error('comments.create succeeded but no inserted comment entityId was returned.');
    }
    return insertedEntity.entityId as string;
  }, input);
  return commentId;
}

export async function editComment(page: Page, input: { commentId: string; text: string }): Promise<void> {
  await page.evaluate((payload) => (window as any).editor.doc.comments.patch(payload), input);
}

export async function replyToComment(page: Page, input: { parentCommentId: string; text: string }): Promise<void> {
  await page.evaluate((payload) => (window as any).editor.doc.comments.create(payload), input);
}

export async function resolveComment(page: Page, input: { commentId: string }): Promise<void> {
  await page.evaluate(
    (payload) => (window as any).editor.doc.comments.patch({ commentId: payload.commentId, status: 'resolved' }),
    input,
  );
}

export async function listComments(
  page: Page,
  query: { includeResolved?: boolean } = { includeResolved: true },
): Promise<CommentsListResult> {
  return page.evaluate((input) => (window as any).editor.doc.comments.list(input), query);
}

export async function insertText(
  page: Page,
  input: { text: string; target?: TextAddress },
  options: { changeMode?: ChangeMode; dryRun?: boolean } = {},
): Promise<TextMutationReceipt> {
  return page.evaluate(({ payload, opts }) => (window as any).editor.doc.insert(payload, opts), {
    payload: input,
    opts: options,
  });
}

export async function replaceText(
  page: Page,
  input: { target: TextAddress; text: string },
  options: { changeMode?: ChangeMode; dryRun?: boolean } = {},
): Promise<TextMutationReceipt> {
  return page.evaluate(({ payload, opts }) => (window as any).editor.doc.replace(payload, opts), {
    payload: input,
    opts: options,
  });
}

export async function deleteText(
  page: Page,
  input: { target: TextAddress },
  options: { changeMode?: ChangeMode; dryRun?: boolean } = {},
): Promise<TextMutationReceipt> {
  return page.evaluate(({ payload, opts }) => (window as any).editor.doc.delete(payload, opts), {
    payload: input,
    opts: options,
  });
}

export async function listTrackChanges(
  page: Page,
  query: { limit?: number; offset?: number; type?: TrackChangeType } = {},
): Promise<TrackChangesListResult> {
  return page.evaluate((input) => (window as any).editor.doc.trackChanges.list(input), query);
}

export async function listItems(page: Page): Promise<ListsListResult> {
  return page.evaluate(() => (window as any).editor.doc.lists.list({}));
}

export async function acceptTrackChange(page: Page, input: { id: string }): Promise<void> {
  await page.evaluate(
    (payload) => (window as any).editor.doc.review.decide({ decision: 'accept', target: { id: payload.id } }),
    input,
  );
}

export async function rejectTrackChange(page: Page, input: { id: string }): Promise<void> {
  await page.evaluate(
    (payload) => (window as any).editor.doc.review.decide({ decision: 'reject', target: { id: payload.id } }),
    input,
  );
}

export async function acceptAllTrackChanges(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).editor.doc.review.decide({ decision: 'accept', target: { scope: 'all' } }));
}

export async function rejectAllTrackChanges(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).editor.doc.review.decide({ decision: 'reject', target: { scope: 'all' } }));
}
