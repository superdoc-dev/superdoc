import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { corpusDoc, unwrap, useStoryHarness } from '../harness';

const ALL_INDEX_COMMAND_IDS = [
  'index.list',
  'index.get',
  'index.insert',
  'index.configure',
  'index.rebuild',
  'index.remove',
  'index.entries.list',
  'index.entries.get',
  'index.entries.insert',
  'index.entries.update',
  'index.entries.remove',
] as const;

type IndexCommandId = (typeof ALL_INDEX_COMMAND_IDS)[number];

type IndexAddress = {
  kind: 'block';
  nodeType: 'index';
  nodeId: string;
};

type IndexEntryAddress = {
  kind: 'inline';
  nodeType: 'indexEntry';
  anchor: {
    start: { blockId: string; offset: number };
    end: { blockId: string; offset: number };
  };
};

type TextTarget = {
  kind: 'text';
  segments: Array<{ blockId: string; range: { start: number; end: number } }>;
};

type IndexFixture = {
  indexTarget?: IndexAddress;
  entryTarget?: IndexEntryAddress;
  textTarget?: TextTarget;
  beforeTotal?: number;
};

type Scenario = {
  operationId: IndexCommandId;
  prepare?: (sessionId: string) => Promise<IndexFixture | null>;
  run: (sessionId: string, fixture: IndexFixture | null) => Promise<any>;
};

const BASE_DOC = corpusDoc('basic/longer-header.docx');

