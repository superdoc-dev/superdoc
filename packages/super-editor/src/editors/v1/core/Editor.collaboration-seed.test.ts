import { beforeAll, describe, expect, it } from 'vitest';
import { applyUpdate, Doc as YDoc, encodeStateAsUpdate, XmlElement, XmlText } from 'yjs';
import { Editor } from './Editor.js';
import { getStarterExtensions } from '@extensions/index.js';
import { seedEditorStateToYDoc } from '@extensions/collaboration/seed-editor-to-ydoc.js';
import { getTestDataAsFileBuffer } from '@tests/helpers/helpers.js';

type SyncHandler = (synced?: boolean) => void;

function createProviderStub() {
  const listeners = {
    sync: new Set<SyncHandler>(),
    synced: new Set<SyncHandler>(),
  };

  return {
    awareness: {
      getStates() {
        return new Map();
      },
      on() {},
      off() {},
    },
    synced: false,
    isSynced: false,
    on(event: 'sync' | 'synced', handler: SyncHandler) {
      listeners[event].add(handler);
    },
    off(event: 'sync' | 'synced', handler: SyncHandler) {
      listeners[event].delete(handler);
    },
    emit(event: 'sync' | 'synced', value?: boolean) {
      for (const handler of listeners[event]) {
        handler(value);
      }
    },
  };
}

function createTestEditor(options: Partial<ConstructorParameters<typeof Editor>[0]> = {}) {
  return new Editor({
    isHeadless: true,
    deferDocumentLoad: true,
    mode: 'docx',
    extensions: getStarterExtensions(),
    suppressDefaultDocxStyles: true,
    ...options,
  });
}

function collectCrossReferences(editor: Editor) {
  const crossReferences: Array<{ pos: number; attrs: Record<string, unknown>; textContent: string }> = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'crossReference') {
      crossReferences.push({ pos, attrs: node.attrs, textContent: node.textContent });
    }
    return true;
  });
  return crossReferences;
}

function createCrossReferencePmDoc(editor: Editor) {
  const { schema } = editor;
  return schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('Hello I am a list')]),
    schema.node('paragraph', null, [
      schema.text('Hello I am a reference to list item: '),
      schema.nodes.crossReference.create({
        instruction: 'REF _Ref228977094 \\r \\h',
        fieldType: 'REF',
        target: '_Ref228977094',
        display: 'paragraphNumber',
        resolvedText: '\u200e1',
        marksAsAttrs: [{ type: 'textStyle', attrs: {} }],
      }),
    ]),
  ]);
}

function findYXmlElementByNodeName(root: unknown, nodeName: string): XmlElement | null {
  let match: XmlElement | null = null;
  const walk = (node: unknown) => {
    if (match) return;
    if (node instanceof XmlElement && node.nodeName === nodeName) {
      match = node;
      return;
    }
    if (node && typeof (node as { forEach?: unknown }).forEach === 'function') {
      (node as { forEach: (callback: (child: unknown) => void) => void }).forEach((child) => walk(child));
    }
  };
  walk(root);
  return match;
}

function addCachedResultRunToYjsCrossReference(ydoc: YDoc, cachedText = '\u200e1'): void {
  const crossReferenceElement = findYXmlElementByNodeName(ydoc.getXmlFragment('supereditor'), 'crossReference');
  if (!crossReferenceElement) {
    throw new Error('Expected seeded Yjs fragment to contain a crossReference element.');
  }

  const run = new XmlElement('run');
  run.setAttribute('runProperties', {
    rFonts: { ascii: 'Aptos', hAnsi: 'Aptos', cs: 'Arial' },
    fontSize: 24,
    fontSizeCs: 24,
  });
  run.setAttribute('runPropertiesInlineKeys', ['fontFamily', 'cs']);

  const text = new XmlText();
  text.insert(0, cachedText);
  run.insert(0, [text]);
  crossReferenceElement.insert(0, [run]);
}

