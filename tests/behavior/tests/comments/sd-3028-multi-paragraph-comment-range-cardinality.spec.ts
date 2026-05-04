import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, resolveComment } from '../../helpers/document-api.js';
import JSZip from 'jszip';

test.use({ config: { toolbar: 'full', comments: 'on' } });

/**
 * Pins ECMA-376 §17.13.4.3 / §17.13.4.4 / §17.13.4.5 conformance for
 * `commentRangeStart` / `commentRangeEnd` / `commentReference`: the
 * `w:id` attribute uniquely identifies an annotation, so each comment
 * id MUST appear exactly once for each marker type in the exported
 * `word/document.xml`. PR #3028 fixed a regression where resolving a
 * multi-paragraph comment emitted N pairs (one per paragraph) all
 * sharing the same id, producing a non-conformant DOCX that Word and
 * other downstream consumers handled inconsistently.
 *
 * The end-to-end shape under test:
 *   1. Type two paragraphs of text.
 *   2. Add a comment whose anchor crosses the paragraph break.
 *   3. Resolve the comment.
 *   4. Export to DOCX.
 *   5. Inspect `word/document.xml`: exactly one `commentRangeStart`,
 *      one `commentRangeEnd`, and one `commentReference` per id.
 *
 * The plugin-level unit test in `comments.test.js` and the spec-derived
 * suite in `comments-helpers.test.js` cover the same invariant at the
 * `resolveCommentById` boundary; this test guards the full
 * `resolveCommentById → prepareCommentsForExport → comment-range
 * translator → word/document.xml` pipeline.
 */
test('SD-3028 multi-paragraph comment exports with one range pair per id', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  // 1. Type two paragraphs. The comment will span the break between
  //    them — that's the case the regression flagged.
  await superdoc.type('First paragraph of multi-paragraph comment target');
  await superdoc.newLine();
  await superdoc.type('Second paragraph of the same comment target');
  await superdoc.waitForStable();

  // 2. Build a multi-segment TextTarget anchored across both
  //    paragraphs (one segment per paragraph) and create the comment
  //    against it. `query.match` only finds patterns within a single
  //    block, so we drop down to `extract` to enumerate the two
  //    paragraph blockIds and stitch together a multi-segment target
  //    by hand. This is exactly the shape the editor produces when a
  //    user drag-selects across a paragraph break.
  const commentId = await superdoc.page.evaluate(async () => {
    const docApi = (window as any).editor.doc;
    const extracted = await docApi.extract();
    const blocks = (extracted?.blocks ?? []).filter(
      (b: any) => typeof b?.nodeId === 'string' && typeof b?.text === 'string' && b.text.length > 0,
    );
    if (blocks.length < 2) {
      throw new Error(`Expected at least two text blocks; got ${blocks.length}.`);
    }
    const [first, second] = blocks;
    const target = {
      kind: 'text',
      segments: [
        { blockId: first.nodeId, range: { start: 0, end: first.text.length } },
        { blockId: second.nodeId, range: { start: 0, end: second.text.length } },
      ],
    };
    const receipt = docApi.comments.create({ target, text: 'spans two paragraphs' });
    if (!receipt || receipt.success !== true) {
      const code = receipt?.failure?.code ?? 'UNKNOWN';
      const message = receipt?.failure?.message ?? 'comments.create returned a non-success receipt';
      throw new Error(`comments.create failed: ${code} ${message}`);
    }
    const inserted = (receipt.inserted ?? []).find(
      (entry: any) => entry?.entityType === 'comment' && typeof entry?.entityId === 'string',
    );
    if (!inserted) throw new Error('comments.create succeeded but no entityId returned.');
    return inserted.entityId as string;
  });
  await superdoc.waitForStable();

  // 3. Resolve. This is the path that previously emitted N pairs.
  await resolveComment(superdoc.page, { commentId });
  await superdoc.waitForStable();

  // 4. Export to DOCX.
  const bytes: number[] = await superdoc.page.evaluate(async () => {
    const blob: Blob = await (window as any).editor.exportDocx();
    const buffer = await blob.arrayBuffer();
    return Array.from(new Uint8Array(buffer));
  });

  // 5. Parse `word/document.xml` and count markers per id. The
  //    document may also contain commentReference elements emitted by
  //    the export pipeline; we count by element name + id attribute.
  const zip = await JSZip.loadAsync(Buffer.from(bytes));
  const documentXmlFile = zip.file('word/document.xml');
  expect(documentXmlFile).not.toBeNull();
  const documentXml = await documentXmlFile!.async('string');

  // Collect every (markerType, id) tuple. Allow self-closing tags
  // with optional whitespace before `/>`.
  const markerRegex = /<w:(commentRangeStart|commentRangeEnd|commentReference)\b[^>]*\sw:id="([^"]+)"[^>]*\/>/g;
  type MarkerKind = 'commentRangeStart' | 'commentRangeEnd' | 'commentReference';
  const counts = new Map<string, Record<MarkerKind, number>>();
  for (const match of documentXml.matchAll(markerRegex)) {
    const kind = match[1] as MarkerKind;
    const id = match[2]!;
    const entry =
      counts.get(id) ??
      ({ commentRangeStart: 0, commentRangeEnd: 0, commentReference: 0 } as Record<MarkerKind, number>);
    entry[kind] += 1;
    counts.set(id, entry);
  }

  // The document should contain at least one comment id (the one we
  // just created and resolved). Word may still emit the canonical
  // sample's range markers; assert per-id, not on total counts.
  expect(counts.size).toBeGreaterThan(0);
  for (const [id, kinds] of counts) {
    expect(
      kinds,
      `Comment id "${id}" must have exactly one of each marker type — duplicate markers indicate non-conformant OOXML.`,
    ).toEqual({ commentRangeStart: 1, commentRangeEnd: 1, commentReference: 1 });
  }
});
