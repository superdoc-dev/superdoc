import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import type { Editor } from '../../core/Editor.js';
import { insertStructuredWrapper } from './plan-wrappers.js';
import { registerBuiltInExecutors } from './register-executors.js';
import { clearExecutorRegistry } from './executor-registry.js';
import { resolveTextTarget } from '../helpers/adapter-utils.js';

let docData: Awaited<ReturnType<typeof loadTestDataForEditorTests>>;

beforeAll(async () => {
  docData = await loadTestDataForEditorTests('blank-doc.docx');
  clearExecutorRegistry();
  registerBuiltInExecutors();
});

let editor: Editor;

beforeEach(() => {
  ({ editor } = initTestEditor({
    content: docData.docx,
    media: docData.media,
    mediaFiles: docData.mediaFiles,
    fonts: docData.fonts,
  }));
});

afterEach(() => {
  editor?.destroy();
  // @ts-expect-error cleanup
  editor = null;
});

function getDocTextContent(ed: Editor): string {
  return ed.state.doc.textContent;
}

/** Requires prior seeded content — a blank doc has no text offsets to span. */
function findResolvableNonCollapsedTarget(ed: Editor): { blockId: string; range: { start: number; end: number } } {
  const candidateIds = new Set<string>();
  const identityKeys = ['sdBlockId', 'blockId', 'paraId', 'id', 'uuid'] as const;

  ed.state.doc.descendants((node) => {
    const attrs = node.attrs as Record<string, unknown> | undefined;
    if (!attrs) return true;

    for (const key of identityKeys) {
      const value = attrs[key];
      if (typeof value === 'string' && value.length > 0) candidateIds.add(value);
    }
    return true;
  });

  for (const blockId of candidateIds) {
    const target = {
      kind: 'text' as const,
      blockId,
      range: { start: 0, end: 1 },
    };
    const resolved = resolveTextTarget(ed, target);
    if (resolved && resolved.from !== resolved.to) {
      return { blockId, range: { start: 0, end: 1 } };
    }
  }

  throw new Error('Expected at least one resolvable non-collapsed text target.');
}

describe('insertStructuredWrapper — markdown', () => {
  it('inserts markdown paragraph content into the document', () => {
    const result = insertStructuredWrapper(editor, {
      value: 'Hello from markdown',
      type: 'markdown',
    });

    expect(result.success).toBe(true);
    expect(getDocTextContent(editor)).toContain('Hello from markdown');
  });

  it('inserts markdown heading as a styled paragraph', () => {
    const result = insertStructuredWrapper(editor, {
      value: '# My Heading',
      type: 'markdown',
    });

    expect(result.success).toBe(true);
    expect(getDocTextContent(editor)).toContain('My Heading');

    // Verify heading is represented as a paragraph with Heading1 style
    let foundHeading = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'paragraph' && node.attrs?.paragraphProperties?.styleId === 'Heading1') {
        foundHeading = true;
      }
      return true;
    });
    expect(foundHeading).toBe(true);
  });

  it('inserts markdown with multiple blocks', () => {
    const result = insertStructuredWrapper(editor, {
      value: '# Title\n\nFirst paragraph.\n\nSecond paragraph.',
      type: 'markdown',
    });

    expect(result.success).toBe(true);
    expect(getDocTextContent(editor)).toContain('Title');
    expect(getDocTextContent(editor)).toContain('First paragraph.');
    expect(getDocTextContent(editor)).toContain('Second paragraph.');
  });

  it('inserts markdown list content', () => {
    const result = insertStructuredWrapper(editor, {
      value: '- Item one\n- Item two\n- Item three',
      type: 'markdown',
    });

    expect(result.success).toBe(true);
    expect(getDocTextContent(editor)).toContain('Item one');
    expect(getDocTextContent(editor)).toContain('Item two');
    expect(getDocTextContent(editor)).toContain('Item three');
  });

  it('returns NO_OP for empty markdown', () => {
    const result = insertStructuredWrapper(editor, {
      value: '',
      type: 'markdown',
    });

    expect(result.success).toBe(false);
    expect(result.failure?.code).toBe('NO_OP');
  });

  it('returns INVALID_TARGET for non-collapsed targets instead of replacing selected text', () => {
    const seed = insertStructuredWrapper(editor, {
      value: 'abcdef',
      type: 'markdown',
    });
    expect(seed.success).toBe(true);

    const textBefore = getDocTextContent(editor);
    const target = findResolvableNonCollapsedTarget(editor);

    const result = insertStructuredWrapper(editor, {
      value: 'X',
      type: 'markdown',
      target: { kind: 'text', ...target },
    });

    expect(result.success).toBe(false);
    expect(result.failure?.code).toBe('INVALID_TARGET');
    expect(getDocTextContent(editor)).toBe(textBefore);
  });
});

