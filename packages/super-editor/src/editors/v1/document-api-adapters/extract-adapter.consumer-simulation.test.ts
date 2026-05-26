/* @vitest-environment jsdom */

/**
 * Consumer simulation for SD-2766. Loads a real DOCX with tracked changes
 * (msword-tracked-changes.docx) and walks through the customer-reported flow
 * end-to-end: extract -> render markers -> build chunks for RAG.
 *
 * Kept separate from extract-adapter.test.ts so unit coverage stays focused
 * and this test reads as a validation harness for the public shape.
 *
 * The fixture contains two interesting paragraphs:
 *   1. "Here is a MS Word [del:basic ][ins:cool ]sentence" — a paired
 *      replacement. SuperDoc's importer (trackedChangeIdMapper.js) maps
 *      adjacent w:del + w:ins with the same author/date to one internal
 *      raw mark id, so both halves share a single entityId at the public
 *      API. Spans carry the per-half type, while the entity-level `type`
 *      on `trackedChanges[]` is `replacement`.
 *   2. "[del:Delete me]" — a paragraph that is entirely a deletion.
 */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import type { Editor } from '../core/Editor.js';
import { extractAdapter } from './extract-adapter.js';
import type { ExtractBlock, ExtractResult, ExtractTextSpan, ExtractTrackedChange } from '@superdoc/document-api';

// ---------------------------------------------------------------------------
// Consumer code — the helpers a downstream user (an SDK consumer's RAG pipeline) would
// write against the new extract output. These are intentionally short, since
// part of validating the API is showing how cheap the consumer side becomes.
// ---------------------------------------------------------------------------

/**
 * Render a block's text with `<ins>` / `<del>` markers around the runs that
 * carry tracked-change marks. Falls back to `block.text` when `textSpans`
 * isn't present (clean blocks, or older SDK responses).
 */
function renderMarkedText(block: ExtractBlock): string {
  if (!block.textSpans || block.textSpans.length === 0) return block.text;
  return block.textSpans
    .map((span) => {
      const tc = span.trackedChanges?.find((c) => c.type === 'insert' || c.type === 'delete');
      if (!tc) return span.text;
      const tag = tc.type === 'insert' ? 'ins' : 'del';
      return `<${tag} data-tc-id="${tc.entityId}">${span.text}</${tag}>`;
    })
    .join('');
}

/**
 * Build the chunks the demo would feed to embeddings. One body chunk per
 * non-empty block, with markers baked into the embedded content. One citation
 * chunk per tracked change, anchored back to the blocks it lives in.
 */
type ChunkForEmbedding =
  | {
      kind: 'body';
      blockId: string;
      content: string;
      hasTrackedChanges: boolean;
    }
  | {
      kind: 'tracked-change';
      entityId: string;
      type: 'insert' | 'delete' | 'replacement' | 'format';
      blockIds: string[];
      content: string;
    };