describe('document-api story: all index commands', () => {
  const { client, outPath } = useStoryHarness('index/all-commands', {
    preserveResults: true,
  });

  const api = client as any;

  const readOperationIds = new Set<IndexCommandId>([
    'index.list',
    'index.get',
    'index.entries.list',
    'index.entries.get',
  ]);

  function slug(operationId: IndexCommandId): string {
    return operationId.replace(/\./g, '-');
  }

  function makeSessionId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function sourceDocNameFor(operationId: IndexCommandId): string {
    return `${slug(operationId)}-source.docx`;
  }

  function resultDocNameFor(operationId: IndexCommandId): string {
    return `${slug(operationId)}.docx`;
  }

  function readOutputNameFor(operationId: IndexCommandId): string {
    return `${slug(operationId)}-read-output.json`;
  }

  async function saveReadOutput(operationId: IndexCommandId, result: any): Promise<void> {
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

  async function saveSource(sessionId: string, operationId: IndexCommandId): Promise<void> {
    await callDocOperation('save', {
      sessionId,
      out: outPath(sourceDocNameFor(operationId)),
      force: true,
    });
  }

  async function saveResult(sessionId: string, operationId: IndexCommandId): Promise<void> {
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

  function assertReadOutput(operationId: IndexCommandId, result: any): void {
    if (operationId === 'index.list') {
      expect(Array.isArray(result?.items)).toBe(true);
      expect(typeof result?.total).toBe('number');
      return;
    }

    if (operationId === 'index.get') {
      expect(result?.address?.kind).toBe('block');
      expect(result?.address?.nodeType).toBe('index');
      return;
    }

    if (operationId === 'index.entries.list') {
      expect(Array.isArray(result?.items)).toBe(true);
      expect(typeof result?.total).toBe('number');
      return;
    }

    if (operationId === 'index.entries.get') {
      expect(result?.address?.kind).toBe('inline');
      expect(result?.address?.nodeType).toBe('indexEntry');
      return;
    }

    throw new Error(`Unexpected read assertion branch for ${operationId}.`);
  }

  function requireFixture(operationId: IndexCommandId, fixture: IndexFixture | null): IndexFixture {
    if (!fixture) throw new Error(`${operationId} requires an index fixture.`);
    return fixture;
  }

  function makeTextTarget(blockId: string, end: number): TextTarget {
    return {
      kind: 'text',
      segments: [{ blockId, range: { start: 0, end } }],
    };
  }

  async function seedTextTarget(sessionId: string, text: string): Promise<TextTarget> {
    const insertResult = await callDocOperation<any>('insert', { sessionId, value: text });
    const blockId = insertResult?.target?.blockId;
    if (typeof blockId !== 'string' || blockId.length === 0) {
      throw new Error('insert did not return a blockId for index text targeting.');
    }
    return makeTextTarget(blockId, Math.max(1, Math.min(10, text.length)));
  }

  function extractIndexAddress(item: any): IndexAddress | null {
    return (item?.address ?? item?.domain?.address ?? null) as IndexAddress | null;
  }

  function extractIndexEntryAddress(item: any): IndexEntryAddress | null {
    return (item?.address ?? item?.domain?.address ?? null) as IndexEntryAddress | null;
  }

  async function insertIndex(sessionId: string): Promise<IndexAddress> {
    const insertResult = await callDocOperation<any>('index.insert', {
      sessionId,
      at: { kind: 'documentEnd' },
      config: {
        headingSeparator: ' · ',
      },
    });
    assertMutationSuccess('index.insert', insertResult);

    const listResult = await callDocOperation<any>('index.list', { sessionId });
    const target = extractIndexAddress(listResult?.items?.[0]);
    if (!target) {
      throw new Error('Unable to resolve inserted index address from index.list.');
    }
    return target;
  }

  async function insertIndexEntry(sessionId: string): Promise<IndexEntryAddress> {
    const at = await seedTextTarget(sessionId, 'Index entry host text.');
    const insertResult = await callDocOperation<any>('index.entries.insert', {
      sessionId,
      at,
      entry: {
        text: 'Primary Entry',
        subEntry: 'Sub Entry',
      },
    });
    assertMutationSuccess('index.entries.insert', insertResult);

    const listResult = await callDocOperation<any>('index.entries.list', { sessionId });
    const target = extractIndexEntryAddress(listResult?.items?.[0]);
    if (!target) {
      throw new Error('Unable to resolve inserted index-entry address from index.entries.list.');
    }
    return target;
  }

  const scenarios: Scenario[] = [
    {
      operationId: 'index.list',
      prepare: async (sessionId) => {
        await insertIndex(sessionId);
        return null;
      },
      run: async (sessionId) => {
        const result = await callDocOperation<any>('index.list', { sessionId });
        expect(result?.total).toBeGreaterThanOrEqual(1);
        return result;
      },
    },
    {
      operationId: 'index.get',
      prepare: async (sessionId) => ({
        indexTarget: await insertIndex(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('index.get', fixture);
        if (!f.indexTarget) throw new Error('index.get requires an index target fixture.');
        return callDocOperation<any>('index.get', {
          sessionId,
          target: f.indexTarget,
        });
      },
    },
    {
      operationId: 'index.insert',
      run: async (sessionId) => {
        const insertResult = await callDocOperation<any>('index.insert', {
          sessionId,
          at: { kind: 'documentEnd' },
          config: {
            entryPageSeparator: ', ',
          },
        });

        const listResult = await callDocOperation<any>('index.list', { sessionId });
        expect(listResult?.total).toBeGreaterThanOrEqual(1);

        return insertResult;
      },
    },
    {
      operationId: 'index.configure',
      prepare: async (sessionId) => ({
        indexTarget: await insertIndex(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('index.configure', fixture);
        if (!f.indexTarget) throw new Error('index.configure requires an index target fixture.');

        const beforeList = await callDocOperation<any>('index.list', { sessionId });
        const currentTarget = extractIndexAddress(beforeList?.items?.[0]) ?? f.indexTarget;

        const configureResult = await callDocOperation<any>('index.configure', {
          sessionId,
          target: currentTarget,
          patch: {
            entryPageSeparator: ' :: ',
            pageRangeSeparator: ' to ',
          },
        });

        const afterList = await callDocOperation<any>('index.list', { sessionId });
        const resolvedTarget = extractIndexAddress(afterList?.items?.[0]) ?? currentTarget;
        const info = await callDocOperation<any>('index.get', {
          sessionId,
          target: resolvedTarget,
        });
        expect(info?.instruction).toContain('::');

        return configureResult;
      },
    },
    {
      operationId: 'index.rebuild',
      prepare: async (sessionId) => ({
        indexTarget: await insertIndex(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('index.rebuild', fixture);
        if (!f.indexTarget) throw new Error('index.rebuild requires an index target fixture.');
        return callDocOperation<any>('index.rebuild', {
          sessionId,
          target: f.indexTarget,
        });
      },
    },
    {
      operationId: 'index.remove',
      prepare: async (sessionId) => ({
        indexTarget: await insertIndex(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('index.remove', fixture);
        if (!f.indexTarget) throw new Error('index.remove requires an index target fixture.');

        const before = await callDocOperation<any>('index.list', { sessionId });
        const removeResult = await callDocOperation<any>('index.remove', {
          sessionId,
          target: f.indexTarget,
        });
        const after = await callDocOperation<any>('index.list', { sessionId });
        expect(after?.total).toBe((before?.total ?? 0) - 1);

        return removeResult;
      },
    },
    {
      operationId: 'index.entries.list',
      prepare: async (sessionId) => {
        await insertIndexEntry(sessionId);
        return null;
      },
      run: async (sessionId) => {
        const result = await callDocOperation<any>('index.entries.list', { sessionId });
        expect(result?.total).toBeGreaterThanOrEqual(1);
        return result;
      },
    },
    {
      operationId: 'index.entries.get',
      prepare: async (sessionId) => ({
        entryTarget: await insertIndexEntry(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('index.entries.get', fixture);
        if (!f.entryTarget) throw new Error('index.entries.get requires an entry target fixture.');
        return callDocOperation<any>('index.entries.get', {
          sessionId,
          target: f.entryTarget,
        });
      },
    },
    {
      operationId: 'index.entries.insert',
      prepare: async (sessionId) => ({
        textTarget: await seedTextTarget(sessionId, 'Insert an XE index entry here.'),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('index.entries.insert', fixture);
        if (!f.textTarget) throw new Error('index.entries.insert requires a text target fixture.');

        const insertResult = await callDocOperation<any>('index.entries.insert', {
          sessionId,
          at: f.textTarget,
          entry: {
            text: 'Inserted Entry',
            bold: true,
          },
        });

        const listResult = await callDocOperation<any>('index.entries.list', { sessionId });
        expect(listResult?.total).toBeGreaterThanOrEqual(1);

        return insertResult;
      },
    },
    {
      operationId: 'index.entries.update',
      prepare: async (sessionId) => ({
        entryTarget: await insertIndexEntry(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('index.entries.update', fixture);
        if (!f.entryTarget) throw new Error('index.entries.update requires an entry target fixture.');

        const updateResult = await callDocOperation<any>('index.entries.update', {
          sessionId,
          target: f.entryTarget,
          patch: {
            text: 'Updated Entry',
            italic: true,
          },
        });

        const info = await callDocOperation<any>('index.entries.get', {
          sessionId,
          target: f.entryTarget,
        });
        expect(info?.text).toBe('Updated Entry');

        return updateResult;
      },
    },
    {
      operationId: 'index.entries.remove',
      prepare: async (sessionId) => ({
        entryTarget: await insertIndexEntry(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('index.entries.remove', fixture);
        if (!f.entryTarget) throw new Error('index.entries.remove requires an entry target fixture.');

        const before = await callDocOperation<any>('index.entries.list', { sessionId });
        const removeResult = await callDocOperation<any>('index.entries.remove', {
          sessionId,
          target: f.entryTarget,
        });
        const after = await callDocOperation<any>('index.entries.list', { sessionId });
        expect(after?.total).toBe((before?.total ?? 0) - 1);

        return removeResult;
      },
    },
  ];

  it('covers every index command currently defined on this branch', () => {
    const scenarioIds = scenarios.map((scenario) => scenario.operationId);
    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
    expect(new Set(scenarioIds)).toEqual(new Set(ALL_INDEX_COMMAND_IDS));
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
