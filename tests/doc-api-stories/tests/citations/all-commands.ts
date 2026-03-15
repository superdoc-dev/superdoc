import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { corpusDoc, unwrap, useStoryHarness } from '../harness';

const ALL_CITATIONS_COMMAND_IDS = [
  'citations.list',
  'citations.get',
  'citations.insert',
  'citations.update',
  'citations.remove',
  'citations.sources.list',
  'citations.sources.get',
  'citations.sources.insert',
  'citations.sources.update',
  'citations.sources.remove',
  'citations.bibliography.get',
  'citations.bibliography.insert',
  'citations.bibliography.configure',
  'citations.bibliography.rebuild',
  'citations.bibliography.remove',
] as const;

type CitationCommandId = (typeof ALL_CITATIONS_COMMAND_IDS)[number];

type CitationAddress = {
  kind: 'inline';
  nodeType: 'citation';
  anchor: {
    start: { blockId: string; offset: number };
    end: { blockId: string; offset: number };
  };
};

type CitationSourceAddress = {
  kind: 'entity';
  entityType: 'citationSource';
  sourceId: string;
};

type BibliographyAddress = {
  kind: 'block';
  nodeType: 'bibliography';
  nodeId: string;
};

type TextTarget = {
  kind: 'text';
  segments: Array<{ blockId: string; range: { start: number; end: number } }>;
};

type CitationFixture = {
  citationTarget?: CitationAddress;
  sourceTarget?: CitationSourceAddress;
  sourceTarget2?: CitationSourceAddress;
  bibliographyTarget?: BibliographyAddress;
  textTarget?: TextTarget;
};

type Scenario = {
  operationId: CitationCommandId;
  prepare?: (sessionId: string) => Promise<CitationFixture | null>;
  run: (sessionId: string, fixture: CitationFixture | null) => Promise<any>;
};

const BASE_DOC = corpusDoc('basic/longer-header.docx');