function buildChunks(extract: ExtractResult): ChunkForEmbedding[] {
  const chunks: ChunkForEmbedding[] = [];
  for (const block of extract.blocks) {
    if (!block.text.trim()) continue;
    chunks.push({
      kind: 'body',
      blockId: block.nodeId,
      content: renderMarkedText(block),
      hasTrackedChanges: !!block.textSpans,
    });
  }
  for (const tc of extract.trackedChanges) {
    chunks.push({
      kind: 'tracked-change',
      entityId: tc.entityId,
      type: tc.type,
      blockIds: tc.blockIds ?? [],
      content: `[${tc.type} by ${tc.author ?? 'Unknown'}]: "${tc.excerpt ?? ''}"`,
    });
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let docxFixture: Awaited<ReturnType<typeof loadTestDataForEditorTests>>;

beforeAll(async () => {
  docxFixture = await loadTestDataForEditorTests('msword-tracked-changes.docx');
});

describe('extract-adapter consumer simulation (SD-2766)', () => {
  let editor: Editor | undefined;

  afterEach(() => {
    editor?.destroy?.();
    editor = undefined;
  });

  it('produces spans that disambiguate a paired delete + insert in one paragraph', async () => {
    const ctx = (await initTestEditor({
      content: docxFixture.docx,
      media: docxFixture.media,
      mediaFiles: docxFixture.mediaFiles,
      fonts: docxFixture.fonts,
    })) as { editor: Editor };
    editor = ctx.editor;

    const result = extractAdapter(editor, {});
    const sentenceBlock = result.blocks.find((b) => b.text.includes('sentence'))!;

    // Sanity: the block exists and carries spans.
    expect(sentenceBlock).toBeDefined();
    expect(sentenceBlock.textSpans).toBeDefined();
    expect(sentenceBlock.textSpans!.map((s) => s.text).join('')).toBe(sentenceBlock.text);

    // Concrete check: there is exactly one delete span and one insert span,
    // and they sit adjacent in the span stream — i.e. the consumer can tell
    // which characters were deleted vs inserted, not just "something happened
    // somewhere in this paragraph".
    const deleteSpans = sentenceBlock.textSpans!.filter((s) => s.trackedChanges?.some((c) => c.type === 'delete'));
    const insertSpans = sentenceBlock.textSpans!.filter((s) => s.trackedChanges?.some((c) => c.type === 'insert'));

    expect(deleteSpans).toHaveLength(1);
    expect(insertSpans.length).toBeGreaterThanOrEqual(1);
    expect(deleteSpans[0].text).toBe('basic ');
    // 'cool ' may emit as one or two spans depending on the converter — the
    // point is the inserted characters are isolated from the surrounding plain
    // text and from the deleted run.
    expect(insertSpans.map((s) => s.text).join('')).toBe('cool ');

    // Render markers and confirm the output disambiguates the repeated-word case.
    const rendered = renderMarkedText(sentenceBlock);
    expect(rendered).toMatch(/<del [^>]*>basic <\/del>/);
    expect(rendered).toMatch(/<ins [^>]*>cool/);
    expect(rendered).toContain('Here is a MS Word');
    expect(rendered).toContain('sentence');

    // Word-authored replacement halves keep distinct span-side markers, but
    // in paired mode they resolve to one public tracked-change entity.
    const delEntity = deleteSpans[0].trackedChanges!.find((c) => c.type === 'delete')!.entityId;
    const insEntity = insertSpans[0].trackedChanges!.find((c) => c.type === 'insert')!.entityId;
    const entitiesById = new Map(result.trackedChanges.map((tc) => [tc.entityId, tc]));
    expect(insEntity).toBe(delEntity);
    expect(entitiesById.get(delEntity)?.wordRevisionIds?.delete).toBeTruthy();
    expect(entitiesById.get(delEntity)?.wordRevisionIds?.insert).toBeTruthy();
  });

  it('attaches every tracked change to the blocks it lives in via blockIds', async () => {
    const ctx = (await initTestEditor({
      content: docxFixture.docx,
      media: docxFixture.media,
      mediaFiles: docxFixture.mediaFiles,
      fonts: docxFixture.fonts,
    })) as { editor: Editor };
    editor = ctx.editor;

    const result = extractAdapter(editor, {});

    expect(result.trackedChanges.length).toBeGreaterThan(0);

    // Every tracked change reports at least one blockId, and that blockId
    // resolves to a real block. The OLD shape had no way to do this — the
    // demo today defaults to `blockId: change.blockId ?? "unknown"` and a
    // citation chunk has no anchor.
    const blockIdSet = new Set(result.blocks.map((b) => b.nodeId));
    for (const tc of result.trackedChanges) {
      expect(tc.blockIds, `change ${tc.entityId} (${tc.type}) should have blockIds`).toBeDefined();
      expect(tc.blockIds!.length).toBeGreaterThan(0);
      for (const bid of tc.blockIds!) {
        expect(blockIdSet.has(bid), `blockId ${bid} should resolve to a block`).toBe(true);
      }
    }
  });

  it("links every span's entityId to a trackedChanges[] entry (navigation round-trip)", async () => {
    const ctx = (await initTestEditor({
      content: docxFixture.docx,
      media: docxFixture.media,
      mediaFiles: docxFixture.mediaFiles,
      fonts: docxFixture.fonts,
    })) as { editor: Editor };
    editor = ctx.editor;

    const result = extractAdapter(editor, {});

    // Collect every entityId referenced by spans.
    const entityIdsInSpans = new Set<string>();
    for (const block of result.blocks) {
      for (const span of block.textSpans ?? []) {
        for (const tc of span.trackedChanges ?? []) {
          entityIdsInSpans.add(tc.entityId);
        }
      }
    }

    // Every span reference resolves to a trackedChanges[] entry. Without this
    // the consumer could render a marker but couldn't look up author/date or
    // pass the id to scrollToElement().
    //
    // We don't assert span.type === entity.type. For paired changes, the
    // entity-level type is "replacement" while the spans still carry the
    // per-half delete/insert truth needed for rendering.
    const indexByEntity = new Map(result.trackedChanges.map((tc) => [tc.entityId, tc]));
    for (const entityId of entityIdsInSpans) {
      expect(indexByEntity.get(entityId), `entityId ${entityId} should appear in trackedChanges[]`).toBeDefined();
    }
  });

  it('lets a consumer derive per-segment view of a Word replacement from spans', async () => {
    // Word-authored replacement halves expose separate tracked-change entities.
    // A reviewer UI ("show me what John changed") rebuilds the segment view
    // from spans + blockIds rather than assuming one aggregate replacement id.
    const ctx = (await initTestEditor({
      content: docxFixture.docx,
      media: docxFixture.media,
      mediaFiles: docxFixture.mediaFiles,
      fonts: docxFixture.fonts,
    })) as { editor: Editor };
    editor = ctx.editor;

    const result = extractAdapter(editor, {});
    const entityToSegments = new Map<string, Array<{ blockId: string; type: string; text: string }>>();
    for (const block of result.blocks) {
      for (const span of block.textSpans ?? []) {
        for (const tc of span.trackedChanges ?? []) {
          const list = entityToSegments.get(tc.entityId) ?? [];
          list.push({ blockId: block.nodeId, type: tc.type, text: span.text });
          entityToSegments.set(tc.entityId, list);
        }
      }
    }

    const deleteEntry = Array.from(entityToSegments.entries()).find(([, segments]) =>
      segments.some((s) => s.type === 'delete' && s.text === 'basic '),
    );
    const insertEntry = Array.from(entityToSegments.entries()).find(
      ([, segments]) =>
        segments
          .filter((s) => s.type === 'insert')
          .map((s) => s.text)
          .join('') === 'cool ',
    );
    expect(deleteEntry).toBeDefined();
    expect(insertEntry).toBeDefined();
    const [deleteEntityId, deleteSegments] = deleteEntry!;
    const [insertEntityId, insertSegments] = insertEntry!;
    expect(deleteEntityId).toBe(insertEntityId);

    const deleteEntity = result.trackedChanges.find((tc) => tc.entityId === deleteEntityId)!;
    expect(deleteEntity.wordRevisionIds?.delete).toBeTruthy();
    expect(deleteEntity.wordRevisionIds?.insert).toBeTruthy();

    expect(deleteSegments.filter((s) => s.type === 'delete').map((s) => s.text)).toEqual(['basic ']);
    expect(
      insertSegments
        .filter((s) => s.type === 'insert')
        .map((s) => s.text)
        .join(''),
    ).toBe('cool ');
    for (const seg of [...deleteSegments, ...insertSegments]) {
      expect(seg.blockId).toBe(deleteEntity.blockIds![0]);
    }
  });

  it('preserves excerpt and exposes a single wordRevisionId for non-paired changes', async () => {
    const ctx = (await initTestEditor({
      content: docxFixture.docx,
      media: docxFixture.media,
      mediaFiles: docxFixture.mediaFiles,
      fonts: docxFixture.fonts,
    })) as { editor: Editor };
    editor = ctx.editor;

    const result = extractAdapter(editor, {});

    // The paragraph-only delete ("Delete me") and the standalone insert
    // ("New text") in this fixture are non-paired — exactly one half each.
    const deleteOnly = result.trackedChanges.find((tc) => tc.type === 'delete' && tc.excerpt?.includes('Delete me'))!;
    expect(deleteOnly).toBeDefined();
    expect(deleteOnly.excerpt).toBe('Delete me');
    expect(deleteOnly.wordRevisionIds?.delete).toBeTruthy();
    expect(deleteOnly.wordRevisionIds?.insert).toBeUndefined();

    const insertOnly = result.trackedChanges.find((tc) => tc.type === 'insert' && tc.excerpt?.includes('New text'))!;
    expect(insertOnly).toBeDefined();
    expect(insertOnly.excerpt).toBe('New text');
    expect(insertOnly.wordRevisionIds?.insert).toBeTruthy();
    expect(insertOnly.wordRevisionIds?.delete).toBeUndefined();
  });

  it('produces RAG chunks where the repeated-word case is unambiguous', async () => {
    const ctx = (await initTestEditor({
      content: docxFixture.docx,
      media: docxFixture.media,
      mediaFiles: docxFixture.mediaFiles,
      fonts: docxFixture.fonts,
    })) as { editor: Editor };
    editor = ctx.editor;

    const result = extractAdapter(editor, {});
    const chunks = buildChunks(result);

    const bodyChunks = chunks.filter((c) => c.kind === 'body');
    const tcChunks = chunks.filter((c) => c.kind === 'tracked-change');

    // The body chunk for the replacement paragraph carries the markers
    // inline. An embedding produced from this chunk distinguishes "basic"
    // from "cool" without any external metadata.
    const sentenceChunk = bodyChunks.find((c) => c.kind === 'body' && c.content.includes('sentence'));
    expect(sentenceChunk).toBeDefined();
    expect(sentenceChunk!.kind).toBe('body');
    if (sentenceChunk!.kind === 'body') {
      expect(sentenceChunk.hasTrackedChanges).toBe(true);
      expect(sentenceChunk.content).toMatch(/<del [^>]*>basic <\/del>/);
      expect(sentenceChunk.content).toMatch(/<ins [^>]*>cool/);
    }

    // Every tracked-change citation chunk has a real blockId list. Today the
    // demo would tag these with "unknown".
    for (const c of tcChunks) {
      if (c.kind !== 'tracked-change') continue;
      expect(c.blockIds.length).toBeGreaterThan(0);
    }
  });

  it("disambiguates the customer-reported pirates fixture's paired replacements", async () => {
    // Real Word-authored DOCX shared by the customer who reported this issue
    // (~22 KB, 74 deletes + 104 inserts, classic paired replacements like
    // "Report" -> "Captain's Log"). Their pipeline saw concatenated strings
    // such as "ReportCaptain's Log" and "your/yer" with no boundaries; this
    // test confirms the same fixture now extracts as ordered spans with the
    // per-mark type preserved.
    const piratesFixture = await loadTestDataForEditorTests('sd-2766-pirates-tracked-changes.docx');
    const ctx = (await initTestEditor({
      content: piratesFixture.docx,
      media: piratesFixture.media,
      mediaFiles: piratesFixture.mediaFiles,
      fonts: piratesFixture.fonts,
    })) as { editor: Editor };
    editor = ctx.editor;

    const result = extractAdapter(editor, {});

    // Title paragraph: "A Simple Report" -> "A Simple Captain's Log".
    // Customer's pipeline reported "A Simple ReportCaptain's Log".
    const titleBlock = result.blocks.find((b) => b.text.includes('Captain') && b.text.includes('Simple'))!;
    expect(titleBlock).toBeDefined();
    expect(titleBlock.textSpans).toBeDefined();
    expect(titleBlock.textSpans!.map((s) => s.text).join('')).toBe(titleBlock.text);

    const titleTaggedSpans = titleBlock.textSpans!.filter((s) => s.trackedChanges && s.trackedChanges.length > 0);
    const titleDelete = titleTaggedSpans.find((s) => s.trackedChanges!.some((c) => c.type === 'delete'))!;
    const titleInserts = titleTaggedSpans.filter((s) => s.trackedChanges!.some((c) => c.type === 'insert'));
    expect(titleDelete.text).toBe('Report');
    expect(titleInserts.map((s) => s.text).join('')).toContain('Captain');
    expect(titleInserts.map((s) => s.text).join('')).toContain('Log');

    // Body paragraph with the documented "get started" -> "set sail" swap.
    const bodyBlock = result.blocks.find((b) => b.text.includes('set sail') || b.text.includes('get started'))!;
    expect(bodyBlock).toBeDefined();
    expect(bodyBlock.textSpans).toBeDefined();
    const bodyDelete = bodyBlock.textSpans!.find((s) => s.trackedChanges?.some((c) => c.type === 'delete'));
    const bodyInsert = bodyBlock.textSpans!.find(
      (s) => s.trackedChanges?.some((c) => c.type === 'insert') && s.text === 'set sail',
    );
    expect(bodyDelete?.text).toBe('get started');
    expect(bodyInsert).toBeDefined();

    // Aggregate sanity: every tracked change reports a blockId, and every
    // multi-type entity (paired replacement) has its excerpt suppressed.
    expect(result.trackedChanges.length).toBeGreaterThan(50);
    const blockIdSet = new Set(result.blocks.map((b) => b.nodeId));
    for (const tc of result.trackedChanges) {
      expect(tc.blockIds, `tc ${tc.entityId} should have blockIds`).toBeDefined();
      expect(tc.blockIds!.every((id) => blockIdSet.has(id))).toBe(true);
    }

    if (process.env.DEBUG_EXTRACT_SAMPLE) {
      const sample = result.blocks
        .filter((b) => b.textSpans)
        .slice(0, 5)
        .map((b) => ({ text: b.text, rendered: renderMarkedText(b) }));
      // eslint-disable-next-line no-console
      console.log('[SD-2766 pirates fixture] first 5 blocks with tracked changes:');
      for (const s of sample) {
        // eslint-disable-next-line no-console
        console.log(`  raw     : ${s.text}`);
        // eslint-disable-next-line no-console
        console.log(`  rendered: ${s.rendered}`);
      }
    }
  });

  it('logs a sample of the new extract output for visual inspection', async () => {
    // Not a strict assertion — produces a snapshot of the shape so a human
    // reviewing the PR or running tests locally can confirm the new fields
    // look right against the real fixture.
    const ctx = (await initTestEditor({
      content: docxFixture.docx,
      media: docxFixture.media,
      mediaFiles: docxFixture.mediaFiles,
      fonts: docxFixture.fonts,
    })) as { editor: Editor };
    editor = ctx.editor;

    const result = extractAdapter(editor, {});
    const blocksWithSpans = result.blocks
      .filter((b) => b.textSpans)
      .map((b) => ({
        nodeId: b.nodeId.slice(0, 12),
        text: b.text,
        rendered: renderMarkedText(b),
        spans: b.textSpans!.map((s: ExtractTextSpan) => ({
          text: s.text,
          tracked: s.trackedChanges?.map((c) => `${c.type}:${c.entityId.slice(0, 8)}`) ?? [],
        })),
      }));
    const tcSummary = result.trackedChanges.map((tc: ExtractTrackedChange) => ({
      entityId: tc.entityId.slice(0, 8),
      type: tc.type,
      excerpt: tc.excerpt,
      blockIds: tc.blockIds?.map((b) => b.slice(0, 12)),
    }));

    // Logs are gated behind an env var so CI doesn't print two pretty-printed
    // JSON blobs on every run. Set DEBUG_EXTRACT_SAMPLE=1 locally to inspect.
    if (process.env.DEBUG_EXTRACT_SAMPLE) {
      // eslint-disable-next-line no-console
      console.log('[SD-2766 consumer simulation] blocks-with-spans:', JSON.stringify(blocksWithSpans, null, 2));
      // eslint-disable-next-line no-console
      console.log('[SD-2766 consumer simulation] tracked-changes:', JSON.stringify(tcSummary, null, 2));
    }

    // Cheap assertion to keep this from being all log: at least one block has
    // spans and at least one tracked change reports its blockIds.
    expect(blocksWithSpans.length).toBeGreaterThan(0);
    expect(result.trackedChanges.some((tc) => (tc.blockIds?.length ?? 0) > 0)).toBe(true);
  });
});
