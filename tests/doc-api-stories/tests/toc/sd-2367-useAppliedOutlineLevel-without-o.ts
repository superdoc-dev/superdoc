/**
 * SD-2367: useAppliedOutlineLevel without \o switch
 *
 * Verifies that TOC collects paragraphs with outlineLevel when
 * useAppliedOutlineLevel is true and no \o range is specified.
 */

import { describe, expect, it } from 'vitest';
import { unwrap, useStoryHarness } from '../harness';

const TIMEOUT_MS = 60_000;

describe('SD-2367: useAppliedOutlineLevel without \\o switch', () => {
  const { client, outPath, runCli } = useStoryHarness('toc/sd-2367-useAppliedOutlineLevel', {
    preserveResults: true,
  });

  const api = client as any;

  function makeSessionId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function assertSuccess(label: string, result: any): void {
    if (result?.success === true || result?.receipt?.success === true) return;
    const code = result?.failure?.code ?? result?.receipt?.failure?.code ?? 'UNKNOWN';
    throw new Error(`${label} did not report success (code: ${code}).`);
  }

  async function callDocOperation<T>(operationId: string, input: Record<string, unknown>): Promise<T> {
    const normalizedInput = { ...input };
    if (typeof normalizedInput.out === 'string' && normalizedInput.out.length > 0 && normalizedInput.force == null) {
      normalizedInput.force = true;
    }
    const envelope = await runCli(['call', `doc.${operationId}`, '--input-json', JSON.stringify(normalizedInput)]);
    return unwrap<T>(unwrap<any>(envelope?.data));
  }

  it(
    'TOC with \\u only collects paragraphs that have outlineLevel set',
    async () => {
      // Step 1: Build a doc with headings via SDK session
      const sessionId = makeSessionId('sd2367');
      await api.doc.open({ sessionId });

      const p1 = unwrap<any>(await api.doc.insert({ sessionId, value: 'Normal paragraph' }));
      assertSuccess('insert', p1);

      const p2 = unwrap<any>(
        await api.doc.create.heading({
          sessionId,
          level: 1,
          at: { kind: 'documentEnd' },
          text: 'Section A',
        }),
      );
      assertSuccess('create.heading 1', p2);

      const p3 = unwrap<any>(
        await api.doc.create.heading({
          sessionId,
          level: 2,
          at: { kind: 'documentEnd' },
          text: 'Section B',
        }),
      );
      assertSuccess('create.heading 2', p3);

      const docPath = outPath('sd2367-source.docx');
      await api.doc.save({ sessionId, out: docPath, force: true });

      // Step 2: Find the first normal paragraph and set outlineLevel via CLI
      const findResult = await callDocOperation<any>('find', {
        doc: docPath,
        query: { select: { type: 'node', nodeType: 'paragraph' } },
      });
      const paragraphs = findResult?.items ?? [];
      expect(paragraphs.length).toBeGreaterThanOrEqual(1);

      const firstParagraph = paragraphs[0];
      const setResult = await callDocOperation<any>('format.paragraph.setOutlineLevel', {
        doc: docPath,
        out: docPath,
        target: firstParagraph.address,
        outlineLevel: 0, // OOXML level 0 → TOC level 1
      });
      assertSuccess('setOutlineLevel', setResult);

      // Step 3: Create TOC with \u only (no \o)
      const createResult = await callDocOperation<any>('create.tableOfContents', {
        doc: docPath,
        out: docPath,
        at: { kind: 'documentStart' },
        config: {
          useAppliedOutlineLevel: true,
          hyperlinks: true,
          hideInWebView: true,
          // NO outlineLevels — the SD-2367 scenario
        },
      });
      assertSuccess('create.tableOfContents', createResult);

      // Step 4: Verify TOC has entries
      const resultPath = outPath('sd2367-result.docx');
      const listResult = await callDocOperation<any>('toc.list', { doc: docPath });
      expect(listResult?.total).toBeGreaterThanOrEqual(1);

      const tocTarget = listResult.items[0].address;
      const tocInfo = await callDocOperation<any>('toc.get', { doc: docPath, target: tocTarget });

      // Before fix: entryCount was 0 (bug). After fix: > 0.
      expect(tocInfo?.properties?.entryCount).toBeGreaterThan(0);
      expect(tocInfo?.properties?.instruction).toContain('\\u');
    },
    TIMEOUT_MS,
  );
});
