import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { corpusDoc, unwrap, useStoryHarness } from '../harness';

const ALL_BOOKMARK_COMMAND_IDS = [
  'bookmarks.list',
  'bookmarks.get',
  'bookmarks.insert',
  'bookmarks.rename',
  'bookmarks.remove',
] as const;

type BookmarkCommandId = (typeof ALL_BOOKMARK_COMMAND_IDS)[number];

type BookmarkAddress = {
  kind: 'entity';
  entityType: 'bookmark';
  name: string;
};

type TextTarget = {
  kind: 'text';
  segments: Array<{ blockId: string; range: { start: number; end: number } }>;
};

type BookmarkFixture = {
  target?: BookmarkAddress;
  textTarget?: TextTarget;
  name?: string;
};

type Scenario = {
  operationId: BookmarkCommandId;
  prepare?: (sessionId: string) => Promise<BookmarkFixture | null>;
  run: (sessionId: string, fixture: BookmarkFixture | null) => Promise<any>;
};

const BASE_DOC = corpusDoc('basic/longer-header.docx');

describe('document-api story: all bookmarks commands', () => {
  const { client, outPath } = useStoryHarness('bookmarks/all-commands', {
    preserveResults: true,
  });

  const api = client as any;

  const readOperationIds = new Set<BookmarkCommandId>(['bookmarks.list', 'bookmarks.get']);

  function slug(operationId: BookmarkCommandId): string {
    return operationId.replace(/\./g, '-');
  }

  function makeSessionId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function sourceDocNameFor(operationId: BookmarkCommandId): string {
    return `${slug(operationId)}-source.docx`;
  }

  function resultDocNameFor(operationId: BookmarkCommandId): string {
    return `${slug(operationId)}.docx`;
  }

  function readOutputNameFor(operationId: BookmarkCommandId): string {
    return `${slug(operationId)}-read-output.json`;
  }

  async function saveReadOutput(operationId: BookmarkCommandId, result: any): Promise<void> {
    await writeFile(
      outPath(readOutputNameFor(operationId)),
      `${JSON.stringify({ operationId, output: result }, null, 2)}\n`,
      'utf8',
    );
  }

  async function callDocOperation<T>(operationId: string, input: Record<string, unknown>): Promise<T> {
    const segments = operationId.split('.');
    let fn: any = api.doc;
    for (const segment of segments) fn = fn?.[segment];

    if (typeof fn !== 'function') {
      throw new Error(`Unknown doc operation: ${operationId}`);
    }

    return unwrap<T>(await fn(input));
  }

  async function saveSource(sessionId: string, operationId: BookmarkCommandId): Promise<void> {
    await callDocOperation('save', {
      sessionId,
      out: outPath(sourceDocNameFor(operationId)),
      force: true,
    });
  }

  async function saveResult(sessionId: string, operationId: BookmarkCommandId): Promise<void> {
    await callDocOperation('save', {
      sessionId,
      out: outPath(resultDocNameFor(operationId)),
      force: true,
    });
  }

  function assertMutationSuccess(operationId: string, result: any): void {
    if (result?.success === true || result?.receipt?.success === true) return;
    const code = result?.failure?.code ?? result?.receipt?.failure?.code ?? 'UNKNOWN';
    throw new Error(`${operationId} did not report success (code: ${code}).`);
  }

  function assertReadOutput(operationId: BookmarkCommandId, result: any): void {
    if (operationId === 'bookmarks.list') {
      expect(Array.isArray(result?.items)).toBe(true);
      expect(typeof result?.total).toBe('number');
      return;
    }

    if (operationId === 'bookmarks.get') {
      expect(result?.address?.kind).toBe('entity');
      expect(result?.address?.entityType).toBe('bookmark');
      expect(typeof result?.name).toBe('string');
      return;
    }

    throw new Error(`Unexpected read assertion branch for ${operationId}.`);
  }

  function requireFixture(operationId: BookmarkCommandId, fixture: BookmarkFixture | null): BookmarkFixture {
    if (!fixture) throw new Error(`${operationId} requires a bookmark fixture.`);
    return fixture;
  }

  function makeTextTarget(blockId: string, end: number): TextTarget {
    return {
      kind: 'text',
      segments: [{ blockId, range: { start: 0, end } }],
    };
  }

  function extractBookmarkAddress(item: any): BookmarkAddress | null {
    return (item?.address ?? item?.domain?.address ?? null) as BookmarkAddress | null;
  }

  async function seedTextTarget(sessionId: string, text: string): Promise<TextTarget> {
    const insertResult = await callDocOperation<any>('insert', { sessionId, value: text });
    const blockId = insertResult?.target?.blockId;
    if (typeof blockId !== 'string' || blockId.length === 0) {
      throw new Error('insert did not return a blockId for bookmark text targeting.');
    }
    return makeTextTarget(blockId, Math.max(1, Math.min(10, text.length)));
  }

  async function insertBookmark(sessionId: string, name: string): Promise<BookmarkAddress> {
    const at = await seedTextTarget(sessionId, `Bookmark host text for ${name}`);
    const insertResult = await callDocOperation<any>('bookmarks.insert', {
      sessionId,
      name,
      at,
    });
    assertMutationSuccess('bookmarks.insert', insertResult);

    const listResult = await callDocOperation<any>('bookmarks.list', { sessionId });
    const match = (listResult?.items ?? []).find((item: any) => {
      const address = extractBookmarkAddress(item);
      return address?.name === name;
    });
    const address = extractBookmarkAddress(match);
    if (!address) {
      throw new Error(`Unable to resolve inserted bookmark address for "${name}".`);
    }
    return address;
  }

  const scenarios: Scenario[] = [
    {
      operationId: 'bookmarks.list',
      prepare: async (sessionId) => {
        const name = `bm-list-${Date.now()}`;
        await insertBookmark(sessionId, name);
        return { name };
      },
      run: async (sessionId) => {
        const result = await callDocOperation<any>('bookmarks.list', { sessionId });
        expect(result?.total).toBeGreaterThanOrEqual(1);
        return result;
      },
    },
    {
      operationId: 'bookmarks.get',
      prepare: async (sessionId) => {
        const name = `bm-get-${Date.now()}`;
        const target = await insertBookmark(sessionId, name);
        return { target, name };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('bookmarks.get', fixture);
        if (!f.target) throw new Error('bookmarks.get requires a bookmark target.');
        return callDocOperation<any>('bookmarks.get', { sessionId, target: f.target });
      },
    },
    {
      operationId: 'bookmarks.insert',
      prepare: async (sessionId) => {
        const textTarget = await seedTextTarget(sessionId, 'Bookmark insertion story text.');
        return { textTarget };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('bookmarks.insert', fixture);
        if (!f.textTarget) throw new Error('bookmarks.insert requires a text target fixture.');

        const name = `bm-insert-${Date.now()}`;
        const insertResult = await callDocOperation<any>('bookmarks.insert', {
          sessionId,
          name,
          at: f.textTarget,
        });

        const listResult = await callDocOperation<any>('bookmarks.list', { sessionId });
        const hasBookmark = (listResult?.items ?? []).some((item: any) => extractBookmarkAddress(item)?.name === name);
        expect(hasBookmark).toBe(true);

        return insertResult;
      },
    },
    {
      operationId: 'bookmarks.rename',
      prepare: async (sessionId) => {
        const name = `bm-rename-from-${Date.now()}`;
        const target = await insertBookmark(sessionId, name);
        return { target, name };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('bookmarks.rename', fixture);
        if (!f.target || !f.name) throw new Error('bookmarks.rename requires a bookmark target fixture.');

        const newName = `${f.name}-renamed`;
        const renameResult = await callDocOperation<any>('bookmarks.rename', {
          sessionId,
          target: f.target,
          newName,
        });

        const renamed = await callDocOperation<any>('bookmarks.get', {
          sessionId,
          target: { kind: 'entity', entityType: 'bookmark', name: newName },
        });
        expect(renamed?.name).toBe(newName);

        return renameResult;
      },
    },
    {
      operationId: 'bookmarks.remove',
      prepare: async (sessionId) => {
        const name = `bm-remove-${Date.now()}`;
        const target = await insertBookmark(sessionId, name);
        return { target, name };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('bookmarks.remove', fixture);
        if (!f.target || !f.name) throw new Error('bookmarks.remove requires a bookmark target fixture.');

        const removeResult = await callDocOperation<any>('bookmarks.remove', {
          sessionId,
          target: f.target,
        });

        const listResult = await callDocOperation<any>('bookmarks.list', { sessionId });
        const stillPresent = (listResult?.items ?? []).some(
          (item: any) => extractBookmarkAddress(item)?.name === f.name,
        );
        expect(stillPresent).toBe(false);

        return removeResult;
      },
    },
  ];

  it('covers every bookmarks command currently defined on this branch', () => {
    const scenarioIds = scenarios.map((scenario) => scenario.operationId);
    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
    expect(new Set(scenarioIds)).toEqual(new Set(ALL_BOOKMARK_COMMAND_IDS));
  });

  for (const scenario of scenarios) {
    it(`${scenario.operationId}: executes and saves source/result docs`, async () => {
      const sessionId = makeSessionId(slug(scenario.operationId));
      try {
        await callDocOperation('open', { sessionId, doc: BASE_DOC });

        const fixture = scenario.prepare ? await scenario.prepare(sessionId) : null;

        await saveSource(sessionId, scenario.operationId);

        const result = await scenario.run(sessionId, fixture);

        if (readOperationIds.has(scenario.operationId)) {
          assertReadOutput(scenario.operationId, result);
          await saveReadOutput(scenario.operationId, result);
        } else {
          assertMutationSuccess(scenario.operationId, result);
        }

        await saveResult(sessionId, scenario.operationId);
      } finally {
        await callDocOperation('close', { sessionId, discard: true }).catch(() => {});
      }
    });
  }
});
