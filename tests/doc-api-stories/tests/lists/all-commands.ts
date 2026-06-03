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
  // SD-1973 formatting operations
  'lists.applyTemplate',
  'lists.applyPreset',
  'lists.captureTemplate',
  'lists.setLevelNumbering',
  'lists.setLevelBullet',
  'lists.setLevelPictureBullet',
  'lists.setLevelAlignment',
  'lists.setLevelIndents',
  'lists.setLevelTrailingCharacter',
  'lists.setLevelMarkerFont',
  'lists.clearLevelOverrides',
  'lists.setType',
  // SD-2025 user-facing operations
  'lists.getStyle',
  'lists.applyStyle',
  'lists.restartAt',
  'lists.setLevelNumberStyle',
  'lists.setLevelText',
  'lists.setLevelStart',
  'lists.setLevelLayout',
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
const PRE_SEPARATED_FIXTURE = path.join(
  REPO_ROOT,
  'packages/super-editor/src/editors/v1/tests/data/pre-separated-list.docx',
);

describe('document-api story: all lists commands', () => {
  const { outPath, runCli } = useStoryHarness('lists/all-commands', {
    preserveResults: true,
  });

  const readOperationIds = new Set<ListsCommandId>([
    'lists.list',
    'lists.get',
    'lists.canJoin',
    'lists.canContinuePrevious',
    'lists.captureTemplate',
    'lists.getStyle',
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

    if (operationId === 'lists.captureTemplate') {
      expect(result?.success).toBe(true);
      expect(result?.template?.version).toBe(1);
      expect(Array.isArray(result?.template?.levels)).toBe(true);
      return;
    }

    if (operationId === 'lists.getStyle') {
      expect(result?.success).toBe(true);
      expect(result?.style?.version).toBe(1);
      expect(Array.isArray(result?.style?.levels)).toBe(true);
      expect(result?.style?.levels?.length).toBeGreaterThan(0);
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

  async function getStyle(docPath: string, target: ListItemAddress): Promise<any> {
    const result = await callDocOperation<any>('lists.getStyle', { doc: docPath, target });
    expect(result?.success).toBe(true);
    expect(result?.style?.version).toBe(1);
    return result.style;
  }

  async function getListItem(docPath: string, address: ListItemAddress): Promise<any> {
    const result = await callDocOperation<any>('lists.get', { doc: docPath, address });
    return result?.item ?? result;
  }

  function requireStyleLevel(style: any, level: number): any {
    const match = style?.levels?.find((entry: any) => entry?.level === level);
    if (!match) throw new Error(`Style did not contain level ${level}.`);
    return match;
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
      query: { select: { type: 'node', nodeType: 'paragraph' } },
    });
    const paragraphs = findResult?.items ?? [];
    const paragraphItem =
      paragraphs.find((item: any) => item?.node?.paragraph?.props?.numbering == null) ?? paragraphs[0];
    const nodeId = paragraphItem?.address?.nodeId;
    if (paragraphs.length === 0 || typeof nodeId !== 'string' || nodeId.length === 0) {
      throw new Error('discoverParagraph: no paragraph found.');
    }
    return {
      kind: 'block',
      nodeType: 'paragraph',
      nodeId,
    };
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
    // SD-1973 formatting operations
    {
      operationId: 'lists.captureTemplate',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, _resultDoc, fixture) => {
        const f = requireFixture('lists.captureTemplate', fixture);
        return callDocOperation<any>('lists.captureTemplate', {
          doc: sourceDoc,
          target: f.firstItem,
        });
      },
    },
    {
      operationId: 'lists.applyPreset',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.applyPreset', fixture);
        return callDocOperation<any>('lists.applyPreset', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.firstItem,
          preset: 'upperRoman',
        });
      },
    },
    {
      operationId: 'lists.getStyle',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, _resultDoc, fixture) => {
        const f = requireFixture('lists.getStyle', fixture);
        return callDocOperation<any>('lists.getStyle', {
          doc: sourceDoc,
          target: f.firstItem,
        });
      },
    },
    {
      operationId: 'lists.applyTemplate',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.applyTemplate', fixture);
        // Capture template and tweak level 0 so the apply is not a no-op
        const captureResult = await callDocOperation<any>('lists.captureTemplate', {
          doc: sourceDoc,
          target: f.firstItem,
        });
        const template = captureResult?.template;
        if (template?.levels?.[0]) {
          template.levels[0].numFmt = 'upperRoman';
          template.levels[0].lvlText = '%1)';
        }
        return callDocOperation<any>('lists.applyTemplate', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.firstItem,
          template,
        });
      },
    },
    {
      operationId: 'lists.applyStyle',
      prepareSource: async (sourceDoc) => setupPreSeparatedFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.applyStyle', fixture);
        const styleResult = await callDocOperation<any>('lists.getStyle', {
          doc: sourceDoc,
          target: f.firstItem,
        });
        const style = structuredClone(styleResult?.style);
        const level0 = requireStyleLevel(style, 0);
        level0.numFmt = 'upperRoman';
        level0.lvlText = '(%1)';

        const result = await callDocOperation<any>('lists.applyStyle', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.secondItem,
          style,
        });

        const appliedStyle = await getStyle(resultDoc, f.secondItem);
        const appliedLevel0 = requireStyleLevel(appliedStyle, 0);
        expect(appliedLevel0.numFmt).toBe('upperRoman');
        expect(appliedLevel0.lvlText).toBe('(%1)');

        const sourceStyle = await getStyle(resultDoc, f.firstItem);
        expect(requireStyleLevel(sourceStyle, 0).numFmt).not.toBe('upperRoman');

        return result;
      },
    },
    {
      operationId: 'lists.restartAt',
      prepareSource: async (sourceDoc) => {
        const fixture = await setupPreSeparatedFixture(sourceDoc);
        const presetResult = await callDocOperation<any>('lists.applyPreset', {
          doc: sourceDoc,
          out: sourceDoc,
          target: fixture.secondItem,
          preset: 'upperRoman',
        });
        assertMutationSuccess('lists.applyPreset (prep)', presetResult);
        return fixture;
      },
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.restartAt', fixture);
        const result = await callDocOperation<any>('lists.restartAt', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.secondItem,
          startAt: 7,
        });

        const item = await getListItem(resultDoc, f.secondItem);
        if (typeof item?.ordinal === 'number') {
          expect(item.ordinal).toBe(7);
        } else {
          expect(String(item?.marker ?? '')).toContain('7');
        }

        return result;
      },
    },
    {
      operationId: 'lists.setLevelNumbering',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.setLevelNumbering', fixture);
        return callDocOperation<any>('lists.setLevelNumbering', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.firstItem,
          level: 0,
          numFmt: 'upperRoman',
          lvlText: '%1.',
        });
      },
    },
    {
      operationId: 'lists.setLevelNumberStyle',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.setLevelNumberStyle', fixture);
        const result = await callDocOperation<any>('lists.setLevelNumberStyle', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.firstItem,
          level: 0,
          numberStyle: 'upperRoman',
        });

        const level0 = requireStyleLevel(await getStyle(resultDoc, f.firstItem), 0);
        expect(level0.numFmt).toBe('upperRoman');
        return result;
      },
    },
    {
      operationId: 'lists.setLevelText',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.setLevelText', fixture);
        const result = await callDocOperation<any>('lists.setLevelText', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.firstItem,
          level: 0,
          text: '(%1)',
        });

        const level0 = requireStyleLevel(await getStyle(resultDoc, f.firstItem), 0);
        expect(level0.lvlText).toBe('(%1)');
        return result;
      },
    },
    {
      operationId: 'lists.setLevelStart',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.setLevelStart', fixture);
        const result = await callDocOperation<any>('lists.setLevelStart', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.firstItem,
          level: 0,
          startAt: 4,
        });

        const level0 = requireStyleLevel(await getStyle(resultDoc, f.firstItem), 0);
        expect(level0.start).toBe(4);
        return result;
      },
    },
    {
      operationId: 'lists.setLevelLayout',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.setLevelLayout', fixture);
        const result = await callDocOperation<any>('lists.setLevelLayout', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.firstItem,
          level: 0,
          layout: {
            alignment: 'center',
            alignedAt: 360,
            textIndentAt: 1440,
            followCharacter: 'tab',
            tabStopAt: 1440,
          },
        });

        const level0 = requireStyleLevel(await getStyle(resultDoc, f.firstItem), 0);
        expect(level0).toMatchObject({
          alignment: 'center',
          indents: { left: 1440, hanging: 1080 },
          trailingCharacter: 'tab',
          tabStopAt: 1440,
        });
        return result;
      },
    },
    {
      operationId: 'lists.setLevelBullet',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.setLevelBullet', fixture);
        return callDocOperation<any>('lists.setLevelBullet', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.firstItem,
          level: 0,
          markerText: '▪',
        });
      },
    },
    {
      operationId: 'lists.setLevelPictureBullet',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.setLevelPictureBullet', fixture);
        return callDocOperation<any>('lists.setLevelPictureBullet', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.firstItem,
          level: 0,
          pictureBulletId: 0,
        });
      },
    },
    {
      operationId: 'lists.setLevelAlignment',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.setLevelAlignment', fixture);
        return callDocOperation<any>('lists.setLevelAlignment', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.firstItem,
          level: 0,
          alignment: 'center',
        });
      },
    },
    {
      operationId: 'lists.setLevelIndents',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.setLevelIndents', fixture);
        return callDocOperation<any>('lists.setLevelIndents', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.firstItem,
          level: 0,
          left: 1440,
          hanging: 360,
        });
      },
    },
    {
      operationId: 'lists.setLevelTrailingCharacter',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.setLevelTrailingCharacter', fixture);
        return callDocOperation<any>('lists.setLevelTrailingCharacter', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.firstItem,
          level: 0,
          trailingCharacter: 'space',
        });
      },
    },
    {
      operationId: 'lists.setType',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.setType', fixture);
        const result = await callDocOperation<any>('lists.setType', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.firstItem,
          kind: 'ordered',
        });

        const item = await getListItem(resultDoc, f.firstItem);
        expect(item?.kind).toBe('ordered');
        return result;
      },
    },
    {
      operationId: 'lists.setLevelMarkerFont',
      prepareSource: async (sourceDoc) => setupListFixture(sourceDoc),
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.setLevelMarkerFont', fixture);
        return callDocOperation<any>('lists.setLevelMarkerFont', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.firstItem,
          level: 0,
          fontFamily: 'Arial',
        });
      },
    },
    {
      operationId: 'lists.clearLevelOverrides',
      prepareSource: async (sourceDoc) => {
        const fixture = await setupListFixture(sourceDoc);
        // Create a w:lvlOverride (start override) so there is something to clear
        const overrideResult = await callDocOperation<any>('lists.setValue', {
          doc: sourceDoc,
          out: sourceDoc,
          target: fixture.firstItem,
          value: 10,
        });
        assertMutationSuccess('lists.setValue (prep)', overrideResult);
        return fixture;
      },
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('lists.clearLevelOverrides', fixture);
        return callDocOperation<any>('lists.clearLevelOverrides', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.firstItem,
          level: 0,
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
