import { describe, expect, it } from 'vitest';
import { unwrap, useStoryHarness } from '../harness';

const TEST_USER = { name: 'Review Bot', email: 'bot@example.com' };

function sid(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function unwrapNamed<T>(payload: unknown, key?: string): T {
  if (key && payload && typeof payload === 'object' && key in payload) {
    return (payload as Record<string, unknown>)[key] as T;
  }
  return unwrap<T>(payload);
}

// SD-3279: the customer's preview-pane pattern (IT-1116). A main editor session
// produces the diff; a *separately-opened* preview session — holding the same
// base document — applies it as tracked changes. Before the fix, the two
// sessions' canonical fingerprints diverged because `sdBlockId` is assigned
// per session, so `diff.apply` threw `PRECONDITION_FAILED`. This story locks
// in the cross-session handoff at the public Document API surface.
describe('document-api story: cross-editor diff handoff (SD-3279)', () => {
  const { client } = useStoryHarness('diff/cross-editor-handoff-roundtrip', {
    preserveResults: false,
    clientOptions: {
      user: TEST_USER,
    },
  });

  async function listTrackedChanges(sessionId: string, type?: 'insert' | 'delete' | 'format') {
    return unwrap<any>(await client.doc.trackChanges.list(type ? { sessionId, type } : { sessionId }));
  }

  it('applies a diff produced in one session to a separate session loaded with the same base content', async () => {
    const baseSessionId = sid('cross-base');
    const previewSessionId = sid('cross-preview');
    const targetSessionId = sid('cross-target');

    const baseText = 'Section 1. Payment is due within thirty days.';
    const targetParagraph = 'Renewal requires written approval.';

    // Base and preview hold identical content. Target represents the desired
    // post-apply state — used only to produce the snapshot the diff is taken
    // against, then closed.
    await client.doc.open({
      sessionId: baseSessionId,
      contentOverride: baseText,
      overrideType: 'text',
    });
    await client.doc.open({
      sessionId: previewSessionId,
      contentOverride: baseText,
      overrideType: 'text',
    });
    await client.doc.open({
      sessionId: targetSessionId,
      contentOverride: `${baseText}\n${targetParagraph}`,
      overrideType: 'text',
    });

    const targetSnapshot = unwrapNamed<any>(await client.doc.diff.capture({ sessionId: targetSessionId }), 'snapshot');
    expect(targetSnapshot.engine).toBe('super-editor');
    await client.doc.close({ sessionId: targetSessionId, discard: true });

    const diff = unwrapNamed<any>(
      await client.doc.diff.compare({
        sessionId: baseSessionId,
        targetSnapshot,
      }),
      'diff',
    );
    expect(diff.summary.hasChanges).toBe(true);
    expect(diff.summary.body.hasChanges).toBe(true);

    // Apply to PREVIEW, not BASE. This is the cross-editor handoff that was
    // broken before SD-3279.
    const applyResult = unwrapNamed<any>(
      await client.doc.diff.apply({
        sessionId: previewSessionId,
        diff,
        changeMode: 'tracked',
      }),
      'result',
    );
    expect(applyResult.appliedOperations).toBeGreaterThan(0);
    expect(applyResult.summary.hasChanges).toBe(true);
    expect(applyResult.summary.body.hasChanges).toBe(true);

    const tracked = await listTrackedChanges(previewSessionId);
    const insertions = await listTrackedChanges(previewSessionId, 'insert');
    expect(tracked.total).toBeGreaterThan(0);
    expect(insertions.total).toBeGreaterThan(0);

    // Customer-visible result: the preview now contains the target content.
    const previewText = await client.doc.getText({ sessionId: previewSessionId });
    expect(previewText).toContain(targetParagraph);

    await client.doc.close({ sessionId: baseSessionId, discard: true });
    await client.doc.close({ sessionId: previewSessionId, discard: true });
  });
});