function clearYjsElementResolvedText(ydoc: YDoc, nodeName: string): void {
  const element = findYXmlElementByNodeName(ydoc.getXmlFragment('supereditor'), nodeName);
  if (!element) {
    throw new Error(`Expected seeded Yjs fragment to contain a ${nodeName} element.`);
  }

  element.setAttribute('resolvedText', '');
}

function collectCitations(editor: Editor) {
  const citations: Array<{ pos: number; attrs: Record<string, unknown>; textContent: string }> = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'citation') {
      citations.push({ pos, attrs: node.attrs, textContent: node.textContent });
    }
    return true;
  });
  return citations;
}

function createCitationPmDoc(editor: Editor) {
  const { schema } = editor;
  return schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('Hello I am a citation reference: ')]),
    schema.node('paragraph', null, [
      schema.text('Source: '),
      schema.nodes.citation.create({
        instruction: 'CITATION Smith2024 \\l 1033',
        sourceIds: ['Smith2024'],
        resolvedText: '(Smith, 2024)',
        marksAsAttrs: [{ type: 'textStyle', attrs: {} }],
      }),
    ]),
  ]);
}

function addCachedResultRunToYjsCitation(ydoc: YDoc, cachedText = '(Smith, 2024)'): void {
  const citationElement = findYXmlElementByNodeName(ydoc.getXmlFragment('supereditor'), 'citation');
  if (!citationElement) {
    throw new Error('Expected seeded Yjs fragment to contain a citation element.');
  }

  const run = new XmlElement('run');
  run.setAttribute('runProperties', {
    rFonts: { ascii: 'Aptos', hAnsi: 'Aptos', cs: 'Arial' },
    fontSize: 24,
    fontSizeCs: 24,
  });
  run.setAttribute('runPropertiesInlineKeys', ['fontFamily', 'cs']);

  const text = new XmlText();
  text.insert(0, cachedText);
  run.insert(0, [text]);
  citationElement.insert(0, [run]);
}

