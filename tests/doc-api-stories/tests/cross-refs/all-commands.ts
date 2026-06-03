import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { corpusDoc, unwrap, useStoryHarness } from '../harness';

const ALL_CROSS_REFS_COMMAND_IDS = [
  'crossRefs.list',
  'crossRefs.get',
  'crossRefs.insert',
  'crossRefs.rebuild',
  'crossRefs.remove',
] as const;

type CrossRefsCommandId = (typeof ALL_CROSS_REFS_COMMAND_IDS)[number];

type CrossRefAddress = {
  kind: 'inline';
  nodeType: 'crossRef';
  anchor: {
    start: { blockId: string; offset: number };
    end: { blockId: string; offset: number };
  };
};

type BookmarkAddress = {
  kind: 'entity';
  entityType: 'bookmark';
  name: string;
};

type TextTarget = {
  kind: 'text';
  segments: Array<{ blockId: string; range: { start: number; end: number } }>;
};

type CrossRefFixture = {
  target?: CrossRefAddress;
  bookmarkTarget?: BookmarkAddress;
  textTarget?: TextTarget;
};

type Scenario = {
  operationId: CrossRefsCommandId;
  prepare?: (sessionId: string) => Promise<CrossRefFixture | null>;
  run: (sessionId: string, fixture: CrossRefFixture | null) => Promise<any>;
};

const BASE_DOC = corpusDoc('basic/longer-header.docx');

