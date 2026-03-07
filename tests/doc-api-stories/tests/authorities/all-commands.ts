import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { corpusDoc, unwrap, useStoryHarness } from '../harness';

const ALL_AUTHORITIES_COMMAND_IDS = [
  'authorities.list',
  'authorities.get',
  'authorities.insert',
  'authorities.configure',
  'authorities.rebuild',
  'authorities.remove',
  'authorities.entries.list',
  'authorities.entries.get',
  'authorities.entries.insert',
  'authorities.entries.update',
  'authorities.entries.remove',
] as const;

type AuthoritiesCommandId = (typeof ALL_AUTHORITIES_COMMAND_IDS)[number];

type AuthoritiesAddress = {
  kind: 'block';
  nodeType: 'tableOfAuthorities';
  nodeId: string;
};

type AuthorityEntryAddress = {
  kind: 'inline';
  nodeType: 'authorityEntry';
  anchor: {
    start: { blockId: string; offset: number };
    end: { blockId: string; offset: number };
  };
};

type TextTarget = {
  kind: 'text';
  segments: Array<{ blockId: string; range: { start: number; end: number } }>;
};

type AuthoritiesFixture = {
  authoritiesTarget?: AuthoritiesAddress;
  entryTarget?: AuthorityEntryAddress;
  textTarget?: TextTarget;
  beforeTotal?: number;
};

type Scenario = {
  operationId: AuthoritiesCommandId;
  prepare?: (sessionId: string) => Promise<AuthoritiesFixture | null>;
  run: (sessionId: string, fixture: AuthoritiesFixture | null) => Promise<any>;
};

const BASE_DOC = corpusDoc('basic/longer-header.docx');

