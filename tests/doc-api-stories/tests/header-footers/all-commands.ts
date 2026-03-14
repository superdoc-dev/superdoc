import { describe, expect, it } from 'vitest';
import { copyFile, writeFile } from 'node:fs/promises';
import { corpusDoc, unwrap, useStoryHarness } from '../harness';

const ALL_HEADER_FOOTERS_COMMAND_IDS = [
  'headerFooters.list',
  'headerFooters.get',
  'headerFooters.resolve',
  'headerFooters.refs.set',
  'headerFooters.refs.clear',
  'headerFooters.refs.setLinkedToPrevious',
  'headerFooters.parts.list',
  'headerFooters.parts.create',
  'headerFooters.parts.delete',
] as const;

type HeaderFootersCommandId = (typeof ALL_HEADER_FOOTERS_COMMAND_IDS)[number];

type SectionAddress = {
  kind: 'section';
  sectionId: string;
};

type HeaderFooterKind = 'header' | 'footer';
type HeaderFooterVariant = 'default' | 'first' | 'even';

type HeaderFooterSlotTarget = {
  kind: 'headerFooterSlot';
  section: SectionAddress;
  headerFooterKind: HeaderFooterKind;
  variant: HeaderFooterVariant;
};

type HeaderFooterFixture = {
  slotTarget?: HeaderFooterSlotTarget;
  partRefId?: string;
  beforePartsTotal?: number;
};

type Scenario = {
  operationId: HeaderFootersCommandId;
  prepareSource: (sourceDoc: string) => Promise<HeaderFooterFixture | null>;
  run: (sourceDoc: string, resultDoc: string, fixture: HeaderFooterFixture | null) => Promise<any>;
};

const HEADER_FOOTER_FIXTURE_DOC = corpusDoc('basic/longer-header.docx');

