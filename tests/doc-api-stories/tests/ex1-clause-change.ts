import { describe, expect, it } from 'vitest';
import { corpusDoc, unwrap, useStoryHarness } from './harness';

const ORIGINAL_CLAUSE = `Term and Termination This Agreement shall commence on the date first written above and continue for a period of [term length] unless terminated earlier in accordance with this Agreement. Either party may terminate this Agreement upon ____   days' written notice to the other party. Licensor may terminate this Agreement immediately if Licensee breaches any of its obligations under this Agreement.`;

describe('document-api story: ex1 clause change', () => {
  const { client, copyDoc } = useStoryHarness('ex1-clause-change');

  it('discover: query.match returns handles, blocks, and runs', async () => {
    const sourceDocPath = await copyDoc(corpusDoc('basic/longer-header.docx'));
    const sessionId = `ex1-seed-${Date.now()}`;

    await client.doc.open({ doc: sourceDocPath, sessionId });

    // -----------------------------------------------------------------------
    // 1. Discover — match once to get handles, ids, and snippets
    // -----------------------------------------------------------------------

    const clauseResult = unwrap<any>(
      await client.doc.query.match({
        sessionId,
        select: { type: 'text', pattern: ORIGINAL_CLAUSE, caseSensitive: true },
        require: 'first',
      }),
    );

    expect(clauseResult.items).toBeDefined();
    expect(clauseResult.items.length).toBeGreaterThan(0);
    expect(clauseResult.total).toBeGreaterThanOrEqual(1);
    expect(clauseResult.page).toBeDefined();
    expect(clauseResult.page.returned).toBeGreaterThanOrEqual(1);

    const clauseMatch = clauseResult.items[0];

    expect(clauseMatch.handle.ref).toBeDefined();
    expect(clauseMatch.id).toMatch(/^m:\d+$/);

    // Verify blocks/runs structure is present
    expect(clauseMatch.blocks).toBeDefined();
    expect(clauseMatch.blocks.length).toBeGreaterThan(0);

    // Verify each block has runs with styles
    for (const block of clauseMatch.blocks) {
      expect(block.blockId).toBeDefined();
      expect(block.runs).toBeDefined();
      expect(block.runs.length).toBeGreaterThan(0);
      for (const run of block.runs) {
        expect(run.styles).toBeDefined();
        expect(typeof run.styles.bold).toBe('boolean');
        expect(run.ref).toBeDefined();
      }
    }

    // Verify handle properties
    expect(clauseMatch.handle.refStability).toBeDefined();
    expect(clauseMatch.handle.targetKind).toBeDefined();

    // Verify V3 ref encoding
    const decodedRef = JSON.parse(atob(clauseMatch.handle.ref.slice(5)));
    expect(decodedRef.v).toBe(3);
    expect(decodedRef.scope).toBe('match');
  });
});