describe('document-api story: all authorities commands', () => {
  const { client, outPath } = useStoryHarness('authorities/all-commands', {
    preserveResults: true,
  });

  const api = client as any;

  const readOperationIds = new Set<AuthoritiesCommandId>([
    'authorities.list',
    'authorities.get',
    'authorities.entries.list',
    'authorities.entries.get',
  ]);

  function slug(operationId: AuthoritiesCommandId): string {
    return operationId.replace(/\./g, '-');
  }

  function makeSessionId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function sourceDocNameFor(operationId: AuthoritiesCommandId): string {
    return `${slug(operationId)}-source.docx`;
  }

  function resultDocNameFor(operationId: AuthoritiesCommandId): string {
    return `${slug(operationId)}.docx`;
  }

  function readOutputNameFor(operationId: AuthoritiesCommandId): string {
    return `${slug(operationId)}-read-output.json`;
  }

  async function saveReadOutput(operationId: AuthoritiesCommandId, result: any): Promise<void> {
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

  async function saveSource(sessionId: string, operationId: AuthoritiesCommandId): Promise<void> {
    await callDocOperation('save', {
      sessionId,
      out: outPath(sourceDocNameFor(operationId)),
      force: true,
    });
  }

  async function saveResult(sessionId: string, operationId: AuthoritiesCommandId): Promise<void> {
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

  function assertReadOutput(operationId: AuthoritiesCommandId, result: any): void {
    if (operationId === 'authorities.list') {
      expect(Array.isArray(result?.items)).toBe(true);
      expect(typeof result?.total).toBe('number');
      return;
    }

    if (operationId === 'authorities.get') {
      expect(result?.address?.kind).toBe('block');
      expect(result?.address?.nodeType).toBe('tableOfAuthorities');
      return;
    }

    if (operationId === 'authorities.entries.list') {
      expect(Array.isArray(result?.items)).toBe(true);
      expect(typeof result?.total).toBe('number');
      return;
    }

    if (operationId === 'authorities.entries.get') {
      expect(result?.address?.kind).toBe('inline');
      expect(result?.address?.nodeType).toBe('authorityEntry');
      return;
    }

    throw new Error(`Unexpected read assertion branch for ${operationId}.`);
  }

  function requireFixture(operationId: AuthoritiesCommandId, fixture: AuthoritiesFixture | null): AuthoritiesFixture {
    if (!fixture) throw new Error(`${operationId} requires an authorities fixture.`);
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
      throw new Error('insert did not return a blockId for authorities text targeting.');
    }
    return makeTextTarget(blockId, Math.max(1, Math.min(10, text.length)));
  }

  function extractAuthoritiesAddress(item: any): AuthoritiesAddress | null {
    return (item?.address ?? item?.domain?.address ?? null) as AuthoritiesAddress | null;
  }

  function extractAuthorityEntryAddress(item: any): AuthorityEntryAddress | null {
    return (item?.address ?? item?.domain?.address ?? null) as AuthorityEntryAddress | null;
  }

  async function insertAuthorities(sessionId: string): Promise<AuthoritiesAddress> {
    const insertResult = await callDocOperation<any>('authorities.insert', {
      sessionId,
      at: { kind: 'documentEnd' },
      config: {
        entryPageSeparator: ' · ',
      },
    });
    assertMutationSuccess('authorities.insert', insertResult);

    const target = insertResult?.authorities as AuthoritiesAddress | undefined;
    if (!target?.nodeId) {
      throw new Error('authorities.insert did not return an authorities address.');
    }
    return target;
  }

  async function insertAuthorityEntry(sessionId: string): Promise<AuthorityEntryAddress> {
    const at = await seedTextTarget(sessionId, 'Authority entry host text.');
    const insertResult = await callDocOperation<any>('authorities.entries.insert', {
      sessionId,
      at,
      entry: {
        longCitation: `Authority Case ${Date.now()}`,
        shortCitation: 'Authority Case',
        category: 1,
      },
    });
    assertMutationSuccess('authorities.entries.insert', insertResult);

    const target = insertResult?.entry as AuthorityEntryAddress | undefined;
    if (target?.anchor?.start?.blockId) {
      return target;
    }

    const listResult = await callDocOperation<any>('authorities.entries.list', { sessionId });
    const listedTarget = extractAuthorityEntryAddress(listResult?.items?.[0]);
    if (!listedTarget) {
      throw new Error('Unable to resolve inserted authority-entry address from authorities.entries.list.');
    }
    return listedTarget;
  }

  const scenarios: Scenario[] = [
    {
      operationId: 'authorities.list',
      prepare: async (sessionId) => {
        await insertAuthorities(sessionId);
        return null;
      },
      run: async (sessionId) => {
        const result = await callDocOperation<any>('authorities.list', { sessionId });
        expect(result?.total).toBeGreaterThanOrEqual(1);
        return result;
      },
    },
    {
      operationId: 'authorities.get',
      prepare: async (sessionId) => ({
        authoritiesTarget: await insertAuthorities(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('authorities.get', fixture);
        if (!f.authoritiesTarget) throw new Error('authorities.get requires an authorities target fixture.');
        return callDocOperation<any>('authorities.get', {
          sessionId,
          target: f.authoritiesTarget,
        });
      },
    },
    {
      operationId: 'authorities.insert',
      run: async (sessionId) => {
        const insertResult = await callDocOperation<any>('authorities.insert', {
          sessionId,
          at: { kind: 'documentEnd' },
          config: {
            tabLeader: 'dot',
            includeHeadings: true,
          },
        });

        const listResult = await callDocOperation<any>('authorities.list', { sessionId });
        expect(listResult?.total).toBeGreaterThanOrEqual(1);

        return insertResult;
      },
    },
    {
      operationId: 'authorities.configure',
      prepare: async (sessionId) => ({
        authoritiesTarget: await insertAuthorities(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('authorities.configure', fixture);
        if (!f.authoritiesTarget) throw new Error('authorities.configure requires an authorities target fixture.');

        const beforeList = await callDocOperation<any>('authorities.list', { sessionId });
        const currentTarget = extractAuthoritiesAddress(beforeList?.items?.[0]) ?? f.authoritiesTarget;

        const configureResult = await callDocOperation<any>('authorities.configure', {
          sessionId,
          target: currentTarget,
          patch: {
            includeHeadings: true,
            usePassim: true,
            pageRangeSeparator: '-',
          },
        });

        const afterList = await callDocOperation<any>('authorities.list', { sessionId });
        const resolvedTarget = extractAuthoritiesAddress(afterList?.items?.[0]) ?? currentTarget;
        const info = await callDocOperation<any>('authorities.get', {
          sessionId,
          target: resolvedTarget,
        });
        expect(info?.config?.includeHeadings).toBe(true);

        return configureResult;
      },
    },
    {
      operationId: 'authorities.rebuild',
      prepare: async (sessionId) => ({
        authoritiesTarget: await insertAuthorities(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('authorities.rebuild', fixture);
        if (!f.authoritiesTarget) throw new Error('authorities.rebuild requires an authorities target fixture.');

        const rebuildResult = await callDocOperation<any>('authorities.rebuild', {
          sessionId,
          target: f.authoritiesTarget,
        });

        const info = await callDocOperation<any>('authorities.get', {
          sessionId,
          target: f.authoritiesTarget,
        });
        expect(info?.address?.nodeId).toBe(f.authoritiesTarget.nodeId);

        return rebuildResult;
      },
    },
    {
      operationId: 'authorities.remove',
      prepare: async (sessionId) => {
        const authoritiesTarget = await insertAuthorities(sessionId);
        const before = await callDocOperation<any>('authorities.list', { sessionId });
        return {
          authoritiesTarget,
          beforeTotal: typeof before?.total === 'number' ? before.total : undefined,
        };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('authorities.remove', fixture);
        if (!f.authoritiesTarget) throw new Error('authorities.remove requires an authorities target fixture.');

        const removeResult = await callDocOperation<any>('authorities.remove', {
          sessionId,
          target: f.authoritiesTarget,
        });

        const listResult = await callDocOperation<any>('authorities.list', { sessionId });
        if (typeof f.beforeTotal === 'number') {
          expect(listResult?.total).toBe(f.beforeTotal - 1);
        } else {
          const hasTarget = (listResult?.items ?? []).some(
            (item: any) => extractAuthoritiesAddress(item)?.nodeId === f.authoritiesTarget?.nodeId,
          );
          expect(hasTarget).toBe(false);
        }

        return removeResult;
      },
    },
    {
      operationId: 'authorities.entries.list',
      prepare: async (sessionId) => {
        await insertAuthorityEntry(sessionId);
        return null;
      },
      run: async (sessionId) => {
        const result = await callDocOperation<any>('authorities.entries.list', { sessionId });
        expect(result?.total).toBeGreaterThanOrEqual(1);
        return result;
      },
    },
    {
      operationId: 'authorities.entries.get',
      prepare: async (sessionId) => ({
        entryTarget: await insertAuthorityEntry(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('authorities.entries.get', fixture);
        if (!f.entryTarget) throw new Error('authorities.entries.get requires an entry target fixture.');
        return callDocOperation<any>('authorities.entries.get', {
          sessionId,
          target: f.entryTarget,
        });
      },
    },
    {
      operationId: 'authorities.entries.insert',
      prepare: async (sessionId) => ({
        textTarget: await seedTextTarget(sessionId, 'Authorities entry insertion host text.'),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('authorities.entries.insert', fixture);
        if (!f.textTarget) throw new Error('authorities.entries.insert requires a text target fixture.');

        const insertResult = await callDocOperation<any>('authorities.entries.insert', {
          sessionId,
          at: f.textTarget,
          entry: {
            longCitation: `Inserted Authority ${Date.now()}`,
            shortCitation: 'Inserted Authority',
            category: 2,
          },
        });

        const listResult = await callDocOperation<any>('authorities.entries.list', { sessionId });
        expect(listResult?.total).toBeGreaterThanOrEqual(1);

        return insertResult;
      },
    },
    {
      operationId: 'authorities.entries.update',
      prepare: async (sessionId) => ({
        entryTarget: await insertAuthorityEntry(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('authorities.entries.update', fixture);
        if (!f.entryTarget) throw new Error('authorities.entries.update requires an entry target fixture.');

        const updateResult = await callDocOperation<any>('authorities.entries.update', {
          sessionId,
          target: f.entryTarget,
          patch: {
            longCitation: `Updated Authority ${Date.now()}`,
            shortCitation: 'Updated Authority',
            category: 3,
            italic: true,
          },
        });

        const info = await callDocOperation<any>('authorities.entries.get', {
          sessionId,
          target: f.entryTarget,
        });
        expect(info?.shortCitation).toBe('Updated Authority');
        expect(info?.italic).toBe(true);

        return updateResult;
      },
    },
    {
      operationId: 'authorities.entries.remove',
      prepare: async (sessionId) => ({
        entryTarget: await insertAuthorityEntry(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('authorities.entries.remove', fixture);
        if (!f.entryTarget) throw new Error('authorities.entries.remove requires an entry target fixture.');

        const before = await callDocOperation<any>('authorities.entries.list', { sessionId });
        const removeResult = await callDocOperation<any>('authorities.entries.remove', {
          sessionId,
          target: f.entryTarget,
        });
        const after = await callDocOperation<any>('authorities.entries.list', { sessionId });
        expect(after?.total).toBe((before?.total ?? 0) - 1);

        return removeResult;
      },
    },
  ];

  it('covers every authorities command currently defined on this branch', () => {
    const scenarioIds = scenarios.map((scenario) => scenario.operationId);
    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
    expect(new Set(scenarioIds)).toEqual(new Set(ALL_AUTHORITIES_COMMAND_IDS));
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
