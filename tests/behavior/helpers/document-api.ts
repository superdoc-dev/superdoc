import type { Page } from '@playwright/test';

export type TrackChangeType = 'insert' | 'delete' | 'format';
export type CommentStatus = 'open' | 'resolved' | string;
export type ChangeMode = 'direct' | 'tracked';

export interface TextRange {
  start: number;
  end: number;
}

export interface TextAddress {
  kind: 'text';
  blockId: string;
  range: TextRange;
}

export interface TextMatchContext {
  address?: unknown;
  textRanges: TextAddress[];
}

export interface CommentInfo {
  commentId: string;
  parentCommentId?: string;
  text?: string;
  status?: CommentStatus;
}

export interface CommentsListResult {
  matches: CommentInfo[];
  total: number;
}

export interface TrackChangeAddress {
  entityId: string;
}

export interface TrackChangeInfo {
  id: string;
  type?: TrackChangeType;
  excerpt?: string;
}

export interface TrackChangesListResult {
  matches: TrackChangeAddress[];
  changes: TrackChangeInfo[];
  total: number;
}

export interface ReceiptFailure {
  code: string;
  message: string;
  details?: unknown;
}

export interface TextMutationResolution {
  requestedTarget?: TextAddress;
  target: TextAddress;
  range: { from: number; to: number };
  text: string;
}

export type TextMutationReceipt =
  | {
      success: true;
      resolution: TextMutationResolution;
      inserted?: unknown[];
      updated?: unknown[];
      removed?: unknown[];
    }
  | {
      success: false;
      resolution: TextMutationResolution;
      failure: ReceiptFailure;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null;
}

function isTextRange(value: unknown): value is TextRange {
  if (!isRecord(value)) return false;
  return Number.isInteger(value.start) && Number.isInteger(value.end);
}

function isTextAddress(value: unknown): value is TextAddress {
  if (!isRecord(value)) return false;
  return value.kind === 'text' && typeof value.blockId === 'string' && isTextRange(value.range);
}

function isTextMutationResolution(value: unknown): value is TextMutationResolution {
  if (!isRecord(value)) return false;
  if (!isTextAddress(value.target)) return false;
  if (!isRecord(value.range)) return false;
  if (!Number.isInteger(value.range.from) || !Number.isInteger(value.range.to)) return false;
  if (typeof value.text !== 'string') return false;
  if (value.requestedTarget !== undefined && !isTextAddress(value.requestedTarget)) return false;
  return true;
}

function isReceiptFailure(value: unknown): value is ReceiptFailure {
  if (!isRecord(value)) return false;
  return typeof value.code === 'string' && typeof value.message === 'string';
}

function isTextMutationReceipt(value: unknown): value is TextMutationReceipt {
  if (!isRecord(value)) return false;
  if (value.success === true) {
    if (!isTextMutationResolution(value.resolution)) return false;
    if (value.inserted !== undefined && !Array.isArray(value.inserted)) return false;
    if (value.updated !== undefined && !Array.isArray(value.updated)) return false;
    if (value.removed !== undefined && !Array.isArray(value.removed)) return false;
    return true;
  }

  if (value.success === false) {
    return isTextMutationResolution(value.resolution) && isReceiptFailure(value.failure);
  }

  return false;
}

function assertMutationReceipt(value: unknown, operationPath: string): TextMutationReceipt {
  if (!isTextMutationReceipt(value)) {
    throw new Error(`Document API returned an unexpected receipt shape from ${operationPath}().`);
  }
  return value;
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
      ['editor.doc.comments.add', docApi.comments?.add],
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
  return page.evaluate(() => {
    const getText = (window as any).editor?.doc?.getText;
    if (typeof getText !== 'function') {
      throw new Error('Document API is unavailable: expected editor.doc.getText().');
    }
    return getText({});
  });
}

