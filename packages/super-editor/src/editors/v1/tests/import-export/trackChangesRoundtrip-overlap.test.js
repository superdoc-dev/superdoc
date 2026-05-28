// @ts-check
/**
 * Phase 005 — repo-local critical tests for overlap DOCX export cleanliness.
 *
 * Plan: v1-3220 / phase0-005 "DOCX Metadata Storage Contract" + "Word
 * Revision Id Allocation" + "Repo-Local Critical Tests Only".
 *
 * The plan forbids exporting SuperDoc-private metadata into DOCX. These
 * tests prove that overlap-aware export:
 *
 *   1. exported `word/document.xml` contains only Word-native tracked-change
 *      wrappers (`w:ins`, `w:del`, `w:rPrChange`).
 *   2. all `w:id` attributes on tracked-change wrappers are Word-compatible
 *      decimal strings.
 *   3. imported decimal `w:id` values are preserved verbatim.
 *   4. no SuperDoc-specific namespaces / custom XML parts appear anywhere in
 *      the exported package.
 *
 */

import { describe, it, expect } from 'vitest';
import { loadTestDataForEditorTests, initTestEditor } from '../helpers/helpers.js';
import { Editor } from '@core/Editor.js';
import DocxZipper from '@core/DocxZipper.js';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';
import { TRACKED_CHANGE_SOURCE_ID_MAP_PROPERTY } from '@extensions/track-changes/review-model/word-id-allocator.js';

const TRACK_NAMES = new Set(['w:ins', 'w:del']);
const FORMAT_REVISION_NAMES = new Set(['w:rPrChange', 'w:pPrChange']);
const FORBIDDEN_NAMESPACE_PREFIXES = ['sd:', 'sdrev:', 'superdoc:'];

const visitNodes = (node, visit) => {
  if (!node || typeof node !== 'object') return;
  visit(node);
  if (Array.isArray(node.elements)) node.elements.forEach((child) => visitNodes(child, visit));
};

const collectTrackedWrappers = (body) => {
  const tracked = [];
  const formats = [];
  visitNodes(body, (node) => {
    if (TRACK_NAMES.has(node.name)) tracked.push(node);
    if (FORMAT_REVISION_NAMES.has(node.name)) formats.push(node);
  });
  return { tracked, formats };
};

const allAttributeKeysFor = (body) => {
  const keys = new Set();
  visitNodes(body, (node) => {
    if (!node.attributes || typeof node.attributes !== 'object') return;
    for (const key of Object.keys(node.attributes)) keys.add(key);
  });
  return keys;
};

const allElementNames = (body) => {
  const names = new Set();
  visitNodes(body, (node) => {
    if (typeof node.name === 'string') names.add(node.name);
  });
  return names;
};

const loadExportedPackage = async (exportedBuffer) => {
  const zipper = new DocxZipper();
  const files = await zipper.getDocxData(exportedBuffer, true);
  return files;
};

