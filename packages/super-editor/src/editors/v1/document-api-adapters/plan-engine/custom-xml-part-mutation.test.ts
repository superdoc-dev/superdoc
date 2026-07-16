import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import type { PreparedCustomXmlPartMutation } from './custom-xml-part-mutation.js';

const compoundMockState = vi.hoisted(() => ({
  forceRollback: false,
}));

vi.mock('../../core/parts/mutation/compound-mutation.js', () => ({
  compoundMutation: vi.fn((request: { editor: Editor; execute: () => boolean }) => {
    const editorWithConverter = request.editor as unknown as {
      converter?: { convertedXml?: Record<string, unknown> };
    };
    const snapshot = editorWithConverter.converter?.convertedXml
      ? structuredClone(editorWithConverter.converter.convertedXml)
      : undefined;

    let executeSuccess = false;
    try {
      executeSuccess = request.execute();
    } catch (error) {
      if (snapshot && editorWithConverter.converter) {
        editorWithConverter.converter.convertedXml = snapshot;
      }
      throw error;
    }

    const success = executeSuccess && !compoundMockState.forceRollback;
    if (!success && snapshot && editorWithConverter.converter) {
      editorWithConverter.converter.convertedXml = snapshot;
    }
    return { success };
  }),
}));

import { cleanupParts, createTestEditor, withPart } from '../../core/parts/testing/test-helpers.js';
import { initRevision } from './revision-tracker.js';
import { commitPreparedCustomXmlPartMutation, prepareCustomXmlPartMutation } from './custom-xml-part-mutation.js';

type TestEditor = ReturnType<typeof createTestEditor>;
type ConverterWithCustomXmlState = TestEditor['converter'] & {
  removedCustomXmlPaths?: Set<string>;
  bibliographyPart?: unknown;
};

function asEditor(editor: TestEditor): Editor {
  return editor as unknown as Editor;
}

function converterOf(editor: TestEditor): ConverterWithCustomXmlState {
  return editor.converter as ConverterWithCustomXmlState;
}

describe('custom-xml-part-mutation', () => {
  let editor: TestEditor;

  beforeEach(() => {
    compoundMockState.forceRollback = false;
    editor = createTestEditor();
    initRevision(asEditor(editor));
  });

  afterEach(() => {
    vi.clearAllMocks();
    cleanupParts();
  });

  it('leaves converter custom-XML state unchanged when the compound mutation rolls back', () => {
    const partId = 'customXml/item1.xml';
    const originalPart = { type: 'element', name: 'original-root', elements: [] };
    const expectedOriginalPart = structuredClone(originalPart);
    const nextPart = { type: 'element', name: 'next-root', elements: [] };
    const originalRemoved = new Set(['customXml/original-deleted.xml']);
    const originalBibliography = { partPath: 'customXml/original.xml', cached: true };
    const nextRemoved = new Set(['customXml/next-deleted.xml']);
    const nextBibliography = { partPath: partId, cached: false };
    const converter = converterOf(editor);

    withPart(editor, partId, originalPart);
    converter.removedCustomXmlPaths = originalRemoved;
    converter.bibliographyPart = originalBibliography;
    compoundMockState.forceRollback = true;

    const prepared = prepareCustomXmlPartMutation(
      asEditor(editor),
      (convertedXml, sandbox) => {
        convertedXml[partId] = nextPart;
        sandbox.removedCustomXmlPaths = nextRemoved;
        sandbox.bibliographyPart = nextBibliography;
        return 'rollback-result';
      },
      'customXml.parts.test',
    );

    const result = commitPreparedCustomXmlPartMutation(asEditor(editor), prepared, {
      source: 'customXml.parts.test',
    });

    expect(result).toBe('rollback-result');
    expect(converter.convertedXml[partId]).toEqual(expectedOriginalPart);
    expect(converter.removedCustomXmlPaths).toBe(originalRemoved);
    expect(converter.removedCustomXmlPaths).toEqual(new Set(['customXml/original-deleted.xml']));
    expect(converter.bibliographyPart).toBe(originalBibliography);
  });

  it('updates converter custom-XML state after a successful compound mutation', () => {
    const partId = 'customXml/item1.xml';
    const originalPart = { type: 'element', name: 'original-root', elements: [] };
    const nextPart = { type: 'element', name: 'next-root', elements: [] };
    const nextRemoved = new Set(['customXml/next-deleted.xml']);
    const nextBibliography = { partPath: partId, cached: false };
    const converter = converterOf(editor);

    withPart(editor, partId, originalPart);

    const prepared = prepareCustomXmlPartMutation(
      asEditor(editor),
      (convertedXml, sandbox) => {
        convertedXml[partId] = nextPart;
        sandbox.removedCustomXmlPaths = nextRemoved;
        sandbox.bibliographyPart = nextBibliography;
        return { success: true };
      },
      'customXml.parts.test',
    );

    const result = commitPreparedCustomXmlPartMutation(asEditor(editor), prepared, {
      source: 'customXml.parts.test',
    });

    expect(result).toEqual({ success: true });
    expect(converter.convertedXml[partId]).toEqual(nextPart);
    expect(converter.removedCustomXmlPaths).toEqual(nextRemoved);
    expect(converter.removedCustomXmlPaths).not.toBe(nextRemoved);
    expect(converter.bibliographyPart).toEqual(nextBibliography);
    expect(converter.bibliographyPart).not.toBe(nextBibliography);
  });

  it('does not half-apply converter state when bibliography cloning fails', () => {
    const originalRemoved = new Set(['customXml/original-deleted.xml']);
    const originalBibliography = { partPath: 'customXml/original.xml', cached: true };
    const converter = converterOf(editor);
    converter.removedCustomXmlPaths = originalRemoved;
    converter.bibliographyPart = originalBibliography;

    const prepared: PreparedCustomXmlPartMutation<string> = {
      result: 'unreachable',
      operations: [],
      affectedParts: [],
      removedCustomXmlPaths: new Set(['customXml/next-deleted.xml']),
      bibliographyPart: () => undefined,
      hasBibliographyPart: true,
    };

    expect(() =>
      commitPreparedCustomXmlPartMutation(asEditor(editor), prepared, {
        source: 'customXml.parts.test',
      }),
    ).toThrow();

    expect(converter.removedCustomXmlPaths).toBe(originalRemoved);
    expect(converter.removedCustomXmlPaths).toEqual(new Set(['customXml/original-deleted.xml']));
    expect(converter.bibliographyPart).toBe(originalBibliography);
  });
});