describe('document-api story: all header/footer commands', () => {
  const { outPath, runCli } = useStoryHarness('header-footers/all-commands', {
    preserveResults: true,
  });

  const readOperationIds = new Set<HeaderFootersCommandId>([
    'headerFooters.list',
    'headerFooters.get',
    'headerFooters.resolve',
    'headerFooters.parts.list',
  ]);

  function slug(operationId: HeaderFootersCommandId): string {
    return operationId.replace(/\./g, '-');
  }

  function sourceDocNameFor(operationId: HeaderFootersCommandId): string {
    return `${slug(operationId)}-source.docx`;
  }

  function resultDocNameFor(operationId: HeaderFootersCommandId): string {
    return `${slug(operationId)}.docx`;
  }

  function readOutputNameFor(operationId: HeaderFootersCommandId): string {
    return `${slug(operationId)}-read-output.json`;
  }

  async function saveReadOutput(operationId: HeaderFootersCommandId, result: any): Promise<void> {
    await writeFile(
      outPath(readOutputNameFor(operationId)),
      `${JSON.stringify({ operationId, output: result }, null, 2)}\n`,
      'utf8',
    );
  }

  function makeSlotTarget(
    section: SectionAddress,
    kind: HeaderFooterKind,
    variant: HeaderFooterVariant,
  ): HeaderFooterSlotTarget {
    return {
      kind: 'headerFooterSlot',
      section,
      headerFooterKind: kind,
      variant,
    };
  }

  function assertMutationSuccess(operationId: string, result: any): void {
    if (result?.success === true || result?.receipt?.success === true) return;
    const code = result?.failure?.code ?? result?.receipt?.failure?.code ?? 'UNKNOWN';
    throw new Error(`${operationId} did not report success (code: ${code}).`);
  }

  function assertReadOutput(operationId: HeaderFootersCommandId, result: any): void {
    if (operationId === 'headerFooters.list') {
      expect(Array.isArray(result?.items)).toBe(true);
      expect(typeof result?.total).toBe('number');
      expect(result?.page).toBeDefined();
      return;
    }

    if (operationId === 'headerFooters.get') {
      expect(result?.section?.kind).toBe('section');
      expect(typeof result?.section?.sectionId).toBe('string');
      expect(result?.kind === 'header' || result?.kind === 'footer').toBe(true);
      expect(['default', 'first', 'even']).toContain(result?.variant);
      expect(typeof result?.isExplicit).toBe('boolean');
      return;
    }

    if (operationId === 'headerFooters.resolve') {
      expect(['explicit', 'inherited', 'none']).toContain(result?.status);
      if (result?.status === 'explicit' || result?.status === 'inherited') {
        expect(typeof result?.refId).toBe('string');
      }
      return;
    }

    if (operationId === 'headerFooters.parts.list') {
      expect(Array.isArray(result?.items)).toBe(true);
      expect(typeof result?.total).toBe('number');
      expect(result?.page).toBeDefined();
      return;
    }

    throw new Error(`Unexpected read assertion branch for ${operationId}.`);
  }

  function requireFixture(
    operationId: HeaderFootersCommandId,
    fixture: HeaderFooterFixture | null,
  ): HeaderFooterFixture {
    if (!fixture) throw new Error(`${operationId} requires a header/footer fixture.`);
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

  async function prepareBaseSourceDoc(sourceDoc: string): Promise<void> {
    await copyFile(HEADER_FOOTER_FIXTURE_DOC, sourceDoc);
  }

  async function listSections(sourceDoc: string): Promise<any[]> {
    const sectionsResult = await callDocOperation<any>('sections.list', { doc: sourceDoc });
    return sectionsResult?.items ?? [];
  }

  async function requireSectionAddress(sourceDoc: string, index: number): Promise<SectionAddress> {
    const sections = await listSections(sourceDoc);
    const section = sections[index]?.address;
    if (!section?.sectionId) {
      throw new Error(`Unable to resolve section at index ${index}.`);
    }
    return section as SectionAddress;
  }

  async function listHeaderFooterParts(sourceDoc: string, kind?: HeaderFooterKind): Promise<any> {
    return callDocOperation<any>('headerFooters.parts.list', {
      doc: sourceDoc,
      ...(kind ? { kind } : {}),
    });
  }

  async function requireFirstPartRefId(sourceDoc: string, kind: HeaderFooterKind): Promise<string> {
    const parts = await listHeaderFooterParts(sourceDoc, kind);
    const refId = parts?.items?.[0]?.refId;
    if (typeof refId !== 'string' || refId.length === 0) {
      throw new Error(`Unable to find a ${kind} part reference id.`);
    }
    return refId;
  }

  async function requireSlotEntry(sourceDoc: string, target: HeaderFooterSlotTarget): Promise<any> {
    return callDocOperation<any>('headerFooters.get', {
      doc: sourceDoc,
      target,
    });
  }

  const scenarios: Scenario[] = [
    {
      operationId: 'headerFooters.list',
      prepareSource: async (sourceDoc) => {
        await prepareBaseSourceDoc(sourceDoc);
        return null;
      },
      run: async (sourceDoc) => {
        const listResult = await callDocOperation<any>('headerFooters.list', {
          doc: sourceDoc,
          kind: 'header',
        });
        expect(listResult?.total).toBeGreaterThanOrEqual(3);
        for (const item of listResult?.items ?? []) {
          expect(item?.kind).toBe('header');
        }
        return listResult;
      },
    },
    {
      operationId: 'headerFooters.get',
      prepareSource: async (sourceDoc) => {
        await prepareBaseSourceDoc(sourceDoc);
        const section = await requireSectionAddress(sourceDoc, 0);
        return { slotTarget: makeSlotTarget(section, 'header', 'default') };
      },
      run: async (sourceDoc, _resultDoc, fixture) => {
        const f = requireFixture('headerFooters.get', fixture);
        if (!f.slotTarget) throw new Error('headerFooters.get requires a slot target fixture.');
        return callDocOperation<any>('headerFooters.get', {
          doc: sourceDoc,
          target: f.slotTarget,
        });
      },
    },
    {
      operationId: 'headerFooters.resolve',
      prepareSource: async (sourceDoc) => {
        await prepareBaseSourceDoc(sourceDoc);
        const section = await requireSectionAddress(sourceDoc, 0);
        return { slotTarget: makeSlotTarget(section, 'header', 'default') };
      },
      run: async (sourceDoc, _resultDoc, fixture) => {
        const f = requireFixture('headerFooters.resolve', fixture);
        if (!f.slotTarget) throw new Error('headerFooters.resolve requires a slot target fixture.');
        const resolveResult = await callDocOperation<any>('headerFooters.resolve', {
          doc: sourceDoc,
          target: f.slotTarget,
        });
        expect(resolveResult?.status).toBe('explicit');
        expect(typeof resolveResult?.refId).toBe('string');
        return resolveResult;
      },
    },
    {
      operationId: 'headerFooters.refs.set',
      prepareSource: async (sourceDoc) => {
        await prepareBaseSourceDoc(sourceDoc);
        const section = await requireSectionAddress(sourceDoc, 0);
        const partRefId = await requireFirstPartRefId(sourceDoc, 'header');
        return {
          slotTarget: makeSlotTarget(section, 'header', 'first'),
          partRefId,
        };
      },
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('headerFooters.refs.set', fixture);
        if (!f.slotTarget || !f.partRefId) {
          throw new Error('headerFooters.refs.set requires slot target and part ref fixtures.');
        }

        const setResult = await callDocOperation<any>('headerFooters.refs.set', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.slotTarget,
          refId: f.partRefId,
        });

        const after = await requireSlotEntry(resultDoc, f.slotTarget);
        expect(after?.isExplicit).toBe(true);
        expect(after?.refId).toBe(f.partRefId);
        return setResult;
      },
    },
    {
      operationId: 'headerFooters.refs.clear',
      prepareSource: async (sourceDoc) => {
        await prepareBaseSourceDoc(sourceDoc);
        const section = await requireSectionAddress(sourceDoc, 0);
        const partRefId = await requireFirstPartRefId(sourceDoc, 'header');
        const slotTarget = makeSlotTarget(section, 'header', 'first');

        const prepareSetResult = await callDocOperation<any>('headerFooters.refs.set', {
          doc: sourceDoc,
          out: sourceDoc,
          target: slotTarget,
          refId: partRefId,
        });
        assertMutationSuccess('headerFooters.refs.set (prep)', prepareSetResult);

        const before = await requireSlotEntry(sourceDoc, slotTarget);
        expect(before?.isExplicit).toBe(true);
        expect(before?.refId).toBe(partRefId);

        return { slotTarget };
      },
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('headerFooters.refs.clear', fixture);
        if (!f.slotTarget) throw new Error('headerFooters.refs.clear requires a slot target fixture.');

        const clearResult = await callDocOperation<any>('headerFooters.refs.clear', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.slotTarget,
        });

        const after = await requireSlotEntry(resultDoc, f.slotTarget);
        expect(after?.isExplicit).toBe(false);
        expect(after?.refId).toBeNull();
        return clearResult;
      },
    },
    {
      operationId: 'headerFooters.refs.setLinkedToPrevious',
      prepareSource: async (sourceDoc) => {
        await prepareBaseSourceDoc(sourceDoc);

        const sectionBreakResult = await callDocOperation<any>('create.sectionBreak', {
          doc: sourceDoc,
          out: sourceDoc,
          at: { kind: 'documentEnd' },
          breakType: 'nextPage',
        });
        assertMutationSuccess('create.sectionBreak (prep)', sectionBreakResult);

        const secondSection = await requireSectionAddress(sourceDoc, 1);
        const slotTarget = makeSlotTarget(secondSection, 'header', 'first');

        const beforeEntry = await requireSlotEntry(sourceDoc, slotTarget);
        expect(beforeEntry?.isExplicit).toBe(false);
        expect(beforeEntry?.refId).toBeNull();

        const beforeParts = await listHeaderFooterParts(sourceDoc, 'header');

        return {
          slotTarget,
          beforePartsTotal: typeof beforeParts?.total === 'number' ? beforeParts.total : undefined,
        };
      },
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('headerFooters.refs.setLinkedToPrevious', fixture);
        if (!f.slotTarget) {
          throw new Error('headerFooters.refs.setLinkedToPrevious requires a slot target fixture.');
        }

        const mutationResult = await callDocOperation<any>('headerFooters.refs.setLinkedToPrevious', {
          doc: sourceDoc,
          out: resultDoc,
          target: f.slotTarget,
          linked: false,
        });

        const afterEntry = await requireSlotEntry(resultDoc, f.slotTarget);
        expect(afterEntry?.isExplicit).toBe(true);
        expect(typeof afterEntry?.refId).toBe('string');

        if (typeof f.beforePartsTotal === 'number') {
          const afterParts = await listHeaderFooterParts(resultDoc, 'header');
          expect(afterParts?.total).toBe(f.beforePartsTotal + 1);
        }

        return mutationResult;
      },
    },
    {
      operationId: 'headerFooters.parts.list',
      prepareSource: async (sourceDoc) => {
        await prepareBaseSourceDoc(sourceDoc);
        return null;
      },
      run: async (sourceDoc) => {
        const listResult = await listHeaderFooterParts(sourceDoc);
        expect(listResult?.total).toBeGreaterThanOrEqual(2);
        for (const item of listResult?.items ?? []) {
          expect(typeof item?.refId).toBe('string');
          expect(item?.kind === 'header' || item?.kind === 'footer').toBe(true);
          expect(typeof item?.partPath).toBe('string');
          expect(Array.isArray(item?.referencedBySections)).toBe(true);
        }
        return listResult;
      },
    },
    {
      operationId: 'headerFooters.parts.create',
      prepareSource: async (sourceDoc) => {
        await prepareBaseSourceDoc(sourceDoc);
        const beforeParts = await listHeaderFooterParts(sourceDoc, 'header');
        return {
          beforePartsTotal: typeof beforeParts?.total === 'number' ? beforeParts.total : undefined,
        };
      },
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('headerFooters.parts.create', fixture);

        const createResult = await callDocOperation<any>('headerFooters.parts.create', {
          doc: sourceDoc,
          out: resultDoc,
          kind: 'header',
        });

        const afterParts = await listHeaderFooterParts(resultDoc, 'header');
        const createdRefId = createResult?.refId;
        expect(typeof createdRefId).toBe('string');
        expect(afterParts?.items?.some((item: any) => item?.refId === createdRefId)).toBe(true);

        if (typeof f.beforePartsTotal === 'number') {
          expect(afterParts?.total).toBe(f.beforePartsTotal + 1);
        }

        return createResult;
      },
    },
    {
      operationId: 'headerFooters.parts.delete',
      prepareSource: async (sourceDoc) => {
        await prepareBaseSourceDoc(sourceDoc);

        const createResult = await callDocOperation<any>('headerFooters.parts.create', {
          doc: sourceDoc,
          out: sourceDoc,
          kind: 'header',
        });
        assertMutationSuccess('headerFooters.parts.create (prep)', createResult);

        const createdRefId = createResult?.refId;
        if (typeof createdRefId !== 'string' || createdRefId.length === 0) {
          throw new Error('headerFooters.parts.delete setup failed: create did not return refId.');
        }

        const beforeParts = await listHeaderFooterParts(sourceDoc, 'header');
        return {
          partRefId: createdRefId,
          beforePartsTotal: typeof beforeParts?.total === 'number' ? beforeParts.total : undefined,
        };
      },
      run: async (sourceDoc, resultDoc, fixture) => {
        const f = requireFixture('headerFooters.parts.delete', fixture);
        if (!f.partRefId) throw new Error('headerFooters.parts.delete requires a part ref fixture.');

        const deleteResult = await callDocOperation<any>('headerFooters.parts.delete', {
          doc: sourceDoc,
          out: resultDoc,
          target: {
            kind: 'headerFooterPart',
            refId: f.partRefId,
          },
        });

        const afterParts = await listHeaderFooterParts(resultDoc, 'header');
        expect(afterParts?.items?.some((item: any) => item?.refId === f.partRefId)).toBe(false);
        if (typeof f.beforePartsTotal === 'number') {
          expect(afterParts?.total).toBe(f.beforePartsTotal - 1);
        }

        return deleteResult;
      },
    },
  ];

  it('covers every header/footer command currently defined on this branch', () => {
    const scenarioIds = scenarios.map((scenario) => scenario.operationId);
    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
    expect(new Set(scenarioIds)).toEqual(new Set(ALL_HEADER_FOOTERS_COMMAND_IDS));
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