describe('Editor collaboration seeding', () => {
  let centeredBuffer: Buffer;

  beforeAll(async () => {
    centeredBuffer = await getTestDataAsFileBuffer('advanced-text.docx');
  });

  it('preserves the first paragraph attrs when seeding a collaborative room', async () => {
    const provider = createProviderStub();
    const ydoc = new YDoc();
    const seededEditor = createTestEditor({
      ydoc,
      collaborationProvider: provider,
    });
    const directEditor = createTestEditor();

    try {
      await seededEditor.open(centeredBuffer, {
        mode: 'docx',
        isNewFile: true,
      });
      await directEditor.open(centeredBuffer, {
        mode: 'docx',
      });

      provider.emit('synced', true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const seededFirstParagraph = seededEditor.state.doc.firstChild;
      const directFirstParagraph = directEditor.state.doc.firstChild;

      expect(seededFirstParagraph?.textContent).toBe(directFirstParagraph?.textContent);
      expect(seededFirstParagraph?.attrs?.paraId).toBe(directFirstParagraph?.attrs?.paraId);
      expect(seededFirstParagraph?.attrs?.paragraphProperties?.justification).toBe(
        directFirstParagraph?.attrs?.paragraphProperties?.justification,
      );
      expect(seededFirstParagraph?.attrs?.attributes ?? null).toEqual(directFirstParagraph?.attrs?.attributes ?? null);
    } finally {
      if (seededEditor.lifecycleState === 'ready') {
        seededEditor.close();
      }
      if (directEditor.lifecycleState === 'ready') {
        directEditor.close();
      }
      seededEditor.destroy();
      directEditor.destroy();
    }
  });

  it('preserves crossReference nodes when a second collaboration client hydrates from the room', async () => {
    const observerProvider = createProviderStub();
    observerProvider.synced = true;
    observerProvider.isSynced = true;
    const ydoc = new YDoc();
    const seedEditor = createTestEditor();
    const observerEditor = createTestEditor({
      ydoc,
      collaborationProvider: observerProvider,
    });

    try {
      await seedEditor.open(undefined, { mode: 'docx' });
      const crossReferenceDoc = createCrossReferencePmDoc(seedEditor);
      // Replacing the full doc range with a doc node unwraps its children into the existing root.
      seedEditor.dispatch(seedEditor.state.tr.replaceWith(0, seedEditor.state.doc.content.size, crossReferenceDoc));

      const seededCrossReferences = collectCrossReferences(seedEditor);
      expect(seededCrossReferences).toHaveLength(1);
      expect(seededCrossReferences[0].attrs.resolvedText).toBe('\u200e1');

      seedEditorStateToYDoc(seedEditor, ydoc);
      addCachedResultRunToYjsCrossReference(ydoc);
      expect(ydoc.getXmlFragment('supereditor').toString()).toContain('crossreference');
      expect(ydoc.getXmlFragment('supereditor').toString()).toContain('REF _Ref228977094');

      await observerEditor.open(undefined, {
        mode: 'docx',
        fragment: ydoc.getXmlFragment('supereditor'),
        isNewFile: false,
      });

      observerProvider.emit('synced', true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const observerCrossReferences = collectCrossReferences(observerEditor);
      expect(observerCrossReferences).toHaveLength(1);
      expect(observerCrossReferences[0].attrs.instruction).toBe('REF _Ref228977094 \\r \\h');
      expect(observerCrossReferences[0].attrs.target).toBe('_Ref228977094');
      expect(observerCrossReferences[0].attrs.resolvedText).toBe('\u200e1');

      const postHydrationSharedXml = ydoc.getXmlFragment('supereditor').toString();
      expect(postHydrationSharedXml).toContain('crossreference');
      expect(postHydrationSharedXml).toContain('REF _Ref228977094');
    } finally {
      if (seedEditor.lifecycleState === 'ready') {
        seedEditor.close();
      }
      if (observerEditor.lifecycleState === 'ready') {
        observerEditor.close();
      }
      seedEditor.destroy();
      observerEditor.destroy();
      ydoc.destroy();
    }
  });

  it('preserves citation nodes when a second collaboration client hydrates from the room', async () => {
    const observerProvider = createProviderStub();
    observerProvider.synced = true;
    observerProvider.isSynced = true;
    const ydoc = new YDoc();
    const seedEditor = createTestEditor();
    const observerEditor = createTestEditor({
      ydoc,
      collaborationProvider: observerProvider,
    });

    try {
      await seedEditor.open(undefined, { mode: 'docx' });
      const citationDoc = createCitationPmDoc(seedEditor);
      seedEditor.dispatch(seedEditor.state.tr.replaceWith(0, seedEditor.state.doc.content.size, citationDoc));

      const seededCitations = collectCitations(seedEditor);
      expect(seededCitations).toHaveLength(1);
      expect(seededCitations[0].attrs.resolvedText).toBe('(Smith, 2024)');

      seedEditorStateToYDoc(seedEditor, ydoc);
      addCachedResultRunToYjsCitation(ydoc);
      expect(ydoc.getXmlFragment('supereditor').toString()).toContain('citation');
      expect(ydoc.getXmlFragment('supereditor').toString()).toContain('CITATION Smith2024');

      await observerEditor.open(undefined, {
        mode: 'docx',
        fragment: ydoc.getXmlFragment('supereditor'),
        isNewFile: false,
      });

      observerProvider.emit('synced', true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const observerCitations = collectCitations(observerEditor);
      expect(observerCitations).toHaveLength(1);
      expect(observerCitations[0].attrs.instruction).toBe('CITATION Smith2024 \\l 1033');
      expect(observerCitations[0].attrs.sourceIds).toEqual(['Smith2024']);
      expect(observerCitations[0].attrs.resolvedText).toBe('(Smith, 2024)');
    } finally {
      if (seedEditor.lifecycleState === 'ready') {
        seedEditor.close();
      }
      if (observerEditor.lifecycleState === 'ready') {
        observerEditor.close();
      }
      seedEditor.destroy();
      observerEditor.destroy();
      ydoc.destroy();
    }
  });

  it('recovers citation resolvedText from cached Yjs children when a second collaboration client hydrates', async () => {
    const observerProvider = createProviderStub();
    observerProvider.synced = true;
    observerProvider.isSynced = true;
    const ydoc = new YDoc();
    const seedEditor = createTestEditor();
    const observerEditor = createTestEditor({
      ydoc,
      collaborationProvider: observerProvider,
    });

    try {
      await seedEditor.open(undefined, { mode: 'docx' });
      const citationDoc = createCitationPmDoc(seedEditor);
      seedEditor.dispatch(seedEditor.state.tr.replaceWith(0, seedEditor.state.doc.content.size, citationDoc));

      seedEditorStateToYDoc(seedEditor, ydoc);
      clearYjsElementResolvedText(ydoc, 'citation');
      addCachedResultRunToYjsCitation(ydoc, '\u200e(Mor, 2006)');

      await observerEditor.open(undefined, {
        mode: 'docx',
        fragment: ydoc.getXmlFragment('supereditor'),
        isNewFile: false,
      });

      observerProvider.emit('synced', true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const observerCitations = collectCitations(observerEditor);
      expect(observerCitations).toHaveLength(1);
      expect(observerCitations[0].attrs.instruction).toBe('CITATION Smith2024 \\l 1033');
      expect(observerCitations[0].attrs.resolvedText).toBe('\u200e(Mor, 2006)');

      const citationElement = findYXmlElementByNodeName(ydoc.getXmlFragment('supereditor'), 'citation');
      expect(citationElement?.getAttribute('resolvedText')).toBe('\u200e(Mor, 2006)');
      expect(citationElement?.length).toBe(0);
    } finally {
      if (seedEditor.lifecycleState === 'ready') {
        seedEditor.close();
      }
      if (observerEditor.lifecycleState === 'ready') {
        observerEditor.close();
      }
      seedEditor.destroy();
      observerEditor.destroy();
      ydoc.destroy();
    }
  });

  it('recovers crossReference resolvedText from cached Yjs children when a second collaboration client hydrates', async () => {
    const observerProvider = createProviderStub();
    observerProvider.synced = true;
    observerProvider.isSynced = true;
    const ydoc = new YDoc();
    const seedEditor = createTestEditor();
    const observerEditor = createTestEditor({
      ydoc,
      collaborationProvider: observerProvider,
    });

    try {
      await seedEditor.open(undefined, { mode: 'docx' });
      const crossReferenceDoc = createCrossReferencePmDoc(seedEditor);
      seedEditor.dispatch(seedEditor.state.tr.replaceWith(0, seedEditor.state.doc.content.size, crossReferenceDoc));

      seedEditorStateToYDoc(seedEditor, ydoc);
      clearYjsElementResolvedText(ydoc, 'crossReference');
      addCachedResultRunToYjsCrossReference(ydoc, 'Target Heading');

      await observerEditor.open(undefined, {
        mode: 'docx',
        fragment: ydoc.getXmlFragment('supereditor'),
        isNewFile: false,
      });

      observerProvider.emit('synced', true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const observerCrossReferences = collectCrossReferences(observerEditor);
      expect(observerCrossReferences).toHaveLength(1);
      expect(observerCrossReferences[0].attrs.instruction).toBe('REF _Ref228977094 \\r \\h');
      expect(observerCrossReferences[0].attrs.target).toBe('_Ref228977094');
      expect(observerCrossReferences[0].attrs.resolvedText).toBe('Target Heading');

      const crossReferenceElement = findYXmlElementByNodeName(ydoc.getXmlFragment('supereditor'), 'crossReference');
      expect(crossReferenceElement?.getAttribute('resolvedText')).toBe('Target Heading');
      expect(crossReferenceElement?.length).toBe(0);
    } finally {
      if (seedEditor.lifecycleState === 'ready') {
        seedEditor.close();
      }
      if (observerEditor.lifecycleState === 'ready') {
        observerEditor.close();
      }
      seedEditor.destroy();
      observerEditor.destroy();
      ydoc.destroy();
    }
  });

  it('hydrates directly from a fragment supplied to open options', async () => {
    const seedYdoc = new YDoc();
    const seedEditor = createTestEditor();
    const fragmentEditor = createTestEditor();

    try {
      await seedEditor.open(undefined, { mode: 'docx' });
      const crossReferenceDoc = createCrossReferencePmDoc(seedEditor);
      seedEditor.dispatch(seedEditor.state.tr.replaceWith(0, seedEditor.state.doc.content.size, crossReferenceDoc));
      seedEditorStateToYDoc(seedEditor, seedYdoc);
      addCachedResultRunToYjsCrossReference(seedYdoc);

      await fragmentEditor.open(undefined, {
        mode: 'docx',
        fragment: seedYdoc.getXmlFragment('supereditor'),
        isNewFile: false,
      });

      const fragmentCrossReferences = collectCrossReferences(fragmentEditor);
      expect(fragmentCrossReferences).toHaveLength(1);
      expect(fragmentCrossReferences[0].attrs.instruction).toBe('REF _Ref228977094 \\r \\h');
      expect(fragmentCrossReferences[0].attrs.resolvedText).toBe('\u200e1');
    } finally {
      if (seedEditor.lifecycleState === 'ready') {
        seedEditor.close();
      }
      if (fragmentEditor.lifecycleState === 'ready') {
        fragmentEditor.close();
      }
      seedEditor.destroy();
      fragmentEditor.destroy();
      seedYdoc.destroy();
    }
  });

  it('hydrates from a fragment attached via setOptions before open()', async () => {
    const seedYdoc = new YDoc();
    const seedEditor = createTestEditor();
    const fragmentEditor = createTestEditor();

    try {
      await seedEditor.open(undefined, { mode: 'docx' });
      const crossReferenceDoc = createCrossReferencePmDoc(seedEditor);
      seedEditor.dispatch(seedEditor.state.tr.replaceWith(0, seedEditor.state.doc.content.size, crossReferenceDoc));
      seedEditorStateToYDoc(seedEditor, seedYdoc);
      addCachedResultRunToYjsCrossReference(seedYdoc);

      fragmentEditor.setOptions({ fragment: seedYdoc.getXmlFragment('supereditor') });
      await fragmentEditor.open(undefined, { mode: 'docx', isNewFile: false });

      const fragmentCrossReferences = collectCrossReferences(fragmentEditor);
      expect(fragmentCrossReferences).toHaveLength(1);
      expect(fragmentCrossReferences[0].attrs.instruction).toBe('REF _Ref228977094 \\r \\h');
      expect(fragmentCrossReferences[0].attrs.resolvedText).toBe('\u200e1');
    } finally {
      if (seedEditor.lifecycleState === 'ready') {
        seedEditor.close();
      }
      if (fragmentEditor.lifecycleState === 'ready') {
        fragmentEditor.close();
      }
      seedEditor.destroy();
      fragmentEditor.destroy();
      seedYdoc.destroy();
    }
  });

  it('hydrates from a fragment supplied to the editor constructor', async () => {
    const seedYdoc = new YDoc();
    const seedEditor = createTestEditor();
    let fragmentEditor: Editor | null = null;

    try {
      await seedEditor.open(undefined, { mode: 'docx' });
      const crossReferenceDoc = createCrossReferencePmDoc(seedEditor);
      seedEditor.dispatch(seedEditor.state.tr.replaceWith(0, seedEditor.state.doc.content.size, crossReferenceDoc));
      seedEditorStateToYDoc(seedEditor, seedYdoc);
      addCachedResultRunToYjsCrossReference(seedYdoc);

      fragmentEditor = createTestEditor({
        fragment: seedYdoc.getXmlFragment('supereditor'),
      });
      await fragmentEditor.open(undefined, {
        mode: 'docx',
        isNewFile: false,
      });

      const fragmentCrossReferences = collectCrossReferences(fragmentEditor);
      expect(fragmentCrossReferences).toHaveLength(1);
      expect(fragmentCrossReferences[0].attrs.instruction).toBe('REF _Ref228977094 \\r \\h');
      expect(fragmentCrossReferences[0].attrs.resolvedText).toBe('\u200e1');
    } finally {
      if (seedEditor.lifecycleState === 'ready') {
        seedEditor.close();
      }
      if (fragmentEditor?.lifecycleState === 'ready') {
        fragmentEditor.close();
      }
      seedEditor.destroy();
      fragmentEditor?.destroy();
      seedYdoc.destroy();
    }
  });

  it('does not reuse a previous fragment when reopened without one', async () => {
    const seedYdoc = new YDoc();
    const seedEditor = createTestEditor();
    const fragmentEditor = createTestEditor();

    try {
      await seedEditor.open(undefined, { mode: 'docx' });
      const crossReferenceDoc = createCrossReferencePmDoc(seedEditor);
      seedEditor.dispatch(seedEditor.state.tr.replaceWith(0, seedEditor.state.doc.content.size, crossReferenceDoc));
      seedEditorStateToYDoc(seedEditor, seedYdoc);
      addCachedResultRunToYjsCrossReference(seedYdoc);

      await fragmentEditor.open(undefined, {
        mode: 'docx',
        fragment: seedYdoc.getXmlFragment('supereditor'),
        isNewFile: false,
      });
      expect(collectCrossReferences(fragmentEditor)).toHaveLength(1);

      fragmentEditor.close();
      await fragmentEditor.open(undefined, { mode: 'docx', isNewFile: true });

      expect(collectCrossReferences(fragmentEditor)).toHaveLength(0);
    } finally {
      if (seedEditor.lifecycleState === 'ready') {
        seedEditor.close();
      }
      if (fragmentEditor.lifecycleState === 'ready') {
        fragmentEditor.close();
      }
      seedEditor.destroy();
      fragmentEditor.destroy();
      seedYdoc.destroy();
    }
  });

  it('preserves crossReference nodes when room content arrives after collaboration setup', async () => {
    const observerProvider = createProviderStub();
    const seedYdoc = new YDoc();
    const observerYdoc = new YDoc();
    const seedEditor = createTestEditor();
    const observerEditor = createTestEditor({
      ydoc: observerYdoc,
      collaborationProvider: observerProvider,
    });

    try {
      await seedEditor.open(undefined, { mode: 'docx' });
      const crossReferenceDoc = createCrossReferencePmDoc(seedEditor);
      seedEditor.dispatch(seedEditor.state.tr.replaceWith(0, seedEditor.state.doc.content.size, crossReferenceDoc));

      seedEditorStateToYDoc(seedEditor, seedYdoc);
      addCachedResultRunToYjsCrossReference(seedYdoc);

      await observerEditor.open(undefined, {
        mode: 'docx',
        isNewFile: false,
      });

      applyUpdate(observerYdoc, encodeStateAsUpdate(seedYdoc));
      observerProvider.emit('synced', true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const observerCrossReferences = collectCrossReferences(observerEditor);
      expect(observerCrossReferences).toHaveLength(1);
      expect(observerCrossReferences[0].attrs.instruction).toBe('REF _Ref228977094 \\r \\h');
      expect(observerCrossReferences[0].attrs.target).toBe('_Ref228977094');
      expect(observerCrossReferences[0].attrs.resolvedText).toBe('\u200e1');
    } finally {
      if (seedEditor.lifecycleState === 'ready') {
        seedEditor.close();
      }
      if (observerEditor.lifecycleState === 'ready') {
        observerEditor.close();
      }
      seedEditor.destroy();
      observerEditor.destroy();
      seedYdoc.destroy();
      observerYdoc.destroy();
    }
  });
});