export async function findTextContexts(
  page: Page,
  pattern: string,
  options: { mode?: 'contains' | 'exact' | 'regex'; caseSensitive?: boolean } = {},
): Promise<TextMatchContext[]> {
  return page.evaluate(
    ({ searchPattern, searchMode, caseSensitive }) => {
      const find = (window as any).editor?.doc?.find;
      if (typeof find !== 'function') {
        throw new Error('Document API is unavailable: expected editor.doc.find().');
      }

      const result = find({
        select: {
          type: 'text',
          pattern: searchPattern,
          mode: searchMode,
          caseSensitive,
        },
      });

      const contexts = Array.isArray(result?.context) ? result.context : [];
      return contexts.map((entry: any) => ({
        address: entry?.address,
        textRanges: Array.isArray(entry?.textRanges) ? entry.textRanges : [],
      })) as TextMatchContext[];
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
  if (!context) return null;

  const range = context.textRanges[options.rangeIndex ?? 0];
  return (range as TextAddress | undefined) ?? null;
}

export async function addComment(page: Page, input: { target: TextAddress; text: string }): Promise<void> {
  await page.evaluate((payload) => {
    const add = (window as any).editor?.doc?.comments?.add;
    if (typeof add !== 'function') {
      throw new Error('Document API is unavailable: expected editor.doc.comments.add().');
    }
    add(payload);
  }, input);
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
): Promise<void> {
  await page.evaluate((payload) => {
    const docApi = (window as any).editor?.doc;
    if (!docApi?.find || !docApi?.comments?.add) {
      throw new Error('Document API is unavailable: expected editor.doc.find/comments.add().');
    }

    const found = docApi.find({
      select: {
        type: 'text',
        pattern: payload.pattern,
        mode: payload.mode ?? 'contains',
        caseSensitive: payload.caseSensitive ?? true,
      },
    });

    const contexts = Array.isArray(found?.context) ? found.context : [];
    const context = contexts[payload.occurrence ?? 0];
    const target = Array.isArray(context?.textRanges) ? context.textRanges[0] : null;
    if (!target) {
      throw new Error(`No text range found for pattern "${payload.pattern}".`);
    }

    docApi.comments.add({ target, text: payload.text });
  }, input);
}

export async function editComment(page: Page, input: { commentId: string; text: string }): Promise<void> {
  await page.evaluate((payload) => {
    const edit = (window as any).editor?.doc?.comments?.edit;
    if (typeof edit !== 'function') {
      throw new Error('Document API is unavailable: expected editor.doc.comments.edit().');
    }
    edit(payload);
  }, input);
}

export async function replyToComment(page: Page, input: { parentCommentId: string; text: string }): Promise<void> {
  await page.evaluate((payload) => {
    const reply = (window as any).editor?.doc?.comments?.reply;
    if (typeof reply !== 'function') {
      throw new Error('Document API is unavailable: expected editor.doc.comments.reply().');
    }
    reply(payload);
  }, input);
}

export async function resolveComment(page: Page, input: { commentId: string }): Promise<void> {
  await page.evaluate((payload) => {
    const resolve = (window as any).editor?.doc?.comments?.resolve;
    if (typeof resolve !== 'function') {
      throw new Error('Document API is unavailable: expected editor.doc.comments.resolve().');
    }
    resolve(payload);
  }, input);
}

export async function listComments(
  page: Page,
  query: { includeResolved?: boolean } = { includeResolved: true },
): Promise<CommentsListResult> {
  return page.evaluate((input) => {
    const list = (window as any).editor?.doc?.comments?.list;
    if (typeof list !== 'function') {
      throw new Error('Document API is unavailable: expected editor.doc.comments.list().');
    }

    const result = list(input);
    const matches = Array.isArray(result?.matches) ? result.matches : [];
    const normalized: CommentInfo[] = matches
      .map((entry: any) => {
        const commentId = entry?.commentId;
        if (typeof commentId !== 'string') return null;
        return {
          commentId,
          parentCommentId: typeof entry?.parentCommentId === 'string' ? entry.parentCommentId : undefined,
          text: typeof entry?.text === 'string' ? entry.text : undefined,
          status: typeof entry?.status === 'string' ? entry.status : undefined,
        } satisfies CommentInfo;
      })
      .filter((entry: CommentInfo | null): entry is CommentInfo => entry != null);
    const total = typeof result?.total === 'number' ? result.total : normalized.length;

    return {
      matches: normalized,
      total,
    } satisfies CommentsListResult;
  }, query);
}

export async function insertText(
  page: Page,
  input: { text: string; target?: TextAddress },
  options: { changeMode?: ChangeMode; dryRun?: boolean } = {},
): Promise<TextMutationReceipt> {
  const receipt = await page.evaluate(
    ({ payload, operationOptions }) => {
      const insert = (window as any).editor?.doc?.insert;
      if (typeof insert !== 'function') {
        throw new Error('Document API is unavailable: expected editor.doc.insert().');
      }
      return insert(payload, operationOptions);
    },
    { payload: input, operationOptions: options },
  );

  return assertMutationReceipt(receipt, 'editor.doc.insert');
}

export async function replaceText(
  page: Page,
  input: { target: TextAddress; text: string },
  options: { changeMode?: ChangeMode; dryRun?: boolean } = {},
): Promise<TextMutationReceipt> {
  const receipt = await page.evaluate(
    ({ payload, operationOptions }) => {
      const replace = (window as any).editor?.doc?.replace;
      if (typeof replace !== 'function') {
        throw new Error('Document API is unavailable: expected editor.doc.replace().');
      }
      return replace(payload, operationOptions);
    },
    { payload: input, operationOptions: options },
  );

  return assertMutationReceipt(receipt, 'editor.doc.replace');
}

export async function deleteText(
  page: Page,
  input: { target: TextAddress },
  options: { changeMode?: ChangeMode; dryRun?: boolean } = {},
): Promise<TextMutationReceipt> {
  const receipt = await page.evaluate(
    ({ payload, operationOptions }) => {
      const remove = (window as any).editor?.doc?.delete;
      if (typeof remove !== 'function') {
        throw new Error('Document API is unavailable: expected editor.doc.delete().');
      }
      return remove(payload, operationOptions);
    },
    { payload: input, operationOptions: options },
  );

  return assertMutationReceipt(receipt, 'editor.doc.delete');
}

export async function listTrackChanges(
  page: Page,
  query: { limit?: number; offset?: number; type?: TrackChangeType } = {},
): Promise<TrackChangesListResult> {
  return page.evaluate((input) => {
    const list = (window as any).editor?.doc?.trackChanges?.list;
    if (typeof list !== 'function') {
      throw new Error('Document API is unavailable: expected editor.doc.trackChanges.list().');
    }

    const result = list(input);

    const matches = Array.isArray(result?.matches) ? result.matches : [];
    const normalizedMatches = matches
      .map((entry: any) => {
        const entityId = entry?.entityId;
        if (typeof entityId !== 'string') return null;
        return { entityId } satisfies TrackChangeAddress;
      })
      .filter((entry: TrackChangeAddress | null): entry is TrackChangeAddress => entry != null);

    const changes = Array.isArray(result?.changes) ? result.changes : [];
    const normalizedChanges = changes
      .map((entry: any) => {
        const id = typeof entry?.id === 'string' ? entry.id : undefined;
        if (!id) return null;

        return {
          id,
          type:
            entry?.type === 'insert' || entry?.type === 'delete' || entry?.type === 'format'
              ? (entry.type as TrackChangeType)
              : undefined,
          excerpt: typeof entry?.excerpt === 'string' ? entry.excerpt : undefined,
        } satisfies TrackChangeInfo;
      })
      .filter((entry: TrackChangeInfo | null): entry is TrackChangeInfo => entry != null);

    const total =
      typeof result?.total === 'number' ? result.total : Math.max(normalizedMatches.length, normalizedChanges.length);

    return {
      matches: normalizedMatches,
      changes: normalizedChanges,
      total,
    } satisfies TrackChangesListResult;
  }, query);
}

export interface ListItemInfo {
  kind?: string;
  marker?: string;
  level?: number;
}

export interface ListItemsResult {
  items: ListItemInfo[];
  total: number;
}

export async function listItems(page: Page): Promise<ListItemsResult> {
  return page.evaluate(() => {
    const listsApi = (window as any).editor?.doc?.lists;
    if (typeof listsApi?.list !== 'function') {
      throw new Error('Document API is unavailable: expected editor.doc.lists.list().');
    }

    const result = listsApi.list({});
    const items = Array.isArray(result?.items) ? result.items : [];
    const normalized = items
      .map((item: any) => ({
        kind: typeof item?.kind === 'string' ? item.kind : undefined,
        marker: typeof item?.marker === 'string' ? item.marker : undefined,
        level: Number.isInteger(item?.level) ? item.level : undefined,
      }))
      .filter((item: ListItemInfo) => item.kind || item.marker || item.level !== undefined);

    return {
      items: normalized,
      total: typeof result?.total === 'number' ? result.total : normalized.length,
    } satisfies ListItemsResult;
  });
}

export async function acceptTrackChange(page: Page, input: { id: string }): Promise<void> {
  await page.evaluate((payload) => {
    const accept = (window as any).editor?.doc?.trackChanges?.accept;
    if (typeof accept !== 'function') {
      throw new Error('Document API is unavailable: expected editor.doc.trackChanges.accept().');
    }
    accept(payload);
  }, input);
}

export async function rejectTrackChange(page: Page, input: { id: string }): Promise<void> {
  await page.evaluate((payload) => {
    const reject = (window as any).editor?.doc?.trackChanges?.reject;
    if (typeof reject !== 'function') {
      throw new Error('Document API is unavailable: expected editor.doc.trackChanges.reject().');
    }
    reject(payload);
  }, input);
}

export async function acceptAllTrackChanges(page: Page): Promise<void> {
  await page.evaluate(() => {
    const acceptAll = (window as any).editor?.doc?.trackChanges?.acceptAll;
    if (typeof acceptAll !== 'function') {
      throw new Error('Document API is unavailable: expected editor.doc.trackChanges.acceptAll().');
    }
    acceptAll({});
  });
}

export async function rejectAllTrackChanges(page: Page): Promise<void> {
  await page.evaluate(() => {
    const rejectAll = (window as any).editor?.doc?.trackChanges?.rejectAll;
    if (typeof rejectAll !== 'function') {
      throw new Error('Document API is unavailable: expected editor.doc.trackChanges.rejectAll().');
    }
    rejectAll({});
  });
}