describe('document-api story: all citations commands', () => {
  const { client, outPath } = useStoryHarness('citations/all-commands', {
    preserveResults: true,
  });

  const api = client as any;

  const readOperationIds = new Set<CitationCommandId>([
    'citations.list',
    'citations.get',
    'citations.sources.list',
    'citations.sources.get',
    'citations.bibliography.get',
  ]);

  function slug(operationId: CitationCommandId): string {
    return operationId.replace(/\./g, '-');
  }

  function makeSessionId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function sourceDocNameFor(operationId: CitationCommandId): string {
    return `${slug(operationId)}-source.docx`;
  }

  function resultDocNameFor(operationId: CitationCommandId): string {
    return `${slug(operationId)}.docx`;
  }

  function readOutputNameFor(operationId: CitationCommandId): string {
    return `${slug(operationId)}-read-output.json`;
  }

  async function saveReadOutput(operationId: CitationCommandId, result: any): Promise<void> {
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

  async function saveSource(sessionId: string, operationId: CitationCommandId): Promise<void> {
    await callDocOperation('save', {
      sessionId,
      out: outPath(sourceDocNameFor(operationId)),
      force: true,
    });
  }

  async function saveResult(sessionId: string, operationId: CitationCommandId): Promise<void> {
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

  function assertReadOutput(operationId: CitationCommandId, result: any): void {
    if (operationId === 'citations.list') {
      expect(Array.isArray(result?.items)).toBe(true);
      expect(typeof result?.total).toBe('number');
      return;
    }

    if (operationId === 'citations.get') {
      expect(result?.address?.kind).toBe('inline');
      expect(result?.address?.nodeType).toBe('citation');
      return;
    }

    if (operationId === 'citations.sources.list') {
      expect(Array.isArray(result?.items)).toBe(true);
      expect(typeof result?.total).toBe('number');
      return;
    }

    if (operationId === 'citations.sources.get') {
      expect(result?.address?.kind).toBe('entity');
      expect(result?.address?.entityType).toBe('citationSource');
      return;
    }

    if (operationId === 'citations.bibliography.get') {
      expect(result?.address?.kind).toBe('block');
      expect(result?.address?.nodeType).toBe('bibliography');
      return;
    }

    throw new Error(`Unexpected read assertion branch for ${operationId}.`);
  }

  function requireFixture(operationId: CitationCommandId, fixture: CitationFixture | null): CitationFixture {
    if (!fixture) throw new Error(`${operationId} requires a citations fixture.`);
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
      throw new Error('insert did not return a blockId for citations text targeting.');
    }
    return makeTextTarget(blockId, Math.max(1, Math.min(10, text.length)));
  }

  function extractCitationAddress(item: any): CitationAddress | null {
    return (item?.address ?? item?.domain?.address ?? null) as CitationAddress | null;
  }

  async function insertCitationSource(sessionId: string, title: string): Promise<CitationSourceAddress> {
    const insertResult = await callDocOperation<any>('citations.sources.insert', {
      sessionId,
      type: 'book',
      fields: {
        title,
        year: '2025',
      },
    });
    assertMutationSuccess('citations.sources.insert', insertResult);

    const source = insertResult?.source as CitationSourceAddress | undefined;
    if (!source?.sourceId) {
      throw new Error('citations.sources.insert did not return a source address.');
    }
    return source;
  }

  async function insertCitation(sessionId: string, sourceIds: string[]): Promise<CitationAddress> {
    const at = await seedTextTarget(sessionId, 'Citation host text.');
    const insertResult = await callDocOperation<any>('citations.insert', {
      sessionId,
      at,
      sourceIds,
    });
    assertMutationSuccess('citations.insert', insertResult);

    const listResult = await callDocOperation<any>('citations.list', { sessionId });
    const target = extractCitationAddress(listResult?.items?.[0]);
    if (!target) {
      throw new Error('Unable to resolve inserted citation address from citations.list.');
    }
    return target;
  }

  async function insertBibliography(sessionId: string): Promise<BibliographyAddress> {
    const insertResult = await callDocOperation<any>('citations.bibliography.insert', {
      sessionId,
      at: { kind: 'documentEnd' },
    });
    assertMutationSuccess('citations.bibliography.insert', insertResult);

    const target = insertResult?.bibliography as BibliographyAddress | undefined;
    if (!target?.nodeId) {
      throw new Error('citations.bibliography.insert did not return a bibliography address.');
    }
    return target;
  }

  const scenarios: Scenario[] = [
    {
      operationId: 'citations.list',
      prepare: async (sessionId) => {
        const source = await insertCitationSource(sessionId, `List Source ${Date.now()}`);
        await insertCitation(sessionId, [source.sourceId]);
        return null;
      },
      run: async (sessionId) => {
        const result = await callDocOperation<any>('citations.list', { sessionId });
        expect(result?.total).toBeGreaterThanOrEqual(1);
        return result;
      },
    },
    {
      operationId: 'citations.get',
      prepare: async (sessionId) => {
        const source = await insertCitationSource(sessionId, `Get Source ${Date.now()}`);
        const citationTarget = await insertCitation(sessionId, [source.sourceId]);
        return { citationTarget };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('citations.get', fixture);
        if (!f.citationTarget) throw new Error('citations.get requires a citation target fixture.');
        return callDocOperation<any>('citations.get', {
          sessionId,
          target: f.citationTarget,
        });
      },
    },
    {
      operationId: 'citations.insert',
      prepare: async (sessionId) => {
        const sourceTarget = await insertCitationSource(sessionId, `Insert Source ${Date.now()}`);
        const textTarget = await seedTextTarget(sessionId, 'Insert citation here.');
        return { sourceTarget, textTarget };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('citations.insert', fixture);
        if (!f.sourceTarget || !f.textTarget) {
          throw new Error('citations.insert requires source + text target fixtures.');
        }

        const insertResult = await callDocOperation<any>('citations.insert', {
          sessionId,
          at: f.textTarget,
          sourceIds: [f.sourceTarget.sourceId],
        });

        const listResult = await callDocOperation<any>('citations.list', { sessionId });
        expect(listResult?.total).toBeGreaterThanOrEqual(1);

        return insertResult;
      },
    },
    {
      operationId: 'citations.update',
      prepare: async (sessionId) => {
        const sourceTarget = await insertCitationSource(sessionId, `Update Source A ${Date.now()}`);
        const sourceTarget2 = await insertCitationSource(sessionId, `Update Source B ${Date.now()}`);
        const citationTarget = await insertCitation(sessionId, [sourceTarget.sourceId]);
        return { citationTarget, sourceTarget, sourceTarget2 };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('citations.update', fixture);
        if (!f.citationTarget || !f.sourceTarget2) {
          throw new Error('citations.update requires citation + secondary source fixtures.');
        }

        const updateResult = await callDocOperation<any>('citations.update', {
          sessionId,
          target: f.citationTarget,
          patch: {
            sourceIds: [f.sourceTarget2.sourceId],
          },
        });

        const info = await callDocOperation<any>('citations.get', {
          sessionId,
          target: f.citationTarget,
        });
        expect(info?.sourceIds).toEqual([f.sourceTarget2.sourceId]);

        return updateResult;
      },
    },
    {
      operationId: 'citations.remove',
      prepare: async (sessionId) => {
        const sourceTarget = await insertCitationSource(sessionId, `Remove Source ${Date.now()}`);
        const citationTarget = await insertCitation(sessionId, [sourceTarget.sourceId]);
        return { citationTarget };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('citations.remove', fixture);
        if (!f.citationTarget) throw new Error('citations.remove requires a citation target fixture.');

        const before = await callDocOperation<any>('citations.list', { sessionId });
        const removeResult = await callDocOperation<any>('citations.remove', {
          sessionId,
          target: f.citationTarget,
        });
        const after = await callDocOperation<any>('citations.list', { sessionId });
        expect(after?.total).toBe((before?.total ?? 0) - 1);

        return removeResult;
      },
    },
    {
      operationId: 'citations.sources.list',
      prepare: async (sessionId) => {
        await insertCitationSource(sessionId, `Sources List ${Date.now()}`);
        return null;
      },
      run: async (sessionId) => {
        const result = await callDocOperation<any>('citations.sources.list', { sessionId });
        expect(result?.total).toBeGreaterThanOrEqual(1);
        return result;
      },
    },
    {
      operationId: 'citations.sources.get',
      prepare: async (sessionId) => ({
        sourceTarget: await insertCitationSource(sessionId, `Sources Get ${Date.now()}`),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('citations.sources.get', fixture);
        if (!f.sourceTarget) throw new Error('citations.sources.get requires a source target fixture.');
        return callDocOperation<any>('citations.sources.get', {
          sessionId,
          target: f.sourceTarget,
        });
      },
    },
    {
      operationId: 'citations.sources.insert',
      run: async (sessionId) => {
        const insertResult = await callDocOperation<any>('citations.sources.insert', {
          sessionId,
          type: 'book',
          fields: {
            title: `Inserted Source ${Date.now()}`,
            year: '2024',
          },
        });

        const listResult = await callDocOperation<any>('citations.sources.list', { sessionId });
        expect(listResult?.total).toBeGreaterThanOrEqual(1);

        return insertResult;
      },
    },
    {
      operationId: 'citations.sources.update',
      prepare: async (sessionId) => ({
        sourceTarget: await insertCitationSource(sessionId, `Sources Update ${Date.now()}`),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('citations.sources.update', fixture);
        if (!f.sourceTarget) throw new Error('citations.sources.update requires a source target fixture.');

        const updateResult = await callDocOperation<any>('citations.sources.update', {
          sessionId,
          target: f.sourceTarget,
          patch: {
            title: 'Updated Source Title',
          },
        });

        const info = await callDocOperation<any>('citations.sources.get', {
          sessionId,
          target: f.sourceTarget,
        });
        expect(info?.fields?.title).toBe('Updated Source Title');

        return updateResult;
      },
    },
    {
      operationId: 'citations.sources.remove',
      prepare: async (sessionId) => ({
        sourceTarget: await insertCitationSource(sessionId, `Sources Remove ${Date.now()}`),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('citations.sources.remove', fixture);
        if (!f.sourceTarget) throw new Error('citations.sources.remove requires a source target fixture.');

        const before = await callDocOperation<any>('citations.sources.list', { sessionId });
        const removeResult = await callDocOperation<any>('citations.sources.remove', {
          sessionId,
          target: f.sourceTarget,
        });
        const after = await callDocOperation<any>('citations.sources.list', { sessionId });
        expect(after?.total).toBe((before?.total ?? 0) - 1);

        return removeResult;
      },
    },
    {
      operationId: 'citations.bibliography.get',
      prepare: async (sessionId) => ({
        bibliographyTarget: await insertBibliography(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('citations.bibliography.get', fixture);
        if (!f.bibliographyTarget) {
          throw new Error('citations.bibliography.get requires a bibliography target fixture.');
        }
        return callDocOperation<any>('citations.bibliography.get', {
          sessionId,
          target: f.bibliographyTarget,
        });
      },
    },
    {
      operationId: 'citations.bibliography.insert',
      run: async (sessionId) => {
        const insertResult = await callDocOperation<any>('citations.bibliography.insert', {
          sessionId,
          at: { kind: 'documentEnd' },
        });
        const target = insertResult?.bibliography;
        expect(target?.nodeId).toBeDefined();
        return insertResult;
      },
    },
    {
      operationId: 'citations.bibliography.configure',
      prepare: async (sessionId) => ({
        bibliographyTarget: await insertBibliography(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('citations.bibliography.configure', fixture);
        if (!f.bibliographyTarget) {
          throw new Error('citations.bibliography.configure requires a bibliography target fixture.');
        }

        const configureResult = await callDocOperation<any>('citations.bibliography.configure', {
          sessionId,
          style: 'APA',
        });

        const info = await callDocOperation<any>('citations.bibliography.get', {
          sessionId,
          target: f.bibliographyTarget,
        });
        expect(typeof info?.style).toBe('string');

        return configureResult;
      },
    },
    {
      operationId: 'citations.bibliography.rebuild',
      prepare: async (sessionId) => ({
        bibliographyTarget: await insertBibliography(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('citations.bibliography.rebuild', fixture);
        if (!f.bibliographyTarget) {
          throw new Error('citations.bibliography.rebuild requires a bibliography target fixture.');
        }
        return callDocOperation<any>('citations.bibliography.rebuild', {
          sessionId,
          target: f.bibliographyTarget,
        });
      },
    },
    {
      operationId: 'citations.bibliography.remove',
      prepare: async (sessionId) => ({
        bibliographyTarget: await insertBibliography(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('citations.bibliography.remove', fixture);
        if (!f.bibliographyTarget) {
          throw new Error('citations.bibliography.remove requires a bibliography target fixture.');
        }

        const removeResult = await callDocOperation<any>('citations.bibliography.remove', {
          sessionId,
          target: f.bibliographyTarget,
        });

        let didThrow = false;
        try {
          await callDocOperation('citations.bibliography.get', {
            sessionId,
            target: f.bibliographyTarget,
          });
        } catch {
          didThrow = true;
        }
        expect(didThrow).toBe(true);

        return removeResult;
      },
    },
  ];

  it('covers every citations command currently defined on this branch', () => {
    const scenarioIds = scenarios.map((scenario) => scenario.operationId);
    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
    expect(new Set(scenarioIds)).toEqual(new Set(ALL_CITATIONS_COMMAND_IDS));
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
