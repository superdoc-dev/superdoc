import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { corpusDoc, unwrap, useStoryHarness } from '../harness';

const ALL_FIELDS_COMMAND_IDS = [
  'fields.list',
  'fields.get',
  'fields.insert',
  'fields.rebuild',
  'fields.remove',
] as const;

type FieldsCommandId = (typeof ALL_FIELDS_COMMAND_IDS)[number];

type FieldAddress = {
  kind: 'field';
  blockId: string;
  occurrenceIndex: number;
  nestingDepth: number;
};

type TextTarget = {
  kind: 'text';
  segments: Array<{ blockId: string; range: { start: number; end: number } }>;
};

type FieldsFixture = {
  target?: FieldAddress;
  textTarget?: TextTarget;
};

type Scenario = {
  operationId: FieldsCommandId;
  prepare?: (sessionId: string) => Promise<FieldsFixture | null>;
  run: (sessionId: string, fixture: FieldsFixture | null) => Promise<any>;
};

const BASE_DOC = corpusDoc('basic/longer-header.docx');

describe('document-api story: all fields commands', () => {
  const { client, outPath } = useStoryHarness('fields/all-commands', {
    preserveResults: true,
  });

  const api = client as any;

  const readOperationIds = new Set<FieldsCommandId>(['fields.list', 'fields.get']);

  function slug(operationId: FieldsCommandId): string {
    return operationId.replace(/\./g, '-');
  }

  function makeSessionId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function sourceDocNameFor(operationId: FieldsCommandId): string {
    return `${slug(operationId)}-source.docx`;
  }

  function resultDocNameFor(operationId: FieldsCommandId): string {
    return `${slug(operationId)}.docx`;
  }

  function readOutputNameFor(operationId: FieldsCommandId): string {
    return `${slug(operationId)}-read-output.json`;
  }

  async function saveReadOutput(operationId: FieldsCommandId, result: any): Promise<void> {
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

  async function saveSource(sessionId: string, operationId: FieldsCommandId): Promise<void> {
    await callDocOperation('save', {
      sessionId,
      out: outPath(sourceDocNameFor(operationId)),
      force: true,
    });
  }

  async function saveResult(sessionId: string, operationId: FieldsCommandId): Promise<void> {
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

  function assertReadOutput(operationId: FieldsCommandId, result: any): void {
    if (operationId === 'fields.list') {
      expect(Array.isArray(result?.items)).toBe(true);
      expect(typeof result?.total).toBe('number');
      return;
    }

    if (operationId === 'fields.get') {
      expect(result?.address?.kind).toBe('field');
      expect(typeof result?.instruction).toBe('string');
      return;
    }

    throw new Error(`Unexpected read assertion branch for ${operationId}.`);
  }

  function requireFixture(operationId: FieldsCommandId, fixture: FieldsFixture | null): FieldsFixture {
    if (!fixture) throw new Error(`${operationId} requires a fields fixture.`);
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
      throw new Error('insert did not return a blockId for fields text targeting.');
    }
    return makeTextTarget(blockId, Math.max(1, Math.min(10, text.length)));
  }

  function extractFieldAddress(item: any): FieldAddress | null {
    return (item?.address ?? item?.domain?.address ?? null) as FieldAddress | null;
  }

  async function insertField(sessionId: string): Promise<FieldAddress> {
    const at = await seedTextTarget(sessionId, 'Field host text.');
    const insertResult = await callDocOperation<any>('fields.insert', {
      sessionId,
      at,
      instruction: 'DATE',
      mode: 'raw',
    });
    assertMutationSuccess('fields.insert', insertResult);

    const listResult = await callDocOperation<any>('fields.list', { sessionId });
    const target = extractFieldAddress(listResult?.items?.[0]);
    if (!target) {
      throw new Error('Unable to resolve inserted field address from fields.list.');
    }
    return target;
  }

  const scenarios: Scenario[] = [
    {
      operationId: 'fields.list',
      prepare: async (sessionId) => {
        await insertField(sessionId);
        return null;
      },
      run: async (sessionId) => {
        const result = await callDocOperation<any>('fields.list', { sessionId });
        expect(result?.total).toBeGreaterThanOrEqual(1);
        return result;
      },
    },
    {
      operationId: 'fields.get',
      prepare: async (sessionId) => ({
        target: await insertField(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('fields.get', fixture);
        if (!f.target) throw new Error('fields.get requires a field target fixture.');
        return callDocOperation<any>('fields.get', {
          sessionId,
          target: f.target,
        });
      },
    },
    {
      operationId: 'fields.insert',
      prepare: async (sessionId) => ({
        textTarget: await seedTextTarget(sessionId, 'Insert a raw field at this location.'),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('fields.insert', fixture);
        if (!f.textTarget) throw new Error('fields.insert requires a text target fixture.');

        const insertResult = await callDocOperation<any>('fields.insert', {
          sessionId,
          at: f.textTarget,
          instruction: 'PAGE',
          mode: 'raw',
        });

        const listResult = await callDocOperation<any>('fields.list', { sessionId });
        expect(listResult?.total).toBeGreaterThanOrEqual(1);

        return insertResult;
      },
    },
    {
      operationId: 'fields.rebuild',
      prepare: async (sessionId) => ({
        target: await insertField(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('fields.rebuild', fixture);
        if (!f.target) throw new Error('fields.rebuild requires a field target fixture.');
        return callDocOperation<any>('fields.rebuild', {
          sessionId,
          target: f.target,
        });
      },
    },
    {
      operationId: 'fields.remove',
      prepare: async (sessionId) => ({
        target: await insertField(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('fields.remove', fixture);
        if (!f.target) throw new Error('fields.remove requires a field target fixture.');

        const before = await callDocOperation<any>('fields.list', { sessionId });
        const removeResult = await callDocOperation<any>('fields.remove', {
          sessionId,
          target: f.target,
          mode: 'raw',
        });
        const after = await callDocOperation<any>('fields.list', { sessionId });
        expect(after?.total).toBe((before?.total ?? 0) - 1);

        return removeResult;
      },
    },
  ];

  it('covers every fields command currently defined on this branch', () => {
    const scenarioIds = scenarios.map((scenario) => scenario.operationId);
    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
    expect(new Set(scenarioIds)).toEqual(new Set(ALL_FIELDS_COMMAND_IDS));
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
