import type { Page } from '@playwright/test';
import type {
  TextAddress,
  MatchContext,
  TrackChangeType,
  CommentsListResult,
  TrackChangesListResult,
  TextMutationReceipt,
  ListsListQuery,
  ListsSetTypeInput,
  ListsSetValueInput,
  ListsContinuePreviousInput,
  ListsSeparateInput,
  ListsMutateItemResult,
  ListsSeparateResult,
  ListsListResult,
} from '@superdoc/document-api';

export type { TextAddress, TextMutationReceipt, TrackChangeType };
export type ChangeMode = 'direct' | 'tracked';
type MutationOptions = { changeMode?: ChangeMode; dryRun?: boolean; expectedRevision?: number };
type ListMutationName = 'setValue' | 'continuePrevious' | 'setType' | 'separate';

async function invokeListMutation<TInput>(
  page: Page,
  operation: ListMutationName,
  input: TInput,
  options: MutationOptions = {},
): Promise<ListsMutateItemResult> {
  return page.evaluate(
    ({ op, payload, opts }) => {
      const listApi = (window as any).editor?.doc?.lists;
      if (!listApi) {
        throw new Error('Document API is unavailable: expected editor.doc.lists.');
      }

      const operationFn = listApi[op];
      if (typeof operationFn !== 'function') {
        throw new Error(`Document API is unavailable: expected editor.doc.lists.${op}().`);
      }

      return operationFn.call(listApi, payload, opts);
    },
    { op: operation, payload: input, opts: options },
  ) as Promise<ListsMutateItemResult>;
}

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
      const docApi = (window as any).editor.doc;
      const toRanges = (item: any): Array<{ kind: 'text'; blockId: string; range: { start: number; end: number } }> => {
        const blocks = Array.isArray(item?.blocks) ? item.blocks : [];
        const fromBlocks = blocks
          .map((block: any) => {
            const blockId = block?.blockId;
            const start = block?.range?.start;
            const end = block?.range?.end;
            if (typeof blockId !== 'string' || typeof start !== 'number' || typeof end !== 'number') return null;
            return { kind: 'text' as const, blockId, range: { start, end } };
          })
          .filter(Boolean);

        if (fromBlocks.length > 0) return fromBlocks;

        const legacyRanges = Array.isArray(item?.context?.textRanges) ? item.context.textRanges : [];
        return legacyRanges.filter(
          (range: any) =>
            range?.kind === 'text' &&
            typeof range?.blockId === 'string' &&
            typeof range?.range?.start === 'number' &&
            typeof range?.range?.end === 'number',
        );
      };

      const queryMatch = docApi?.query?.match;
      if (typeof queryMatch === 'function') {
        const result = queryMatch({
          select: {
            type: 'text',
            pattern: searchPattern,
            mode: searchMode === 'exact' ? 'contains' : searchMode,
            caseSensitive,
          },
          require: 'any',
        });
        const items = Array.isArray(result?.items) ? result.items : [];
        return items
          .map((item: any) => {
            const textRanges = toRanges(item);
            const address = item?.address ?? item?.context?.address;
            if (!address || textRanges.length === 0) return null;
            return {
              address,
              snippet: typeof item?.snippet === 'string' ? item.snippet : (item?.context?.snippet ?? ''),
              highlightRange:
                item?.highlightRange &&
                typeof item.highlightRange.start === 'number' &&
                typeof item.highlightRange.end === 'number'
                  ? item.highlightRange
                  : (item?.context?.highlightRange ?? { start: 0, end: 0 }),
              textRanges,
            };
          })
          .filter(Boolean);
      }

      // Legacy fallback
      const result = docApi.find({
        select: {
          type: 'text',
          pattern: searchPattern,
          mode: searchMode === 'exact' ? 'contains' : searchMode,
          caseSensitive,
        },
      });
      const items = Array.isArray(result?.items) ? result.items : [];
      if (items.length > 0) return items.map((item: any) => item?.context).filter(Boolean);
      return Array.isArray(result?.context) ? result.context : [];
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
  const target = await findFirstTextRange(page, input.pattern, {
    occurrence: input.occurrence,
    mode: input.mode,
    caseSensitive: input.caseSensitive,
  });
  if (!target) throw new Error(`No text range found for pattern "${input.pattern}".`);

  const commentId = await page.evaluate(
    (payload) => {
      const docApi = (window as any).editor.doc;
      type ReceiptLike = {
        success?: boolean;
        inserted?: Array<{ entityType?: string; entityId?: string }>;
        failure?: { code?: string; message?: string };
      };
      const receipt = docApi.comments.create({ target: payload.target, text: payload.text }) as ReceiptLike | undefined;
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
    },
    { target, text: input.text },
  );
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
  return page.evaluate((input) => {
    const result = (window as any).editor.doc.comments.list(input);
    if (Array.isArray(result?.matches)) {
      return result;
    }

    const discoveryItems = Array.isArray(result?.items) ? result.items : [];
    const matches = discoveryItems.map((item: any) => ({
      ...item,
      commentId: item?.commentId ?? item?.id ?? item?.address?.entityId,
    }));

    return { ...result, matches };
  }, query) as Promise<CommentsListResult>;
}

