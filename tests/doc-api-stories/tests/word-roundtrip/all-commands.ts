/**
 * Word-in-the-loop validation for anchored metadata (SD-3201).
 *
 * The SuperDoc → DOCX → SuperDoc round-trip is proven by
 * `tests/doc-api-stories/tests/metadata/all-commands.ts` — same
 * session model, save and reopen. This story proves the harder case:
 * Microsoft Word in the middle.
 *
 * Fixtures under `./fixtures/` were generated as follows:
 *
 *   1. `source-baseline.docx` — a SuperDoc-exported DOCX with one
 *      anchored citation (`id="fixture-cite-001"`, namespace
 *      `urn:superdoc:test:word-roundtrip:1`, anchor over the phrase
 *      "duty of care").
 *   2. `baseline-word-resaved.docx` — `source-baseline.docx` opened
 *      in Word and re-saved without edits. Proves Word does not
 *      strip the customXml part or the hidden SDT wrapper.
 *   3. `baseline-word-edited.docx` — `source-baseline.docx` opened
 *      in Word with text inserted inside the cited span. Proves the
 *      SDT survives content edits and resolves to a target whose
 *      text content includes the edit.
 *
 * The fixtures are deterministic snapshots — they run in CI without
 * needing Word access. New Word version regressions are caught by a
 * separate pre-rollout live script (not in this PR).
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { unwrap, useStoryHarness } from '../harness';

const NAMESPACE = 'urn:superdoc:test:word-roundtrip:1';
const CITE_ID = 'fixture-cite-001';

const EXPECTED_PAYLOAD = {
  citationId: 'fixture-cite-001',
  sourceId: 'src-restatement',
  sourceType: 'statute',
  provider: 'lexisnexis',
  displayText: 'Restatement (Third) of Torts § 6',
  locator: '§ 6',
  excerpt: 'An actor must exercise reasonable care.',
  confidence: 0.92,
};

const FIXTURE_DIR = path.resolve(import.meta.dirname, 'fixtures');
const FIXTURE_RESAVED = path.join(FIXTURE_DIR, 'baseline-word-resaved.docx');
const FIXTURE_EDITED = path.join(FIXTURE_DIR, 'baseline-word-edited.docx');

describe('document-api story: Word round-trip preserves anchored metadata', () => {
  const { client } = useStoryHarness('word-roundtrip/all-commands', { preserveResults: true });
  const api = client as any;

  function makeSessionId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async function callDocOperation<T>(operationId: string, input: Record<string, unknown>): Promise<T> {
    const segments = operationId.split('.');
    let fn: any = api.doc;
    for (const segment of segments) fn = fn?.[segment];
    if (typeof fn !== 'function') throw new Error(`Unknown doc operation: ${operationId}`);
    return unwrap<T>(await fn(input));
  }

  async function withReopenedSession<T>(fixturePath: string, fn: (sessionId: string) => Promise<T>): Promise<T> {
    const sessionId = makeSessionId('word-roundtrip');
    try {
      await callDocOperation('open', { sessionId, doc: fixturePath });
      return await fn(sessionId);
    } finally {
      await callDocOperation('close', { sessionId, discard: true }).catch(() => {});
    }
  }

  it('Word save (no edits): metadata.list/get/resolve all recover the citation', async () => {
    await withReopenedSession(FIXTURE_RESAVED, async (sessionId) => {
      // list
      const list = await callDocOperation<any>('metadata.list', { sessionId, namespace: NAMESPACE });
      expect(list?.total).toBe(1);
      const ids = (list?.items ?? []).map((item: any) => item?.id ?? item?.domain?.id);
      expect(ids).toContain(CITE_ID);

      // get — payload survives intact (Word does not normalize the customXml part)
      const info = await callDocOperation<any>('metadata.get', { sessionId, id: CITE_ID });
      expect(info?.id).toBe(CITE_ID);
      expect(info?.namespace).toBe(NAMESPACE);
      expect(info?.payload).toEqual(EXPECTED_PAYLOAD);

      // resolve — anchor still resolves to a text-range target
      const resolved = await callDocOperation<any>('metadata.resolve', { sessionId, id: CITE_ID });
      expect(resolved?.id).toBe(CITE_ID);
      expect(resolved?.target?.kind).toBe('selection');
      expect(resolved?.target?.start?.kind).toBe('text');
      expect(resolved?.target?.end?.kind).toBe('text');
    });
  });

  it('Word edit inside anchor: metadata recovers, anchor survives without detaching', async () => {
    await withReopenedSession(FIXTURE_EDITED, async (sessionId) => {
      // payload still recovers — Word does not touch the customXml part during inline edits
      const info = await callDocOperation<any>('metadata.get', { sessionId, id: CITE_ID });
      expect(info?.payload).toEqual(EXPECTED_PAYLOAD);

      // resolve returns a `selection` target with text endpoints — the anchor did not detach
      // when Word split runs around the inserted word. (A detached / orphaned anchor would
      // resolve to a different `target.kind`, or no target at all.)
      const resolved = await callDocOperation<any>('metadata.resolve', { sessionId, id: CITE_ID });
      expect(resolved?.id).toBe(CITE_ID);
      expect(resolved?.target?.kind).toBe('selection');
      expect(resolved?.target?.start?.kind).toBe('text');
      expect(resolved?.target?.end?.kind).toBe('text');

      // Independent text-content check via `extract` — slice the resolved block's text using the
      // resolved start/end offsets and assert the inserted word ("reasonable") plus the original
      // anchor head and tail ("duty", "care") all fall inside the SDT range. This is independent
      // of `metadata.resolve` because `extract` reads the document body, not the customXml store.
      const extracted = await callDocOperation<any>('extract', { sessionId });
      const startBlockId = resolved.target.start.blockId;
      const endBlockId = resolved.target.end.blockId;
      expect(endBlockId).toBe(startBlockId); // fixture invariant: anchor is intra-paragraph
      const block = (extracted?.blocks ?? []).find((b: any) => b?.nodeId === startBlockId);
      expect(block?.text).toBeTruthy();
      const selectedText = String(block.text).slice(resolved.target.start.offset, resolved.target.end.offset);
      expect(selectedText).toContain('duty');
      expect(selectedText).toContain('reasonable');
      expect(selectedText).toContain('care');
    });
  });
});
