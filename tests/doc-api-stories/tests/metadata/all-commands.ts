/**
 * doc-api story: anchored-metadata end-to-end through the SDK + CLI.
 *
 * Exercises `editor.doc.metadata.*` on a real Editor + DOCX round-trip
 * (the harness drives the CLI under the hood). Catches the gap that
 * smoke unit tests can't: that the adapter actually wraps a text range
 * in a hidden content control, writes the payload to a namespaced
 * custom XML part, resolves the anchor back to a SelectionTarget, and
 * removes both sides on cleanup.
 *
 * SD-3104.
 */
import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { unwrap, useStoryHarness } from '../harness';

const ALL_METADATA_COMMAND_IDS = [
  'metadata.attach',
  'metadata.list',
  'metadata.get',
  'metadata.update',
  'metadata.remove',
  'metadata.resolve',
] as const;

type MetadataCommandId = (typeof ALL_METADATA_COMMAND_IDS)[number];

type TextTarget = {
  kind: 'selection';
  start: { kind: 'text'; blockId: string; offset: number };
  end: { kind: 'text'; blockId: string; offset: number };
};

type Fixture = {
  target?: TextTarget;
  id?: string;
};

type Scenario = {
  operationId: MetadataCommandId;
  prepare?: (sessionId: string) => Promise<Fixture | null>;
  run: (sessionId: string, fixture: Fixture | null) => Promise<any>;
};

const BASE_DOC = path.resolve(import.meta.dirname, '../../../../shared/common/data/blank.docx');
const NAMESPACE = 'urn:superdoc:metadata-story:1';

