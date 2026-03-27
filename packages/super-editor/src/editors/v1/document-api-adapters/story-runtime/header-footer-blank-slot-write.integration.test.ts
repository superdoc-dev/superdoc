import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import type { Editor } from '../../core/Editor.js';
import { getStoryRuntimeCache } from './resolve-story-runtime.js';
import { buildStoryKey } from './story-key.js';
import type { HeaderFooterKind, HeaderFooterSlotAddress, HeaderFooterSlotStoryLocator } from '@superdoc/document-api';

let docData: Awaited<ReturnType<typeof loadTestDataForEditorTests>>;
let editor: Editor;

beforeAll(async () => {
  docData = await loadTestDataForEditorTests('blank-doc.docx');
});

beforeEach(() => {
  ({ editor } = initTestEditor({
    content: docData.docx,
    media: docData.media,
    mediaFiles: docData.mediaFiles,
    fonts: docData.fonts,
    useImmediateSetTimeout: false,
  }));
});

afterEach(() => {
  editor?.destroy();
  // @ts-expect-error test cleanup
  editor = null;
});

function getFirstSectionAddress() {
  const firstSection = editor.doc.sections.list().items[0];
  if (!firstSection) {
    throw new Error('Expected a first section in the blank test document.');
  }
  return firstSection.address;
}

function createSlotTarget(kind: HeaderFooterKind): HeaderFooterSlotAddress {
  return {
    kind: 'headerFooterSlot',
    section: getFirstSectionAddress(),
    headerFooterKind: kind,
    variant: 'default',
  };
}

function createStoryLocator(
  kind: HeaderFooterKind,
  overrides: Partial<HeaderFooterSlotStoryLocator> = {},
): HeaderFooterSlotStoryLocator {
  return {
    kind: 'story',
    storyType: 'headerFooterSlot',
    section: getFirstSectionAddress(),
    headerFooterKind: kind,
    variant: 'default',
    onWrite: 'materializeIfInherited',
    ...overrides,
  };
}

describe('header/footer writes on blank docs', () => {
  it.each([
    ['header', 'Hello from a blank header'],
    ['footer', 'Hello from a blank footer'],
  ] as const)('creates a missing %s slot on first text insert', (kind, text) => {
    const slot = createSlotTarget(kind);
    const story = createStoryLocator(kind);

    expect(editor.doc.headerFooters.resolve({ target: slot }).status).toBe('none');

    const receipt = editor.doc.insert({
      in: story,
      value: text,
    });

    expect(receipt.success).toBe(true);
    expect(editor.doc.headerFooters.resolve({ target: slot }).status).toBe('explicit');
    expect(editor.doc.getText({ in: story })).toContain(text);
  });

  it('does not materialize a missing slot during dry-run insert', () => {
    const slot = createSlotTarget('header');
    const story = createStoryLocator('header');

    const preview = editor.doc.insert(
      {
        in: story,
        value: 'Preview only',
      },
      { dryRun: true },
    );

    expect(preview.success).toBe(true);
    expect(editor.doc.headerFooters.resolve({ target: slot }).status).toBe('none');
    expect(() => editor.doc.getText({ in: story })).toThrow();

    const cache = getStoryRuntimeCache(editor);
    expect(cache?.has(buildStoryKey(story)) ?? false).toBe(false);
  });

  it('does not materialize a missing slot for reads', () => {
    const slot = createSlotTarget('header');
    const story = createStoryLocator('header');

    expect(editor.doc.headerFooters.resolve({ target: slot }).status).toBe('none');
    expect(() => editor.doc.getText({ in: story })).toThrow();
    expect(editor.doc.headerFooters.resolve({ target: slot }).status).toBe('none');
  });

  it('still honors onWrite:error for a missing slot', () => {
    const slot = createSlotTarget('header');
    const story = createStoryLocator('header', { onWrite: 'error' });

    expect(() =>
      editor.doc.insert({
        in: story,
        value: 'Should fail',
      }),
    ).toThrow();

    expect(editor.doc.headerFooters.resolve({ target: slot }).status).toBe('none');
  });

  it('still honors resolution:explicit for a missing slot', () => {
    const slot = createSlotTarget('header');
    const story = createStoryLocator('header', { resolution: 'explicit' });

    expect(() =>
      editor.doc.insert({
        in: story,
        value: 'Should fail',
      }),
    ).toThrow();

    expect(editor.doc.headerFooters.resolve({ target: slot }).status).toBe('none');
  });
});
