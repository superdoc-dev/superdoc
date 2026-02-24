import { describe, expect, it } from 'vitest';
import { corpusDoc, unwrap, useStoryHarness } from './harness';

const ORIGINAL_TITLE = 'Term and Termination';
const REPLACEMENT_TITLE = 'Limitation of Liability';
const ORIGINAL_BODY = `This Agreement shall commence on the date first written above and continue for a period of [term length] unless terminated earlier in accordance with this Agreement. Either party may terminate this Agreement upon ____   days' written notice to the other party. Licensor may terminate this Agreement immediately if Licensee breaches any of its obligations under this Agreement.`;
const REPLACEMENT_BODY =
  "In no event shall Licensor be liable for any indirect, incidental, special, or consequential damages arising out of or in connection with this Agreement, whether in an action in contract, tort, or otherwise, even if Licensor has been advised of the possibility of such damages. Licensor's total liability for any claim arising out of or relating to this Agreement shall not exceed the amount of the license fee paid by Licensee to Licensor.";
// const BODY_REGEX =
//   'This Agreement shall commence[\\s\\S]*?Licensee breaches any of its obligations under this Agreement\\.';

const PRESERVE_STYLE = {
  inline: { mode: 'preserve', onNonUniform: 'majority' },
  paragraph: { mode: 'preserve' },
} as const;

describe('doc-api story: ex1 clause change', () => {
  const { client, copyDoc, outPath } = useStoryHarness('ex1-clause-change');

  it('runs Example 1 with tracked mutation plan and preserves title marks', async () => {
    const sourceDocPath = await copyDoc(corpusDoc('basic/longer-header.docx'));
    const outputDocPath = outPath('example1-result.docx');
    const sessionId = `ex1-seed-${Date.now()}`;
    const verifySessionId = `${sessionId}-verify`;

    await client.doc.open({ doc: sourceDocPath, sessionId });

    // Discover the seeded content
    const titleDiscovery = unwrap<any>(
      await client.doc.query.match({
        sessionId,
        select: { type: 'text', pattern: ORIGINAL_TITLE, caseSensitive: true },
        require: 'first',
        includeStyle: true,
      }),
    );
    const bodyDiscovery = unwrap<any>(
      await client.doc.query.match({
        sessionId,
        select: { type: 'text', pattern: ORIGINAL_BODY, caseSensitive: true },
        require: 'first',
        includeStyle: true,
      }),
    );

    expect(titleDiscovery.matches.length).toBeGreaterThan(0);
    expect(bodyDiscovery.matches.length).toBeGreaterThan(0);

    // Build and preview the mutation plan
    const steps = [
      {
        id: 'rewrite_title',
        op: 'text.rewrite',
        where: {
          by: 'select',
          select: { type: 'text', pattern: ORIGINAL_TITLE, caseSensitive: true },
          require: 'exactlyOne',
        },
        args: { replacement: { text: REPLACEMENT_TITLE }, style: PRESERVE_STYLE },
      },
      {
        id: 'rewrite_body',
        op: 'text.rewrite',
        where: {
          by: 'select',
          select: { type: 'text', pattern: ORIGINAL_BODY, caseSensitive: true },
          require: 'exactlyOne',
        },
        args: { replacement: { text: REPLACEMENT_BODY }, style: PRESERVE_STYLE },
      },
    ];

    // Apply and save
    const applyResult = unwrap<any>(
      await client.doc.mutations.apply({ sessionId, atomic: true, changeMode: 'tracked', steps }),
    );

    expect(applyResult.success).toBe(true);
    expect(applyResult.revision.after).not.toBe(applyResult.revision.before);

    await client.doc.save({ sessionId, out: outputDocPath, force: true });

    // Verify round-tripped output
    await client.doc.close({ sessionId, discard: true });
    await client.doc.open({ doc: outputDocPath, sessionId: verifySessionId });

    const replacementTitle = unwrap<any>(
      await client.doc.query.match({
        sessionId: verifySessionId,
        select: { type: 'text', pattern: REPLACEMENT_TITLE, caseSensitive: true },
        require: 'first',
        includeStyle: true,
      }),
    );
    const replacementBody = unwrap<any>(
      await client.doc.query.match({
        sessionId: verifySessionId,
        select: { type: 'text', pattern: REPLACEMENT_BODY, caseSensitive: true },
        require: 'first',
      }),
    );
    const trackedChanges = unwrap<any>(await client.doc.trackChanges.list({ sessionId: verifySessionId, limit: 20 }));

    expect(replacementTitle.matches[0]?.style?.marks).toMatchObject({ bold: true });
    expect(replacementBody.totalMatches).toBeGreaterThan(0);
    expect(trackedChanges.total).toBeGreaterThan(0);
  });
});
