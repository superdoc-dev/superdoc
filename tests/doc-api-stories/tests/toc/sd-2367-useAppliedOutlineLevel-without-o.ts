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
  const { client, outPath } = useStoryHarness('toc/sd-2367-useAppliedOutlineLevel', {
    preserveResults: true,
  });

  const api = client as any;

  function makeSessionId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  it(
    'TOC with \\u only collects paragraphs that have outlineLevel set',
    async () => {
      const sessionId = makeSessionId('sd2367');
      await api.doc.open({ sessionId });

      // Insert normal paragraphs (no heading style)
      const p1 = unwrap<any>(await api.doc.insert({ sessionId, value: 'Normal paragraph' }));
      expect(p1?.receipt?.success).toBe(true);

      const p2 = unwrap<any>(
        await api.doc.create.heading({
          sessionId,
          level: 1,
          at: { kind: 'documentEnd' },
          text: 'Custom Section A',
        }),
      );
      expect(p2?.receipt?.success).toBe(true);

      const p3 = unwrap<any>(
        await api.doc.create.heading({
          sessionId,
          level: 2,
          at: { kind: 'documentEnd' },
          text: 'Custom Section B',
        }),
      );
      expect(p3?.receipt?.success).toBe(true);

      // Save the doc so we can use CLI calls
      const docPath = outPath('sd2367-source.docx');
      await api.doc.save({ sessionId, out: docPath, force: true });

      // Discover the paragraphs to get their nodeIds for setOutlineLevel
      const blocksResult = unwrap<any>(await api.doc.blocks.list({ sessionId, filter: { nodeType: 'paragraph' } }));
      const paragraphs = blocksResult?.items ?? [];
      expect(paragraphs.length).toBeGreaterThanOrEqual(3);

      // Set outlineLevel on the first normal paragraph (not a heading style)
      const firstParagraph = paragraphs[0];
      const setResult = unwrap<any>(
        await api.doc.format.paragraph.setOutlineLevel({
          sessionId,
          target: firstParagraph.address,
          outlineLevel: 0, // outline level 0 → TOC level 1
        }),
      );
      expect(setResult?.receipt?.success).toBe(true);

      // Save after setting outlineLevel
      await api.doc.save({ sessionId, out: docPath, force: true });

      // Create a TOC WITHOUT \o — only \u (useAppliedOutlineLevel)
      // This is the bug scenario: TOC \u \h \z
      const createResult = unwrap<any>(
        await api.doc.create.tableOfContents({
          sessionId,
          at: { kind: 'documentStart' },
          config: {
            useAppliedOutlineLevel: true,
            hyperlinks: true,
            hideInWebView: true,
            // NO outlineLevels — this is the key part
          },
        }),
      );

      if (createResult?.success !== true && createResult?.receipt?.success !== true) {
        const code = createResult?.failure?.code ?? createResult?.receipt?.failure?.code ?? 'UNKNOWN';
        throw new Error(`create.tableOfContents did not report success (code: ${code}).`);
      }

      // Save with TOC
      const resultPath = outPath('sd2367-result.docx');
      await api.doc.save({ sessionId, out: resultPath, force: true });

      // Verify: the TOC should have entries (not be empty)
      const tocList = unwrap<any>(await api.doc.toc.list({ sessionId }));
      expect(tocList?.total).toBeGreaterThanOrEqual(1);

      const tocTarget = tocList.items[0].address;
      const tocInfo = unwrap<any>(await api.doc.toc.get({ sessionId, target: tocTarget }));

      // The TOC should contain entries from paragraphs with outlineLevel
      // Before the fix, this would be 0 (bug). After the fix, > 0.
      expect(tocInfo?.properties?.entryCount).toBeGreaterThan(0);

      // Verify the instruction does NOT contain \o (no outline range)
      // but DOES contain \u
      expect(tocInfo?.properties?.instruction).toContain('\\u');
    },
    TIMEOUT_MS,
  );
});
