import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { corpusDoc, unwrap, useStoryHarness } from '../harness';

const ALL_CAPTION_COMMAND_IDS = [
  'captions.list',
  'captions.get',
  'captions.insert',
  'captions.update',
  'captions.remove',
  'captions.configure',
] as const;

type CaptionCommandId = (typeof ALL_CAPTION_COMMAND_IDS)[number];

type CaptionAddress = {
  kind: 'block';
  nodeType: 'paragraph';
  nodeId: string;
};

type BlockAddress = {
  kind: 'block';
  nodeType: string;
  nodeId: string;
};

type CaptionFixture = {
  target?: CaptionAddress;
  adjacentTo?: BlockAddress;
  label?: string;
};

type Scenario = {
  operationId: CaptionCommandId;
  prepare?: (sessionId: string) => Promise<CaptionFixture | null>;
  run: (sessionId: string, fixture: CaptionFixture | null) => Promise<any>;
};

const BASE_DOC = corpusDoc('basic/longer-header.docx');

describe('document-api story: all captions commands', () => {
  const { client, outPath } = useStoryHarness('captions/all-commands', {
    preserveResults: true,
  });

  const api = client as any;

  const readOperationIds = new Set<CaptionCommandId>(['captions.list', 'captions.get']);

  function slug(operationId: CaptionCommandId): string {
    return operationId.replace(/\./g, '-');
  }

  function makeSessionId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function sourceDocNameFor(operationId: CaptionCommandId): string {
    return `${slug(operationId)}-source.docx`;
  }

  function resultDocNameFor(operationId: CaptionCommandId): string {
    return `${slug(operationId)}.docx`;
  }

  function readOutputNameFor(operationId: CaptionCommandId): string {
    return `${slug(operationId)}-read-output.json`;
  }

  async function saveReadOutput(operationId: CaptionCommandId, result: any): Promise<void> {
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

  async function saveSource(sessionId: string, operationId: CaptionCommandId): Promise<void> {
    await callDocOperation('save', {
      sessionId,
      out: outPath(sourceDocNameFor(operationId)),
      force: true,
    });
  }

  async function saveResult(sessionId: string, operationId: CaptionCommandId): Promise<void> {
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

  function assertReadOutput(operationId: CaptionCommandId, result: any): void {
    if (operationId === 'captions.list') {
      expect(Array.isArray(result?.items)).toBe(true);
      expect(typeof result?.total).toBe('number');
      return;
    }

    if (operationId === 'captions.get') {
      expect(result?.address?.kind).toBe('block');
      expect(result?.address?.nodeType).toBe('paragraph');
      expect(typeof result?.label).toBe('string');
      return;
    }

    throw new Error(`Unexpected read assertion branch for ${operationId}.`);
  }

  function requireFixture(operationId: CaptionCommandId, fixture: CaptionFixture | null): CaptionFixture {
    if (!fixture) throw new Error(`${operationId} requires a caption fixture.`);
    return fixture;
  }

  function extractCaptionAddress(item: any): CaptionAddress | null {
    return (item?.address ?? item?.domain?.address ?? null) as CaptionAddress | null;
  }

  async function createAdjacentParagraph(sessionId: string): Promise<BlockAddress> {
    const createResult = await callDocOperation<any>('create.paragraph', {
      sessionId,
      at: { kind: 'documentEnd' },
      text: 'Caption host paragraph.',
    });
    assertMutationSuccess('create.paragraph', createResult);

    const paragraph = createResult?.paragraph;
    if (!paragraph?.nodeId) {
      throw new Error('create.paragraph did not return a paragraph block address.');
    }

    return {
      kind: 'block',
      nodeType: paragraph.nodeType,
      nodeId: paragraph.nodeId,
    };
  }

  async function insertCaption(sessionId: string, label: string): Promise<CaptionAddress> {
    const adjacentTo = await createAdjacentParagraph(sessionId);
    const insertResult = await callDocOperation<any>('captions.insert', {
      sessionId,
      adjacentTo,
      position: 'below',
      label,
      text: 'Story caption text',
    });
    assertMutationSuccess('captions.insert', insertResult);

    const listResult = await callDocOperation<any>('captions.list', { sessionId, label });
    const target = extractCaptionAddress(listResult?.items?.[0]);
    if (!target) {
      throw new Error('Unable to resolve inserted caption address from captions.list.');
    }

    return target;
  }

  const scenarios: Scenario[] = [
    {
      operationId: 'captions.list',
      prepare: async (sessionId) => {
        const label = `FigureList${Date.now()}`;
        await insertCaption(sessionId, label);
        return { label };
      },
      run: async (sessionId, fixture) => {
        const label = fixture?.label;
        const result = await callDocOperation<any>('captions.list', {
          sessionId,
          ...(label ? { label } : {}),
        });
        expect(result?.total).toBeGreaterThanOrEqual(1);
        return result;
      },
    },
    {
      operationId: 'captions.get',
      prepare: async (sessionId) => {
        const label = `FigureGet${Date.now()}`;
        const target = await insertCaption(sessionId, label);
        return { target, label };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('captions.get', fixture);
        if (!f.target) throw new Error('captions.get requires a caption target fixture.');
        return callDocOperation<any>('captions.get', {
          sessionId,
          target: f.target,
        });
      },
    },
    {
      operationId: 'captions.insert',
      prepare: async (sessionId) => ({
        adjacentTo: await createAdjacentParagraph(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('captions.insert', fixture);
        if (!f.adjacentTo) throw new Error('captions.insert requires an adjacent block fixture.');

        const label = `FigureInsert${Date.now()}`;
        const insertResult = await callDocOperation<any>('captions.insert', {
          sessionId,
          adjacentTo: f.adjacentTo,
          position: 'below',
          label,
          text: 'Inserted caption text',
        });

        const listResult = await callDocOperation<any>('captions.list', { sessionId, label });
        expect(listResult?.total).toBeGreaterThanOrEqual(1);

        return insertResult;
      },
    },
    {
      operationId: 'captions.update',
      prepare: async (sessionId) => ({
        target: await insertCaption(sessionId, `FigureUpdate${Date.now()}`),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('captions.update', fixture);
        if (!f.target) throw new Error('captions.update requires a caption target fixture.');

        const updateResult = await callDocOperation<any>('captions.update', {
          sessionId,
          target: f.target,
          patch: {
            text: 'Updated caption text from story.',
          },
        });

        const info = await callDocOperation<any>('captions.get', {
          sessionId,
          target: f.target,
        });
        expect(info?.text).toContain('Updated caption text from story.');

        return updateResult;
      },
    },
    {
      operationId: 'captions.remove',
      prepare: async (sessionId) => ({
        target: await insertCaption(sessionId, `FigureRemove${Date.now()}`),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('captions.remove', fixture);
        if (!f.target) throw new Error('captions.remove requires a caption target fixture.');

        const before = await callDocOperation<any>('captions.list', { sessionId });
        const removeResult = await callDocOperation<any>('captions.remove', {
          sessionId,
          target: f.target,
        });
        const after = await callDocOperation<any>('captions.list', { sessionId });
        expect(after?.total).toBe((before?.total ?? 0) - 1);

        return removeResult;
      },
    },
    {
      operationId: 'captions.configure',
      prepare: async (sessionId) => {
        const label = `FigureConfigure${Date.now()}`;
        await insertCaption(sessionId, label);
        return { label };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('captions.configure', fixture);
        if (!f.label) throw new Error('captions.configure requires a label fixture.');

        return callDocOperation<any>('captions.configure', {
          sessionId,
          label: f.label,
          format: 'upperRoman',
          includeChapter: false,
        });
      },
    },
  ];

  it('covers every captions command currently defined on this branch', () => {
    const scenarioIds = scenarios.map((scenario) => scenario.operationId);
    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
    expect(new Set(scenarioIds)).toEqual(new Set(ALL_CAPTION_COMMAND_IDS));
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