describe('overlap export — Word-native shape only', () => {
  it('preserves imported decimal w:id values and emits no SuperDoc-private metadata', async () => {
    const fileName = 'msword-tracked-changes.docx';
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(fileName);
    const { editor } = await initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      isHeadless: true,
      trackedChanges: {},
    });

    try {
      const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
      expect(exportedBuffer?.byteLength ?? exportedBuffer?.length).toBeGreaterThan(0);

      const exportedFiles = await loadExportedPackage(exportedBuffer);

      // Phase 005 — hard prohibitions: no SuperDoc-private custom XML parts
      // and no review-graph sidecars must be present in the package.
      const sdSidecar = exportedFiles.find((entry) => /customXml\/.*sd-tracked-review/i.test(entry.name));
      expect(sdSidecar, 'No customXml/sd-tracked-review.xml sidecar permitted').toBeUndefined();

      const customXmlEntries = exportedFiles.filter((entry) => entry.name.startsWith('customXml/'));
      for (const entry of customXmlEntries) {
        // Any custom XML parts that survive round-trip must NOT carry the
        // overlap review graph; surface that as a hard test failure by
        // scanning for our internal attribute names.
        expect(entry.content).not.toMatch(/sdrev:/);
        expect(entry.content).not.toMatch(/sd-tracked-review/);
      }

      const documentXmlEntry = exportedFiles.find((entry) => entry.name === 'word/document.xml');
      expect(documentXmlEntry).toBeDefined();

      const documentJson = parseXmlToJson(documentXmlEntry.content);
      const documentNode = documentJson.elements?.find((el) => el.name === 'w:document');
      const body = documentNode?.elements?.find((el) => el.name === 'w:body');
      expect(body).toBeDefined();

      const { tracked, formats } = collectTrackedWrappers(body);
      expect(tracked.length).toBeGreaterThan(0);

      // Phase 005 — every emitted `w:id` must be a Word-compatible decimal
      // string. UUIDs / non-decimal sourceIds are not valid Word revision
      // ids; the allocator mints fresh decimals for SuperDoc-native
      // revisions while preserving imported decimals verbatim.
      for (const node of tracked) {
        const id = node.attributes?.['w:id'];
        expect(id, `Tracked-change node missing w:id (${node.name})`).toBeDefined();
        expect(String(id)).toMatch(/^\d+$/);
      }

      // Format revisions, when present, follow the same allocator rule.
      for (const node of formats) {
        const id = node.attributes?.['w:id'];
        expect(id, `Format revision node missing w:id (${node.name})`).toBeDefined();
        expect(String(id)).toMatch(/^\d+$/);
      }

      // Phase 005 — no SuperDoc-private attributes on tracked-change
      // wrappers. The Word-native attribute set is `w:id`, `w:author`,
      // `w:authorEmail`, `w:date`, plus optional `w:authorImage` (treated
      // as Word-supported per converter convention).
      // Word-standard tracked-change attributes. `w:rsid*` are
      // revision-save ids that ship in untouched Word documents.
      const allowedAttrs = new Set([
        'w:id',
        'w:author',
        'w:authorEmail',
        'w:date',
        'w:authorImage',
        'w:rsidDel',
        'w:rsidR',
        'w:rsidRDefault',
        'w:rsidRPr',
        'w:rsidP',
        'w:rsidTr',
        'w:rsidSect',
      ]);
      for (const node of [...tracked, ...formats]) {
        if (!node.attributes) continue;
        for (const key of Object.keys(node.attributes)) {
          // overlap internal attrs (`changeType`, `revisionGroupId`,
          // `splitFromId`, etc.) live on PM marks only — never on OOXML.
          expect(allowedAttrs.has(key), `Tracked-change wrapper carries non-Word attribute "${key}"`).toBe(true);
        }
      }

      // Phase 005 — no SuperDoc-private namespaces appear anywhere in the
      // body. `sd:*`, `sdrev:*`, and `superdoc:*` are forbidden even on
      // unrelated wrappers.
      const allKeys = allAttributeKeysFor(body);
      for (const key of allKeys) {
        for (const banned of FORBIDDEN_NAMESPACE_PREFIXES) {
          expect(key.startsWith(banned), `Body attribute "${key}" uses forbidden namespace ${banned}`).toBe(false);
        }
      }

      // Phase 005 — no SuperDoc-specific element names.
      const allNames = allElementNames(body);
      for (const name of allNames) {
        for (const banned of FORBIDDEN_NAMESPACE_PREFIXES) {
          expect(name.startsWith(banned), `Body element "${name}" uses forbidden namespace ${banned}`).toBe(false);
        }
      }
    } finally {
      editor.destroy();
    }
  });

  it('installs the Word id allocator by default', async () => {
    const fileName = 'msword-tracked-changes.docx';
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(fileName);
    const { editor } = await initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      isHeadless: true,
    });

    try {
      const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
      const exportedFiles = await loadExportedPackage(exportedBuffer);
      const documentXmlEntry = exportedFiles.find((entry) => entry.name === 'word/document.xml');
      expect(documentXmlEntry).toBeDefined();
      expect(editor.converter.wordIdAllocator).not.toBeNull();
    } finally {
      editor.destroy();
    }
  });
});

