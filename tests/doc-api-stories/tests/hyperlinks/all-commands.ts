import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { corpusDoc, unwrap, useStoryHarness } from '../harness';

const ALL_HYPERLINK_COMMAND_IDS = [
  'hyperlinks.list',
  'hyperlinks.get',
  'hyperlinks.wrap',
  'hyperlinks.insert',
  'hyperlinks.patch',
  'hyperlinks.remove',
] as const;
const COMMAND_STORY_TIMEOUT_MS = 60_000;

type HyperlinksCommandId = (typeof ALL_HYPERLINK_COMMAND_IDS)[number];

type HyperlinkTarget = {
  kind: 'inline';
  nodeType: 'hyperlink';
  anchor: {
    start: { blockId: string; offset: number };
    end: { blockId: string; offset: number };
  };
};

type TextTarget = {
  kind: 'text';
  blockId: string;
  range: { start: number; end: number };
};

type HyperlinksFixture = {
  target?: HyperlinkTarget;
  textTarget?: TextTarget;
  removedText?: string;
  beforeTotal?: number;
};

type Scenario = {
  operationId: HyperlinksCommandId;
  setup: 'corpus';
  prepare?: (sessionId: string) => Promise<HyperlinksFixture | null>;
  run: (sessionId: string, fixture: HyperlinksFixture | null) => Promise<any>;
};

const CORPUS_HYPERLINK_FIXTURE = corpusDoc('basic/hyperlink-font-size.docx');
const WRAP_PARAGRAPH_TEXT = 'This sentence has a wrap target phrase for hyperlink wrapping.';
const WRAP_PHRASE = 'wrap target phrase';