describe('document-api story: all metadata commands', () => {
  const { client, outPath } = useStoryHarness('metadata/all-commands', {
    preserveResults: true,
  });

  const api = client as any;

  const readOperationIds = new Set<MetadataCommandId>(['metadata.list', 'metadata.get', 'metadata.resolve']);

  function slug(operationId: MetadataCommandId): string {
    return operationId.replace(/\./g, '-');
  }

  function makeSessionId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function sourceDocNameFor(operationId: MetadataCommandId): string {
    return `${slug(operationId)}-source.docx`;
  }

  function resultDocNameFor(operationId: MetadataCommandId): string {
    return `${slug(operationId)}.docx`;
  }

  function roundtripDocNameFor(operationId: MetadataCommandId): string {
    return `${slug(operationId)}-roundtrip.docx`;
  }

  function readOutputNameFor(operationId: MetadataCommandId): string {
    return `${slug(operationId)}-read-output.json`;
  }

  async function saveReadOutput(operationId: MetadataCommandId, result: any): Promise<void> {
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

  async function saveSource(sessionId: string, operationId: MetadataCommandId): Promise<void> {
    await callDocOperation('save', { sessionId, out: outPath(sourceDocNameFor(operationId)), force: true });
  }

  async function saveResult(sessionId: string, operationId: MetadataCommandId): Promise<string> {
    const docPath = outPath(resultDocNameFor(operationId));
    await callDocOperation('save', { sessionId, out: docPath, force: true });
    return docPath;
  }

  function assertMutationSuccess(operationId: string, result: any): void {
    if (result?.success === true || result?.receipt?.success === true) return;
    const code = result?.failure?.code ?? result?.receipt?.failure?.code ?? 'UNKNOWN';
    throw new Error(`${operationId} did not report success (code: ${code}).`);
  }

  function requireFixture(operationId: MetadataCommandId, fixture: Fixture | null): Fixture {
    if (!fixture) throw new Error(`${operationId} requires a fixture.`);
    return fixture;
  }

  function itemIds(result: any): string[] {
    return (result?.items ?? [])
      .map((item: any) => item?.id ?? item?.domain?.id)
      .filter((id: unknown) => typeof id === 'string');
  }

  function expectedIdFor(operationId: MetadataCommandId, fixture: Fixture | null, result: any): string | null {
    if (operationId === 'metadata.attach' && typeof result?.id === 'string') return result.id;
    if (typeof fixture?.id === 'string') return fixture.id;
    return null;
  }

  async function assertRoundtripState(
    operationId: MetadataCommandId,
    resultDocPath: string,
    fixture: Fixture | null,
    result: any,
  ): Promise<void> {
    const reopenSessionId = makeSessionId(`${slug(operationId)}-reopen`);
    const expectedId = expectedIdFor(operationId, fixture, result);
    try {
      await callDocOperation('open', { sessionId: reopenSessionId, doc: resultDocPath });

      if (operationId === 'metadata.remove') {
        if (!expectedId) throw new Error('metadata.remove roundtrip requires an id fixture.');
        const reopenedGet = await callDocOperation<any>('metadata.get', { sessionId: reopenSessionId, id: expectedId });
        expect(reopenedGet).toBeNull();
        const reopenedResolve = await callDocOperation<any>('metadata.resolve', {
          sessionId: reopenSessionId,
          id: expectedId,
        });
        expect(reopenedResolve).toBeNull();
        const reopenedList = await callDocOperation<any>('metadata.list', {
          sessionId: reopenSessionId,
          namespace: NAMESPACE,
        });
        expect(itemIds(reopenedList)).not.toContain(expectedId);
        await callDocOperation('save', {
          sessionId: reopenSessionId,
          out: outPath(roundtripDocNameFor(operationId)),
          force: true,
        });
        return;
      }

      if (!expectedId) throw new Error(`${operationId} roundtrip requires an anchored metadata id.`);
      const reopenedInfo = await callDocOperation<any>('metadata.get', { sessionId: reopenSessionId, id: expectedId });
      expect(reopenedInfo?.id).toBe(expectedId);
      expect(reopenedInfo?.namespace).toBe(NAMESPACE);

      const reopenedResolve = await callDocOperation<any>('metadata.resolve', {
        sessionId: reopenSessionId,
        id: expectedId,
      });
      expect(reopenedResolve?.id).toBe(expectedId);
      expect(reopenedResolve?.target?.kind).toBe('selection');

      const reopenedList = await callDocOperation<any>('metadata.list', {
        sessionId: reopenSessionId,
        namespace: NAMESPACE,
      });
      expect(itemIds(reopenedList)).toContain(expectedId);

      const reopenedWithin = await callDocOperation<any>('metadata.list', {
        sessionId: reopenSessionId,
        namespace: NAMESPACE,
        within: reopenedResolve.target,
      });
      expect(itemIds(reopenedWithin)).toContain(expectedId);

      await callDocOperation('save', {
        sessionId: reopenSessionId,
        out: outPath(roundtripDocNameFor(operationId)),
        force: true,
      });
    } finally {
      await callDocOperation('close', { sessionId: reopenSessionId, discard: true }).catch(() => {});
    }
  }

  async function seedTextTarget(sessionId: string, text: string): Promise<TextTarget> {
    const insertResult = await callDocOperation<any>('insert', { sessionId, value: text });
    const blockId = insertResult?.target?.blockId;
    if (typeof blockId !== 'string' || blockId.length === 0) {
      throw new Error('insert did not return a blockId for metadata anchor targeting.');
    }
    const end = Math.max(1, Math.min(text.length, 12));
    return {
      kind: 'selection',
      start: { kind: 'text', blockId, offset: 0 },
      end: { kind: 'text', blockId, offset: end },
    };
  }

  async function attachOne(sessionId: string, id: string, payload: unknown): Promise<{ target: TextTarget }> {
    const target = await seedTextTarget(sessionId, `Anchor host text for ${id}`);
    const attachResult = await callDocOperation<any>('metadata.attach', {
      sessionId,
      id,
      target,
      namespace: NAMESPACE,
      payload,
    });
    assertMutationSuccess('metadata.attach', attachResult);
    return { target };
  }

  const scenarios: Scenario[] = [
    {
      operationId: 'metadata.attach',
      prepare: async (sessionId) => {
        const target = await seedTextTarget(sessionId, 'Metadata attach host text.');
        return { target };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('metadata.attach', fixture);
        if (!f.target) throw new Error('metadata.attach requires a text target fixture.');

        const id = `meta-attach-${Date.now()}`;
        const attachResult = await callDocOperation<any>('metadata.attach', {
          sessionId,
          id,
          target: f.target,
          namespace: NAMESPACE,
          payload: { kind: 'citation', source: 'Story v1' },
        });

        const withinResult = await callDocOperation<any>('metadata.list', {
          sessionId,
          namespace: NAMESPACE,
          within: f.target,
        });
        expect(itemIds(withinResult)).toContain(id);

        const listResult = await callDocOperation<any>('metadata.list', { sessionId, namespace: NAMESPACE });
        expect(itemIds(listResult)).toContain(id);

        return attachResult;
      },
    },
    {
      operationId: 'metadata.list',
      prepare: async (sessionId) => {
        const id = `meta-list-${Date.now()}`;
        await attachOne(sessionId, id, { kind: 'citation', source: 'List scenario' });
        return { id };
      },
      run: async (sessionId, fixture) => {
        const result = await callDocOperation<any>('metadata.list', { sessionId, namespace: NAMESPACE });
        expect(typeof result?.total).toBe('number');
        expect(result.total).toBeGreaterThanOrEqual(1);
        expect(Array.isArray(result?.items)).toBe(true);

        const f = requireFixture('metadata.list', fixture);
        if (!f.id) throw new Error('metadata.list requires an id fixture.');
        const resolved = await callDocOperation<any>('metadata.resolve', { sessionId, id: f.id });
        expect(resolved?.target?.kind).toBe('selection');
        const narrowed = await callDocOperation<any>('metadata.list', {
          sessionId,
          namespace: NAMESPACE,
          within: resolved.target,
        });
        expect(itemIds(narrowed)).toContain(f.id);
        return result;
      },
    },
    {
      operationId: 'metadata.get',
      prepare: async (sessionId) => {
        const id = `meta-get-${Date.now()}`;
        await attachOne(sessionId, id, { kind: 'citation', source: 'Get scenario' });
        return { id };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('metadata.get', fixture);
        if (!f.id) throw new Error('metadata.get requires an id fixture.');
        const result = await callDocOperation<any>('metadata.get', { sessionId, id: f.id });
        expect(result?.id).toBe(f.id);
        expect(result?.namespace).toBe(NAMESPACE);
        expect(result?.payload).toEqual({ kind: 'citation', source: 'Get scenario' });
        return result;
      },
    },
    {
      operationId: 'metadata.resolve',
      prepare: async (sessionId) => {
        const id = `meta-resolve-${Date.now()}`;
        const { target } = await attachOne(sessionId, id, { kind: 'citation', source: 'Resolve scenario' });
        return { id, target };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('metadata.resolve', fixture);
        if (!f.id) throw new Error('metadata.resolve requires an id fixture.');
        const result = await callDocOperation<any>('metadata.resolve', { sessionId, id: f.id });
        expect(result?.id).toBe(f.id);
        expect(result?.target?.kind).toBe('selection');
        expect(result?.target?.start?.kind).toBe('text');
        expect(result?.target?.end?.kind).toBe('text');
        return result;
      },
    },
    {
      operationId: 'metadata.update',
      prepare: async (sessionId) => {
        const id = `meta-update-${Date.now()}`;
        await attachOne(sessionId, id, { kind: 'citation', source: 'Before update' });
        return { id };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('metadata.update', fixture);
        if (!f.id) throw new Error('metadata.update requires an id fixture.');

        const updateResult = await callDocOperation<any>('metadata.update', {
          sessionId,
          id: f.id,
          payload: { kind: 'citation', source: 'After update', confidence: 0.95 },
        });

        const refetched = await callDocOperation<any>('metadata.get', { sessionId, id: f.id });
        expect(refetched?.payload).toEqual({ kind: 'citation', source: 'After update', confidence: 0.95 });

        return updateResult;
      },
    },
    {
      operationId: 'metadata.remove',
      prepare: async (sessionId) => {
        const id = `meta-remove-${Date.now()}`;
        await attachOne(sessionId, id, { kind: 'citation', source: 'Will be removed' });
        return { id };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('metadata.remove', fixture);
        if (!f.id) throw new Error('metadata.remove requires an id fixture.');

        const removeResult = await callDocOperation<any>('metadata.remove', { sessionId, id: f.id });

        // Both sides gone: payload + anchor.
        const afterGet = await callDocOperation<any>('metadata.get', { sessionId, id: f.id });
        expect(afterGet).toBeNull();

        const afterResolve = await callDocOperation<any>('metadata.resolve', { sessionId, id: f.id });
        expect(afterResolve).toBeNull();

        const listAfter = await callDocOperation<any>('metadata.list', { sessionId, namespace: NAMESPACE });
        expect(itemIds(listAfter)).not.toContain(f.id);

        return removeResult;
      },
    },
  ];

  it('covers every metadata command currently defined on this branch', () => {
    const scenarioIds = scenarios.map((s) => s.operationId);
    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
    expect(new Set(scenarioIds)).toEqual(new Set(ALL_METADATA_COMMAND_IDS));
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
          await saveReadOutput(scenario.operationId, result);
        } else {
          assertMutationSuccess(scenario.operationId, result);
        }

        const resultDocPath = await saveResult(sessionId, scenario.operationId);
        await assertRoundtripState(scenario.operationId, resultDocPath, fixture, result);
      } finally {
        await callDocOperation('close', { sessionId, discard: true }).catch(() => {});
      }
    });
  }
});
