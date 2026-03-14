import { access, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { corpusDoc, useStoryHarness } from '../harness';

type ContentControlTarget = {
  kind: 'block' | 'inline';
  nodeType: 'sdt';
  nodeId: string;
};

type ChoiceItem = {
  displayText: string;
  value: string;
};

type ScenarioFixture = {
  target?: ContentControlTarget;
  secondaryTarget?: ContentControlTarget;
  parentTarget?: ContentControlTarget;
  childTarget?: ContentControlTarget;
  tag?: string;
  alias?: string;
  startBlockId?: string;
  endBlockId?: string;
  choiceItems?: ChoiceItem[];
};

const BASE_CONTENT_CONTROLS_DOC = corpusDoc('layout/sdts-basic.docx');

const ALL_CONTENT_CONTROL_COMMAND_IDS = [
  'create.contentControl',
  'contentControls.list',
  'contentControls.get',
  'contentControls.listInRange',
  'contentControls.selectByTag',
  'contentControls.selectByTitle',
  'contentControls.listChildren',
  'contentControls.getParent',
  'contentControls.wrap',
  'contentControls.unwrap',
  'contentControls.delete',
  'contentControls.copy',
  'contentControls.move',
  'contentControls.patch',
  'contentControls.setLockMode',
  'contentControls.setType',
  'contentControls.getContent',
  'contentControls.replaceContent',
  'contentControls.clearContent',
  'contentControls.appendContent',
  'contentControls.prependContent',
  'contentControls.insertBefore',
  'contentControls.insertAfter',
  'contentControls.getBinding',
  'contentControls.setBinding',
  'contentControls.clearBinding',
  'contentControls.getRawProperties',
  'contentControls.patchRawProperties',
  'contentControls.validateWordCompatibility',
  'contentControls.normalizeWordCompatibility',
  'contentControls.normalizeTagPayload',
  'contentControls.text.setMultiline',
  'contentControls.text.setValue',
  'contentControls.text.clearValue',
  'contentControls.date.setValue',
  'contentControls.date.clearValue',
  'contentControls.date.setDisplayFormat',
  'contentControls.date.setDisplayLocale',
  'contentControls.date.setStorageFormat',
  'contentControls.date.setCalendar',
  'contentControls.checkbox.getState',
  'contentControls.checkbox.setState',
  'contentControls.checkbox.toggle',
  'contentControls.checkbox.setSymbolPair',
  'contentControls.choiceList.getItems',
  'contentControls.choiceList.setItems',
  'contentControls.choiceList.setSelected',
  'contentControls.repeatingSection.listItems',
  'contentControls.repeatingSection.insertItemBefore',
  'contentControls.repeatingSection.insertItemAfter',
  'contentControls.repeatingSection.cloneItem',
  'contentControls.repeatingSection.deleteItem',
  'contentControls.repeatingSection.setAllowInsertDelete',
  'contentControls.group.wrap',
  'contentControls.group.ungroup',
] as const;

type ContentControlsCommandId = (typeof ALL_CONTENT_CONTROL_COMMAND_IDS)[number];

const READ_OPERATION_IDS = new Set<ContentControlsCommandId>([
  'contentControls.list',
  'contentControls.get',
  'contentControls.listInRange',
  'contentControls.selectByTag',
  'contentControls.selectByTitle',
  'contentControls.listChildren',
  'contentControls.getParent',
  'contentControls.getContent',
  'contentControls.getBinding',
  'contentControls.getRawProperties',
  'contentControls.validateWordCompatibility',
  'contentControls.checkbox.getState',
  'contentControls.choiceList.getItems',
  'contentControls.repeatingSection.listItems',
]);

const CHOICE_ITEMS: ChoiceItem[] = [
  { displayText: 'One', value: 'one' },
  { displayText: 'Two', value: 'two' },
  { displayText: 'Three', value: 'three' },
];

type StoryScenario = {
  operationId: ContentControlsCommandId;
  seedDoc?: string;
  allowNoOpFailure?: boolean;
  prepare?: (sessionId: string) => Promise<ScenarioFixture | null>;
  run: (sessionId: string, fixture: ScenarioFixture | null) => Promise<any>;
};

type OperationCallOptions = {
  allowCommandFailure?: boolean;
};

describe('document-api story: all content-controls commands', () => {
  const { outPath, runCli } = useStoryHarness('content-controls/all-commands', {
    preserveResults: true,
  });

  function makeSessionId(operationSlug: string): string {
    const safeSlug = operationSlug.replace(/[^A-Za-z0-9._-]/g, '-');
    const base = safeSlug.slice(0, 36).replace(/-+$/, '') || 'cc';
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `${base}-${timestamp}-${random}`.slice(0, 64);
  }

  function slug(operationId: ContentControlsCommandId): string {
    return operationId.replace(/\./g, '-');
  }

  function sourceDocNameFor(operationId: ContentControlsCommandId): string {
    return `${slug(operationId)}-source.docx`;
  }

  function resultDocNameFor(operationId: ContentControlsCommandId): string {
    return `${slug(operationId)}.docx`;
  }

  function readOutputNameFor(operationId: ContentControlsCommandId): string {
    return `${slug(operationId)}-read-output.json`;
  }

  function fixtureTag(operationId: ContentControlsCommandId, suffix: string): string {
    return `${slug(operationId)}-${suffix}`;
  }

  function normalizeTargetCandidate(value: unknown): ContentControlTarget | null {
    if (typeof value !== 'object' || value === null) {
      return null;
    }

    const candidate = value as Record<string, unknown>;
    const kind = candidate.kind;
    const nodeType = candidate.nodeType;
    const rawNodeId = candidate.nodeId;

    if (kind !== 'block' && kind !== 'inline') {
      return null;
    }
    if (nodeType !== 'sdt' || rawNodeId === undefined || rawNodeId === null) {
      return null;
    }

    const nodeId = String(rawNodeId);
    if (nodeId.length === 0) {
      return null;
    }

    return { kind, nodeType: 'sdt', nodeId };
  }

  function requireTarget(operationId: ContentControlsCommandId, fixture: ScenarioFixture | null): ContentControlTarget {
    const target = normalizeTargetCandidate(fixture?.target);
    if (!target) {
      throw new Error(`${operationId} requires a target fixture.`);
    }
    return target;
  }

  function requireSecondaryTarget(
    operationId: ContentControlsCommandId,
    fixture: ScenarioFixture | null,
  ): ContentControlTarget {
    const target = normalizeTargetCandidate(fixture?.secondaryTarget);
    if (!target) {
      throw new Error(`${operationId} requires a secondary target fixture.`);
    }
    return target;
  }

  function requireParentTarget(
    operationId: ContentControlsCommandId,
    fixture: ScenarioFixture | null,
  ): ContentControlTarget {
    const target = normalizeTargetCandidate(fixture?.parentTarget);
    if (!target) {
      throw new Error(`${operationId} requires a parent target fixture.`);
    }
    return target;
  }

  function requireChildTarget(
    operationId: ContentControlsCommandId,
    fixture: ScenarioFixture | null,
  ): ContentControlTarget {
    const target = normalizeTargetCandidate(fixture?.childTarget);
    if (!target) {
      throw new Error(`${operationId} requires a child target fixture.`);
    }
    return target;
  }

  function assertMutationSuccess(operationId: ContentControlsCommandId, result: any, allowNoOpFailure = false): void {
    if (result?.success === true || result?.receipt?.success === true) return;

    const code = result?.failure?.code ?? result?.receipt?.failure?.code ?? 'UNKNOWN';
    if (allowNoOpFailure && code === 'NO_OP') return;

    throw new Error(`${operationId} did not report success (code: ${code}).`);
  }

  function assertReadShape(operationId: ContentControlsCommandId, result: any): void {
    if (
      operationId === 'contentControls.list' ||
      operationId === 'contentControls.listInRange' ||
      operationId === 'contentControls.selectByTag' ||
      operationId === 'contentControls.selectByTitle' ||
      operationId === 'contentControls.listChildren'
    ) {
      expect(Array.isArray(result?.items)).toBe(true);
      expect(typeof result?.total).toBe('number');
      return;
    }

    if (operationId === 'contentControls.get') {
      expect(result?.nodeType).toBe('sdt');
      expect(typeof result?.id).toBe('string');
      expect(result?.target?.nodeType).toBe('sdt');
      return;
    }

    if (operationId === 'contentControls.getParent') {
      if (result === null) return;
      expect(result?.nodeType).toBe('sdt');
      expect(result?.target?.nodeType).toBe('sdt');
      return;
    }

    if (operationId === 'contentControls.getContent') {
      expect(typeof result?.content).toBe('string');
      expect(result?.format === 'text' || result?.format === 'html').toBe(true);
      return;
    }

    if (operationId === 'contentControls.getBinding') {
      if (result === null) return;
      expect(typeof result?.storeItemId).toBe('string');
      expect(typeof result?.xpath).toBe('string');
      return;
    }

    if (operationId === 'contentControls.getRawProperties') {
      expect(typeof result?.properties).toBe('object');
      expect(result?.properties).not.toBeNull();
      return;
    }

    if (operationId === 'contentControls.validateWordCompatibility') {
      expect(typeof result?.compatible).toBe('boolean');
      expect(Array.isArray(result?.diagnostics)).toBe(true);
      return;
    }

    if (operationId === 'contentControls.checkbox.getState') {
      expect(typeof result?.checked).toBe('boolean');
      return;
    }

    if (operationId === 'contentControls.choiceList.getItems') {
      expect(Array.isArray(result?.items)).toBe(true);
      return;
    }

    if (operationId === 'contentControls.repeatingSection.listItems') {
      expect(Array.isArray(result?.items)).toBe(true);
      expect(typeof result?.total).toBe('number');
      return;
    }

    throw new Error(`Unexpected read assertion branch for ${operationId}.`);
  }

  async function saveReadOutput(operationId: ContentControlsCommandId, result: any): Promise<void> {
    await writeFile(
      outPath(readOutputNameFor(operationId)),
      `${JSON.stringify({ operationId, output: result }, null, 2)}\n`,
      'utf8',
    );
  }

  async function saveSource(sessionId: string, operationId: ContentControlsCommandId): Promise<void> {
    await callDocOperation('save', {
      sessionId,
      out: outPath(sourceDocNameFor(operationId)),
      force: true,
    });
  }

  async function saveResult(sessionId: string, operationId: ContentControlsCommandId): Promise<void> {
    await callDocOperation('save', {
      sessionId,
      out: outPath(resultDocNameFor(operationId)),
      force: true,
    });
  }

  function hasOwn(record: unknown, key: string): boolean {
    return typeof record === 'object' && record !== null && Object.prototype.hasOwnProperty.call(record, key);
  }

  function unwrapResultLayer(payload: unknown): unknown {
    if (hasOwn(payload, 'result')) {
      return (payload as Record<string, unknown>).result;
    }
    if (hasOwn(payload, 'undefined')) {
      return (payload as Record<string, unknown>).undefined;
    }
    return payload;
  }

  function parseOperationResult<T>(envelope: any): T {
    const firstLayer = unwrapResultLayer(envelope?.data);
    const secondLayer = unwrapResultLayer(firstLayer);
    return secondLayer as T;
  }

  async function callDocOperation<T>(
    operationId: string,
    input: Record<string, unknown>,
    options: OperationCallOptions = {},
  ): Promise<T> {
    const envelope = await runCli(['call', `doc.${operationId}`, '--input-json', JSON.stringify(input)], {
      allowError: options.allowCommandFailure === true,
    });

    if (envelope?.ok === false) {
      const fallbackFailure = {
        code: envelope?.error?.code ?? 'COMMAND_FAILED',
        message: envelope?.error?.message ?? 'Operation failed.',
      };
      const detailedFailure = hasOwn(envelope?.error?.details, 'failure')
        ? (envelope.error.details as Record<string, unknown>).failure
        : undefined;

      return {
        success: false,
        failure: (detailedFailure ?? fallbackFailure) as Record<string, unknown>,
      } as T;
    }

    return parseOperationResult<T>(envelope);
  }

  async function openSeedDocument(sessionId: string, docPath: string): Promise<void> {
    await callDocOperation('open', { sessionId, doc: docPath });
  }

  async function closeSession(sessionId: string): Promise<void> {
    await callDocOperation('close', { sessionId, discard: true });
  }

  async function listControls(sessionId: string, query?: Record<string, unknown>): Promise<any> {
    return callDocOperation<any>('contentControls.list', {
      sessionId,
      ...(query ?? {}),
    });
  }

  async function getControl(sessionId: string, target: ContentControlTarget): Promise<any> {
    return callDocOperation<any>('contentControls.get', { sessionId, target });
  }

  async function getControlContent(sessionId: string, target: ContentControlTarget): Promise<any> {
    return callDocOperation<any>('contentControls.getContent', { sessionId, target });
  }

  async function createControl(
    sessionId: string,
    operationId: ContentControlsCommandId,
    input: {
      kind?: 'block' | 'inline';
      controlType?: string;
      tag?: string;
      alias?: string;
      content?: string;
      target?: ContentControlTarget;
    } = {},
  ): Promise<ContentControlTarget> {
    const createResult = await callDocOperation<any>('create.contentControl', {
      sessionId,
      kind: input.kind ?? 'block',
      controlType: input.controlType ?? 'text',
      tag: input.tag,
      alias: input.alias,
      content: input.content,
      target: input.target,
    });

    assertMutationSuccess(operationId, createResult);

    const target = normalizeTargetCandidate(createResult?.updatedRef ?? createResult?.contentControl);
    if (!target) {
      throw new Error(`${operationId}: create.contentControl did not return a target.`);
    }

    return target;
  }

  async function findParagraphNodeIds(sessionId: string): Promise<string[]> {
    const findResult = await callDocOperation<any>('find', {
      sessionId,
      type: 'node',
      nodeType: 'paragraph',
    });

    const nodeIds = (findResult?.items ?? [])
      .map((item: any) => item?.address?.nodeId)
      .filter((nodeId: unknown): nodeId is string => typeof nodeId === 'string' && nodeId.length > 0);

    if (nodeIds.length < 2) {
      throw new Error('Expected at least two paragraphs to build a range fixture.');
    }

    return nodeIds;
  }

  async function createNestedControls(
    sessionId: string,
    operationId: ContentControlsCommandId,
  ): Promise<{
    childTarget: ContentControlTarget;
    parentTarget: ContentControlTarget;
  }> {
    const parentTarget = await seedRepeatingSection(sessionId, operationId, true);
    const childList = await callDocOperation<any>('contentControls.repeatingSection.listItems', {
      sessionId,
      target: parentTarget,
    });
    const resolvedChild = normalizeTargetCandidate(childList?.items?.[0]?.target);
    if (!resolvedChild) {
      throw new Error(`${operationId}: unable to resolve nested child target from repeating section.`);
    }

    return {
      childTarget: resolvedChild,
      parentTarget,
    };
  }

  async function findGetParentFixture(sessionId: string): Promise<ScenarioFixture> {
    const listed = await listControls(sessionId);
    const items = listed?.items ?? [];

    for (const item of items) {
      const candidate = normalizeTargetCandidate(item?.target);
      if (!candidate) continue;

      try {
        const parent = await callDocOperation<any>('contentControls.getParent', {
          sessionId,
          target: candidate,
        });

        const parentTarget = normalizeTargetCandidate(parent?.target);
        if (parentTarget) {
          return {
            childTarget: candidate,
            parentTarget,
          };
        }
      } catch {
        // Ignore controls that cannot be resolved in this adapter state.
      }
    }

    const fallback = normalizeTargetCandidate(items.find((item: any) => item?.target?.nodeId)?.target);
    if (!fallback) {
      throw new Error('contentControls.getParent requires at least one discoverable content control target.');
    }

    return {
      childTarget: fallback,
    };
  }

  async function seedChoiceControl(
    sessionId: string,
    operationId: ContentControlsCommandId,
  ): Promise<{ target: ContentControlTarget; items: ChoiceItem[] }> {
    const target = await createControl(sessionId, operationId, {
      kind: 'block',
      controlType: 'comboBox',
      tag: fixtureTag(operationId, 'combo'),
      alias: `${fixtureTag(operationId, 'combo')}-alias`,
      content: 'choice content',
    });

    const setItemsResult = await callDocOperation<any>('contentControls.choiceList.setItems', {
      sessionId,
      target,
      items: CHOICE_ITEMS,
    });
    assertMutationSuccess('contentControls.choiceList.setItems', setItemsResult);

    return { target, items: CHOICE_ITEMS };
  }

  async function seedRepeatingSection(
    sessionId: string,
    operationId: ContentControlsCommandId,
    seedWithFirstItem: boolean,
  ): Promise<ContentControlTarget> {
    const target = await createControl(sessionId, operationId, {
      kind: 'block',
      controlType: 'repeatingSection',
      tag: fixtureTag(operationId, 'repeating'),
      alias: `${fixtureTag(operationId, 'repeating')}-alias`,
      content: 'repeating section host',
    });

    if (seedWithFirstItem) {
      const seedResult = await callDocOperation<any>('contentControls.repeatingSection.insertItemBefore', {
        sessionId,
        target,
        index: 0,
      });
      assertMutationSuccess('contentControls.repeatingSection.insertItemBefore', seedResult);
    }

    return target;
  }

  const scenarios: StoryScenario[] = [
    // -----------------------------------------------------------------------
    // A. Core CRUD + Discovery
    // -----------------------------------------------------------------------
    {
      operationId: 'create.contentControl',
      run: async (sessionId) => {
        const tag = fixtureTag('create.contentControl', 'created');
        const createResult = await callDocOperation<any>('create.contentControl', {
          sessionId,
          kind: 'block',
          controlType: 'text',
          tag,
          alias: `${tag}-alias`,
          content: 'created by story',
        });

        const listResult = await listControls(sessionId, { tag });
        expect(listResult?.total).toBeGreaterThanOrEqual(1);

        return createResult;
      },
    },
    {
      operationId: 'contentControls.list',
      run: async (sessionId) => {
        const listResult = await listControls(sessionId);
        expect(listResult?.total).toBeGreaterThanOrEqual(1);
        return listResult;
      },
    },
    {
      operationId: 'contentControls.get',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.get', {
          kind: 'block',
          controlType: 'text',
          tag: fixtureTag('contentControls.get', 'target'),
          alias: fixtureTag('contentControls.get', 'alias'),
          content: 'get target content',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.get', fixture);
        const info = await getControl(sessionId, target);
        expect(info?.target?.nodeId).toBe(target.nodeId);
        return info;
      },
    },
    {
      operationId: 'contentControls.listInRange',
      prepare: async (sessionId) => {
        const paragraphIds = await findParagraphNodeIds(sessionId);
        return {
          startBlockId: paragraphIds[0],
          endBlockId: paragraphIds[paragraphIds.length - 1],
        };
      },
      run: async (sessionId, fixture) => {
        const startBlockId = fixture?.startBlockId;
        const endBlockId = fixture?.endBlockId;
        if (!startBlockId || !endBlockId) {
          throw new Error('contentControls.listInRange requires start/end block ids.');
        }

        const listResult = await callDocOperation<any>('contentControls.listInRange', {
          sessionId,
          startBlockId,
          endBlockId,
        });

        expect(listResult?.total).toBeGreaterThanOrEqual(1);
        return listResult;
      },
    },
    {
      operationId: 'contentControls.selectByTag',
      prepare: async (sessionId) => {
        const tag = fixtureTag('contentControls.selectByTag', 'selected-tag');
        const target = await createControl(sessionId, 'contentControls.selectByTag', {
          kind: 'block',
          controlType: 'text',
          tag,
          alias: `${tag}-alias`,
          content: 'tag selection text',
        });
        return { target, tag };
      },
      run: async (sessionId, fixture) => {
        const tag = fixture?.tag;
        const target = requireTarget('contentControls.selectByTag', fixture);
        if (!tag) throw new Error('contentControls.selectByTag requires a tag fixture.');

        const result = await callDocOperation<any>('contentControls.selectByTag', {
          sessionId,
          tag,
        });

        const nodeIds = (result?.items ?? []).map((item: any) => item?.target?.nodeId);
        expect(nodeIds).toContain(target.nodeId);
        return result;
      },
    },
    {
      operationId: 'contentControls.selectByTitle',
      prepare: async (sessionId) => {
        const alias = fixtureTag('contentControls.selectByTitle', 'selected-title');
        const target = await createControl(sessionId, 'contentControls.selectByTitle', {
          kind: 'block',
          controlType: 'text',
          tag: `${alias}-tag`,
          alias,
          content: 'title selection text',
        });
        return { target, alias };
      },
      run: async (sessionId, fixture) => {
        const alias = fixture?.alias;
        const target = requireTarget('contentControls.selectByTitle', fixture);
        if (!alias) throw new Error('contentControls.selectByTitle requires an alias fixture.');

        const result = await callDocOperation<any>('contentControls.selectByTitle', {
          sessionId,
          title: alias,
        });

        const nodeIds = (result?.items ?? []).map((item: any) => item?.target?.nodeId);
        expect(nodeIds).toContain(target.nodeId);
        return result;
      },
    },
    {
      operationId: 'contentControls.listChildren',
      prepare: async (sessionId) => {
        const nested = await createNestedControls(sessionId, 'contentControls.listChildren');
        return {
          childTarget: nested.childTarget,
          parentTarget: nested.parentTarget,
        };
      },
      run: async (sessionId, fixture) => {
        const parentTarget = requireParentTarget('contentControls.listChildren', fixture);
        const childTarget = requireChildTarget('contentControls.listChildren', fixture);

        const result = await callDocOperation<any>('contentControls.listChildren', {
          sessionId,
          target: parentTarget,
        });

        const nodeIds = (result?.items ?? []).map((item: any) => item?.target?.nodeId);
        expect(nodeIds).toContain(childTarget.nodeId);
        return result;
      },
    },
    {
      operationId: 'contentControls.getParent',
      prepare: async (sessionId) => {
        return findGetParentFixture(sessionId);
      },
      run: async (sessionId, fixture) => {
        const childTarget = requireChildTarget('contentControls.getParent', fixture);
        const expectedParentNodeId = fixture?.parentTarget?.nodeId;

        const result = await callDocOperation<any>('contentControls.getParent', {
          sessionId,
          target: childTarget,
        });

        if (expectedParentNodeId) {
          expect(result?.target?.nodeId ?? result?.id).toBe(expectedParentNodeId);
        } else {
          expect(result === null || result?.target?.nodeId == null).toBe(true);
        }
        return result;
      },
    },
    {
      operationId: 'contentControls.wrap',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.wrap', {
          kind: 'block',
          controlType: 'text',
          tag: fixtureTag('contentControls.wrap', 'target'),
          alias: `${fixtureTag('contentControls.wrap', 'target')}-alias`,
          content: 'wrap me',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.wrap', fixture);
        const result = await callDocOperation<any>('contentControls.wrap', {
          sessionId,
          target,
          kind: 'block',
          tag: fixtureTag('contentControls.wrap', 'wrapper'),
          alias: `${fixtureTag('contentControls.wrap', 'wrapper')}-alias`,
        });

        expect(result?.updatedRef?.nodeId).toBeDefined();
        expect(result?.updatedRef?.nodeId).not.toBe(target.nodeId);
        return result;
      },
    },
    {
      operationId: 'contentControls.unwrap',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.unwrap', {
          kind: 'block',
          controlType: 'text',
          tag: fixtureTag('contentControls.unwrap', 'target'),
          alias: `${fixtureTag('contentControls.unwrap', 'target')}-alias`,
          content: 'unwrap me',
        });

        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.unwrap', fixture);
        return callDocOperation<any>('contentControls.unwrap', { sessionId, target });
      },
    },
    {
      operationId: 'contentControls.delete',
      prepare: async (sessionId) => {
        const tag = fixtureTag('contentControls.delete', 'delete-target');
        const target = await createControl(sessionId, 'contentControls.delete', {
          kind: 'block',
          controlType: 'text',
          tag,
          alias: `${tag}-alias`,
          content: 'delete me',
        });
        return { target, tag };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.delete', fixture);
        const tag = fixture?.tag;
        const result = await callDocOperation<any>('contentControls.delete', { sessionId, target });

        if (tag) {
          const listAfter = await callDocOperation<any>('contentControls.selectByTag', { sessionId, tag });
          expect((listAfter?.items ?? []).some((item: any) => item?.target?.nodeId === target.nodeId)).toBe(false);
        }

        return result;
      },
    },
    {
      operationId: 'contentControls.copy',
      prepare: async (sessionId) => {
        const source = await createControl(sessionId, 'contentControls.copy', {
          kind: 'block',
          controlType: 'text',
          tag: fixtureTag('contentControls.copy', 'source'),
          alias: `${fixtureTag('contentControls.copy', 'source')}-alias`,
          content: 'copy source',
        });

        const destination = await createControl(sessionId, 'contentControls.copy', {
          kind: 'block',
          controlType: 'text',
          tag: fixtureTag('contentControls.copy', 'destination'),
          alias: `${fixtureTag('contentControls.copy', 'destination')}-alias`,
          content: 'copy destination',
        });

        return { target: source, secondaryTarget: destination };
      },
      run: async (sessionId, fixture) => {
        const source = requireTarget('contentControls.copy', fixture);
        const destination = requireSecondaryTarget('contentControls.copy', fixture);

        const result = await callDocOperation<any>('contentControls.copy', {
          sessionId,
          target: source,
          destination,
        });

        expect(result?.updatedRef?.nodeId).toBeDefined();
        expect(result?.updatedRef?.nodeId).not.toBe(source.nodeId);
        return result;
      },
    },
    {
      operationId: 'contentControls.move',
      prepare: async (sessionId) => {
        const source = await createControl(sessionId, 'contentControls.move', {
          kind: 'block',
          controlType: 'text',
          tag: fixtureTag('contentControls.move', 'source'),
          alias: `${fixtureTag('contentControls.move', 'source')}-alias`,
          content: 'move source',
        });

        const destination = await createControl(sessionId, 'contentControls.move', {
          kind: 'block',
          controlType: 'text',
          tag: fixtureTag('contentControls.move', 'destination'),
          alias: `${fixtureTag('contentControls.move', 'destination')}-alias`,
          content: 'move destination',
        });

        return { target: source, secondaryTarget: destination };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.move', fixture);
        const destination = requireSecondaryTarget('contentControls.move', fixture);

        const result = await callDocOperation<any>('contentControls.move', {
          sessionId,
          target,
          destination,
        });

        const movedInfo = await getControl(sessionId, target);
        expect(movedInfo?.target?.nodeId).toBe(target.nodeId);

        return result;
      },
    },
    {
      operationId: 'contentControls.patch',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.patch', {
          kind: 'block',
          controlType: 'text',
          tag: fixtureTag('contentControls.patch', 'target'),
          alias: `${fixtureTag('contentControls.patch', 'target')}-alias`,
          content: 'patch target',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.patch', fixture);

        const patchedAlias = `${fixtureTag('contentControls.patch', 'alias')}-updated`;
        const patchedTag = `${fixtureTag('contentControls.patch', 'tag')}-updated`;

        const result = await callDocOperation<any>('contentControls.patch', {
          sessionId,
          target,
          alias: patchedAlias,
          tag: patchedTag,
          color: '#3366FF',
          showingPlaceholder: false,
          temporary: false,
          tabIndex: 7,
        });

        const info = await getControl(sessionId, target);
        expect(info?.properties?.alias).toBe(patchedAlias);
        expect(info?.properties?.tag).toBe(patchedTag);

        return result;
      },
    },
    {
      operationId: 'contentControls.setLockMode',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.setLockMode', {
          kind: 'block',
          controlType: 'text',
          tag: fixtureTag('contentControls.setLockMode', 'target'),
          alias: `${fixtureTag('contentControls.setLockMode', 'target')}-alias`,
          content: 'lock mode target',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.setLockMode', fixture);
        const result = await callDocOperation<any>('contentControls.setLockMode', {
          sessionId,
          target,
          lockMode: 'contentLocked',
        });

        const info = await getControl(sessionId, target);
        expect(info?.lockMode).toBe('contentLocked');

        return result;
      },
    },
    {
      operationId: 'contentControls.setType',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.setType', {
          kind: 'block',
          controlType: 'text',
          tag: fixtureTag('contentControls.setType', 'target'),
          alias: `${fixtureTag('contentControls.setType', 'target')}-alias`,
          content: 'set type target',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.setType', fixture);
        const result = await callDocOperation<any>('contentControls.setType', {
          sessionId,
          target,
          controlType: 'date',
        });

        const info = await getControl(sessionId, target);
        expect(info?.controlType).toBe('date');

        return result;
      },
    },
    {
      operationId: 'contentControls.getContent',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.getContent', {
          kind: 'inline',
          controlType: 'text',
          tag: fixtureTag('contentControls.getContent', 'target'),
          alias: `${fixtureTag('contentControls.getContent', 'target')}-alias`,
          content: 'content read target',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.getContent', fixture);
        const result = await getControlContent(sessionId, target);
        expect(result?.content).toContain('content read target');
        return result;
      },
    },
    {
      operationId: 'contentControls.replaceContent',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.replaceContent', {
          kind: 'inline',
          controlType: 'text',
          tag: fixtureTag('contentControls.replaceContent', 'target'),
          alias: `${fixtureTag('contentControls.replaceContent', 'target')}-alias`,
          content: 'replace this text',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.replaceContent', fixture);
        const replacedText = 'replacement text from story';

        const result = await callDocOperation<any>('contentControls.replaceContent', {
          sessionId,
          target,
          content: replacedText,
          format: 'text',
        });

        const contentResult = await getControlContent(sessionId, target);
        expect(contentResult?.content).toBe(replacedText);

        return result;
      },
    },
    {
      operationId: 'contentControls.clearContent',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.clearContent', {
          kind: 'block',
          controlType: 'text',
          tag: fixtureTag('contentControls.clearContent', 'target'),
          alias: `${fixtureTag('contentControls.clearContent', 'target')}-alias`,
          content: 'clear this text',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.clearContent', fixture);
        const result = await callDocOperation<any>('contentControls.clearContent', { sessionId, target });

        const contentResult = await getControlContent(sessionId, target);
        expect(contentResult?.content).toBe('');

        return result;
      },
    },
    {
      operationId: 'contentControls.appendContent',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.appendContent', {
          kind: 'inline',
          controlType: 'text',
          tag: fixtureTag('contentControls.appendContent', 'target'),
          alias: `${fixtureTag('contentControls.appendContent', 'target')}-alias`,
          content: 'append-start',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.appendContent', fixture);
        const suffix = '-append-end';

        const result = await callDocOperation<any>('contentControls.appendContent', {
          sessionId,
          target,
          content: suffix,
          format: 'text',
        });

        const contentResult = await getControlContent(sessionId, target);
        expect(contentResult?.content).toContain('append-start');
        expect(contentResult?.content).toContain(suffix);

        return result;
      },
    },
    {
      operationId: 'contentControls.prependContent',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.prependContent', {
          kind: 'inline',
          controlType: 'text',
          tag: fixtureTag('contentControls.prependContent', 'target'),
          alias: `${fixtureTag('contentControls.prependContent', 'target')}-alias`,
          content: 'prepend-tail',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.prependContent', fixture);
        const prefix = 'prepend-head-';

        const result = await callDocOperation<any>('contentControls.prependContent', {
          sessionId,
          target,
          content: prefix,
          format: 'text',
        });

        const contentResult = await getControlContent(sessionId, target);
        expect(contentResult?.content.startsWith(prefix)).toBe(true);

        return result;
      },
    },
    {
      operationId: 'contentControls.insertBefore',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.insertBefore', {
          kind: 'block',
          controlType: 'text',
          tag: fixtureTag('contentControls.insertBefore', 'target'),
          alias: `${fixtureTag('contentControls.insertBefore', 'target')}-alias`,
          content: 'insert-before-anchor',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.insertBefore', fixture);
        const insertedText = fixtureTag('contentControls.insertBefore', 'inserted-text');

        const result = await callDocOperation<any>('contentControls.insertBefore', {
          sessionId,
          target,
          content: insertedText,
          format: 'text',
        });

        const findResult = await callDocOperation<any>('find', {
          sessionId,
          type: 'text',
          pattern: insertedText,
        });
        expect(findResult?.total).toBeGreaterThanOrEqual(1);

        return result;
      },
    },
    {
      operationId: 'contentControls.insertAfter',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.insertAfter', {
          kind: 'block',
          controlType: 'text',
          tag: fixtureTag('contentControls.insertAfter', 'target'),
          alias: `${fixtureTag('contentControls.insertAfter', 'target')}-alias`,
          content: 'insert-after-anchor',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.insertAfter', fixture);
        const insertedText = fixtureTag('contentControls.insertAfter', 'inserted-text');

        const result = await callDocOperation<any>('contentControls.insertAfter', {
          sessionId,
          target,
          content: insertedText,
          format: 'text',
        });

        const findResult = await callDocOperation<any>('find', {
          sessionId,
          type: 'text',
          pattern: insertedText,
        });
        expect(findResult?.total).toBeGreaterThanOrEqual(1);

        return result;
      },
    },

    // -----------------------------------------------------------------------
    // B. Data Binding + Raw/Compatibility
    // -----------------------------------------------------------------------
    {
      operationId: 'contentControls.getBinding',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.getBinding', {
          kind: 'block',
          controlType: 'text',
          tag: fixtureTag('contentControls.getBinding', 'target'),
          alias: `${fixtureTag('contentControls.getBinding', 'target')}-alias`,
          content: 'binding target',
        });

        const setBindingResult = await callDocOperation<any>('contentControls.setBinding', {
          sessionId,
          target,
          storeItemId: '{binding-store-id}',
          xpath: '/root/binding/path',
          prefixMappings: 'xmlns:ns="http://example.com"',
        });
        assertMutationSuccess('contentControls.setBinding', setBindingResult);

        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.getBinding', fixture);
        const result = await callDocOperation<any>('contentControls.getBinding', {
          sessionId,
          target,
        });

        expect(result?.storeItemId).toBe('{binding-store-id}');
        expect(result?.xpath).toBe('/root/binding/path');
        return result;
      },
    },
    {
      operationId: 'contentControls.setBinding',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.setBinding', {
          kind: 'block',
          controlType: 'text',
          tag: fixtureTag('contentControls.setBinding', 'target'),
          alias: `${fixtureTag('contentControls.setBinding', 'target')}-alias`,
          content: 'binding mutation target',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.setBinding', fixture);

        const result = await callDocOperation<any>('contentControls.setBinding', {
          sessionId,
          target,
          storeItemId: '{set-binding-store}',
          xpath: '/root/setBinding',
          prefixMappings: 'xmlns:abc="http://example.com/abc"',
        });

        const binding = await callDocOperation<any>('contentControls.getBinding', {
          sessionId,
          target,
        });
        expect(binding?.storeItemId).toBe('{set-binding-store}');
        expect(binding?.xpath).toBe('/root/setBinding');

        return result;
      },
    },
    {
      operationId: 'contentControls.clearBinding',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.clearBinding', {
          kind: 'block',
          controlType: 'text',
          tag: fixtureTag('contentControls.clearBinding', 'target'),
          alias: `${fixtureTag('contentControls.clearBinding', 'target')}-alias`,
          content: 'clear binding target',
        });

        const setBindingResult = await callDocOperation<any>('contentControls.setBinding', {
          sessionId,
          target,
          storeItemId: '{clear-binding-store}',
          xpath: '/root/clearBinding',
        });
        assertMutationSuccess('contentControls.setBinding', setBindingResult);

        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.clearBinding', fixture);

        const result = await callDocOperation<any>('contentControls.clearBinding', {
          sessionId,
          target,
        });

        const binding = await callDocOperation<any>('contentControls.getBinding', {
          sessionId,
          target,
        });
        expect(binding).toBeNull();

        return result;
      },
    },
    {
      operationId: 'contentControls.getRawProperties',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.getRawProperties', {
          kind: 'block',
          controlType: 'text',
          tag: fixtureTag('contentControls.getRawProperties', 'target'),
          alias: `${fixtureTag('contentControls.getRawProperties', 'target')}-alias`,
          content: 'raw properties target',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.getRawProperties', fixture);
        const result = await callDocOperation<any>('contentControls.getRawProperties', {
          sessionId,
          target,
        });
        expect(typeof result?.properties).toBe('object');
        expect(result?.properties).not.toBeNull();
        return result;
      },
    },
    {
      operationId: 'contentControls.patchRawProperties',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.patchRawProperties', {
          kind: 'block',
          controlType: 'text',
          tag: fixtureTag('contentControls.patchRawProperties', 'target'),
          alias: `${fixtureTag('contentControls.patchRawProperties', 'target')}-alias`,
          content: 'patch raw target',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.patchRawProperties', fixture);

        const result = await callDocOperation<any>('contentControls.patchRawProperties', {
          sessionId,
          target,
          patches: [
            {
              op: 'set',
              name: 'w:custom',
              element: {
                attributes: { 'w:val': 'story-custom-value' },
              },
            },
          ],
        });

        const raw = await callDocOperation<any>('contentControls.getRawProperties', {
          sessionId,
          target,
        });
        const rawString = JSON.stringify(raw?.properties ?? {});
        expect(rawString).toContain('w:custom');

        return result;
      },
    },
    {
      operationId: 'contentControls.validateWordCompatibility',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.validateWordCompatibility', {
          kind: 'block',
          controlType: 'text',
          tag: fixtureTag('contentControls.validateWordCompatibility', 'target'),
          alias: `${fixtureTag('contentControls.validateWordCompatibility', 'target')}-alias`,
          content: 'compatibility target',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.validateWordCompatibility', fixture);
        const result = await callDocOperation<any>('contentControls.validateWordCompatibility', {
          sessionId,
          target,
        });
        expect(typeof result?.compatible).toBe('boolean');
        expect(Array.isArray(result?.diagnostics)).toBe(true);
        return result;
      },
    },
    {
      operationId: 'contentControls.normalizeWordCompatibility',
      allowNoOpFailure: true,
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.normalizeWordCompatibility', {
          kind: 'block',
          controlType: 'text',
          tag: fixtureTag('contentControls.normalizeWordCompatibility', 'target'),
          alias: `${fixtureTag('contentControls.normalizeWordCompatibility', 'target')}-alias`,
          content: 'normalize compatibility target',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.normalizeWordCompatibility', fixture);
        return callDocOperation<any>(
          'contentControls.normalizeWordCompatibility',
          {
            sessionId,
            target,
          },
          { allowCommandFailure: true },
        );
      },
    },
    {
      operationId: 'contentControls.normalizeTagPayload',
      prepare: async (sessionId) => {
        const plainTag = 'not-json-tag';
        const target = await createControl(sessionId, 'contentControls.normalizeTagPayload', {
          kind: 'block',
          controlType: 'text',
          tag: plainTag,
          alias: `${fixtureTag('contentControls.normalizeTagPayload', 'target')}-alias`,
          content: 'normalize tag target',
        });
        return { target, tag: plainTag };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.normalizeTagPayload', fixture);
        const originalTag = fixture?.tag;
        if (!originalTag) throw new Error('contentControls.normalizeTagPayload requires original tag fixture.');

        const result = await callDocOperation<any>('contentControls.normalizeTagPayload', {
          sessionId,
          target,
        });

        const info = await getControl(sessionId, target);
        const normalizedTag = info?.properties?.tag;
        expect(typeof normalizedTag).toBe('string');
        expect(normalizedTag).toContain('"value"');
        expect(normalizedTag).toContain(originalTag);

        return result;
      },
    },

    // -----------------------------------------------------------------------
    // C. Typed Controls
    // -----------------------------------------------------------------------
    {
      operationId: 'contentControls.text.setMultiline',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.text.setMultiline', {
          kind: 'block',
          controlType: 'text',
          tag: fixtureTag('contentControls.text.setMultiline', 'target'),
          alias: `${fixtureTag('contentControls.text.setMultiline', 'target')}-alias`,
          content: 'text multiline target',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.text.setMultiline', fixture);
        const result = await callDocOperation<any>('contentControls.text.setMultiline', {
          sessionId,
          target,
          multiline: true,
        });

        const info = await getControl(sessionId, target);
        expect(info?.properties?.multiline).toBe(true);

        return result;
      },
    },
    {
      operationId: 'contentControls.text.setValue',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.text.setValue', {
          kind: 'inline',
          controlType: 'text',
          tag: fixtureTag('contentControls.text.setValue', 'target'),
          alias: `${fixtureTag('contentControls.text.setValue', 'target')}-alias`,
          content: 'text set value target',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.text.setValue', fixture);
        const value = 'text value set by story';

        const result = await callDocOperation<any>('contentControls.text.setValue', {
          sessionId,
          target,
          value,
        });

        const contentResult = await getControlContent(sessionId, target);
        expect(contentResult?.content).toBe(value);

        return result;
      },
    },
    {
      operationId: 'contentControls.text.clearValue',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.text.clearValue', {
          kind: 'inline',
          controlType: 'text',
          tag: fixtureTag('contentControls.text.clearValue', 'target'),
          alias: `${fixtureTag('contentControls.text.clearValue', 'target')}-alias`,
          content: 'text clear target',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.text.clearValue', fixture);
        const result = await callDocOperation<any>('contentControls.text.clearValue', {
          sessionId,
          target,
        });

        const contentResult = await getControlContent(sessionId, target);
        expect(typeof contentResult?.content).toBe('string');
        expect(contentResult?.content).not.toBeUndefined();

        return result;
      },
    },
    {
      operationId: 'contentControls.date.setValue',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.date.setValue', {
          kind: 'block',
          controlType: 'date',
          tag: fixtureTag('contentControls.date.setValue', 'target'),
          alias: `${fixtureTag('contentControls.date.setValue', 'target')}-alias`,
          content: 'date value target',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.date.setValue', fixture);

        const result = await callDocOperation<any>('contentControls.date.setValue', {
          sessionId,
          target,
          value: '2026-01-15T00:00:00Z',
        });

        const info = await getControl(sessionId, target);
        expect(info?.controlType).toBe('date');

        return result;
      },
    },
    {
      operationId: 'contentControls.date.clearValue',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.date.clearValue', {
          kind: 'block',
          controlType: 'date',
          tag: fixtureTag('contentControls.date.clearValue', 'target'),
          alias: `${fixtureTag('contentControls.date.clearValue', 'target')}-alias`,
          content: 'date clear target',
        });

        const seedValueResult = await callDocOperation<any>('contentControls.date.setValue', {
          sessionId,
          target,
          value: '2026-02-20T00:00:00Z',
        });
        assertMutationSuccess('contentControls.date.setValue', seedValueResult);

        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.date.clearValue', fixture);
        return callDocOperation<any>('contentControls.date.clearValue', {
          sessionId,
          target,
        });
      },
    },
    {
      operationId: 'contentControls.date.setDisplayFormat',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.date.setDisplayFormat', {
          kind: 'block',
          controlType: 'date',
          tag: fixtureTag('contentControls.date.setDisplayFormat', 'target'),
          alias: `${fixtureTag('contentControls.date.setDisplayFormat', 'target')}-alias`,
          content: 'date format target',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.date.setDisplayFormat', fixture);

        const result = await callDocOperation<any>('contentControls.date.setDisplayFormat', {
          sessionId,
          target,
          format: 'yyyy-MM-dd',
        });

        const info = await getControl(sessionId, target);
        expect(info?.properties?.dateFormat).toBe('yyyy-MM-dd');

        return result;
      },
    },
    {
      operationId: 'contentControls.date.setDisplayLocale',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.date.setDisplayLocale', {
          kind: 'block',
          controlType: 'date',
          tag: fixtureTag('contentControls.date.setDisplayLocale', 'target'),
          alias: `${fixtureTag('contentControls.date.setDisplayLocale', 'target')}-alias`,
          content: 'date locale target',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.date.setDisplayLocale', fixture);

        const result = await callDocOperation<any>('contentControls.date.setDisplayLocale', {
          sessionId,
          target,
          locale: 'en-US',
        });

        const info = await getControl(sessionId, target);
        expect(info?.properties?.dateLocale).toBe('en-US');

        return result;
      },
    },
    {
      operationId: 'contentControls.date.setStorageFormat',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.date.setStorageFormat', {
          kind: 'block',
          controlType: 'date',
          tag: fixtureTag('contentControls.date.setStorageFormat', 'target'),
          alias: `${fixtureTag('contentControls.date.setStorageFormat', 'target')}-alias`,
          content: 'date storage format target',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.date.setStorageFormat', fixture);

        const result = await callDocOperation<any>('contentControls.date.setStorageFormat', {
          sessionId,
          target,
          format: 'dateTime',
        });

        const info = await getControl(sessionId, target);
        expect(info?.properties?.storageFormat).toBe('dateTime');

        return result;
      },
    },
    {
      operationId: 'contentControls.date.setCalendar',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.date.setCalendar', {
          kind: 'block',
          controlType: 'date',
          tag: fixtureTag('contentControls.date.setCalendar', 'target'),
          alias: `${fixtureTag('contentControls.date.setCalendar', 'target')}-alias`,
          content: 'date calendar target',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.date.setCalendar', fixture);

        const result = await callDocOperation<any>('contentControls.date.setCalendar', {
          sessionId,
          target,
          calendar: 'gregorian',
        });

        const info = await getControl(sessionId, target);
        expect(info?.properties?.calendar).toBe('gregorian');

        return result;
      },
    },
    {
      operationId: 'contentControls.checkbox.getState',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.checkbox.getState', {
          kind: 'block',
          controlType: 'checkbox',
          tag: fixtureTag('contentControls.checkbox.getState', 'target'),
          alias: `${fixtureTag('contentControls.checkbox.getState', 'target')}-alias`,
          content: 'checkbox state target',
        });

        const setStateResult = await callDocOperation<any>('contentControls.checkbox.setState', {
          sessionId,
          target,
          checked: true,
        });
        assertMutationSuccess('contentControls.checkbox.setState', setStateResult);

        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.checkbox.getState', fixture);
        const result = await callDocOperation<any>('contentControls.checkbox.getState', {
          sessionId,
          target,
        });
        expect(result?.checked).toBe(true);
        return result;
      },
    },
    {
      operationId: 'contentControls.checkbox.setState',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.checkbox.setState', {
          kind: 'block',
          controlType: 'checkbox',
          tag: fixtureTag('contentControls.checkbox.setState', 'target'),
          alias: `${fixtureTag('contentControls.checkbox.setState', 'target')}-alias`,
          content: 'checkbox set state target',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.checkbox.setState', fixture);

        const result = await callDocOperation<any>('contentControls.checkbox.setState', {
          sessionId,
          target,
          checked: true,
        });

        const state = await callDocOperation<any>('contentControls.checkbox.getState', {
          sessionId,
          target,
        });
        expect(state?.checked).toBe(true);

        return result;
      },
    },
    {
      operationId: 'contentControls.checkbox.toggle',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.checkbox.toggle', {
          kind: 'block',
          controlType: 'checkbox',
          tag: fixtureTag('contentControls.checkbox.toggle', 'target'),
          alias: `${fixtureTag('contentControls.checkbox.toggle', 'target')}-alias`,
          content: 'checkbox toggle target',
        });

        const setStateResult = await callDocOperation<any>('contentControls.checkbox.setState', {
          sessionId,
          target,
          checked: false,
        });
        assertMutationSuccess('contentControls.checkbox.setState', setStateResult);

        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.checkbox.toggle', fixture);

        const result = await callDocOperation<any>('contentControls.checkbox.toggle', {
          sessionId,
          target,
        });

        const state = await callDocOperation<any>('contentControls.checkbox.getState', {
          sessionId,
          target,
        });
        expect(state?.checked).toBe(true);

        return result;
      },
    },
    {
      operationId: 'contentControls.checkbox.setSymbolPair',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.checkbox.setSymbolPair', {
          kind: 'block',
          controlType: 'checkbox',
          tag: fixtureTag('contentControls.checkbox.setSymbolPair', 'target'),
          alias: `${fixtureTag('contentControls.checkbox.setSymbolPair', 'target')}-alias`,
          content: 'checkbox symbols target',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.checkbox.setSymbolPair', fixture);

        const result = await callDocOperation<any>('contentControls.checkbox.setSymbolPair', {
          sessionId,
          target,
          checkedSymbol: { font: 'Wingdings', char: '00FE' },
          uncheckedSymbol: { font: 'Wingdings', char: '00A8' },
        });

        const info = await getControl(sessionId, target);
        expect(info?.properties?.checkedSymbol?.font).toBe('Wingdings');
        expect(info?.properties?.uncheckedSymbol?.font).toBe('Wingdings');

        return result;
      },
    },
    {
      operationId: 'contentControls.choiceList.getItems',
      prepare: async (sessionId) => {
        const seeded = await seedChoiceControl(sessionId, 'contentControls.choiceList.getItems');

        const setSelectedResult = await callDocOperation<any>('contentControls.choiceList.setSelected', {
          sessionId,
          target: seeded.target,
          value: 'two',
        });
        assertMutationSuccess('contentControls.choiceList.setSelected', setSelectedResult);

        return {
          target: seeded.target,
          choiceItems: seeded.items,
        };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.choiceList.getItems', fixture);
        const result = await callDocOperation<any>('contentControls.choiceList.getItems', {
          sessionId,
          target,
        });
        expect(result?.items?.length).toBeGreaterThanOrEqual(3);
        expect(result?.selectedValue).toBe('two');
        return result;
      },
    },
    {
      operationId: 'contentControls.choiceList.setItems',
      prepare: async (sessionId) => {
        const seeded = await seedChoiceControl(sessionId, 'contentControls.choiceList.setItems');
        return {
          target: seeded.target,
          choiceItems: seeded.items,
        };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.choiceList.setItems', fixture);
        const items: ChoiceItem[] = [
          { displayText: 'Apple', value: 'apple' },
          { displayText: 'Banana', value: 'banana' },
        ];

        const result = await callDocOperation<any>('contentControls.choiceList.setItems', {
          sessionId,
          target,
          items,
        });

        const info = await callDocOperation<any>('contentControls.choiceList.getItems', {
          sessionId,
          target,
        });
        expect(info?.items).toEqual(items);

        return result;
      },
    },
    {
      operationId: 'contentControls.choiceList.setSelected',
      prepare: async (sessionId) => {
        const seeded = await seedChoiceControl(sessionId, 'contentControls.choiceList.setSelected');
        return {
          target: seeded.target,
          choiceItems: seeded.items,
        };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.choiceList.setSelected', fixture);

        const result = await callDocOperation<any>('contentControls.choiceList.setSelected', {
          sessionId,
          target,
          value: 'three',
        });

        const info = await callDocOperation<any>('contentControls.choiceList.getItems', {
          sessionId,
          target,
        });
        expect(info?.selectedValue).toBe('three');

        return result;
      },
    },

    // -----------------------------------------------------------------------
    // D. Repeating Section + Group
    // -----------------------------------------------------------------------
    {
      operationId: 'contentControls.repeatingSection.listItems',
      prepare: async (sessionId) => {
        const target = await seedRepeatingSection(sessionId, 'contentControls.repeatingSection.listItems', true);
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.repeatingSection.listItems', fixture);
        const result = await callDocOperation<any>('contentControls.repeatingSection.listItems', {
          sessionId,
          target,
        });
        expect(result?.total).toBeGreaterThanOrEqual(1);
        return result;
      },
    },
    {
      operationId: 'contentControls.repeatingSection.insertItemBefore',
      prepare: async (sessionId) => {
        const target = await seedRepeatingSection(
          sessionId,
          'contentControls.repeatingSection.insertItemBefore',
          false,
        );
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.repeatingSection.insertItemBefore', fixture);

        const result = await callDocOperation<any>('contentControls.repeatingSection.insertItemBefore', {
          sessionId,
          target,
          index: 0,
        });

        const list = await callDocOperation<any>('contentControls.repeatingSection.listItems', {
          sessionId,
          target,
        });
        expect(list?.total).toBe(1);

        return result;
      },
    },
    {
      operationId: 'contentControls.repeatingSection.insertItemAfter',
      prepare: async (sessionId) => {
        const target = await seedRepeatingSection(sessionId, 'contentControls.repeatingSection.insertItemAfter', true);
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.repeatingSection.insertItemAfter', fixture);

        const result = await callDocOperation<any>('contentControls.repeatingSection.insertItemAfter', {
          sessionId,
          target,
          index: 0,
        });

        const list = await callDocOperation<any>('contentControls.repeatingSection.listItems', {
          sessionId,
          target,
        });
        expect(list?.total).toBeGreaterThanOrEqual(2);

        return result;
      },
    },
    {
      operationId: 'contentControls.repeatingSection.cloneItem',
      prepare: async (sessionId) => {
        const target = await seedRepeatingSection(sessionId, 'contentControls.repeatingSection.cloneItem', true);
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.repeatingSection.cloneItem', fixture);

        const result = await callDocOperation<any>('contentControls.repeatingSection.cloneItem', {
          sessionId,
          target,
          index: 0,
        });

        const list = await callDocOperation<any>('contentControls.repeatingSection.listItems', {
          sessionId,
          target,
        });
        expect(list?.total).toBeGreaterThanOrEqual(2);

        return result;
      },
    },
    {
      operationId: 'contentControls.repeatingSection.deleteItem',
      prepare: async (sessionId) => {
        const target = await seedRepeatingSection(sessionId, 'contentControls.repeatingSection.deleteItem', true);
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.repeatingSection.deleteItem', fixture);

        const result = await callDocOperation<any>('contentControls.repeatingSection.deleteItem', {
          sessionId,
          target,
          index: 0,
        });

        const list = await callDocOperation<any>('contentControls.repeatingSection.listItems', {
          sessionId,
          target,
        });
        expect(list?.total).toBe(0);

        return result;
      },
    },
    {
      operationId: 'contentControls.repeatingSection.setAllowInsertDelete',
      prepare: async (sessionId) => {
        const target = await seedRepeatingSection(
          sessionId,
          'contentControls.repeatingSection.setAllowInsertDelete',
          false,
        );
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.repeatingSection.setAllowInsertDelete', fixture);

        const result = await callDocOperation<any>('contentControls.repeatingSection.setAllowInsertDelete', {
          sessionId,
          target,
          allow: true,
        });

        const info = await getControl(sessionId, target);
        expect(info?.properties?.allowInsertDelete).toBe(true);

        return result;
      },
    },
    {
      operationId: 'contentControls.group.wrap',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.group.wrap', {
          kind: 'block',
          controlType: 'text',
          tag: fixtureTag('contentControls.group.wrap', 'target'),
          alias: `${fixtureTag('contentControls.group.wrap', 'target')}-alias`,
          content: 'group wrap target',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.group.wrap', fixture);

        const result = await callDocOperation<any>('contentControls.group.wrap', {
          sessionId,
          target,
        });

        const wrappedTarget = normalizeTargetCandidate(result?.updatedRef);
        if (!wrappedTarget) {
          throw new Error('contentControls.group.wrap did not return updatedRef.');
        }

        expect(wrappedTarget.kind).toBe('block');
        expect(wrappedTarget.nodeType).toBe('sdt');

        return result;
      },
    },
    {
      operationId: 'contentControls.group.ungroup',
      prepare: async (sessionId) => {
        const target = await createControl(sessionId, 'contentControls.group.ungroup', {
          kind: 'block',
          controlType: 'group',
          tag: fixtureTag('contentControls.group.ungroup', 'target'),
          alias: `${fixtureTag('contentControls.group.ungroup', 'target')}-alias`,
          content: 'group ungroup target',
        });
        return { target };
      },
      run: async (sessionId, fixture) => {
        const target = requireTarget('contentControls.group.ungroup', fixture);
        return callDocOperation<any>('contentControls.group.ungroup', {
          sessionId,
          target,
        });
      },
    },
  ];

  it('covers every content-controls command currently defined on this branch', () => {
    const scenarioIds = scenarios.map((scenario) => scenario.operationId);
    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
    expect(new Set(scenarioIds)).toEqual(new Set(ALL_CONTENT_CONTROL_COMMAND_IDS));
  });

  for (const scenario of scenarios) {
    it(`${scenario.operationId}: executes and saves source/result docs`, async () => {
      const sessionId = makeSessionId(scenario.operationId.replace(/\./g, '-'));

      try {
        await openSeedDocument(sessionId, scenario.seedDoc ?? BASE_CONTENT_CONTROLS_DOC);

        const fixture = scenario.prepare ? await scenario.prepare(sessionId) : null;

        await saveSource(sessionId, scenario.operationId);

        const result = await scenario.run(sessionId, fixture);

        if (READ_OPERATION_IDS.has(scenario.operationId)) {
          assertReadShape(scenario.operationId, result);
          await saveReadOutput(scenario.operationId, result);
        } else {
          assertMutationSuccess(scenario.operationId, result, scenario.allowNoOpFailure === true);
        }

        await saveResult(sessionId, scenario.operationId);
      } finally {
        await closeSession(sessionId).catch(() => {});
      }
    });
  }

  it('writes source/result artifacts for every content-controls command', async () => {
    for (const operationId of ALL_CONTENT_CONTROL_COMMAND_IDS) {
      await access(outPath(sourceDocNameFor(operationId)));
      await access(outPath(resultDocNameFor(operationId)));

      if (READ_OPERATION_IDS.has(operationId)) {
        await access(outPath(readOutputNameFor(operationId)));
      }
    }
  });
});