describe('document-api story: all crossRefs commands', () => {
  const { client, outPath } = useStoryHarness('cross-refs/all-commands', {
    preserveResults: true,
  });

  const api = client as any;

  const readOperationIds = new Set<CrossRefsCommandId>(['crossRefs.list', 'crossRefs.get']);

  function slug(operationId: CrossRefsCommandId): string {
    return operationId.replace(/\./g, '-');
  }

  function makeSessionId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function sourceDocNameFor(operationId: CrossRefsCommandId): string {
    return `${slug(operationId)}-source.docx`;
  }

  function resultDocNameFor(operationId: CrossRefsCommandId): string {
    return `${slug(operationId)}.docx`;
  }

  function readOutputNameFor(operationId: CrossRefsCommandId): string {
    return `${slug(operationId)}-read-output.json`;
  }

  async function saveReadOutput(operationId: CrossRefsCommandId, result: any): Promise<void> {
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

  async function saveSource(sessionId: string, operationId: CrossRefsCommandId): Promise<void> {
    await callDocOperation('save', {
      sessionId,
      out: outPath(sourceDocNameFor(operationId)),
      force: true,
    });
  }

  async function saveResult(sessionId: string, operationId: CrossRefsCommandId): Promise<void> {
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

  function assertReadOutput(operationId: CrossRefsCommandId, result: any): void {
    if (operationId === 'crossRefs.list') {
      expect(Array.isArray(result?.items)).toBe(true);
      expect(typeof result?.total).toBe('number');
      return;
    }

    if (operationId === 'crossRefs.get') {
      expect(result?.address?.kind).toBe('inline');
      expect(result?.address?.nodeType).toBe('crossRef');
      expect(result?.target).toBeDefined();
      return;
    }

    throw new Error(`Unexpected read assertion branch for ${operationId}.`);
  }

  function requireFixture(operationId: CrossRefsCommandId, fixture: CrossRefFixture | null): CrossRefFixture {
    if (!fixture) throw new Error(`${operationId} requires a crossRef fixture.`);
    return fixture;
  }

  function makeTextTarget(blockId: string, end: number): TextTarget {
    return {
      kind: 'text',
      segments: [{ blockId, range: { start: 0, end } }],
    };
  }

  function extractCrossRefAddress(item: any): CrossRefAddress | null {
    return (item?.address ?? item?.domain?.address ?? null) as CrossRefAddress | null;
  }

  async function seedTextTarget(sessionId: string, text: string): Promise<TextTarget> {
    const insertResult = await callDocOperation<any>('insert', { sessionId, value: text });
    const blockId = insertResult?.target?.blockId;
    if (typeof blockId !== 'string' || blockId.length === 0) {
      throw new Error('insert did not return a blockId for crossRef text targeting.');
    }
    return makeTextTarget(blockId, Math.max(1, Math.min(12, text.length)));
  }

  async function insertBookmarkTarget(sessionId: string, name: string): Promise<BookmarkAddress> {
    const at = await seedTextTarget(sessionId, `Bookmark target text for ${name}.`);
    const insertResult = await callDocOperation<any>('bookmarks.insert', {
      sessionId,
      name,
      at,
    });
    assertMutationSuccess('bookmarks.insert', insertResult);
    return { kind: 'entity', entityType: 'bookmark', name };
  }

  async function insertCrossRef(sessionId: string): Promise<CrossRefAddress> {
    const bookmarkTarget = await insertBookmarkTarget(sessionId, `xref-bookmark-${Date.now()}`);
    const at = await seedTextTarget(sessionId, 'Cross-reference host text.');
    const insertResult = await callDocOperation<any>('crossRefs.insert', {
      sessionId,
      at,
      target: {
        kind: 'bookmark',
        name: bookmarkTarget.name,
      },
      display: 'content',
    });
    assertMutationSuccess('crossRefs.insert', insertResult);

    const listResult = await callDocOperation<any>('crossRefs.list', { sessionId });
    const address = extractCrossRefAddress(listResult?.items?.[0]);
    if (!address) {
      throw new Error('Unable to resolve inserted cross-reference address from crossRefs.list.');
    }
    return address;
  }

  const scenarios: Scenario[] = [
    {
      operationId: 'crossRefs.list',
      prepare: async (sessionId) => {
        await insertCrossRef(sessionId);
        return null;
      },
      run: async (sessionId) => {
        const listResult = await callDocOperation<any>('crossRefs.list', { sessionId });
        expect(listResult?.total).toBeGreaterThanOrEqual(1);
        return listResult;
      },
    },
    {
      operationId: 'crossRefs.get',
      prepare: async (sessionId) => {
        const target = await insertCrossRef(sessionId);
        return { target };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('crossRefs.get', fixture);
        if (!f.target) throw new Error('crossRefs.get requires a cross-reference target fixture.');
        return callDocOperation<any>('crossRefs.get', { sessionId, target: f.target });
      },
    },
    {
      operationId: 'crossRefs.insert',
      prepare: async (sessionId) => {
        const bookmarkTarget = await insertBookmarkTarget(sessionId, `xref-insert-bookmark-${Date.now()}`);
        const textTarget = await seedTextTarget(sessionId, 'Insert a cross-reference in this text.');
        return { bookmarkTarget, textTarget };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('crossRefs.insert', fixture);
        if (!f.bookmarkTarget || !f.textTarget) {
          throw new Error('crossRefs.insert requires bookmark and text target fixtures.');
        }

        const insertResult = await callDocOperation<any>('crossRefs.insert', {
          sessionId,
          at: f.textTarget,
          target: {
            kind: 'bookmark',
            name: f.bookmarkTarget.name,
          },
          display: 'content',
        });

        const listResult = await callDocOperation<any>('crossRefs.list', { sessionId });
        expect(listResult?.total).toBeGreaterThanOrEqual(1);

        return insertResult;
      },
    },
    {
      operationId: 'crossRefs.rebuild',
      prepare: async (sessionId) => {
        const target = await insertCrossRef(sessionId);
        return { target };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('crossRefs.rebuild', fixture);
        if (!f.target) throw new Error('crossRefs.rebuild requires a cross-reference target fixture.');
        return callDocOperation<any>('crossRefs.rebuild', {
          sessionId,
          target: f.target,
        });
      },
    },
    {
      operationId: 'crossRefs.remove',
      prepare: async (sessionId) => {
        const target = await insertCrossRef(sessionId);
        return { target };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('crossRefs.remove', fixture);
        if (!f.target) throw new Error('crossRefs.remove requires a cross-reference target fixture.');

        const removeResult = await callDocOperation<any>('crossRefs.remove', {
          sessionId,
          target: f.target,
        });

        const listResult = await callDocOperation<any>('crossRefs.list', { sessionId });
        const stillPresent = (listResult?.items ?? []).some(
          (item: any) => extractCrossRefAddress(item)?.anchor?.start?.blockId === f.target?.anchor?.start?.blockId,
        );
        expect(stillPresent).toBe(false);

        return removeResult;
      },
    },
  ];

  it('covers every crossRefs command currently defined on this branch', () => {
    const scenarioIds = scenarios.map((scenario) => scenario.operationId);
    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
    expect(new Set(scenarioIds)).toEqual(new Set(ALL_CROSS_REFS_COMMAND_IDS));
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
