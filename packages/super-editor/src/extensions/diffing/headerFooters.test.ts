import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@core/Editor.js';
import { getStarterExtensions } from '@extensions/index.js';
import { getTestDataAsBuffer } from '@tests/export/export-helpers/export-helpers.js';
import { getTrackChanges } from '@extensions/track-changes/trackChangesHelpers/getTrackChanges.js';
import { captureHeaderFooterState, diffHeaderFooters, type HeaderFooterState } from './algorithm/header-footer-diffing';
import { replayHeaderFooters } from './replay/replay-header-footers';
import { replayPartsDiff } from './replay/replay-parts';
import { resolveSectionProjections } from '../../document-api-adapters/helpers/sections-resolver.js';

/**
 * Creates a headless editor from a DOCX fixture.
 *
 * @param user Optional user config for tracked replay tests.
 * @returns Headless editor ready for diffing tests.
 */
async function createEditor(user?: { name: string; email: string }): Promise<Editor> {
  const buffer = await getTestDataAsBuffer('diffing/diff_before2.docx');
  const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

  return new Editor({
    isHeadless: true,
    extensions: getStarterExtensions(),
    documentId: 'header-footer-diff-test',
    content: docx,
    mode: 'docx',
    media,
    mediaFiles,
    fonts,
    annotations: true,
    user,
  });
}

/**
 * Builds a simple PM JSON document for header/footer content.
 *
 * @param editor Editor whose schema should be used.
 * @param text Plain text content for the document.
 * @returns PM JSON document with one paragraph.
 */
function createHeaderFooterDoc(editor: Editor, text: string): Record<string, unknown> {
  const paragraph = editor.schema.nodes.paragraph.create(
    undefined,
    editor.schema.nodes.run.create(undefined, text ? [editor.schema.text(text)] : []),
  );
  return editor.schema.nodes.doc.create(undefined, [paragraph]).toJSON() as Record<string, unknown>;
}