export async function insertText(
  page: Page,
  input: { value: string; target?: TextAddress; type?: 'text' | 'markdown' | 'html' },
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
  return page.evaluate((input) => {
    const result = (window as any).editor.doc.trackChanges.list(input);
    if (Array.isArray(result?.changes)) {
      return result;
    }

    const discoveryItems = Array.isArray(result?.items) ? result.items : [];
    const changes = discoveryItems.map((item: any) => ({
      ...item,
      id: item?.id ?? item?.address?.entityId,
    }));

    return { ...result, changes };
  }, query) as Promise<TrackChangesListResult>;
}

export async function listItems(page: Page, query: ListsListQuery = {}): Promise<ListsListResult> {
  return page.evaluate((input) => (window as any).editor.doc.lists.list(input), query);
}

export async function listSetValue(
  page: Page,
  input: ListsSetValueInput,
  options: MutationOptions = {},
): Promise<ListsMutateItemResult> {
  return invokeListMutation(page, 'setValue', input, options);
}

export async function listContinuePrevious(
  page: Page,
  input: ListsContinuePreviousInput,
  options: MutationOptions = {},
): Promise<ListsMutateItemResult> {
  return invokeListMutation(page, 'continuePrevious', input, options);
}

export async function listSetType(
  page: Page,
  input: ListsSetTypeInput,
  options: MutationOptions = {},
): Promise<ListsMutateItemResult> {
  return invokeListMutation(page, 'setType', input, options);
}

export async function listSeparate(
  page: Page,
  input: ListsSeparateInput,
  options: MutationOptions = {},
): Promise<ListsSeparateResult> {
  return invokeListMutation(page, 'separate', input, options) as Promise<ListsSeparateResult>;
}

export async function acceptTrackChange(page: Page, input: { id: string }): Promise<void> {
  await page.evaluate(
    (payload) => (window as any).editor.doc.trackChanges.decide({ decision: 'accept', target: { id: payload.id } }),
    input,
  );
}

export async function rejectTrackChange(page: Page, input: { id: string }): Promise<void> {
  await page.evaluate(
    (payload) => (window as any).editor.doc.trackChanges.decide({ decision: 'reject', target: { id: payload.id } }),
    input,
  );
}

export async function acceptAllTrackChanges(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as any).editor.doc.trackChanges.decide({ decision: 'accept', target: { scope: 'all' } }),
  );
}

export async function rejectAllTrackChanges(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as any).editor.doc.trackChanges.decide({ decision: 'reject', target: { scope: 'all' } }),
  );
}
