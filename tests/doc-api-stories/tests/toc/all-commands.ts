import { describe, expect, it } from 'vitest';
import { copyFile, writeFile } from 'node:fs/promises';
import { unwrap, useStoryHarness } from '../harness';

const ALL_TOC_COMMAND_IDS = [
  'create.tableOfContents',
  'toc.list',
  'toc.get',
  'toc.configure',
  'toc.update',
  'toc.remove',
] as const;

type TocCommandId = (typeof ALL_TOC_COMMAND_IDS)[number];

type TocTarget = {
  kind: 'block';
  nodeType: 'tableOfContents';
  nodeId: string;
};

type TocFixture = {
  target: TocTarget;
};

type Scenario = {
  operationId: TocCommandId;
  prepareSource: (sourceDoc: string) => Promise<TocFixture | null>;
  run: (sourceDoc: string, resultDoc: string, fixture: TocFixture | null) => Promise<any>;
};

describe('document-api story: all toc commands', () => {
  const { client, outPath, runCli } = useStoryHarness('toc/all-commands', {
    preserveResults: true,
  });

  const api = client as any;
  const readOperationIds = new Set<TocCommandId>(['toc.list', 'toc.get']);

  function slug(operationId: TocCommandId): string {
    return operationId.replace(/\./g, '-');
  }

  function makeSessionId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function sourceDocNameFor(operationId: TocCommandId): string {
    return `${slug(operationId)}-source.docx`;
  }

  function resultDocNameFor(operationId: TocCommandId): string {
    return `${slug(operationId)}.docx`;
  }

  function readOutputNameFor(operationId: TocCommandId): string {
    return `${slug(operationId)}-read-output.json`;
  }

  async function saveReadOutput(operationId: TocCommandId, result: any): Promise<void> {
    await writeFile(
      outPath(readOutputNameFor(operationId)),
      `${JSON.stringify({ operationId, output: result }, null, 2)}\n`,
      'utf8',
    );
  }

  function assertMutationSuccess(operationId: string, result: any): void {
    if (result?.success === true || result?.receipt?.success === true) return;
    const code = result?.failure?.code ?? result?.receipt?.failure?.code ?? 'UNKNOWN';
    throw new Error(`${operationId} did not report success (code: ${code}).`);
  }

  function assertReadOutput(operationId: TocCommandId, result: any): void {
    if (operationId === 'toc.list') {
      expect(Array.isArray(result?.items)).toBe(true);
      expect(typeof result?.total).toBe('number');
      expect(result?.page).toBeDefined();
      return;
    }

    if (operationId === 'toc.get') {
      expect(result?.nodeType).toBe('tableOfContents');
      expect(result?.kind).toBe('block');
      expect(typeof result?.properties?.instruction).toBe('string');
      expect(typeof result?.properties?.entryCount).toBe('number');
      return;
    }

    throw new Error(`Unexpected read assertion branch for ${operationId}.`);
  }

  function requireFixture(operationId: TocCommandId, fixture: TocFixture | null): TocFixture {
    if (!fixture) throw new Error(`${operationId} requires a TOC fixture.`);
    return fixture;
  }

  async function seedHeadingContent(sessionId: string): Promise<void> {
    const insertResult = unwrap<any>(await api.doc.insert({ sessionId, value: 'TOC story seed paragraph.' }));
    expect(insertResult?.receipt?.success).toBe(true);

    const h1 = unwrap<any>(
      await api.doc.create.heading({
        sessionId,
        level: 1,
        at: { kind: 'documentEnd' },
        text: 'Overview',
      }),
    );
    assertMutationSuccess('create.tableOfContents', h1);

    const h2 = unwrap<any>(
      await api.doc.create.heading({
        sessionId,
        level: 2,
        at: { kind: 'documentEnd' },
        text: 'Scope',
      }),
    );
    assertMutationSuccess('create.tableOfContents', h2);

    const h3 = unwrap<any>(
      await api.doc.create.heading({
        sessionId,
        level: 3,
        at: { kind: 'documentEnd' },
        text: 'Deliverables',
      }),
    );
    assertMutationSuccess('create.tableOfContents', h3);
  }

  async function callDocOperation<T>(operationId: string, input: Record<string, unknown>): Promise<T> {
    const normalizedInput = { ...input };
    if (typeof normalizedInput.out === 'string' && normalizedInput.out.length > 0 && normalizedInput.force == null) {
      normalizedInput.force = true;
    }

    const envelope = await runCli(['call', `doc.${operationId}`, '--input-json', JSON.stringify(normalizedInput)]);
    return unwrap<T>(unwrap<any>(envelope?.data));
  }

  async function resolveFirstTocTarget(doc: string): Promise<TocTarget> {
    const listResult = await callDocOperation<any>('toc.list', { doc });
    const target = listResult?.items?.[0]?.address;
    if (!target?.nodeId) {
      throw new Error('Unable to resolve TOC target from toc.list.');
    }
    return target as TocTarget;
  }

  async function buildHeadingsSourceDoc(docPath: string): Promise<void> {
    const sessionId = makeSessionId('toc-seed');
    await api.doc.open({ sessionId });
    await seedHeadingContent(sessionId);
    await api.doc.save({
      sessionId,
      out: docPath,
      force: true,
    });
  }

  async function setupSingleTocSourceDoc(docPath: string): Promise<TocFixture> {
    await buildHeadingsSourceDoc(docPath);

    const createResult = await callDocOperation<any>('create.tableOfContents', {
      doc: docPath,
      out: docPath,
      at: { kind: 'documentStart' },
      config: { hyperlinks: true, outlineLevels: { from: 1, to: 3 } },
    });
    assertMutationSuccess('create.tableOfContents', createResult);

    const target = await resolveFirstTocTarget(docPath);
    return { target };
  }

  async function setupMultipleTocSourceDoc(docPath: string): Promise<void> {
    await buildHeadingsSourceDoc(docPath);

    const startToc = await callDocOperation<any>('create.tableOfContents', {
      doc: docPath,
      out: docPath,
      at: { kind: 'documentStart' },
      config: { hyperlinks: true, outlineLevels: { from: 1, to: 3 } },
    });
    assertMutationSuccess('create.tableOfContents', startToc);

    const endToc = await callDocOperation<any>('create.tableOfContents', {
      doc: docPath,
      out: docPath,
      at: { kind: 'documentEnd' },
      config: { hyperlinks: false, separator: ' - ', outlineLevels: { from: 1, to: 2 } },
    });
    assertMutationSuccess('create.tableOfContents', endToc);
  }

  async function setupStaleTocSourceDoc(docPath: string): Promise<TocFixture> {
    const fixture = await setupSingleTocSourceDoc(docPath);

    const addHeadingResult = await callDocOperation<any>('create.heading', {
      doc: docPath,
      out: docPath,
      at: { kind: 'documentEnd' },
      level: 2,
      text: 'Risks',
    });
    assertMutationSuccess('create.heading', addHeadingResult);

    return fixture;
  }

  const scenarios: Scenario[] = [
    {
      operationId: 'create.tableOfContents',
      prepareSource: async (sourceDoc) => {
        await buildHeadingsSourceDoc(sourceDoc);
        return null;
      },
      run: async (sourceDoc, resultDoc) => {
        const beforeList = await callDocOperation<any>('toc.list', { doc: sourceDoc });
        expect(beforeList?.total).toBe(0);

        const createResult = await callDocOperation<any>('create.tableOfContents', {
          doc: sourceDoc,
          out: resultDoc,
          at: { kind: 'documentStart' },
          config: { hyperlinks: true, outlineLevels: { from: 1, to: 3 } },
        });

        const listResult = await callDocOperation<any>('toc.list', { doc: resultDoc });
        expect(listResult?.total).toBeGreaterThanOrEqual(1);
        const createdTarget = listResult?.items?.[0]?.address as TocTarget | undefined;
        if (!createdTarget) {
          throw new Error('create.tableOfContents did not produce a discoverable TOC.');
        }

        const createdInfo = await callDocOperation<any>('toc.get', { doc: resultDoc, target: createdTarget });
        expect(createdInfo?.properties?.entryCount).toBeGreaterThan(0);

        return createResult;
      },
    },
    {
      operationId: 'toc.list',
      prepareSource: async (sourceDoc) => {
        await setupMultipleTocSourceDoc(sourceDoc);
        return null;
      },
      run: async (sourceDoc) => {
        const listResult = await callDocOperation<any>('toc.list', { doc: sourceDoc });
        expect(listResult?.total).toBeGreaterThanOrEqual(2);
        for (const item of listResult?.items ?? []) {
          expect(item?.address?.nodeType).toBe('tableOfContents');
        }
        return listResult;
      },
    },
    {
      operationId: 'toc.get',
      prepareSource: async (sourceDoc) => setupSingleTocSourceDoc(sourceDoc),
      run: async (sourceDoc, _resultDoc, fixture) => {
        const f = requireFixture('toc.get', fixture);
        return callDocOperation<any>('toc.get', { doc: sourceDoc, target: f.target });
      },
    },
    {
      operationId: 'toc.configure',
      prepareSource: async (sourceDoc) => setupSingleTocSourceDoc(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('toc.configure', fixture);
        const beforeInfo = await callDocOperation<any>('toc.get', { doc: sourceDoc, target: f.target });
        const configureResult = await callDocOperation<any>('toc.configure', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.target,
          patch: {
            hyperlinks: false,
            separator: ' · ',
            omitPageNumberLevels: { from: 2, to: 3 },
          },
        });

        const refreshedTarget = await resolveFirstTocTarget(resultDoc);
        const afterInfo = await callDocOperation<any>('toc.get', { doc: resultDoc, target: refreshedTarget });
        expect(beforeInfo?.properties?.instruction).not.toBe(afterInfo?.properties?.instruction);
        expect(afterInfo?.properties?.instruction).not.toContain('\\h');
        expect(afterInfo?.properties?.instruction).toContain('\\n "2-3"');
        expect(afterInfo?.properties?.instruction).toContain('\\p " · "');
        expect(afterInfo?.properties?.displayConfig?.separator).toBe(' · ');
        expect(afterInfo?.properties?.displayConfig?.omitPageNumberLevels).toEqual({ from: 2, to: 3 });
        expect(afterInfo?.properties?.entryCount).toBeGreaterThan(0);

        return configureResult;
      },
    },
    {
      operationId: 'toc.update',
      prepareSource: async (sourceDoc) => setupStaleTocSourceDoc(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('toc.update', fixture);
        const sourceTarget = await resolveFirstTocTarget(sourceDoc);
        const beforeInfo = await callDocOperation<any>('toc.get', { doc: sourceDoc, target: sourceTarget });

        const updateResult = await callDocOperation<any>('toc.update', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.target,
        });

        const refreshedTarget = await resolveFirstTocTarget(resultDoc);
        const afterInfo = await callDocOperation<any>('toc.get', { doc: resultDoc, target: refreshedTarget });
        expect(afterInfo?.properties?.entryCount).toBe((beforeInfo?.properties?.entryCount ?? 0) + 1);

        return updateResult;
      },
    },
    {
      operationId: 'toc.remove',
      prepareSource: async (sourceDoc) => setupSingleTocSourceDoc(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('toc.remove', fixture);
        const beforeList = await callDocOperation<any>('toc.list', { doc: sourceDoc });
        expect(beforeList?.total).toBe(1);

        const removeResult = await callDocOperation<any>('toc.remove', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.target,
        });

        const afterList = await callDocOperation<any>('toc.list', { doc: resultDoc });
        expect(afterList?.total).toBe(0);

        return removeResult;
      },
    },
  ];

  it('covers every toc command currently defined on this branch', () => {
    const scenarioIds = scenarios.map((scenario) => scenario.operationId);
    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
    expect(new Set(scenarioIds)).toEqual(new Set(ALL_TOC_COMMAND_IDS));
  });

  for (const scenario of scenarios) {
    it(`${scenario.operationId}: executes and saves source/result docs`, async () => {
      const sourceDoc = outPath(sourceDocNameFor(scenario.operationId));
      const resultDoc = outPath(resultDocNameFor(scenario.operationId));

      const fixture = await scenario.prepareSource(sourceDoc);

      const result = await scenario.run(sourceDoc, resultDoc, fixture);

      if (readOperationIds.has(scenario.operationId)) {
        assertReadOutput(scenario.operationId, result);
        await saveReadOutput(scenario.operationId, result);
        await copyFile(sourceDoc, resultDoc);
      } else {
        assertMutationSuccess(scenario.operationId, result);
      }
    });
  }
});