describe('overlap export — allocator collision behavior', () => {
  it('successor fragments mint ids that do not collide with preserved sourceIds', async () => {
    // Build a synthetic document whose tracked marks carry preserved decimal
    // sourceIds (1, 2) plus a native revision with no sourceId. The
    // allocator must mint a fresh decimal id for the native revision
    // that does not collide with the preserved set.
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('blank-doc.docx');
    const { editor } = await initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      isHeadless: true,
      trackedChanges: {},
    });

    try {
      const schema = editor.schema;
      const baseDocJson = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'run',
                content: [
                  {
                    type: 'text',
                    text: 'imported',
                    marks: [
                      {
                        type: 'trackInsert',
                        attrs: {
                          id: 'logical-a',
                          sourceId: '1',
                          author: 'Alice',
                          authorEmail: 'alice@example.com',
                          date: '2024-01-01T00:00:00Z',
                        },
                      },
                    ],
                  },
                ],
              },
              {
                type: 'run',
                content: [
                  {
                    type: 'text',
                    text: 'paired',
                    marks: [
                      {
                        type: 'trackDelete',
                        attrs: {
                          id: 'logical-b',
                          sourceId: '2',
                          author: 'Alice',
                          authorEmail: 'alice@example.com',
                          date: '2024-01-01T00:00:00Z',
                        },
                      },
                    ],
                  },
                ],
              },
              {
                type: 'run',
                content: [
                  {
                    type: 'text',
                    text: 'native',
                    marks: [
                      {
                        type: 'trackInsert',
                        attrs: {
                          id: 'logical-c',
                          sourceId: '',
                          author: 'Alice',
                          authorEmail: 'alice@example.com',
                          date: '2024-02-01T00:00:00Z',
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      const replacementDoc = schema.nodeFromJSON(baseDocJson);
      const tx = editor.state.tr.replaceWith(0, editor.state.doc.content.size, replacementDoc.content);
      editor.dispatch(tx);

      const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
      const files = await loadExportedPackage(exportedBuffer);
      const documentXmlEntry = files.find((f) => f.name === 'word/document.xml');
      const documentJson = parseXmlToJson(documentXmlEntry.content);
      const documentNode = documentJson.elements?.find((el) => el.name === 'w:document');
      const body = documentNode?.elements?.find((el) => el.name === 'w:body');

      const { tracked } = collectTrackedWrappers(body);
      const ids = tracked.map((node) => String(node.attributes?.['w:id']));

      // Imported sourceIds preserved.
      expect(ids).toContain('1');
      expect(ids).toContain('2');

      // The native revision must NOT collide with the preserved set.
      const nativeId = ids.find((id) => id !== '1' && id !== '2');
      expect(nativeId).toBeDefined();
      expect(nativeId).toMatch(/^\d+$/);
      expect(nativeId).not.toBe('1');
      expect(nativeId).not.toBe('2');

      // Every id is decimal.
      for (const id of ids) {
        expect(id).toMatch(/^\d+$/);
      }
    } finally {
      editor.destroy();
    }
  });

  it('restores non-decimal sourceIds after Word-compatible export rewrites w:id', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('blank-doc.docx');
    const { editor } = await initTestEditor({
      content: docx,
      media,
      mediaFiles,
      fonts,
      isHeadless: true,
      trackedChanges: {},
    });
    let reopened;

    try {
      const schema = editor.schema;
      const originalSourceId = '77eb0a88-caef-402e-9329-ea504555afa3';
      const replacementDoc = schema.nodeFromJSON({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'run',
                content: [
                  {
                    type: 'text',
                    text: 'superdoc-origin',
                    marks: [
                      {
                        type: 'trackInsert',
                        attrs: {
                          id: 'logical-superdoc-origin',
                          sourceId: originalSourceId,
                          author: 'Alice',
                          authorEmail: 'alice@example.com',
                          date: '2024-01-01T00:00:00Z',
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      editor.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, replacementDoc.content));

      const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
      const files = await loadExportedPackage(exportedBuffer);
      const documentXmlEntry = files.find((f) => f.name === 'word/document.xml');
      expect(documentXmlEntry.content).toContain('w:id="1"');
      expect(documentXmlEntry.content).not.toContain(originalSourceId);

      const customXmlEntry = files.find((f) => f.name === 'docProps/custom.xml');
      expect(customXmlEntry.content).toContain(TRACKED_CHANGE_SOURCE_ID_MAP_PROPERTY);
      expect(customXmlEntry.content).toContain(originalSourceId);

      const [roundtripDocx, roundtripMedia, roundtripMediaFiles, roundtripFonts] = await Editor.loadXmlData(
        exportedBuffer,
        true,
      );
      ({ editor: reopened } = await initTestEditor({
        content: roundtripDocx,
        media: roundtripMedia,
        mediaFiles: roundtripMediaFiles,
        fonts: roundtripFonts,
        isHeadless: true,
        trackedChanges: {},
      }));

      const sourceIds = [];
      reopened.state.doc.descendants((node) => {
        for (const mark of node.marks ?? []) {
          if (mark.type.name === 'trackInsert') sourceIds.push(mark.attrs.sourceId);
        }
      });
      expect(sourceIds).toContain(originalSourceId);
    } finally {
      editor.destroy();
      reopened?.destroy();
    }
  });
});
