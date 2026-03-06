import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { corpusDoc, unwrap, useStoryHarness } from '../harness';

const ALL_LINKS_COMMAND_IDS = ['links.list', 'links.get', 'links.insert', 'links.update', 'links.remove'] as const;

type LinksCommandId = (typeof ALL_LINKS_COMMAND_IDS)[number];

type LinkAddress = {
  kind: 'inline';
  nodeType: 'hyperlink';
  anchor: {
    start: { blockId: string; offset: number };
    end: { blockId: string; offset: number };
  };
};

type TextTarget = {
  kind: 'text';
  segments: Array<{ blockId: string; range: { start: number; end: number } }>;
};

type LinksFixture = {
  target?: LinkAddress;
  textTarget?: TextTarget;
  beforeTotal?: number;
};

type Scenario = {
  operationId: LinksCommandId;
  prepare?: (sessionId: string) => Promise<LinksFixture | null>;
  run: (sessionId: string, fixture: LinksFixture | null) => Promise<any>;
};

const BASE_DOC = corpusDoc('basic/longer-header.docx');

describe('document-api story: all links commands', () => {
  const { client, outPath } = useStoryHarness('links/all-commands', {
    preserveResults: true,
  });

  const api = client as any;

  const readOperationIds = new Set<LinksCommandId>(['links.list', 'links.get']);

  function slug(operationId: LinksCommandId): string {
    return operationId.replace(/\./g, '-');
  }

  function makeSessionId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function sourceDocNameFor(operationId: LinksCommandId): string {
    return `${slug(operationId)}-source.docx`;
  }

  function resultDocNameFor(operationId: LinksCommandId): string {
    return `${slug(operationId)}.docx`;
  }

  function readOutputNameFor(operationId: LinksCommandId): string {
    return `${slug(operationId)}-read-output.json`;
  }

  async function saveReadOutput(operationId: LinksCommandId, result: any): Promise<void> {
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

  async function saveSource(sessionId: string, operationId: LinksCommandId): Promise<void> {
    await callDocOperation('save', {
      sessionId,
      out: outPath(sourceDocNameFor(operationId)),
      force: true,
    });
  }

  async function saveResult(sessionId: string, operationId: LinksCommandId): Promise<void> {
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

  function assertReadOutput(operationId: LinksCommandId, result: any): void {
    if (operationId === 'links.list') {
      expect(Array.isArray(result?.items)).toBe(true);
      expect(typeof result?.total).toBe('number');
      return;
    }

    if (operationId === 'links.get') {
      expect(result?.address?.kind).toBe('inline');
      expect(result?.address?.nodeType).toBe('hyperlink');
      expect(result?.destination).toBeDefined();
      return;
    }

    throw new Error(`Unexpected read assertion branch for ${operationId}.`);
  }

  function requireFixture(operationId: LinksCommandId, fixture: LinksFixture | null): LinksFixture {
    if (!fixture) throw new Error(`${operationId} requires a links fixture.`);
    return fixture;
  }

  function makeTextTarget(blockId: string, end: number): TextTarget {
    return {
      kind: 'text',
      segments: [{ blockId, range: { start: 0, end } }],
    };
  }

  function extractLinkAddress(item: any): LinkAddress | null {
    return (item?.address ?? item?.domain?.address ?? null) as LinkAddress | null;
  }

  async function seedTextTarget(sessionId: string, text: string): Promise<TextTarget> {
    const insertResult = await callDocOperation<any>('insert', { sessionId, value: text });
    const blockId = insertResult?.target?.blockId;
    if (typeof blockId !== 'string' || blockId.length === 0) {
      throw new Error('insert did not return a blockId for link text targeting.');
    }
    return makeTextTarget(blockId, Math.max(1, Math.min(14, text.length)));
  }

  async function insertLink(sessionId: string): Promise<LinkAddress> {
    const at = await seedTextTarget(sessionId, 'Link target text for links story.');
    const insertResult = await callDocOperation<any>('links.insert', {
      sessionId,
      at,
      destination: {
        kind: 'external',
        href: 'https://example.com/links-story',
      },
    });
    assertMutationSuccess('links.insert', insertResult);

    const listResult = await callDocOperation<any>('links.list', { sessionId });
    const address = extractLinkAddress(listResult?.items?.[0]);
    if (!address) {
      throw new Error('Unable to resolve inserted link address from links.list.');
    }
    return address;
  }

  const scenarios: Scenario[] = [
    {
      operationId: 'links.list',
      prepare: async (sessionId) => {
        await insertLink(sessionId);
        return null;
      },
      run: async (sessionId) => {
        const listResult = await callDocOperation<any>('links.list', { sessionId });
        expect(listResult?.total).toBeGreaterThanOrEqual(1);
        return listResult;
      },
    },
    {
      operationId: 'links.get',
      prepare: async (sessionId) => {
        const target = await insertLink(sessionId);
        return { target };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('links.get', fixture);
        if (!f.target) throw new Error('links.get requires a link target fixture.');
        return callDocOperation<any>('links.get', { sessionId, target: f.target });
      },
    },
    {
      operationId: 'links.insert',
      prepare: async (sessionId) => {
        const textTarget = await seedTextTarget(sessionId, 'Insert a new link over this phrase.');
        return { textTarget };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('links.insert', fixture);
        if (!f.textTarget) throw new Error('links.insert requires a text target fixture.');

        const insertResult = await callDocOperation<any>('links.insert', {
          sessionId,
          at: f.textTarget,
          destination: {
            kind: 'external',
            href: 'https://example.com/links-inserted',
          },
        });

        const listResult = await callDocOperation<any>('links.list', { sessionId });
        expect(listResult?.total).toBeGreaterThanOrEqual(1);

        return insertResult;
      },
    },
    {
      operationId: 'links.update',
      prepare: async (sessionId) => {
        const target = await insertLink(sessionId);
        return { target };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('links.update', fixture);
        if (!f.target) throw new Error('links.update requires a link target fixture.');

        const updateResult = await callDocOperation<any>('links.update', {
          sessionId,
          target: f.target,
          patch: {
            destination: {
              kind: 'external',
              href: 'https://example.com/links-updated',
            },
            tooltip: 'updated-tooltip',
          },
        });

        const info = await callDocOperation<any>('links.get', {
          sessionId,
          target: f.target,
        });
        expect(info?.destination?.kind).toBe('external');
        expect(info?.destination?.href).toBe('https://example.com/links-updated');

        return updateResult;
      },
    },
    {
      operationId: 'links.remove',
      prepare: async (sessionId) => {
        const target = await insertLink(sessionId);
        const listBefore = await callDocOperation<any>('links.list', { sessionId });
        return {
          target,
          beforeTotal: typeof listBefore?.total === 'number' ? listBefore.total : undefined,
        };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('links.remove', fixture);
        if (!f.target) throw new Error('links.remove requires a link target fixture.');

        const removeResult = await callDocOperation<any>('links.remove', {
          sessionId,
          target: f.target,
        });

        const listAfter = await callDocOperation<any>('links.list', { sessionId });
        if (typeof f.beforeTotal === 'number') {
          expect(listAfter?.total).toBe(f.beforeTotal - 1);
        }

        return removeResult;
      },
    },
  ];

  it('covers every links command currently defined on this branch', () => {
    const scenarioIds = scenarios.map((scenario) => scenario.operationId);
    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
    expect(new Set(scenarioIds)).toEqual(new Set(ALL_LINKS_COMMAND_IDS));
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
