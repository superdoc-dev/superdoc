import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { reactive, ref } from 'vue';

vi.mock('@superdoc/stores/superdoc-store', () => {
  const documents = ref([]);
  const user = reactive({ name: 'Fixture runner', email: 'fixture-runner@superdoc.dev' });
  const activeSelection = reactive({ documentId: 'external-docx', selectionBounds: {} });
  const selectionPosition = reactive({ source: null });
  const getDocument = (id) => documents.value.find((document) => document.id === id);
  const useMockStore = defineStore('superdoc', () => ({
    documents,
    user,
    activeSelection,
    selectionPosition,
    getDocument,
  }));

  return {
    useSuperdocStore: useMockStore,
    __fixtureSuperdoc: {
      documents,
      user,
      activeSelection,
      selectionPosition,
      emit: vi.fn(),
      config: { isInternal: false },
    },
  };
});

vi.mock('@superdoc/components/CommentsLayer/use-comment', () => ({
  default: vi.fn((params = {}) => {
    const selection = params.selection || { source: 'external-docx', selectionBounds: {} };
    return {
      ...params,
      selection,
      getValues: () => ({ ...params, selection }),
      setText: vi.fn(),
    };
  }),
}));

vi.mock('@superdoc/core/collaboration/helpers.js', () => ({ syncCommentsToClients: vi.fn() }));
vi.mock('@superdoc/helpers/group-changes.js', () => ({ groupChanges: vi.fn(() => []) }));

import { useCommentsStore } from '@superdoc/stores/comments-store.js';
import { __fixtureSuperdoc } from '@superdoc/stores/superdoc-store';
import { Editor } from '@superdoc/super-editor';
import { initTestEditor } from '@tests/helpers/helpers.js';

const requiredPath = (name) => {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is required. Run this fixture through pnpm --filter superdoc test:external-docx.`);
  return value;
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const toBuffer = async (value) => {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value?.arrayBuffer === 'function') return Buffer.from(await value.arrayBuffer());
  throw new TypeError('Editor.exportDocx returned an unsupported value');
};

const collectTypes = (value) => {
  const types = [];
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'string') types.push(node.type);
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(value);
  return types;
};

const commentId = (comment) => String(comment?.commentId ?? '');
const sortedCommentIds = (comments) => comments.map(commentId).sort();
const sameCommentIds = (left, right) => {
  const leftIds = sortedCommentIds(left);
  const rightIds = sortedCommentIds(right);
  return leftIds.length === rightIds.length && leftIds.every((id, index) => id === rightIds[index]);
};

describe('external DOCX feedback loop', () => {
  let editor;
  let reimportEditor;

  beforeEach(() => {
    setActivePinia(createPinia());
    __fixtureSuperdoc.documents.value = [{ id: 'external-docx', type: 'docx' }];
  });

  afterEach(() => {
    editor?.destroy();
    reimportEditor?.destroy();
  });

  it('imports, projects comments, exports, and re-imports the document', async () => {
    const fixturePath = requiredPath('SUPERDOC_TEST_DOCX');
    const outputPath = requiredPath('SUPERDOC_TEST_OUTPUT');
    const evidencePath = requiredPath('SUPERDOC_TEST_EVIDENCE');
    const fixture = await readFile(fixturePath);
    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(fixture, true);
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts, documentId: 'external-docx' }));

    const importedComments = editor.converter.comments ?? [];
    const store = useCommentsStore();
    await store.processLoadedDocxComments({
      superdoc: __fixtureSuperdoc,
      editor,
      comments: importedComments,
      documentId: 'external-docx',
    });
    const projectedComments = [...store.commentsList];

    const exported = await editor.exportDocx({
      comments: store.translateCommentsForExport(),
      commentsType: 'external',
    });
    const exportedBytes = await toBuffer(exported);
    await writeFile(outputPath, exportedBytes);

    const [reimportedDocx, reimportedMedia, reimportedMediaFiles, reimportedFonts] = await Editor.loadXmlData(
      exportedBytes,
      true,
    );
    ({ editor: reimportEditor } = initTestEditor({
      content: reimportedDocx,
      media: reimportedMedia,
      mediaFiles: reimportedMediaFiles,
      fonts: reimportedFonts,
      documentId: 'external-docx-reimported',
    }));
    const reimportedComments = reimportEditor.converter.comments ?? [];
    const commentsImported = importedComments.length > 0;
    const projectionPreserved = sameCommentIds(projectedComments, importedComments);
    const roundTripPreserved = sameCommentIds(reimportedComments, importedComments);

    const evidence = {
      schemaVersion: '1.0',
      input: { path: fixturePath, bytes: fixture.byteLength, sha256: sha256(fixture) },
      output: { path: outputPath, bytes: exportedBytes.byteLength, sha256: sha256(exportedBytes) },
      comments: {
        imported: importedComments.map((comment) => ({
          id: commentId(comment),
          nodeTypes: collectTypes(comment.elements),
        })),
        projected: projectedComments.map((comment) => ({
          id: commentId(comment),
          html: comment.commentText ?? null,
          nodeTypes: collectTypes(comment.docxCommentJSON),
        })),
        reimported: reimportedComments.map((comment) => ({
          id: commentId(comment),
          nodeTypes: collectTypes(comment.elements),
        })),
      },
      checks: {
        commentsImported,
        projectionPreserved,
        roundTripPreserved,
      },
    };
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

    expect(exportedBytes.byteLength).toBeGreaterThan(0);
    expect(commentsImported, 'No comments were imported from the fixture').toBe(true);
    expect(projectionPreserved, 'Comment identities changed during sidebar projection').toBe(true);
    expect(roundTripPreserved, 'Comment identities changed after export and re-import').toBe(true);
  });
});
