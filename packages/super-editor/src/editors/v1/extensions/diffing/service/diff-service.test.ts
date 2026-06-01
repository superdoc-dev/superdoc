import { describe, expect, it } from 'vitest';

import { Editor } from '@core/Editor.js';
import { BLANK_DOCX_BASE64 } from '@core/blank-docx.js';
import { getStarterExtensions } from '@extensions/index.js';
import { getTrackChanges } from '@extensions/track-changes/trackChangesHelpers/getTrackChanges.js';
import { getTestDataAsBuffer } from '@tests/export/export-helpers/export-helpers.js';
import type { CommentInput } from '../algorithm/comment-diffing.ts';
import { captureHeaderFooterState } from '../algorithm/header-footer-diffing.ts';
import { applyDiffPayload, captureSnapshot, compareToSnapshot } from './index.ts';
import { buildCanonicalDiffableState, buildLegacyCanonicalDiffableState } from './canonicalize.ts';
import { computeFingerprint } from './fingerprint.ts';
import { V1_COVERAGE } from './coverage.ts';

const TEST_USER = { name: 'Test User', email: 'test@example.com' };

type MutableCommentPayload = {
  commentText: string;
  textJson: {
    content: Array<{ text: string }>;
  };
};

type ModifiedCommentDiffPayload = {
  action: string;
  oldCommentJSON: MutableCommentPayload;
  newCommentJSON: MutableCommentPayload;
};

function buildCommentTextJson(text: string): Record<string, unknown> {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text }],
  };
}

function setEditorComments(editor: Editor, comments: CommentInput[]): void {
  if (!editor.converter) {
    throw new Error('Expected editor converter to be initialized.');
  }
  editor.converter.comments = comments;
}

function createHeaderFooterDoc(editor: Editor, text: string): Record<string, unknown> {
  const paragraph = editor.schema.nodes.paragraph.create(
    undefined,
    editor.schema.nodes.run.create(undefined, text ? [editor.schema.text(text)] : []),
  );
  return editor.schema.nodes.doc.create(undefined, [paragraph]).toJSON() as Record<string, unknown>;
}

