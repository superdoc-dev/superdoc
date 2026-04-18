import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { unwrap, useStoryHarness } from '../harness';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
const PRE_SEPARATED_FIXTURE = path.join(
  REPO_ROOT,
  'packages/super-editor/src/editors/v1/tests/data/pre-separated-list.docx',
);
const NUMBERING_PART = 'word/numbering.xml';

type ListItemAddress = {
  kind: 'block';
  nodeType: 'listItem';
  nodeId: string;
};

type ListStyle = {
  version: 1;
  levels: Array<{
    level: number;
    numFmt?: string;
    lvlText?: string;
    start?: number;
    alignment?: string;
    indents?: { left?: number; hanging?: number; firstLine?: number };
    trailingCharacter?: string;
    markerFont?: string;
    pictureBulletId?: number;
    tabStopAt?: number | null;
  }>;
};

function sid(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneStyle<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requireLevel(style: ListStyle, level: number) {
  const match = style.levels.find((entry) => entry.level === level);
  if (!match) throw new Error(`Style did not contain level ${level}.`);
  return match;
}

describe('document-api story: lists style commands roundtrip', () => {
  const { client, copyDoc, outPath, runCli } = useStoryHarness('lists/style-commands-roundtrip', {
    preserveResults: true,
    cliBinMode: 'source',
  });

  const api = client as any;

  async function callDocOperation<T>(operationId: string, input: Record<string, unknown>): Promise<T> {
    const segments = operationId.split('.');
    let fn: any = api.doc;
    for (const segment of segments) fn = fn?.[segment];

    if (typeof fn === 'function') {
      return unwrap<T>(await fn(input));
    }

    const normalizedInput = { ...input };
    if (typeof normalizedInput.out === 'string' && normalizedInput.out.length > 0 && normalizedInput.force == null) {
      normalizedInput.force = true;
    }

    const envelope = await runCli(['call', `doc.${operationId}`, '--input-json', JSON.stringify(normalizedInput)]);
    return unwrap<T>(unwrap<any>(envelope?.data));
  }

  async function openFixture(label: string): Promise<{ sessionId: string; sourceDoc: string; resultDoc: string }> {
    const sourceDoc = await copyDoc(PRE_SEPARATED_FIXTURE, `${label}-source.docx`);
    const resultDoc = outPath(`${label}.docx`);
    const sessionId = sid(label);
    await callDocOperation('open', { sessionId, doc: sourceDoc });
    return { sessionId, sourceDoc, resultDoc };
  }

  async function saveResult(sessionId: string, resultDoc: string): Promise<void> {
    await callDocOperation('save', { sessionId, out: resultDoc, force: true });
  }

  async function listItems(sessionId: string): Promise<any[]> {
    const result = await callDocOperation<any>('lists.list', { sessionId });
    return result?.items ?? [];
  }

  async function resolvePreSeparatedFixture(sessionId: string): Promise<{
    firstItem: ListItemAddress;
    secondItem: ListItemAddress;
  }> {
    const items = await listItems(sessionId);
    if (items.length < 2) {
      throw new Error(`Expected at least 2 list items, got ${items.length}.`);
    }

    const firstListId = items[0].listId;
    const secondListItem = items.find((item: any) => item.listId !== firstListId);
    if (!secondListItem) {
      throw new Error('Expected items from at least two different list sequences.');
    }

    return {
      firstItem: items[0].address as ListItemAddress,
      secondItem: secondListItem.address as ListItemAddress,
    };
  }

  async function getStyle(sessionId: string, target: ListItemAddress): Promise<ListStyle> {
    const result = await callDocOperation<any>('lists.getStyle', { sessionId, target });
    expect(result?.success).toBe(true);
    expect(result?.style?.version).toBe(1);
    return result.style as ListStyle;
  }

  async function getItem(sessionId: string, address: ListItemAddress): Promise<any> {
    return callDocOperation<any>('lists.get', { sessionId, address });
  }

  async function canContinuePrevious(sessionId: string, target: ListItemAddress): Promise<any> {
    return callDocOperation<any>('lists.canContinuePrevious', { sessionId, target });
  }

  async function readZipEntry(docPath: string, zipPath: string): Promise<string | null> {
    const JSZipModule = await import('../../../../packages/superdoc/node_modules/jszip');
    const JSZip = JSZipModule.default;
    const buffer = await readFile(docPath);
    const zip = await JSZip.loadAsync(buffer);
    const file = zip.file(zipPath);
    return file ? file.async('string') : null;
  }

  async function requireZipEntry(docPath: string, zipPath: string): Promise<string> {
    const content = await readZipEntry(docPath, zipPath);
    if (content == null) {
      throw new Error(`Missing zip entry "${zipPath}" in ${docPath}`);
    }
    return content;
  }

  function assertMutationSuccess(operationId: string, result: any): void {
    if (result?.success === true || result?.receipt?.success === true) return;
    const code = result?.failure?.code ?? result?.receipt?.failure?.code ?? 'UNKNOWN';
    throw new Error(`${operationId} did not report success (code: ${code}).`);
  }

  it('round-trips getStyle/applyStyle/restartAt without affecting the previous sequence', async () => {
    const { sessionId, resultDoc } = await openFixture('style-apply-restart');
    const fixture = await resolvePreSeparatedFixture(sessionId);

    const canContinueBefore = await canContinuePrevious(sessionId, fixture.secondItem);
    expect(canContinueBefore?.canContinue).toBe(true);

    const firstStyleBefore = await getStyle(sessionId, fixture.firstItem);
    const secondStyleBefore = await getStyle(sessionId, fixture.secondItem);

    const editedStyle = cloneStyle(firstStyleBefore);
    const level0 = requireLevel(editedStyle, 0);
    level0.numFmt = 'upperRoman';
    level0.lvlText = '(%1)';
    level0.start = 4;
    level0.alignment = 'center';
    level0.indents = { left: 1440, hanging: 1080 };
    level0.trailingCharacter = 'tab';
    level0.tabStopAt = 1440;

    const applyResult = await callDocOperation<any>('lists.applyStyle', {
      sessionId,
      target: fixture.secondItem,
      style: editedStyle,
    });
    assertMutationSuccess('lists.applyStyle', applyResult);

    const secondStyleAfterApply = await getStyle(sessionId, fixture.secondItem);
    const secondLevel0 = requireLevel(secondStyleAfterApply, 0);
    expect(secondLevel0).toMatchObject({
      numFmt: 'upperRoman',
      lvlText: '(%1)',
      start: 4,
      alignment: 'center',
      indents: { left: 1440, hanging: 1080 },
      trailingCharacter: 'tab',
      tabStopAt: 1440,
    });

    const firstStyleAfterApply = await getStyle(sessionId, fixture.firstItem);
    expect(firstStyleAfterApply).toEqual(firstStyleBefore);
    expect(secondStyleAfterApply).not.toEqual(secondStyleBefore);

    const canContinueAfterApply = await canContinuePrevious(sessionId, fixture.secondItem);
    expect(canContinueAfterApply?.canContinue).toBe(false);

    const restartResult = await callDocOperation<any>('lists.restartAt', {
      sessionId,
      target: fixture.secondItem,
      startAt: 7,
    });
    assertMutationSuccess('lists.restartAt', restartResult);

    const restartedItem = await getItem(sessionId, fixture.secondItem);
    const restartedInfo = restartedItem?.item ?? restartedItem;
    if (typeof restartedInfo?.ordinal === 'number') {
      expect(restartedInfo.ordinal).toBe(7);
    } else {
      expect(String(restartedInfo?.marker ?? '')).toContain('7');
    }

    const secondStyleAfterRestart = await getStyle(sessionId, fixture.secondItem);
    expect(secondStyleAfterRestart).toEqual(secondStyleAfterApply);

    await saveResult(sessionId, resultDoc);

    const numberingXml = await requireZipEntry(resultDoc, NUMBERING_PART);
    expect(numberingXml).toContain('w:numFmt');
    expect(numberingXml).toContain('upperRoman');
    expect(numberingXml).toContain('w:lvlText');
    expect(numberingXml).toContain('(%1)');
    expect(numberingXml).toMatch(/w:lvlJc[^>]*w:val="center"/);
    expect(numberingXml).toMatch(
      /w:ind[^>]*w:left="1440"[^>]*w:hanging="1080"|w:ind[^>]*w:hanging="1080"[^>]*w:left="1440"/,
    );
    expect(numberingXml).toMatch(/w:suff[^>]*w:val="tab"/);
    expect(numberingXml).toMatch(/w:tab[^>]*w:val="num"[^>]*w:pos="1440"|w:tab[^>]*w:pos="1440"[^>]*w:val="num"/);
    expect(numberingXml).toMatch(/w:startOverride[^>]*w:val="7"/);
  });

  it('applies decomposed setLevel* commands without clobbering prior level edits', async () => {
    const { sessionId, resultDoc } = await openFixture('set-level-commands');
    const fixture = await resolvePreSeparatedFixture(sessionId);

    const baselineStyle = await getStyle(sessionId, fixture.firstItem);
    const baselineLevel0 = requireLevel(baselineStyle, 0);

    const setNumberStyleResult = await callDocOperation<any>('lists.setLevelNumberStyle', {
      sessionId,
      target: fixture.firstItem,
      level: 0,
      numberStyle: 'upperRoman',
    });
    assertMutationSuccess('lists.setLevelNumberStyle', setNumberStyleResult);

    const afterNumberStyle = requireLevel(await getStyle(sessionId, fixture.firstItem), 0);
    expect(afterNumberStyle.numFmt).toBe('upperRoman');
    expect(afterNumberStyle.lvlText).toBe(baselineLevel0.lvlText);

    const setTextResult = await callDocOperation<any>('lists.setLevelText', {
      sessionId,
      target: fixture.firstItem,
      level: 0,
      text: '(%1)',
    });
    assertMutationSuccess('lists.setLevelText', setTextResult);

    const afterText = requireLevel(await getStyle(sessionId, fixture.firstItem), 0);
    expect(afterText.numFmt).toBe('upperRoman');
    expect(afterText.lvlText).toBe('(%1)');

    const setStartResult = await callDocOperation<any>('lists.setLevelStart', {
      sessionId,
      target: fixture.firstItem,
      level: 0,
      startAt: 4,
    });
    assertMutationSuccess('lists.setLevelStart', setStartResult);

    const afterStart = requireLevel(await getStyle(sessionId, fixture.firstItem), 0);
    expect(afterStart.numFmt).toBe('upperRoman');
    expect(afterStart.lvlText).toBe('(%1)');
    expect(afterStart.start).toBe(4);

    const setLayoutResult = await callDocOperation<any>('lists.setLevelLayout', {
      sessionId,
      target: fixture.firstItem,
      level: 0,
      layout: {
        alignment: 'center',
        alignedAt: 360,
        textIndentAt: 1440,
        followCharacter: 'tab',
        tabStopAt: 1440,
      },
    });
    assertMutationSuccess('lists.setLevelLayout', setLayoutResult);

    const afterLayout = requireLevel(await getStyle(sessionId, fixture.firstItem), 0);
    expect(afterLayout).toMatchObject({
      numFmt: 'upperRoman',
      lvlText: '(%1)',
      start: 4,
      alignment: 'center',
      indents: { left: 1440, hanging: 1080 },
      trailingCharacter: 'tab',
      tabStopAt: 1440,
    });

    await saveResult(sessionId, resultDoc);

    const numberingXml = await requireZipEntry(resultDoc, NUMBERING_PART);
    expect(numberingXml).toContain('upperRoman');
    expect(numberingXml).toContain('(%1)');
    expect(numberingXml).toMatch(/w:start[^>]*w:val="4"/);
    expect(numberingXml).toMatch(/w:lvlJc[^>]*w:val="center"/);
    expect(numberingXml).toMatch(/w:suff[^>]*w:val="tab"/);
  });

  it('preserves restart overrides when applying a style to the same sequence', async () => {
    const { sessionId, resultDoc } = await openFixture('style-preserves-restart');
    const fixture = await resolvePreSeparatedFixture(sessionId);

    const presetResult = await callDocOperation<any>('lists.applyPreset', {
      sessionId,
      target: fixture.secondItem,
      preset: 'upperRoman',
    });
    assertMutationSuccess('lists.applyPreset', presetResult);

    const restartResult = await callDocOperation<any>('lists.restartAt', {
      sessionId,
      target: fixture.secondItem,
      startAt: 7,
    });
    assertMutationSuccess('lists.restartAt', restartResult);

    const styleBefore = await getStyle(sessionId, fixture.secondItem);
    const editedStyle = cloneStyle(styleBefore);
    requireLevel(editedStyle, 0).lvlText = '(%1)';

    const applyResult = await callDocOperation<any>('lists.applyStyle', {
      sessionId,
      target: fixture.secondItem,
      style: editedStyle,
    });
    assertMutationSuccess('lists.applyStyle', applyResult);

    const styleAfter = await getStyle(sessionId, fixture.secondItem);
    expect(requireLevel(styleAfter, 0).lvlText).toBe('(%1)');

    await saveResult(sessionId, resultDoc);

    const numberingXml = await requireZipEntry(resultDoc, NUMBERING_PART);
    expect(numberingXml).toContain('(%1)');
    expect(numberingXml).toMatch(/w:startOverride[^>]*w:val="7"/);
  });
});
