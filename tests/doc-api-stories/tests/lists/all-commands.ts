import { describe, expect, it } from 'vitest';
import { copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { unwrap, useStoryHarness } from '../harness';

const ALL_LISTS_COMMAND_IDS = [
  'lists.list',
  'lists.get',
  'lists.insert',
  'lists.create',
  'lists.attach',
  'lists.detach',
  'lists.indent',
  'lists.outdent',
  'lists.join',
  'lists.canJoin',
  'lists.separate',
  'lists.setLevel',
  'lists.setValue',
  'lists.continuePrevious',
  'lists.canContinuePrevious',
  'lists.setLevelRestart',
  'lists.convertToText',
] as const;

type ListsCommandId = (typeof ALL_LISTS_COMMAND_IDS)[number];

type ListItemAddress = {
  kind: 'block';
  nodeType: 'listItem';
  nodeId: string;
};

type ListsFixture = {
  firstItem: ListItemAddress;
  secondItem: ListItemAddress;
};

type Scenario = {
  operationId: ListsCommandId;
  prepareSource: (sourceDoc: string) => Promise<ListsFixture | null>;
  run: (sourceDoc: string, resultDoc: string, fixture: ListsFixture | null) => Promise<any>;
};

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
const PRE_SEPARATED_FIXTURE = path.join(REPO_ROOT, 'packages/super-editor/src/tests/data/pre-separated-list.docx');

describe('document-api story: all lists commands', () => {
  const { outPath, runCli } = useStoryHarness('lists/all-commands', {
    preserveResults: true,
  });

  const readOperationIds = new Set<ListsCommandId>([
    'lists.list',
    'lists.get',
    'lists.canJoin',
    'lists.canContinuePrevious',
  ]);

  function slug(operationId: ListsCommandId): string {
    return operationId.replace(/\./g, '-');
  }

  function sourceDocNameFor(operationId: ListsCommandId): string {
    return `${slug(operationId)}-source.docx`;
  }

  function resultDocNameFor(operationId: ListsCommandId): string {
    return `${slug(operationId)}.docx`;
  }

  function readOutputNameFor(operationId: ListsCommandId): string {
    return `${slug(operationId)}-read-output.json`;
  }

  async function saveReadOutput(operationId: ListsCommandId, result: any): Promise<void> {
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

  function assertReadOutput(operationId: ListsCommandId, result: any): void {
    if (operationId === 'lists.list') {
      expect(Array.isArray(result?.items)).toBe(true);
      expect(typeof result?.total).toBe('number');
      expect(result?.page).toBeDefined();
      return;
    }

    if (operationId === 'lists.get') {
      const item = result?.item ?? result;
      expect(item?.address?.nodeType).toBe('listItem');
      expect(item?.kind).toBeDefined();
      return;
    }

    if (operationId === 'lists.canJoin') {
      expect(typeof result?.canJoin).toBe('boolean');
      return;
    }

    if (operationId === 'lists.canContinuePrevious') {
      expect(typeof result?.canContinue).toBe('boolean');
      return;
    }

    throw new Error(`Unexpected read assertion branch for ${operationId}.`);
  }

  function requireFixture(operationId: ListsCommandId, fixture: ListsFixture | null): ListsFixture {
    if (!fixture) throw new Error(`${operationId} requires a lists fixture.`);
    return fixture;
  }

  async function callDocOperation<T>(operationId: string, input: Record<string, unknown>): Promise<T> {
    const normalizedInput = { ...input };
    if (typeof normalizedInput.out === 'string' && normalizedInput.out.length > 0 && normalizedInput.force == null) {
      normalizedInput.force = true;
    }

    const envelope = await runCli(['call', `doc.${operationId}`, '--input-json', JSON.stringify(normalizedInput)]);
    return unwrap<T>(unwrap<any>(envelope?.data));
  }

  // ---------------------------------------------------------------------------
  // Fixture helpers
  //
  // All fixtures use pre-separated-list.docx as the base. This file ships with
  // stable w14:paraId attributes so nodeIds survive DOCX round-trips.
  // ---------------------------------------------------------------------------

  /**
   * Copy the pre-separated fixture and discover two items from the **same** list.
   * Used for operations that work on a single list (indent, outdent, separate, etc.).
   */
  async function setupListFixture(sourceDoc: string): Promise<ListsFixture> {
    await copyFile(PRE_SEPARATED_FIXTURE, sourceDoc);
    const listResult = await callDocOperation<any>('lists.list', { doc: sourceDoc });
    const items = listResult?.items ?? [];

    // Group items by listId and find a list with >= 2 items
    const byList = new Map<string, any[]>();
    for (const item of items) {
      const lid = item.listId;
      const group = byList.get(lid) ?? [];
      group.push(item);
      byList.set(lid, group);
    }

    const largestGroup = [...byList.values()].sort((a, b) => b.length - a.length)[0];
    if (!largestGroup || largestGroup.length < 2) {
      throw new Error('setupListFixture: no list with >= 2 items found.');
    }

    return {
      firstItem: largestGroup[0].address as ListItemAddress,
      secondItem: largestGroup[1].address as ListItemAddress,
    };
  }

  /**
   * Copy the pre-separated fixture and discover items from **different** lists.
   * Used for join, continuePrevious, canJoin, canContinuePrevious.
   */
  async function setupPreSeparatedFixture(sourceDoc: string): Promise<ListsFixture> {
    await copyFile(PRE_SEPARATED_FIXTURE, sourceDoc);
    const listResult = await callDocOperation<any>('lists.list', { doc: sourceDoc });
    const items = listResult?.items ?? [];
    if (items.length < 2) {
      throw new Error(`setupPreSeparatedFixture: expected >= 2 items, got ${items.length}.`);
    }

    const firstListId = items[0].listId;
    const secondListItem = items.find((item: any) => item.listId !== firstListId);
    if (!secondListItem) {
      throw new Error('setupPreSeparatedFixture: expected items from two different lists.');
    }

    return {
      firstItem: items[0].address as ListItemAddress,
      secondItem: secondListItem.address as ListItemAddress,
    };
  }

  /**
   * Discover the first plain paragraph (non-list-item) in a doc.
   * The pre-separated fixture includes one paragraph with a stable paraId.
   */
  async function discoverParagraph(docPath: string): Promise<{ kind: 'block'; nodeType: 'paragraph'; nodeId: string }> {
    const findResult = await callDocOperation<any>('find', {
      doc: docPath,
      type: 'node',
      nodeType: 'paragraph',
    });
    const paragraphs = findResult?.items ?? [];
    if (paragraphs.length === 0 || !paragraphs[0]?.address?.nodeId) {
      throw new Error('discoverParagraph: no paragraph found.');
    }
    return paragraphs[0].address;
  }

  // ---------------------------------------------------------------------------
  // Scenarios
  // ---------------------------------------------------------------------------

  const scenarios: Scenario[] = [
    {
      operationId: 'lists.create',
      prepareSource: async (sourceDoc) => {
        await copyFile(PRE_SEPARATED_FIXTURE, sourceDoc);
        return null;
      },
      run: async (sourceDoc, resultDoc) => {
        // Discover the stable paragraph and convert it to a list
        const paragraphAddress = await discoverParagraph(sourceDoc);

        const createResult = await callDocOperation<any>('lists.create', {
          doc: sourceDoc,
          out: resultDoc,
          mode: 'fromParagraphs',
          target: paragraphAddress,
          kind: 'ordered',
        });

        const listResult = await callDocOperation<any>('lists.list', { doc: resultDoc });
        expect(listResult?.total).toBeGreaterThanOrEqual(9); // 8 original + 1 new

        return createResult;
      },
    },
    {
      operationId: 'lists.list',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc) => {
        const listResult = await callDocOperation<any>('lists.list', { doc: sourceDoc });
        expect(listResult?.items?.length).toBeGreaterThanOrEqual(2);
        return listResult;
      },
    },
    {
      operationId: 'lists.get',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, _resultDoc, fixture) => {
        const f = requireFixture('lists.get', fixture);
        return callDocOperation<any>('lists.get', { doc: sourceDoc, address: f.firstItem });
      },
    },
    {
      operationId: 'lists.insert',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.insert', fixture);
        return callDocOperation<any>('lists.insert', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.firstItem,
          position: 'after',
          text: 'Newly inserted item.',
        });
      },
    },
    {
      operationId: 'lists.attach',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.attach', fixture);
        // The fixture doc has a plain paragraph with a stable paraId
        const paragraphAddress = await discoverParagraph(sourceDoc);

        return callDocOperation<any>('lists.attach', {
          doc: sourceDoc,
          out: resultDoc,
          target: paragraphAddress,
          attachTo: f.firstItem,
        });
      },
    },
    {
      operationId: 'lists.detach',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.detach', fixture);
        return callDocOperation<any>('lists.detach', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.firstItem,
        });
      },
    },
    {
      operationId: 'lists.indent',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.indent', fixture);
        return callDocOperation<any>('lists.indent', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.secondItem,
        });
      },
    },
    {
      operationId: 'lists.outdent',
      prepareSource: async (sourceDoc) => {
        const fixture = await setupListFixture(sourceDoc);
        // Indent the second item first so we can outdent it
        const indentResult = await callDocOperation<any>('lists.indent', {
          doc: sourceDoc,
          out: sourceDoc,
          target: fixture.secondItem,
        });
        assertMutationSuccess('lists.indent', indentResult);
        return fixture; // nodeIds are stable (paraId-backed)
      },
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.outdent', fixture);
        return callDocOperation<any>('lists.outdent', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.secondItem,
        });
      },
    },
    {
      operationId: 'lists.separate',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.separate', fixture);
        return callDocOperation<any>('lists.separate', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.secondItem,
        });
      },
    },
    {
      operationId: 'lists.join',
      prepareSource: async (sourceDoc) => setupPreSeparatedFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.join', fixture);
        return callDocOperation<any>('lists.join', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.secondItem,
          direction: 'withPrevious',
        });
      },
    },
    {
      operationId: 'lists.canJoin',
      prepareSource: async (sourceDoc) => setupPreSeparatedFixture(sourceDoc),
      run: async (sourceDoc, _resultDoc, fixture) => {
        const f = requireFixture('lists.canJoin', fixture);
        const result = await callDocOperation<any>('lists.canJoin', {
          doc: sourceDoc,
          target: f.secondItem,
          direction: 'withPrevious',
        });
        expect(result?.canJoin).toBe(true);
        return result;
      },
    },
    {
      operationId: 'lists.continuePrevious',
      prepareSource: async (sourceDoc) => setupPreSeparatedFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.continuePrevious', fixture);
        return callDocOperation<any>('lists.continuePrevious', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.secondItem,
        });
      },
    },
    {
      operationId: 'lists.canContinuePrevious',
      prepareSource: async (sourceDoc) => setupPreSeparatedFixture(sourceDoc),
      run: async (sourceDoc, _resultDoc, fixture) => {
        const f = requireFixture('lists.canContinuePrevious', fixture);
        const result = await callDocOperation<any>('lists.canContinuePrevious', {
          doc: sourceDoc,
          target: f.secondItem,
        });
        expect(result?.canContinue).toBe(true);
        return result;
      },
    },
    {
      operationId: 'lists.setLevel',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.setLevel', fixture);
        return callDocOperation<any>('lists.setLevel', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.firstItem,
          level: 1,
        });
      },
    },
    {
      operationId: 'lists.setValue',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.setValue', fixture);
        return callDocOperation<any>('lists.setValue', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.firstItem,
          value: 5,
        });
      },
    },
    {
      operationId: 'lists.setLevelRestart',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.setLevelRestart', fixture);
        return callDocOperation<any>('lists.setLevelRestart', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.firstItem,
          level: 1,
          restartAfterLevel: 0,
        });
      },
    },
    {
      operationId: 'lists.convertToText',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.convertToText', fixture);
        return callDocOperation<any>('lists.convertToText', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.firstItem,
        });
      },
    },
  ];

  it('covers every lists command currently defined on this branch', () => {
    const scenarioIds = scenarios.map((scenario) => scenario.operationId);
    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
    expect(new Set(scenarioIds)).toEqual(new Set(ALL_LISTS_COMMAND_IDS));
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