describe('document-api story: all hyperlinks commands', () => {
  const { outPath, runCli } = useStoryHarness('hyperlinks/all-commands', {
    preserveResults: true,
  });
  const readOperationIds = new Set<HyperlinksCommandId>(['hyperlinks.list', 'hyperlinks.get']);

  function makeSessionId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function slug(operationId: HyperlinksCommandId): string {
    return operationId.replace(/\./g, '-');
  }

  function sourceDocNameFor(operationId: HyperlinksCommandId): string {
    return `${slug(operationId)}-source.docx`;
  }

  function resultDocNameFor(operationId: HyperlinksCommandId): string {
    return `${slug(operationId)}.docx`;
  }

  function readOutputNameFor(operationId: HyperlinksCommandId): string {
    return `${slug(operationId)}-read-output.json`;
  }

  async function saveReadOutput(operationId: HyperlinksCommandId, result: any): Promise<void> {
    await writeFile(
      outPath(readOutputNameFor(operationId)),
      `${JSON.stringify({ operationId, output: result }, null, 2)}\n`,
      'utf8',
    );
  }

  async function saveSource(sessionId: string, operationId: HyperlinksCommandId): Promise<void> {
    await callDocOperation('save', {
      sessionId,
      out: outPath(sourceDocNameFor(operationId)),
      force: true,
    });
  }

  async function saveResult(sessionId: string, operationId: HyperlinksCommandId): Promise<void> {
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

  function assertReadOutput(operationId: HyperlinksCommandId, result: any): void {
    if (operationId === 'hyperlinks.list') {
      expect(Array.isArray(result?.items)).toBe(true);
      expect(typeof result?.total).toBe('number');
      expect(result?.page).toBeDefined();
      return;
    }

    if (operationId === 'hyperlinks.get') {
      expect(result?.address?.kind).toBe('inline');
      expect(result?.address?.nodeType).toBe('hyperlink');
      const href = result?.properties?.href;
      const anchor = result?.properties?.anchor;
      expect(typeof href === 'string' || typeof anchor === 'string').toBe(true);
      return;
    }

    throw new Error(`Unexpected read assertion branch for ${operationId}.`);
  }

  function requireFixture(operationId: HyperlinksCommandId, fixture: HyperlinksFixture | null): HyperlinksFixture {
    if (!fixture) throw new Error(`${operationId} requires a fixture.`);
    return fixture;
  }

  async function callDocOperation<T>(operationId: string, input: Record<string, unknown>): Promise<T> {
    const envelope = await runCli(['call', `doc.${operationId}`, '--input-json', JSON.stringify(input)]);
    return unwrap<T>(unwrap<any>(envelope?.data));
  }

  async function listHyperlinks(sessionId: string): Promise<any> {
    return callDocOperation<any>('hyperlinks.list', { sessionId });
  }

  async function resolveFirstHyperlinkTarget(sessionId: string): Promise<HyperlinkTarget> {
    const listResult = await listHyperlinks(sessionId);
    const target = listResult?.items?.[0]?.address;
    if (!target?.anchor?.start?.blockId || !target?.anchor?.end?.blockId) {
      throw new Error('Unable to resolve hyperlink target from hyperlinks.list.');
    }
    return target as HyperlinkTarget;
  }

  async function seedWrapSource(sessionId: string): Promise<TextTarget> {
    const insertResult = await callDocOperation<any>('insert', { sessionId, value: WRAP_PARAGRAPH_TEXT });
    expect(insertResult?.receipt?.success).toBe(true);

    const resolutionTarget = insertResult?.receipt?.resolution?.target;
    const blockId =
      insertResult?.target?.blockId ?? resolutionTarget?.anchor?.start?.blockId ?? resolutionTarget?.nodeId;
    if (typeof blockId !== 'string' || blockId.length === 0) {
      throw new Error('Wrap setup failed: insert did not return a blockId.');
    }
    const baseOffset =
      typeof resolutionTarget?.anchor?.start?.offset === 'number' ? resolutionTarget.anchor.start.offset : 0;

    const start = WRAP_PARAGRAPH_TEXT.indexOf(WRAP_PHRASE);
    if (start < 0) throw new Error('Wrap setup failed: phrase was not found in seed text.');
    const end = start + WRAP_PHRASE.length;

    return {
      kind: 'text',
      blockId,
      range: { start: baseOffset + start, end: baseOffset + end },
    };
  }

  const scenarios: Scenario[] = [
    {
      operationId: 'hyperlinks.list',
      setup: 'corpus',
      run: async (sessionId) => {
        const listResult = await listHyperlinks(sessionId);
        expect(listResult?.total).toBeGreaterThanOrEqual(1);
        expect(listResult?.items?.[0]?.address?.nodeType).toBe('hyperlink');
        return listResult;
      },
    },
    {
      operationId: 'hyperlinks.get',
      setup: 'corpus',
      prepare: async (sessionId) => ({
        target: await resolveFirstHyperlinkTarget(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('hyperlinks.get', fixture);
        if (!f.target) throw new Error('hyperlinks.get requires a hyperlink target fixture.');
        return callDocOperation<any>('hyperlinks.get', { sessionId, target: f.target });
      },
    },
    {
      operationId: 'hyperlinks.wrap',
      setup: 'corpus',
      prepare: async (sessionId) => ({
        textTarget: await seedWrapSource(sessionId),
      }),
      run: async (sessionId, fixture) => {
        const f = requireFixture('hyperlinks.wrap', fixture);
        if (!f.textTarget) throw new Error('hyperlinks.wrap requires a text target fixture.');

        const wrapResult = await callDocOperation<any>('hyperlinks.wrap', {
          sessionId,
          target: f.textTarget,
          link: {
            destination: { href: 'https://example.com/wrapped-by-story' },
            tooltip: 'wrapped-by-story',
          },
        });

        const listResult = await callDocOperation<any>('hyperlinks.list', {
          sessionId,
          textPattern: WRAP_PHRASE,
        });
        expect(listResult?.total).toBeGreaterThanOrEqual(1);

        return wrapResult;
      },
    },
    {
      operationId: 'hyperlinks.insert',
      setup: 'corpus',
      prepare: async (sessionId) => {
        const insertResult = await callDocOperation<any>('insert', {
          sessionId,
          value: 'Insertion host paragraph.',
        });
        expect(insertResult?.receipt?.success).toBe(true);
        return null;
      },
      run: async (sessionId) => {
        const insertedText = 'Inserted hyperlink text';
        const insertResult = await callDocOperation<any>('hyperlinks.insert', {
          sessionId,
          text: insertedText,
          link: {
            destination: { href: 'https://example.com/inserted-by-story' },
            tooltip: 'inserted-by-story',
          },
        });

        const listResult = await callDocOperation<any>('hyperlinks.list', {
          sessionId,
          textPattern: insertedText,
        });
        expect(listResult?.total).toBeGreaterThanOrEqual(1);

        return insertResult;
      },
    },
    {
      operationId: 'hyperlinks.patch',
      setup: 'corpus',
      prepare: async (sessionId) => {
        const listResult = await listHyperlinks(sessionId);
        const target =
          listResult?.items?.find((item: any) => typeof item?.properties?.href === 'string')?.address ??
          listResult?.items?.[0]?.address;
        if (!target) throw new Error('hyperlinks.patch setup failed: no hyperlink target found.');
        return { target };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('hyperlinks.patch', fixture);
        if (!f.target) throw new Error('hyperlinks.patch requires a hyperlink target fixture.');

        const patchResult = await callDocOperation<any>('hyperlinks.patch', {
          sessionId,
          target: f.target,
          patch: {
            href: 'https://example.com/patched-by-story',
            tooltip: 'patched-by-story',
            target: '_blank',
          },
        });

        const patchedTarget = patchResult?.hyperlink ?? f.target;
        const info = await callDocOperation<any>('hyperlinks.get', {
          sessionId,
          target: patchedTarget,
        });

        expect(info?.properties?.href).toBe('https://example.com/patched-by-story');
        expect(info?.properties?.tooltip).toBe('patched-by-story');
        expect(info?.properties?.target).toBe('_blank');

        return patchResult;
      },
    },
    {
      operationId: 'hyperlinks.remove',
      setup: 'corpus',
      prepare: async (sessionId) => {
        const listResult = await listHyperlinks(sessionId);
        const targetItem = listResult?.items?.[0];
        if (!targetItem?.address) {
          throw new Error('hyperlinks.remove setup failed: no hyperlink target found.');
        }
        return {
          target: targetItem.address,
          removedText: typeof targetItem.text === 'string' ? targetItem.text : undefined,
          beforeTotal: typeof listResult?.total === 'number' ? listResult.total : undefined,
        };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('hyperlinks.remove', fixture);
        if (!f.target) throw new Error('hyperlinks.remove requires a hyperlink target fixture.');

        const removeResult = await callDocOperation<any>('hyperlinks.remove', {
          sessionId,
          target: f.target,
          mode: 'unwrap',
        });

        const afterList = await listHyperlinks(sessionId);
        if (typeof f.beforeTotal === 'number') {
          expect(afterList?.total).toBe(f.beforeTotal - 1);
        }

        if (typeof f.removedText === 'string' && f.removedText.length > 0) {
          const textResult = await callDocOperation<any>('find', {
            sessionId,
            query: { select: { type: 'text', pattern: f.removedText } },
          });
          expect(textResult?.total).toBeGreaterThanOrEqual(1);
        }

        return removeResult;
      },
    },
  ];

  it('covers every hyperlinks command currently defined on this branch', () => {
    const scenarioIds = scenarios.map((scenario) => scenario.operationId);
    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
    expect(new Set(scenarioIds)).toEqual(new Set(ALL_HYPERLINK_COMMAND_IDS));
  });

  for (const scenario of scenarios) {
    it(
      `${scenario.operationId}: executes and saves source/result docs`,
      async () => {
        const sessionId = makeSessionId(scenario.operationId.replace(/\./g, '-'));
        try {
          await callDocOperation('open', { sessionId, doc: CORPUS_HYPERLINK_FIXTURE });

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
      },
      COMMAND_STORY_TIMEOUT_MS,
    );
  }
});