describe('insertStructuredWrapper — list numbering rollback', () => {
  it('rolls back numbering allocations when insertContentAt fails after markdown parsing', () => {
    // This test exercises the actual rollback branch: markdown with list
    // syntax is parsed (allocating numbering IDs on editor.converter), then
    // insertContentAt is forced to fail, and we verify the snapshot/restore
    // reverts numbering state to its pre-insert value.
    const converter = (editor as any).converter;

    // Capture numbering state before the insert attempt.
    const numberingBefore = JSON.stringify(converter?.numbering ?? {});
    const translatedBefore = JSON.stringify(converter?.translatedNumbering ?? {});

    // Shadow both view.dispatch and editor.dispatch with undefined so that
    // CommandService's #dispatchWithFallback returns false (no dispatch
    // method available). This causes insertContentAt to return false AFTER
    // markdown parsing has already allocated numbering IDs on the converter.
    const view = (editor as any).view;
    if (view) {
      Object.defineProperty(view, 'dispatch', { value: undefined, configurable: true });
    }
    Object.defineProperty(editor, 'dispatch', { value: undefined, configurable: true });

    try {
      const result = insertStructuredWrapper(editor, {
        value: '- List item that allocates numbering',
        type: 'markdown',
      });

      expect(result.success).toBe(false);
      expect(result.failure?.code).toBe('INVALID_TARGET');

      // The markdown parsing allocated numbering IDs, but rollback should
      // have restored converter state to the pre-insert snapshot.
      expect(JSON.stringify(converter?.numbering ?? {})).toBe(numberingBefore);
      expect(JSON.stringify(converter?.translatedNumbering ?? {})).toBe(translatedBefore);
    } finally {
      // Remove own-property shadows to restore prototype methods.
      if (view) delete view.dispatch;
      delete (editor as any).dispatch;
    }
  });

  it('does not roll back numbering on successful list insert', () => {
    const converter = (editor as any).converter;

    const numberingBefore = JSON.stringify(converter?.numbering ?? {});

    const result = insertStructuredWrapper(editor, {
      value: '- Successfully inserted list item',
      type: 'markdown',
    });

    expect(result.success).toBe(true);
    // Numbering state should have changed (new list ID allocated).
    expect(JSON.stringify(converter?.numbering ?? {})).not.toBe(numberingBefore);
  });
});

describe('insertStructuredWrapper — html', () => {
  it('inserts HTML content into the document', () => {
    const result = insertStructuredWrapper(editor, {
      value: '<p>Hello from HTML</p>',
      type: 'html',
    });

    expect(result.success).toBe(true);
    expect(getDocTextContent(editor)).toContain('Hello from HTML');
  });
});

describe('insertStructuredWrapper — dry-run', () => {
  it('does not mutate document on dry-run markdown insert', () => {
    const textBefore = getDocTextContent(editor);

    const result = insertStructuredWrapper(
      editor,
      { value: '# Should Not Appear', type: 'markdown' },
      { dryRun: true },
    );

    expect(result.success).toBe(true);
    expect(getDocTextContent(editor)).toBe(textBefore);
  });

  it('mirrors runtime failure for empty markdown in dry-run mode', () => {
    const runtime = insertStructuredWrapper(editor, {
      value: '',
      type: 'markdown',
    });
    expect(runtime.success).toBe(false);
    expect(runtime.failure?.code).toBe('NO_OP');

    const dryRun = insertStructuredWrapper(
      editor,
      {
        value: '',
        type: 'markdown',
      },
      { dryRun: true },
    );

    expect(dryRun.success).toBe(false);
    expect(dryRun.failure?.code).toBe('NO_OP');
  });

  it('does not mutate numbering state on dry-run html list insert', () => {
    const converter = (editor as any).converter;
    expect(converter).toBeDefined();

    const numberingBefore = JSON.stringify(converter?.numbering ?? {});
    const translatedBefore = JSON.stringify(converter?.translatedNumbering ?? {});

    const dryRun = insertStructuredWrapper(
      editor,
      {
        value: '<ol><li>Dry run list item</li></ol>',
        type: 'html',
      },
      { dryRun: true },
    );

    expect(dryRun.success).toBe(true);
    expect(JSON.stringify(converter?.numbering ?? {})).toBe(numberingBefore);
    expect(JSON.stringify(converter?.translatedNumbering ?? {})).toBe(translatedBefore);
  });

  it('mirrors runtime environment failure for html in dry-run mode', () => {
    const opts = (editor as any).options ?? ((editor as any).options = {});
    const prevDocument = opts.document;
    const prevMockDocument = opts.mockDocument;

    opts.document = undefined;
    opts.mockDocument = undefined;
    vi.stubGlobal('document', undefined as any);

    try {
      const runtime = insertStructuredWrapper(editor, {
        value: '<p>Hello from HTML</p>',
        type: 'html',
      });
      expect(runtime.success).toBe(false);
      expect(runtime.failure?.code).toBe('UNSUPPORTED_ENVIRONMENT');

      const dryRun = insertStructuredWrapper(
        editor,
        {
          value: '<p>Hello from HTML</p>',
          type: 'html',
        },
        { dryRun: true },
      );

      expect(dryRun.success).toBe(false);
      expect(dryRun.failure?.code).toBe('UNSUPPORTED_ENVIRONMENT');
    } finally {
      vi.unstubAllGlobals();
      opts.document = prevDocument;
      opts.mockDocument = prevMockDocument;
    }
  });
});