/**
 * Seeds one header/footer part into converter state and document relationships.
 *
 * @param editor Editor whose converter should be updated.
 * @param params Header/footer part settings.
 */
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

  if (!converter.convertedXml?.[partPath]) {
    converter.convertedXml![partPath] = {
      type: 'element',
      name: 'document',
      elements: [
        {
          type: 'element',
          name: kind === 'header' ? 'w:hdr' : 'w:ftr',
          attributes: {
            'xmlns:w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
            'xmlns:r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
          },
          elements: [],
        },
      ],
    };
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

function seedPartDependency(
  editor: Editor,
  params: {
    partPath: string;
    relationshipId: string;
    target: string;
    targetPath: string;
    mediaContent: string;
  },
): void {
  const { partPath, relationshipId, target, targetPath, mediaContent } = params;
  const fileName = partPath.split('/').pop();
  if (!fileName) {
    throw new Error(`Invalid partPath: ${partPath}`);
  }

  editor.converter!.convertedXml![`word/_rels/${fileName}.rels`] = {
    type: 'element',
    name: 'document',
    elements: [
      {
        type: 'element',
        name: 'Relationships',
        attributes: { xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships' },
        elements: [
          {
            type: 'element',
            name: 'Relationship',
            attributes: {
              Id: relationshipId,
              Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
              Target: target,
            },
            elements: [],
          },
        ],
      },
    ],
  };

  editor.options.mediaFiles ??= {};
  editor.options.mediaFiles[targetPath] = mediaContent;
  (editor.storage.image as { media?: Record<string, unknown> }).media ??= {};
  (editor.storage.image as { media?: Record<string, unknown> }).media![targetPath] = mediaContent;
}

/**
 * Writes the body section properties used by the section resolver.
 *
 * @param editor Editor whose body section properties should be updated.
 * @param params Explicit section references to set.
 */
function setBodySection(
  editor: Editor,
  params: {
    titlePg?: boolean;
    headerDefault?: string | null;
    headerFirst?: string | null;
    footerDefault?: string | null;
    footerFirst?: string | null;
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
  if (params.headerFirst) {
    elements.push({
      type: 'element',
      name: 'w:headerReference',
      attributes: { 'w:type': 'first', 'r:id': params.headerFirst },
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
  if (params.footerFirst) {
    elements.push({
      type: 'element',
      name: 'w:footerReference',
      attributes: { 'w:type': 'first', 'r:id': params.footerFirst },
      elements: [],
    });
  }

  editor.converter!.bodySectPr = {
    type: 'element',
    name: 'w:sectPr',
    elements,
  };
}

/**
 * Seeds one default header for a single-section test document.
 *
 * @param editor Editor whose converter should be updated.
 * @param text Header text content.
 */
function seedDefaultHeader(editor: Editor, text: string): void {
  seedPart(editor, {
    kind: 'header',
    refId: 'rIdHeader1',
    partPath: 'word/header1.xml',
    text,
  });
  setBodySection(editor, { headerDefault: 'rIdHeader1' });
}

/**
 * Seeds one default footer for a single-section test document.
 *
 * @param editor Editor whose converter should be updated.
 * @param text Footer text content.
 */
function seedDefaultFooter(editor: Editor, text: string): void {
  seedPart(editor, {
    kind: 'footer',
    refId: 'rIdFooter1',
    partPath: 'word/footer1.xml',
    text,
  });
  setBodySection(editor, { footerDefault: 'rIdFooter1' });
}

describe('Header/footer diffing', () => {
  it('emits cleared slot changes when a section slot is removed', async () => {
    const editor = await createEditor();

    try {
      const previous: HeaderFooterState = {
        parts: [],
        slots: [
          {
            sectionId: 'section-a',
            titlePg: false,
            header: { default: 'rIdHeaderDefault', first: null, even: null },
            footer: { default: null, first: null, even: null },
          },
          {
            sectionId: 'section-b',
            titlePg: true,
            header: { default: null, first: 'rIdHeaderFirst', even: null },
            footer: { default: null, first: 'rIdFooterFirst', even: null },
          },
        ],
      };
      const next: HeaderFooterState = {
        parts: [],
        slots: [
          {
            sectionId: 'section-a',
            titlePg: false,
            header: { default: 'rIdHeaderDefault', first: null, even: null },
            footer: { default: null, first: null, even: null },
          },
        ],
      };

      const diff = diffHeaderFooters(previous, next, editor.schema);

      expect(diff?.slotChanges).toEqual([
        {
          sectionId: 'section-b',
          titlePg: false,
          header: { default: null, first: null, even: null },
          footer: { default: null, first: null, even: null },
        },
      ]);
    } finally {
      editor.destroy?.();
    }
  });

  it('compares and replays a newly added header', async () => {
    const beforeEditor = await createEditor();
    const afterEditor = await createEditor();

    try {
      setBodySection(beforeEditor, {});
      seedDefaultHeader(afterEditor, 'New header');

      const diff = beforeEditor.commands.compareDocuments(afterEditor);

      expect(diff.headerFootersDiff?.addedParts).toHaveLength(1);
      expect(diff.headerFootersDiff?.slotChanges).toHaveLength(1);

      expect(beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: false })).toBe(true);
      expect(captureHeaderFooterState(beforeEditor)).toEqual(captureHeaderFooterState(afterEditor));
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });

  it('compares and replays a newly added footer', async () => {
    const beforeEditor = await createEditor();
    const afterEditor = await createEditor();

    try {
      setBodySection(beforeEditor, {});
      seedDefaultFooter(afterEditor, 'New footer');

      const diff = beforeEditor.commands.compareDocuments(afterEditor);

      expect(diff.headerFootersDiff?.addedParts).toHaveLength(1);
      expect(diff.headerFootersDiff?.slotChanges).toHaveLength(1);

      expect(beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: false })).toBe(true);
      expect(captureHeaderFooterState(beforeEditor)).toEqual(captureHeaderFooterState(afterEditor));
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });

  it('emits a header/footer refresh signal when replay adds a new header', async () => {
    const beforeEditor = await createEditor();
    const afterEditor = await createEditor();

    try {
      setBodySection(beforeEditor, {});
      seedDefaultHeader(afterEditor, 'New header');

      const emitSpy = vi.spyOn(beforeEditor, 'emit');
      const diff = beforeEditor.commands.compareDocuments(afterEditor);

      expect(beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: false })).toBe(true);
      expect(emitSpy).toHaveBeenCalledWith(
        'partChanged',
        expect.objectContaining({
          source: 'diff-replay',
          parts: expect.arrayContaining([
            expect.objectContaining({ partId: 'word/header1.xml', sectionId: 'rIdHeader1', operation: 'create' }),
          ]),
        }),
      );
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });

  it('captures and replays header part dependencies through partsDiff', async () => {
    const beforeEditor = await createEditor();
    const afterEditor = await createEditor();

    try {
      setBodySection(beforeEditor, {});
      seedDefaultHeader(afterEditor, 'Header with image');
      seedPartDependency(afterEditor, {
        partPath: 'word/header1.xml',
        relationshipId: 'rIdImage1',
        target: 'media/header-logo.png',
        targetPath: 'word/media/header-logo.png',
        mediaContent: 'data:image/png;base64,aGVhZGVy',
      });

      const diff = beforeEditor.commands.compareDocuments(afterEditor);

      expect(diff.partsDiff).not.toBeNull();
      expect(diff.partsDiff?.upserts['word/_rels/header1.xml.rels']).toBeTruthy();
      expect(diff.partsDiff?.upserts['word/media/header-logo.png']).toBeTruthy();

      expect(beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: false })).toBe(true);
      expect(beforeEditor.converter?.convertedXml?.['word/_rels/header1.xml.rels']).toBeTruthy();
      expect(
        (beforeEditor.storage.image as { media?: Record<string, unknown> }).media?.['word/media/header-logo.png'],
      ).toBe('data:image/png;base64,aGVhZGVy');
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });

  it('emits partChanged for parts replayed from diff payloads', async () => {
    const beforeEditor = await createEditor();
    const afterEditor = await createEditor();

    try {
      setBodySection(beforeEditor, {});
      seedDefaultHeader(afterEditor, 'Header with image');
      seedPartDependency(afterEditor, {
        partPath: 'word/header1.xml',
        relationshipId: 'rIdImage1',
        target: 'media/header-logo.png',
        targetPath: 'word/media/header-logo.png',
        mediaContent: 'data:image/png;base64,aGVhZGVy',
      });

      const emitSpy = vi.spyOn(beforeEditor, 'emit');
      const diff = beforeEditor.commands.compareDocuments(afterEditor);

      expect(beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: false })).toBe(true);
      expect(emitSpy).toHaveBeenCalledWith(
        'partChanged',
        expect.objectContaining({
          source: 'diff-replay',
          parts: expect.arrayContaining([
            expect.objectContaining({ partId: 'word/_rels/header1.xml.rels' }),
            expect.objectContaining({ partId: 'word/media/header-logo.png' }),
          ]),
        }),
      );
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });

  it('publishes replayed media upserts through collaboration', () => {
    const addImageToCollaboration = vi.fn(() => true);

    replayPartsDiff({
      partsDiff: {
        upserts: {
          'word/media/header-logo.png': {
            kind: 'binary',
            content: 'data:image/png;base64,aGVhZGVy',
          },
        },
        deletes: [],
      },
      editor: {
        commands: {
          addImageToCollaboration,
        },
        converter: {
          convertedXml: {},
        },
        options: {
          mediaFiles: {},
        },
        storage: {
          image: {
            media: {},
          },
        },
      },
    });

    expect(addImageToCollaboration).toHaveBeenCalledWith({
      mediaPath: 'word/media/header-logo.png',
      fileData: 'data:image/png;base64,aGVhZGVy',
    });
  });

  it('exports a valid header part after replay adds a new header', async () => {
    const beforeEditor = await createEditor();
    const afterEditor = await createEditor();

    try {
      setBodySection(beforeEditor, {});
      seedDefaultHeader(afterEditor, 'Exported header');

      const diff = beforeEditor.commands.compareDocuments(afterEditor);

      expect(beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: false })).toBe(true);

      const updatedDocs = await beforeEditor.exportDocx({ getUpdatedDocs: true });
      expect(updatedDocs['word/header1.xml']).toContain('<w:hdr');
      expect(updatedDocs['word/header1.xml']).toContain('xmlns:w=');
      expect(updatedDocs['[Content_Types].xml']).toContain('/word/header1.xml');
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });

  it('compares and replays modified header content', async () => {
    const beforeEditor = await createEditor();
    const afterEditor = await createEditor();

    try {
      seedDefaultHeader(beforeEditor, 'Old header');
      seedDefaultHeader(afterEditor, 'Updated header');

      const diff = beforeEditor.commands.compareDocuments(afterEditor);

      expect(diff.headerFootersDiff?.modifiedParts).toHaveLength(1);

      expect(beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: false })).toBe(true);
      expect(captureHeaderFooterState(beforeEditor)).toEqual(captureHeaderFooterState(afterEditor));
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });

  it('treats header part path changes as a real diff', async () => {
    const beforeEditor = await createEditor();
    const afterEditor = await createEditor();

    try {
      seedPart(beforeEditor, {
        kind: 'header',
        refId: 'rIdHeader1',
        partPath: 'word/header1.xml',
        text: 'Same header',
      });
      setBodySection(beforeEditor, { headerDefault: 'rIdHeader1' });

      seedPart(afterEditor, {
        kind: 'header',
        refId: 'rIdHeader1',
        partPath: 'word/header2.xml',
        text: 'Same header',
      });
      setBodySection(afterEditor, { headerDefault: 'rIdHeader1' });

      const diff = beforeEditor.commands.compareDocuments(afterEditor);

      expect(diff.headerFootersDiff?.modifiedParts).toHaveLength(1);
      expect(diff.headerFootersDiff?.modifiedParts[0]).toMatchObject({
        refId: 'rIdHeader1',
        oldPartPath: 'word/header1.xml',
        partPath: 'word/header2.xml',
      });

      expect(beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: false })).toBe(true);
      expect(beforeEditor.converter?.convertedXml?.['word/header1.xml']).toBeUndefined();
      expect(beforeEditor.converter?.convertedXml?.['word/header2.xml']).toBeTruthy();

      const relsRoot = (
        beforeEditor.converter?.convertedXml?.['word/_rels/document.xml.rels'] as
          | {
              elements?: Array<{
                name?: string;
                elements?: Array<{ name?: string; attributes?: Record<string, string> }>;
              }>;
            }
          | undefined
      )?.elements?.find((entry) => entry.name === 'Relationships');
      const relationship = relsRoot?.elements?.find(
        (entry) => entry.name === 'Relationship' && entry.attributes?.Id === 'rIdHeader1',
      );
      expect(relationship?.attributes?.Target).toBe('header2.xml');
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });

  it('emits delete and create partChanged events when a header part path is renamed', async () => {
    const beforeEditor = await createEditor();
    const afterEditor = await createEditor();

    try {
      seedPart(beforeEditor, {
        kind: 'header',
        refId: 'rIdHeader1',
        partPath: 'word/header1.xml',
        text: 'Same header',
      });
      setBodySection(beforeEditor, { headerDefault: 'rIdHeader1' });

      seedPart(afterEditor, {
        kind: 'header',
        refId: 'rIdHeader1',
        partPath: 'word/header2.xml',
        text: 'Same header',
      });
      setBodySection(afterEditor, { headerDefault: 'rIdHeader1' });

      const emitSpy = vi.spyOn(beforeEditor, 'emit');
      const diff = beforeEditor.commands.compareDocuments(afterEditor);

      expect(beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: false })).toBe(true);
      expect(emitSpy).toHaveBeenCalledWith(
        'partChanged',
        expect.objectContaining({
          source: 'diff-replay',
          parts: expect.arrayContaining([
            expect.objectContaining({ partId: 'word/header1.xml', sectionId: 'rIdHeader1', operation: 'delete' }),
            expect.objectContaining({ partId: 'word/header2.xml', sectionId: 'rIdHeader1', operation: 'create' }),
          ]),
        }),
      );
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });

  it('compares and replays header removal', async () => {
    const beforeEditor = await createEditor();
    const afterEditor = await createEditor();

    try {
      seedDefaultHeader(beforeEditor, 'Remove me');
      setBodySection(afterEditor, {});

      const diff = beforeEditor.commands.compareDocuments(afterEditor);

      expect(diff.headerFootersDiff?.removedParts).toHaveLength(1);
      expect(diff.headerFootersDiff?.slotChanges).toHaveLength(1);

      expect(beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: false })).toBe(true);
      expect(captureHeaderFooterState(beforeEditor)).toEqual(captureHeaderFooterState(afterEditor));
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });

  it('preserves shared header dependencies when removing one header', async () => {
    const beforeEditor = await createEditor();
    const afterEditor = await createEditor();

    try {
      seedPart(beforeEditor, {
        kind: 'header',
        refId: 'rIdHeaderDefault',
        partPath: 'word/header1.xml',
        text: 'Default header',
      });
      seedPart(beforeEditor, {
        kind: 'header',
        refId: 'rIdHeaderFirst',
        partPath: 'word/header2.xml',
        text: 'First header',
      });
      seedPartDependency(beforeEditor, {
        partPath: 'word/header1.xml',
        relationshipId: 'rIdImage1',
        target: 'media/shared-logo.png',
        targetPath: 'word/media/shared-logo.png',
        mediaContent: 'data:image/png;base64,c2hhcmVk',
      });
      seedPartDependency(beforeEditor, {
        partPath: 'word/header2.xml',
        relationshipId: 'rIdImage2',
        target: 'media/shared-logo.png',
        targetPath: 'word/media/shared-logo.png',
        mediaContent: 'data:image/png;base64,c2hhcmVk',
      });
      setBodySection(beforeEditor, {
        titlePg: true,
        headerDefault: 'rIdHeaderDefault',
        headerFirst: 'rIdHeaderFirst',
      });

      seedPart(afterEditor, {
        kind: 'header',
        refId: 'rIdHeaderDefault',
        partPath: 'word/header1.xml',
        text: 'Default header',
      });
      seedPartDependency(afterEditor, {
        partPath: 'word/header1.xml',
        relationshipId: 'rIdImage1',
        target: 'media/shared-logo.png',
        targetPath: 'word/media/shared-logo.png',
        mediaContent: 'data:image/png;base64,c2hhcmVk',
      });
      setBodySection(afterEditor, {
        headerDefault: 'rIdHeaderDefault',
      });

      const diff = beforeEditor.commands.compareDocuments(afterEditor);

      expect(diff.headerFootersDiff?.removedParts).toHaveLength(1);
      expect(diff.partsDiff?.deletes).not.toContain('word/media/shared-logo.png');
      expect(diff.partsDiff?.deletes).not.toContain('word/header2.xml');
      expect(diff.partsDiff?.deletes).toContain('word/_rels/header2.xml.rels');
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });

  it('keeps body replay tracked when header/footer diffs are present', async () => {
    const user = { name: 'Test User', email: 'test@example.com' };
    const beforeEditor = await createEditor(user);
    const afterEditor = await createEditor();

    try {
      setBodySection(beforeEditor, {});
      afterEditor.dispatch(afterEditor.state.tr.insertText('Updated ', 1));
      seedDefaultHeader(afterEditor, 'Tracked header');

      const diff = beforeEditor.commands.compareDocuments(afterEditor);

      expect(beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: true })).toBe(true);
      expect(beforeEditor.state.doc.textContent).toBe(afterEditor.state.doc.textContent);
      expect(getTrackChanges(beforeEditor.state).length).toBeGreaterThan(0);
      expect(captureHeaderFooterState(beforeEditor)).toEqual(captureHeaderFooterState(afterEditor));
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });

  it('updates titlePg cache after replay changes first-page header settings', async () => {
    const beforeEditor = await createEditor();
    const afterEditor = await createEditor();

    try {
      seedDefaultHeader(beforeEditor, 'Default header');
      seedDefaultHeader(afterEditor, 'Default header');
      setBodySection(afterEditor, { titlePg: true, headerDefault: 'rIdHeader1' });

      const diff = beforeEditor.commands.compareDocuments(afterEditor);

      expect(beforeEditor.converter?.headerIds?.titlePg).not.toBe(true);

      expect(beforeEditor.commands.replayDifferences(diff, { applyTrackedChanges: false })).toBe(true);

      expect(beforeEditor.converter?.headerIds?.titlePg).toBe(true);
      expect(beforeEditor.converter?.footerIds?.titlePg).toBe(true);
    } finally {
      beforeEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });

  it('updates converter variant ids when replay repoints a section header ref', async () => {
    const beforeEditor = await createEditor();

    try {
      seedPart(beforeEditor, {
        kind: 'header',
        refId: 'rIdHeader1',
        partPath: 'word/header1.xml',
        text: 'Original default header',
      });
      setBodySection(beforeEditor, { headerDefault: 'rIdHeader1' });
      beforeEditor.converter!.headerIds = {
        ...(beforeEditor.converter!.headerIds ?? {}),
        default: 'rIdHeader1',
        ids: ['rIdHeader1'],
      };
      const sectionId = resolveSectionProjections(beforeEditor as never)[0]?.sectionId;
      expect(sectionId).toBeTruthy();

      const tr = beforeEditor.state.tr;
      replayHeaderFooters({
        tr,
        schema: beforeEditor.schema,
        editor: beforeEditor,
        headerFootersDiff: {
          addedParts: [],
          modifiedParts: [],
          removedParts: [],
          slotChanges: [
            {
              sectionId,
              titlePg: false,
              header: { default: 'rIdHeader2', first: null, even: null, odd: null },
              footer: { default: null, first: null, even: null, odd: null },
            },
          ],
        },
      });

      expect(beforeEditor.converter?.headerIds?.default).toBe('rIdHeader2');
    } finally {
      beforeEditor.destroy?.();
    }
  });
});