function seedPart(
  editor: Editor,
  params: { kind: 'header' | 'footer'; refId: string; partPath: string; text: string },
): void {
  const { kind, refId, partPath, text } = params;
  const converter = editor.converter!;
  const collection = kind === 'header' ? (converter.headers ??= {}) : (converter.footers ??= {});
  collection[refId] = createHeaderFooterDoc(editor, text);

  const variantIds = kind === 'header' ? (converter.headerIds ??= {}) : (converter.footerIds ??= {});
  if (!Array.isArray(variantIds.ids)) {
    variantIds.ids = [];
  }
  if (!variantIds.ids.includes(refId)) {
    variantIds.ids.push(refId);
  }

  const relsPart = (converter.convertedXml!['word/_rels/document.xml.rels'] ??= {
    type: 'element',
    name: 'document',
    elements: [],
  }) as { elements?: Array<{ name?: string; attributes?: Record<string, string>; elements?: unknown[] }> };
  if (!relsPart.elements) {
    relsPart.elements = [];
  }
  let relsRoot = relsPart.elements.find((entry) => entry.name === 'Relationships');
  if (!relsRoot) {
    relsRoot = {
      name: 'Relationships',
      attributes: { xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships' },
      elements: [],
    };
    relsPart.elements.push(relsRoot);
  }
  if (!relsRoot.elements) {
    relsRoot.elements = [];
  }

  const existing = relsRoot.elements.find(
    (entry) => entry?.name === 'Relationship' && entry.attributes?.Id === refId,
  ) as { attributes?: Record<string, string> } | undefined;
  const attributes = {
    Id: refId,
    Type:
      kind === 'header'
        ? 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header'
        : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer',
    Target: partPath.replace(/^word\//, ''),
  };

  if (existing) {
    existing.attributes = attributes;
  } else {
    relsRoot.elements.push({
      name: 'Relationship',
      attributes,
      elements: [],
    });
  }
}

function setBodySection(
  editor: Editor,
  params: {
    titlePg?: boolean;
    headerDefault?: string | null;
    footerDefault?: string | null;
  },
): void {
  const elements: Array<Record<string, unknown>> = [
    {
      type: 'element',
      name: 'w:pgSz',
      attributes: { 'w:w': '12240', 'w:h': '15840' },
    },
    {
      type: 'element',
      name: 'w:pgMar',
      attributes: {
        'w:top': '1440',
        'w:right': '1440',
        'w:bottom': '1440',
        'w:left': '1440',
        'w:header': '708',
        'w:footer': '708',
        'w:gutter': '0',
      },
    },
  ];

  if (params.titlePg) {
    elements.push({ type: 'element', name: 'w:titlePg', elements: [] });
  }
  if (params.headerDefault) {
    elements.push({
      type: 'element',
      name: 'w:headerReference',
      attributes: { 'w:type': 'default', 'r:id': params.headerDefault },
      elements: [],
    });
  }
  if (params.footerDefault) {
    elements.push({
      type: 'element',
      name: 'w:footerReference',
      attributes: { 'w:type': 'default', 'r:id': params.footerDefault },
      elements: [],
    });
  }

  editor.converter!.bodySectPr = {
    type: 'element',
    name: 'w:sectPr',
    elements,
  };
}

function seedDefaultHeader(editor: Editor, text: string): void {
  seedPart(editor, {
    kind: 'header',
    refId: 'rIdHeader1',
    partPath: 'word/header1.xml',
    text,
  });
  setBodySection(editor, { headerDefault: 'rIdHeader1' });
}

function seedDefaultFooter(editor: Editor, text: string): void {
  seedPart(editor, {
    kind: 'footer',
    refId: 'rIdFooter1',
    partPath: 'word/footer1.xml',
    text,
  });
  setBodySection(editor, { footerDefault: 'rIdFooter1' });
}

async function openBlankDocxWithText(text: string): Promise<Editor> {
  const editor = await Editor.open(Buffer.from(BLANK_DOCX_BASE64, 'base64'), {
    isHeadless: true,
    extensions: getStarterExtensions(),
    user: TEST_USER,
  });
  editor.dispatch(editor.state.tr.insertText(text, 1));
  return editor;
}

async function reopenExportedDocument(exported: Blob | Buffer): Promise<Editor> {
  const buffer = Buffer.isBuffer(exported) ? exported : Buffer.from(await exported.arrayBuffer());
  return Editor.open(buffer, {
    isHeadless: true,
    extensions: getStarterExtensions(),
    user: TEST_USER,
  });
}

async function openFixtureDocument(name: string): Promise<Editor> {
  const buffer = await getTestDataAsBuffer(`diffing/${name}`);
  const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

  return new Editor({
    isHeadless: true,
    extensions: getStarterExtensions(),
    documentId: `fixture-${name}`,
    content: docx,
    mode: 'docx',
    media,
    mediaFiles,
    fonts,
    annotations: true,
    user: TEST_USER,
  });
}

describe('diff-service tracked apply', () => {
  it('applies appended text as tracked changes', async () => {
    const baseEditor = await openBlankDocxWithText('Section 1. Payment is due within thirty days.');
    const targetEditor = await openBlankDocxWithText(
      'Section 1. Payment is due within thirty days. Renewal requires written approval.',
    );

    try {
      const snapshot = captureSnapshot(targetEditor);
      const diff = compareToSnapshot(baseEditor, snapshot);
      const { tr } = applyDiffPayload(baseEditor, diff, { changeMode: 'tracked' });

      baseEditor.dispatch(tr);

      expect(baseEditor.state.doc.textContent).toBe(targetEditor.state.doc.textContent);
      expect(getTrackChanges(baseEditor.state).length).toBeGreaterThan(0);
    } finally {
      baseEditor.destroy?.();
      targetEditor.destroy?.();
    }
  });

  it('applies added paragraph content as tracked changes', async () => {
    const baseEditor = await openBlankDocxWithText('Section 1. Payment is due within thirty days.');
    const targetEditor = await openBlankDocxWithText(
      'Section 1. Payment is due within thirty days.\nRenewal requires written approval.',
    );

    try {
      const snapshot = captureSnapshot(targetEditor);
      const diff = compareToSnapshot(baseEditor, snapshot);
      const { tr } = applyDiffPayload(baseEditor, diff, { changeMode: 'tracked' });

      baseEditor.dispatch(tr);

      expect(baseEditor.state.doc.textContent).toBe(targetEditor.state.doc.textContent);
      expect(getTrackChanges(baseEditor.state).length).toBeGreaterThan(0);
    } finally {
      baseEditor.destroy?.();
      targetEditor.destroy?.();
    }
  });

  it('preserves tracked diff changes through export and reopen', async () => {
    const baseEditor = await openBlankDocxWithText('Section 1. Payment is due within thirty days.');
    const targetEditor = await openBlankDocxWithText(
      'Section 1. Payment is due within thirty days.\nRenewal requires written approval.',
    );

    let reopenedEditor: Editor | undefined;

    try {
      const snapshot = captureSnapshot(targetEditor);
      const diff = compareToSnapshot(baseEditor, snapshot);
      const { tr } = applyDiffPayload(baseEditor, diff, { changeMode: 'tracked' });

      baseEditor.dispatch(tr);

      expect(getTrackChanges(baseEditor.state).length).toBeGreaterThan(0);

      const exported = await baseEditor.exportDocument();
      reopenedEditor = await reopenExportedDocument(exported);

      expect(getTrackChanges(reopenedEditor.state).length).toBeGreaterThan(0);
    } finally {
      reopenedEditor?.destroy?.();
      baseEditor.destroy?.();
      targetEditor.destroy?.();
    }
  });

  it('replays body image dependencies through partsDiff', async () => {
    const baseEditor = await openFixtureDocument('diff_before6.docx');
    const targetEditor = await openFixtureDocument('diff_after6.docx');

    try {
      const snapshot = captureSnapshot(targetEditor);
      const diff = compareToSnapshot(baseEditor, snapshot);
      const mediaUpserts = Object.keys(
        (diff.payload.partsDiff as Record<string, unknown> | null)?.upserts ?? {},
      ).filter((path) => path.startsWith('word/media/'));

      expect(mediaUpserts.length).toBeGreaterThan(0);

      const { tr } = applyDiffPayload(baseEditor, diff, { changeMode: 'direct' });
      baseEditor.dispatch(tr);

      for (const path of mediaUpserts) {
        expect((baseEditor.storage.image as { media?: Record<string, unknown> }).media?.[path]).toBeDefined();
      }
    } finally {
      baseEditor.destroy?.();
      targetEditor.destroy?.();
    }
  });

  it('captures header/footer-only diffs from snapshots when body content is unchanged', async () => {
    const baseEditor = await openBlankDocxWithText('Base document.');
    const targetEditor = await openBlankDocxWithText('Base document.');

    try {
      seedDefaultFooter(targetEditor, 'Footer only change');

      const snapshot = captureSnapshot(targetEditor);
      const diff = compareToSnapshot(baseEditor, snapshot);

      expect(diff.payload.docDiffs).toEqual([]);
      expect(diff.payload.headerFootersDiff).not.toBeNull();
      expect((diff.payload.headerFootersDiff as { addedParts?: unknown[] }).addedParts).toHaveLength(1);
      expect((diff.payload.headerFootersDiff as { slotChanges?: unknown[] }).slotChanges).toHaveLength(1);
      expect(diff.payload.partsDiff).not.toBeNull();
      expect(
        (diff.payload.partsDiff as { upserts?: Record<string, unknown> }).upserts?.['word/_rels/document.xml.rels'],
      ).toBeTruthy();
    } finally {
      baseEditor.destroy?.();
      targetEditor.destroy?.();
    }
  });

  it('rejects snapshots whose comment identity was tampered after capture', async () => {
    const baseEditor = await openBlankDocxWithText('Base document.');
    const targetEditor = await openBlankDocxWithText('Base document.');

    try {
      setEditorComments(targetEditor, [
        {
          commentId: 'c-1',
          commentText: 'Identity comment',
          textJson: buildCommentTextJson('Identity comment'),
        },
      ]);

      const snapshot = captureSnapshot(targetEditor);
      const snapshotComments = snapshot.payload.comments as Array<Record<string, unknown>>;
      snapshotComments[0]!.commentId = 'c-2';

      expect(() => compareToSnapshot(baseEditor, snapshot)).toThrowError(
        /fingerprint does not match re-derived value/i,
      );
    } finally {
      baseEditor.destroy?.();
      targetEditor.destroy?.();
    }
  });

  it('accepts legacy v1 snapshots during compare', async () => {
    const baseEditor = await openBlankDocxWithText('Base document.');
    const targetEditor = await openBlankDocxWithText('Updated document.');

    try {
      const snapshot = captureSnapshot(targetEditor);
      const legacySnapshot = structuredClone(snapshot);
      legacySnapshot.version = 'sd-diff-snapshot/v1';
      legacySnapshot.coverage = { ...V1_COVERAGE };
      delete (legacySnapshot.payload as Record<string, unknown>).headerFooters;
      legacySnapshot.fingerprint = computeFingerprint(
        buildCanonicalDiffableState(
          targetEditor.state.doc,
          targetEditor.converter?.comments ?? [],
          targetEditor.converter?.translatedLinkedStyles ?? null,
          targetEditor.converter?.translatedNumbering ?? null,
          null,
          null,
        ),
      );

      const diff = compareToSnapshot(baseEditor, legacySnapshot);

      expect(diff.version).toBe('sd-diff-payload/v1');
      expect(diff.summary.body.hasChanges).toBe(true);
    } finally {
      baseEditor.destroy?.();
      targetEditor.destroy?.();
    }
  });

  it('does not produce header/footer removal diffs when comparing against a v1 snapshot', async () => {
    const baseEditor = await openBlankDocxWithText('Base document.');
    const targetEditor = await openBlankDocxWithText('Updated document.');

    try {
      // Base editor has a real header — v1 snapshot does not cover headers,
      // so the diff must NOT treat existing headers as "removed".
      seedDefaultHeader(baseEditor, 'Existing header');

      const snapshot = captureSnapshot(targetEditor);
      const legacySnapshot = structuredClone(snapshot);
      legacySnapshot.version = 'sd-diff-snapshot/v1';
      legacySnapshot.coverage = { ...V1_COVERAGE };
      delete (legacySnapshot.payload as Record<string, unknown>).headerFooters;
      legacySnapshot.fingerprint = computeFingerprint(
        buildCanonicalDiffableState(
          targetEditor.state.doc,
          targetEditor.converter?.comments ?? [],
          targetEditor.converter?.translatedLinkedStyles ?? null,
          targetEditor.converter?.translatedNumbering ?? null,
          null,
          null,
        ),
      );

      const diff = compareToSnapshot(baseEditor, legacySnapshot);

      expect(diff.version).toBe('sd-diff-payload/v1');
      expect(diff.payload.headerFootersDiff).toBeNull();
      expect(diff.summary.headerFooters.hasChanges).toBe(false);
    } finally {
      baseEditor.destroy?.();
      targetEditor.destroy?.();
    }
  });

  it('commits headerFooterModified after applyDiffPayload replays header changes', async () => {
    const baseEditor = await openBlankDocxWithText('Base document.');
    const targetEditor = await openBlankDocxWithText('Base document.');

    try {
      setBodySection(baseEditor, {});
      seedDefaultHeader(targetEditor, 'Applied header');
      baseEditor.converter!.headerFooterModified = false;

      const snapshot = captureSnapshot(targetEditor);
      const diff = compareToSnapshot(baseEditor, snapshot);
      const { tr } = applyDiffPayload(baseEditor, diff, { changeMode: 'direct' });

      baseEditor.dispatch(tr);

      expect(baseEditor.converter?.headerFooterModified).toBe(true);
      expect(captureHeaderFooterState(baseEditor)).toEqual(captureHeaderFooterState(targetEditor));
    } finally {
      baseEditor.destroy?.();
      targetEditor.destroy?.();
    }
  });

  it('returns comment diffs detached from base comments and target snapshot payloads', async () => {
    const baseEditor = await openBlankDocxWithText('Base document.');
    const targetEditor = await openBlankDocxWithText('Base document.');

    try {
      setEditorComments(baseEditor, [
        {
          commentId: 'c-1',
          commentText: 'Old comment',
          textJson: buildCommentTextJson('Old nested'),
        },
      ]);
      setEditorComments(targetEditor, [
        {
          commentId: 'c-1',
          commentText: 'New comment',
          textJson: buildCommentTextJson('New nested'),
        },
      ]);

      const snapshot = captureSnapshot(targetEditor);
      const diff = compareToSnapshot(baseEditor, snapshot);
      const commentDiffs = (diff.payload.commentDiffs ?? []) as ModifiedCommentDiffPayload[];

      expect(commentDiffs).toHaveLength(1);
      expect(commentDiffs[0]?.action).toBe('modified');

      const modifiedDiff = commentDiffs[0]!;
      modifiedDiff.oldCommentJSON.commentText = 'Tampered old';
      modifiedDiff.oldCommentJSON.textJson.content[0].text = 'Tampered old nested';
      modifiedDiff.newCommentJSON.commentText = 'Tampered new';
      modifiedDiff.newCommentJSON.textJson.content[0].text = 'Tampered new nested';

      expect(baseEditor.converter?.comments?.[0]).toMatchObject({
        commentId: 'c-1',
        commentText: 'Old comment',
        textJson: buildCommentTextJson('Old nested'),
      });
      expect((snapshot.payload.comments as Array<Record<string, unknown>>)[0]).toMatchObject({
        commentId: 'c-1',
        commentText: 'New comment',
        textJson: buildCommentTextJson('New nested'),
      });
    } finally {
      baseEditor.destroy?.();
      targetEditor.destroy?.();
    }
  });

  it('rejects apply when semantic state matches but parts state differs', async () => {
    const baseEditor = await openFixtureDocument('diff_before19.docx');
    const targetEditor = await openFixtureDocument('diff_after19.docx');

    try {
      const snapshot = captureSnapshot(targetEditor);
      const diff = compareToSnapshot(baseEditor, snapshot);
      const baseSnapshot = captureSnapshot(baseEditor);
      expect(baseSnapshot.fingerprint).toBe(diff.baseFingerprint);

      const relsPart = baseEditor.converter?.convertedXml?.['word/_rels/document.xml.rels'] as
        | {
            elements?: Array<{
              name?: string;
              elements?: Array<{ name?: string; attributes?: Record<string, string> }>;
            }>;
          }
        | undefined;
      const relsRoot = relsPart?.elements?.find((entry) => entry.name === 'Relationships');
      relsRoot?.elements?.push({
        name: 'Relationship',
        attributes: {
          Id: 'rId999',
          Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
          Target: 'media/unexpected-image.png',
        },
      });
      baseEditor.options.mediaFiles ??= {};
      baseEditor.storage.image.media ??= {};
      baseEditor.options.mediaFiles['word/media/unexpected-image.png'] = 'base64-unexpected';
      baseEditor.storage.image.media['word/media/unexpected-image.png'] = 'base64-unexpected';

      const mutatedSnapshot = captureSnapshot(baseEditor);
      expect(mutatedSnapshot.fingerprint).not.toBe(baseSnapshot.fingerprint);

      expect(() => applyDiffPayload(baseEditor, diff, { changeMode: 'direct' })).toThrowError(/fingerprint mismatch/i);
    } finally {
      baseEditor.destroy?.();
      targetEditor.destroy?.();
    }
  });

  it('rejects v1 payloads that declare v2 header/footer coverage', async () => {
    const baseEditor = await openBlankDocxWithText('Base document.');
    const targetEditor = await openBlankDocxWithText('Updated document.');

    try {
      const snapshot = captureSnapshot(targetEditor);
      const diff = compareToSnapshot(baseEditor, snapshot);
      const invalidV1Diff = {
        ...structuredClone(diff),
        version: 'sd-diff-payload/v1' as const,
        coverage: {
          ...V1_COVERAGE,
          headerFooters: true,
        },
      };

      expect(() => applyDiffPayload(baseEditor, invalidV1Diff, { changeMode: 'direct' })).toThrowError(
        /coverage mismatch/i,
      );
    } finally {
      baseEditor.destroy?.();
      targetEditor.destroy?.();
    }
  });
});

// SD-3279: cross-editor diff handoff. A diff produced by one editor instance
// must be applicable to a second editor instance that holds the same document
// content. Previously the fingerprint included session-local block IDs, so
// the apply would throw PRECONDITION_FAILED even for identical content.
describe('diff-service cross-editor handoff (SD-3279)', () => {
  it('applies a diff produced by one editor to a second editor with the same content', async () => {
    const editorMain = await openBlankDocxWithText('Base document.');
    const editorPreview = await openBlankDocxWithText('Base document.');
    const targetEditor = await openBlankDocxWithText('Base document. Renewal requires written approval.');

    try {
      const snapshot = captureSnapshot(targetEditor);
      const diff = compareToSnapshot(editorMain, snapshot);

      const { tr } = applyDiffPayload(editorPreview, diff, { changeMode: 'tracked' });
      editorPreview.dispatch(tr);

      expect(editorPreview.state.doc.textContent).toBe(targetEditor.state.doc.textContent);
      expect(getTrackChanges(editorPreview.state).length).toBeGreaterThan(0);
    } finally {
      editorMain.destroy?.();
      editorPreview.destroy?.();
      targetEditor.destroy?.();
    }
  });

  it('keeps the same-editor capture/compare/apply path working (regression guard)', async () => {
    const editor = await openBlankDocxWithText('Base document.');
    const targetEditor = await openBlankDocxWithText('Base document. Renewal.');

    try {
      const snapshot = captureSnapshot(targetEditor);
      const diff = compareToSnapshot(editor, snapshot);
      const { tr } = applyDiffPayload(editor, diff, { changeMode: 'tracked' });
      editor.dispatch(tr);

      expect(editor.state.doc.textContent).toBe(targetEditor.state.doc.textContent);
      expect(getTrackChanges(editor.state).length).toBeGreaterThan(0);
    } finally {
      editor.destroy?.();
      targetEditor.destroy?.();
    }
  });

  // Customer flow: main editor mutates → exports current state → preview loads
  // the exported DOCX → applies the diff. This exercises the full converter
  // round-trip. Stripping sdBlockId / sdBlockRev from the fingerprint (this
  // fix) is necessary but not sufficient: a second canonical-state divergence
  // is introduced during export → re-import that still trips the fingerprint
  // check. Tracked separately as SD-3282; the cross-editor same-blob path
  // above is fixed by this change.
  it('exposes the known export → reimport fingerprint divergence (regression marker)', async () => {
    const editorMain = await openBlankDocxWithText('Base document.');
    const targetEditor = await openBlankDocxWithText('Base document. Renewal requires written approval.');

    let editorPreview: Editor | undefined;
    try {
      const snapshot = captureSnapshot(targetEditor);
      const diff = compareToSnapshot(editorMain, snapshot);

      const exported = await editorMain.exportDocument();
      editorPreview = await reopenExportedDocument(exported);

      // Expected to throw today; flip this assertion to a success expectation
      // once the export/reimport canonical-state divergence is resolved.
      expect(() => applyDiffPayload(editorPreview!, diff, { changeMode: 'tracked' })).toThrowError(
        /fingerprint mismatch/i,
      );
    } finally {
      editorPreview?.destroy?.();
      editorMain.destroy?.();
      targetEditor.destroy?.();
    }
  });
});

// SD-3279 backward compatibility: snapshots and diff payloads captured under
// the pre-fix algorithm carry a fingerprint that included session-local
// sdBlockId / sdBlockRev values. The fix changes the canonical state without
// bumping the snapshot/payload version, which would invalidate already
// persisted artifacts in the customer's revision-history workflow. The
// validation paths in compareToSnapshot and applyDiffPayload accept either
// the new or the legacy fingerprint, so old artifacts remain usable.
describe('diff-service legacy fingerprint fallback (SD-3279 backward compat)', () => {
  function legacyFingerprintForEditor(editor: Editor, snapshot: ReturnType<typeof captureSnapshot>): string {
    const payload = snapshot.payload as {
      doc: Record<string, unknown>;
      comments: CommentInput[];
      styles: Record<string, unknown> | null;
      numbering: Record<string, unknown> | null;
      headerFooters: Record<string, unknown> | null;
      partsState: Record<string, unknown> | null;
    };
    const parsedDoc = editor.state.schema.nodeFromJSON(payload.doc);
    const legacyCanonical = buildLegacyCanonicalDiffableState(
      parsedDoc,
      payload.comments,
      payload.styles as any,
      payload.numbering as any,
      payload.headerFooters as any,
      payload.partsState as any,
    );
    return computeFingerprint(legacyCanonical);
  }

  it('accepts a snapshot whose fingerprint was computed under the legacy normalizer', async () => {
    const baseEditor = await openBlankDocxWithText('Base document.');
    const targetEditor = await openBlankDocxWithText('Base document. Renewal.');

    try {
      const snapshot = captureSnapshot(targetEditor);
      const legacyFingerprint = legacyFingerprintForEditor(targetEditor, snapshot);

      // Confirm the algorithms produce different fingerprints — otherwise the
      // test isn't exercising the fallback.
      expect(legacyFingerprint).not.toBe(snapshot.fingerprint);

      const legacySnapshot = { ...snapshot, fingerprint: legacyFingerprint };
      const diff = compareToSnapshot(baseEditor, legacySnapshot);
      expect(diff.summary.hasChanges).toBe(true);
    } finally {
      baseEditor.destroy?.();
      targetEditor.destroy?.();
    }
  });

  it('accepts a same-editor diff payload whose baseFingerprint was computed under the legacy normalizer', async () => {
    const baseEditor = await openBlankDocxWithText('Base document.');
    const targetEditor = await openBlankDocxWithText('Base document. Renewal.');

    try {
      const snapshot = captureSnapshot(targetEditor);
      const diff = compareToSnapshot(baseEditor, snapshot);

      // Synthesize a legacy-style payload by computing the legacy fingerprint
      // of the current base editor and swapping it in for baseFingerprint.
      const baseSnapshot = captureSnapshot(baseEditor);
      const legacyBaseFingerprint = legacyFingerprintForEditor(baseEditor, baseSnapshot);
      expect(legacyBaseFingerprint).not.toBe(diff.baseFingerprint);

      const legacyDiff = { ...diff, baseFingerprint: legacyBaseFingerprint };

      const { tr } = applyDiffPayload(baseEditor, legacyDiff, { changeMode: 'tracked' });
      baseEditor.dispatch(tr);

      expect(baseEditor.state.doc.textContent).toBe(targetEditor.state.doc.textContent);
      expect(getTrackChanges(baseEditor.state).length).toBeGreaterThan(0);
    } finally {
      baseEditor.destroy?.();
      targetEditor.destroy?.();
    }
  });

  it('still rejects a genuinely tampered snapshot (both new and legacy fingerprints mismatch)', async () => {
    const baseEditor = await openBlankDocxWithText('Base document.');
    const targetEditor = await openBlankDocxWithText('Base document. Renewal.');

    try {
      const snapshot = captureSnapshot(targetEditor);
      // Keep the original fingerprint but replace the body payload with
      // unrelated content. Neither the new nor the legacy normalizer will
      // produce a hash matching the kept fingerprint.
      const tamperedPayload = {
        ...(snapshot.payload as Record<string, unknown>),
        doc: {
          type: 'doc',
          content: [{ type: 'paragraph', attrs: {}, content: [{ type: 'text', text: 'Unrelated' }] }],
        },
      };
      const tamperedSnapshot = { ...snapshot, payload: tamperedPayload };

      expect(() => compareToSnapshot(baseEditor, tamperedSnapshot)).toThrowError(/may have been tampered/i);
    } finally {
      baseEditor.destroy?.();
      targetEditor.destroy?.();
    }
  });
});
