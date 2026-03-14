import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { corpusDoc, unwrap, useStoryHarness } from '../harness';

const ALL_FOOTNOTE_COMMAND_IDS = [
  'footnotes.list',
  'footnotes.get',
  'footnotes.insert',
  'footnotes.update',
  'footnotes.remove',
  'footnotes.configure',
] as const;

type FootnoteCommandId = (typeof ALL_FOOTNOTE_COMMAND_IDS)[number];

type FootnoteAddress = {
  kind: 'entity';
  entityType: 'footnote';
  noteId: string;
};

type TextTarget = {
  kind: 'text';
  segments: Array<{ blockId: string; range: { start: number; end: number } }>;
};

type FootnoteFixture = {
  target?: FootnoteAddress;
  textTarget?: TextTarget;
  type?: 'footnote' | 'endnote';
  noteId?: string;
};

type Scenario = {
  operationId: FootnoteCommandId;
  prepare?: (sessionId: string) => Promise<FootnoteFixture | null>;
  run: (sessionId: string, fixture: FootnoteFixture | null) => Promise<any>;
};

const BASE_DOC = corpusDoc('basic/longer-header.docx');

describe('document-api story: all footnotes commands', () => {
  const { client, outPath } = useStoryHarness('footnotes/all-commands', {
    preserveResults: true,
  });

  const api = client as any;

  const readOperationIds = new Set<FootnoteCommandId>(['footnotes.list', 'footnotes.get']);

  function slug(operationId: FootnoteCommandId): string {
    return operationId.replace(/\./g, '-');
  }

  function makeSessionId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function sourceDocNameFor(operationId: FootnoteCommandId): string {
    return `${slug(operationId)}-source.docx`;
  }

  function resultDocNameFor(operationId: FootnoteCommandId): string {
    return `${slug(operationId)}.docx`;
  }

  function readOutputNameFor(operationId: FootnoteCommandId): string {
    return `${slug(operationId)}-read-output.json`;
  }

  async function saveReadOutput(operationId: FootnoteCommandId, result: any): Promise<void> {
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

  async function saveSource(sessionId: string, operationId: FootnoteCommandId): Promise<void> {
    await callDocOperation('save', {
      sessionId,
      out: outPath(sourceDocNameFor(operationId)),
      force: true,
    });
  }

  async function saveResult(sessionId: string, operationId: FootnoteCommandId): Promise<void> {
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

  function assertReadOutput(operationId: FootnoteCommandId, result: any): void {
    if (operationId === 'footnotes.list') {
      expect(Array.isArray(result?.items)).toBe(true);
      expect(typeof result?.total).toBe('number');
      return;
    }

    if (operationId === 'footnotes.get') {
      expect(result?.address?.kind).toBe('entity');
      expect(result?.address?.entityType).toBe('footnote');
      expect(typeof result?.noteId).toBe('string');
      return;
    }

    throw new Error(`Unexpected read assertion branch for ${operationId}.`);
  }

  function requireFixture(operationId: FootnoteCommandId, fixture: FootnoteFixture | null): FootnoteFixture {
    if (!fixture) throw new Error(`${operationId} requires a footnote fixture.`);
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
      throw new Error('insert did not return a blockId for footnote text targeting.');
    }
    return makeTextTarget(blockId, Math.max(1, Math.min(10, text.length)));
  }

  function extractFootnoteAddress(item: any): FootnoteAddress | null {
    return (item?.address ?? item?.domain?.address ?? null) as FootnoteAddress | null;
  }

  async function insertFootnote(
    sessionId: string,
    type: 'footnote' | 'endnote',
    content: string,
  ): Promise<FootnoteAddress> {
    const at = await seedTextTarget(sessionId, `Footnote host text for ${type}.`);
    const insertResult = await callDocOperation<any>('footnotes.insert', {
      sessionId,
      at,
      type,
      content,
    });
    assertMutationSuccess('footnotes.insert', insertResult);

    const listResult = await callDocOperation<any>('footnotes.list', { sessionId, type });
    const address = extractFootnoteAddress(listResult?.items?.[0]);
    if (!address) {
      throw new Error('Unable to resolve inserted footnote address from footnotes.list.');
    }
    return address;
  }

  const scenarios: Scenario[] = [
    {
      operationId: 'footnotes.list',
      prepare: async (sessionId) => {
        await insertFootnote(sessionId, 'footnote', 'List fixture footnote content.');
        return null;
      },
      run: async (sessionId) => {
        const listResult = await callDocOperation<any>('footnotes.list', { sessionId });
        expect(listResult?.total).toBeGreaterThanOrEqual(1);
        return listResult;
      },
    },
    {
      operationId: 'footnotes.get',
      prepare: async (sessionId) => {
        const target = await insertFootnote(sessionId, 'footnote', 'Get fixture footnote content.');
        return { target };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('footnotes.get', fixture);
        if (!f.target) throw new Error('footnotes.get requires a footnote target fixture.');
        return callDocOperation<any>('footnotes.get', { sessionId, target: f.target });
      },
    },
    {
      operationId: 'footnotes.insert',
      prepare: async (sessionId) => {
        const textTarget = await seedTextTarget(sessionId, 'Insert a footnote at this location.');
        return { textTarget };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('footnotes.insert', fixture);
        if (!f.textTarget) throw new Error('footnotes.insert requires a text target fixture.');

        const insertResult = await callDocOperation<any>('footnotes.insert', {
          sessionId,
          at: f.textTarget,
          type: 'footnote',
          content: 'Inserted footnote content from story test.',
        });

        const listResult = await callDocOperation<any>('footnotes.list', { sessionId, type: 'footnote' });
        expect(listResult?.total).toBeGreaterThanOrEqual(1);

        return insertResult;
      },
    },
    {
      operationId: 'footnotes.update',
      prepare: async (sessionId) => {
        const target = await insertFootnote(sessionId, 'footnote', 'Initial update fixture content.');
        return { target };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('footnotes.update', fixture);
        if (!f.target) throw new Error('footnotes.update requires a footnote target fixture.');

        const updateResult = await callDocOperation<any>('footnotes.update', {
          sessionId,
          target: f.target,
          patch: {
            content: 'Updated footnote content from story test.',
          },
        });

        const info = await callDocOperation<any>('footnotes.get', {
          sessionId,
          target: f.target,
        });
        expect(info?.content).toBe('Updated footnote content from story test.');

        return updateResult;
      },
    },
    {
      operationId: 'footnotes.remove',
      prepare: async (sessionId) => {
        const target = await insertFootnote(sessionId, 'footnote', 'Remove fixture content.');
        return { target, noteId: target.noteId };
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('footnotes.remove', fixture);
        if (!f.target || !f.noteId) throw new Error('footnotes.remove requires a footnote target fixture.');

        const removeResult = await callDocOperation<any>('footnotes.remove', {
          sessionId,
          target: f.target,
        });

        const listResult = await callDocOperation<any>('footnotes.list', { sessionId });
        const stillPresent = (listResult?.items ?? []).some(
          (item: any) => extractFootnoteAddress(item)?.noteId === f.noteId,
        );
        expect(stillPresent).toBe(false);

        return removeResult;
      },
    },
    {
      operationId: 'footnotes.configure',
      run: async (sessionId) => {
        return callDocOperation<any>('footnotes.configure', {
          sessionId,
          type: 'footnote',
          scope: { kind: 'document' },
          numbering: {
            format: 'lowerRoman',
            start: 2,
            restartPolicy: 'continuous',
            position: 'pageBottom',
          },
        });
      },
    },
  ];

  it('covers every footnotes command currently defined on this branch', () => {
    const scenarioIds = scenarios.map((scenario) => scenario.operationId);
    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
    expect(new Set(scenarioIds)).toEqual(new Set(ALL_FOOTNOTE_COMMAND_IDS));
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
