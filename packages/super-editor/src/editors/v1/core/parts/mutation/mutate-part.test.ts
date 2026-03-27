import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mutatePart, mutateParts } from './mutate-part.js';
import { createTestEditor, withPart, withDescriptor, cleanupParts } from '../testing/test-helpers.js';
import { registerPartDescriptor, clearPartDescriptors } from '../registry/part-registry.js';
import { registerInvalidationHandler, clearInvalidationHandlers } from '../invalidation/part-invalidation-registry.js';
import { initRevision, getRevision } from '../../../document-api-adapters/plan-engine/revision-tracker.js';
import type { Editor } from '../../Editor.js';
import type { PartId, PartChangedEvent, MutatePartRequest } from '../types.js';

function asEditor(mock: ReturnType<typeof createTestEditor>): Editor {
  return mock as unknown as Editor;
}

describe('mutatePart', () => {
  let editor: ReturnType<typeof createTestEditor>;

  beforeEach(() => {
    editor = createTestEditor();
    initRevision(asEditor(editor));
  });

  afterEach(() => {
    cleanupParts();
  });

  // -----------------------------------------------------------------------
  // Mutate operation
  // -----------------------------------------------------------------------

  describe('mutate operation', () => {
    it('mutates an existing part in-place', () => {
      withPart(editor, 'word/styles.xml', { elements: [{ name: 'w:styles' }] });

      const result = mutatePart({
        editor: asEditor(editor),
        partId: 'word/styles.xml',
        operation: 'mutate',
        source: 'test',
        mutate({ part }) {
          (part as Record<string, unknown>).modified = true;
          return 'ok';
        },
      });

      expect(result.changed).toBe(true);
      expect(result.changedPaths.length).toBeGreaterThan(0);
      expect(editor.converter.convertedXml['word/styles.xml']).toHaveProperty('modified', true);
    });

    it('returns changed: false when mutation is a no-op', () => {
      withPart(editor, 'word/styles.xml', { value: 42 });

      const result = mutatePart({
        editor: asEditor(editor),
        partId: 'word/styles.xml',
        operation: 'mutate',
        source: 'test',
        mutate() {
          // No changes
          return 'noop';
        },
      });

      expect(result.changed).toBe(false);
      expect(result.changedPaths).toEqual([]);
    });

    it('uses ensurePart when part does not exist', () => {
      registerPartDescriptor({
        id: 'word/styles.xml',
        ensurePart: () => ({ elements: [] }),
      });

      const result = mutatePart({
        editor: asEditor(editor),
        partId: 'word/styles.xml',
        operation: 'mutate',
        source: 'test',
        mutate({ part }) {
          (part as { elements: unknown[] }).elements.push({ name: 'new' });
        },
      });

      expect(result.changed).toBe(true);
      expect(editor.converter.convertedXml['word/styles.xml']).toBeDefined();
    });

    it('throws when part does not exist and no descriptor', () => {
      expect(() =>
        mutatePart({
          editor: asEditor(editor),
          partId: 'word/styles.xml',
          operation: 'mutate',
          source: 'test',
          mutate() {},
        }),
      ).toThrow('does not exist');
    });
  });

  // -----------------------------------------------------------------------
  // Create operation
  // -----------------------------------------------------------------------

  describe('create operation', () => {
    it('creates a new part', () => {
      const result = mutatePart({
        editor: asEditor(editor),
        partId: 'word/header1.xml',
        operation: 'create',
        source: 'test',
        initial: { elements: [{ name: 'w:hdr' }] },
      });

      expect(result.changed).toBe(true);
      expect(editor.converter.convertedXml['word/header1.xml']).toBeDefined();
    });

    it('throws when part already exists', () => {
      withPart(editor, 'word/header1.xml', { existing: true });

      expect(() =>
        mutatePart({
          editor: asEditor(editor),
          partId: 'word/header1.xml',
          operation: 'create',
          source: 'test',
          initial: { elements: [] },
        }),
      ).toThrow('already exists');
    });

    it('does not retain caller references (clone on create)', () => {
      const initial = { elements: [{ name: 'w:hdr' }] };

      mutatePart({
        editor: asEditor(editor),
        partId: 'word/header1.xml',
        operation: 'create',
        source: 'test',
        initial,
      });

      initial.elements.push({ name: 'injected' });

      const stored = editor.converter.convertedXml['word/header1.xml'] as typeof initial;
      expect(stored.elements).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Delete operation
  // -----------------------------------------------------------------------

  describe('delete operation', () => {
    it('removes an existing part', () => {
      withPart(editor, 'word/header1.xml', { elements: [] });

      const result = mutatePart({
        editor: asEditor(editor),
        partId: 'word/header1.xml',
        operation: 'delete',
        source: 'test',
      });

      expect(result.changed).toBe(true);
      expect(editor.converter.convertedXml['word/header1.xml']).toBeUndefined();
    });

    it('throws when part does not exist', () => {
      expect(() =>
        mutatePart({
          editor: asEditor(editor),
          partId: 'word/header1.xml',
          operation: 'delete',
          source: 'test',
        }),
      ).toThrow('does not exist');
    });

    it('runs onDelete hook before removal', () => {
      withPart(editor, 'word/header1.xml', { elements: [] });

      const onDelete = vi.fn();
      registerPartDescriptor({
        id: 'word/header1.xml',
        ensurePart: () => ({ elements: [] }),
        onDelete,
      });

      mutatePart({
        editor: asEditor(editor),
        partId: 'word/header1.xml',
        operation: 'delete',
        source: 'test',
      });

      expect(onDelete).toHaveBeenCalledOnce();
      expect(onDelete.mock.calls[0][0].partId).toBe('word/header1.xml');
    });
  });

  // -----------------------------------------------------------------------
  // Dry-run semantics
  // -----------------------------------------------------------------------

  describe('dry-run', () => {
    it('does not persist changes on dry-run mutate', () => {
      withPart(editor, 'word/styles.xml', { value: 1 });

      const result = mutatePart({
        editor: asEditor(editor),
        partId: 'word/styles.xml',
        operation: 'mutate',
        source: 'test',
        dryRun: true,
        mutate({ part }) {
          (part as Record<string, unknown>).value = 2;
        },
      });

      expect(result.changed).toBe(true);
      expect((editor.converter.convertedXml['word/styles.xml'] as Record<string, unknown>).value).toBe(1);
    });

    it('does not persist changes on dry-run create', () => {
      const result = mutatePart({
        editor: asEditor(editor),
        partId: 'word/header1.xml',
        operation: 'create',
        source: 'test',
        dryRun: true,
        initial: { elements: [] },
      });

      expect(result.changed).toBe(true);
      expect(editor.converter.convertedXml['word/header1.xml']).toBeUndefined();
    });

    it('does not emit partChanged on dry-run', () => {
      withPart(editor, 'word/styles.xml', { value: 1 });
      const handler = vi.fn();
      editor.on('partChanged', handler);

      mutatePart({
        editor: asEditor(editor),
        partId: 'word/styles.xml',
        operation: 'mutate',
        source: 'test',
        dryRun: true,
        mutate({ part }) {
          (part as Record<string, unknown>).value = 2;
        },
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('does not mark converter as modified on dry-run', () => {
      withPart(editor, 'word/styles.xml', { value: 1 });

      mutatePart({
        editor: asEditor(editor),
        partId: 'word/styles.xml',
        operation: 'mutate',
        source: 'test',
        dryRun: true,
        mutate({ part }) {
          (part as Record<string, unknown>).value = 2;
        },
      });

      expect(editor.converter.documentModified).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Lifecycle side effects
  // -----------------------------------------------------------------------

  describe('lifecycle', () => {
    it('marks converter.documentModified on changed mutation', () => {
      withPart(editor, 'word/styles.xml', { value: 1 });

      mutatePart({
        editor: asEditor(editor),
        partId: 'word/styles.xml',
        operation: 'mutate',
        source: 'test',
        mutate({ part }) {
          (part as Record<string, unknown>).value = 2;
        },
      });

      expect(editor.converter.documentModified).toBe(true);
    });

    it('does not mark converter.documentModified on no-op', () => {
      withPart(editor, 'word/styles.xml', { value: 1 });

      mutatePart({
        editor: asEditor(editor),
        partId: 'word/styles.xml',
        operation: 'mutate',
        source: 'test',
        mutate() {},
      });

      expect(editor.converter.documentModified).toBe(false);
    });

    it('increments revision on changed mutation', () => {
      withPart(editor, 'word/styles.xml', { value: 1 });
      const before = getRevision(asEditor(editor));

      mutatePart({
        editor: asEditor(editor),
        partId: 'word/styles.xml',
        operation: 'mutate',
        source: 'test',
        mutate({ part }) {
          (part as Record<string, unknown>).value = 2;
        },
      });

      expect(getRevision(asEditor(editor))).not.toBe(before);
    });

    it('does not increment revision on no-op', () => {
      withPart(editor, 'word/styles.xml', { value: 1 });
      const before = getRevision(asEditor(editor));

      mutatePart({
        editor: asEditor(editor),
        partId: 'word/styles.xml',
        operation: 'mutate',
        source: 'test',
        mutate() {},
      });

      expect(getRevision(asEditor(editor))).toBe(before);
    });

    it('promotes GUID if unset', () => {
      editor.converter.documentGuid = null;
      withPart(editor, 'word/styles.xml', { value: 1 });

      mutatePart({
        editor: asEditor(editor),
        partId: 'word/styles.xml',
        operation: 'mutate',
        source: 'test',
        mutate({ part }) {
          (part as Record<string, unknown>).value = 2;
        },
      });

      expect(editor.converter.documentGuid).toBe('promoted-guid');
    });
  });

  // -----------------------------------------------------------------------
  // Event emission
  // -----------------------------------------------------------------------

  describe('events', () => {
    it('emits exactly one partChanged event per mutation', () => {
      withPart(editor, 'word/styles.xml', { value: 1 });
      const handler = vi.fn();
      editor.on('partChanged', handler);

      mutatePart({
        editor: asEditor(editor),
        partId: 'word/styles.xml',
        operation: 'mutate',
        source: 'test.source',
        mutate({ part }) {
          (part as Record<string, unknown>).value = 2;
        },
      });

      expect(handler).toHaveBeenCalledOnce();
      const event = handler.mock.calls[0][0] as PartChangedEvent;
      expect(event.source).toBe('test.source');
      expect(event.parts).toHaveLength(1);
      expect(event.parts[0].partId).toBe('word/styles.xml');
      expect(event.parts[0].operation).toBe('mutate');
    });

    it('does not emit on no-op', () => {
      withPart(editor, 'word/styles.xml', { value: 1 });
      const handler = vi.fn();
      editor.on('partChanged', handler);

      mutatePart({
        editor: asEditor(editor),
        partId: 'word/styles.xml',
        operation: 'mutate',
        source: 'test',
        mutate() {},
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Descriptor hooks
  // -----------------------------------------------------------------------

  describe('descriptor hooks', () => {
    it('runs afterCommit on changed mutation', () => {
      const afterCommit = vi.fn();
      registerPartDescriptor({
        id: 'word/styles.xml',
        ensurePart: () => ({ elements: [] }),
        afterCommit,
      });

      withPart(editor, 'word/styles.xml', { value: 1 });

      mutatePart({
        editor: asEditor(editor),
        partId: 'word/styles.xml',
        operation: 'mutate',
        source: 'test',
        mutate({ part }) {
          (part as Record<string, unknown>).value = 2;
        },
      });

      expect(afterCommit).toHaveBeenCalledOnce();
    });

    it('does not run afterCommit on no-op', () => {
      const afterCommit = vi.fn();
      registerPartDescriptor({
        id: 'word/styles.xml',
        ensurePart: () => ({ elements: [] }),
        afterCommit,
      });

      withPart(editor, 'word/styles.xml', { value: 1 });

      mutatePart({
        editor: asEditor(editor),
        partId: 'word/styles.xml',
        operation: 'mutate',
        source: 'test',
        mutate() {},
      });

      expect(afterCommit).not.toHaveBeenCalled();
    });

    it('runs normalizePart during mutate', () => {
      registerPartDescriptor({
        id: 'word/styles.xml',
        ensurePart: () => ({ sorted: false }),
        normalizePart(part: unknown) {
          (part as Record<string, unknown>).sorted = true;
          return part;
        },
      });

      withPart(editor, 'word/styles.xml', { sorted: false });

      mutatePart({
        editor: asEditor(editor),
        partId: 'word/styles.xml',
        operation: 'mutate',
        source: 'test',
        mutate({ part }) {
          (part as Record<string, unknown>).data = 'new';
        },
      });

      const stored = editor.converter.convertedXml['word/styles.xml'] as Record<string, unknown>;
      expect(stored.sorted).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Rollback on failure
  // -----------------------------------------------------------------------

  describe('rollback', () => {
    it('rolls back on mutate callback failure', () => {
      withPart(editor, 'word/styles.xml', { value: 'original' });

      expect(() =>
        mutatePart({
          editor: asEditor(editor),
          partId: 'word/styles.xml',
          operation: 'mutate',
          source: 'test',
          mutate({ part }) {
            (part as Record<string, unknown>).value = 'modified';
            throw new Error('Callback failed');
          },
        }),
      ).toThrow('Callback failed');

      expect((editor.converter.convertedXml['word/styles.xml'] as Record<string, unknown>).value).toBe('original');
    });

    it('rolls back on normalizePart failure', () => {
      registerPartDescriptor({
        id: 'word/styles.xml',
        ensurePart: () => ({}),
        normalizePart() {
          throw new Error('Normalize failed');
        },
      });

      withPart(editor, 'word/styles.xml', { value: 'original' });

      expect(() =>
        mutatePart({
          editor: asEditor(editor),
          partId: 'word/styles.xml',
          operation: 'mutate',
          source: 'test',
          mutate({ part }) {
            (part as Record<string, unknown>).value = 'modified';
          },
        }),
      ).toThrow('Normalize failed');

      expect((editor.converter.convertedXml['word/styles.xml'] as Record<string, unknown>).value).toBe('original');
    });
  });

  // -----------------------------------------------------------------------
  // Invalidation
  // -----------------------------------------------------------------------

  describe('invalidation', () => {
    it('runs invalidation handler after event emission', () => {
      withPart(editor, 'word/styles.xml', { value: 1 });
      const handler = vi.fn();
      registerInvalidationHandler('word/styles.xml', handler);

      mutatePart({
        editor: asEditor(editor),
        partId: 'word/styles.xml',
        operation: 'mutate',
        source: 'test',
        mutate({ part }) {
          (part as Record<string, unknown>).value = 2;
        },
      });

      expect(handler).toHaveBeenCalledOnce();
    });

    it('does not run invalidation on no-op', () => {
      withPart(editor, 'word/styles.xml', { value: 1 });
      const handler = vi.fn();
      registerInvalidationHandler('word/styles.xml', handler);

      mutatePart({
        editor: asEditor(editor),
        partId: 'word/styles.xml',
        operation: 'mutate',
        source: 'test',
        mutate() {},
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Multi-part transactions
// ---------------------------------------------------------------------------

describe('mutateParts', () => {
  let editor: ReturnType<typeof createTestEditor>;

  beforeEach(() => {
    editor = createTestEditor();
    initRevision(asEditor(editor));
  });

  afterEach(() => {
    cleanupParts();
  });

  it('executes multiple operations atomically', () => {
    withPart(editor, 'word/styles.xml', { value: 1 });

    const result = mutateParts({
      editor: asEditor(editor),
      source: 'test',
      operations: [
        {
          editor: asEditor(editor),
          partId: 'word/styles.xml',
          operation: 'mutate',
          source: 'test',
          mutate({ part }) {
            (part as Record<string, unknown>).value = 2;
          },
        },
        {
          editor: asEditor(editor),
          partId: 'word/header1.xml',
          operation: 'create',
          source: 'test',
          initial: { elements: [] },
        },
      ],
    });

    expect(result.changed).toBe(true);
    expect(result.parts).toHaveLength(2);
    expect(result.parts[0].operation).toBe('mutate');
    expect(result.parts[1].operation).toBe('create');
  });

  it('emits exactly one event for multi-part transaction', () => {
    withPart(editor, 'word/styles.xml', { value: 1 });
    const handler = vi.fn();
    editor.on('partChanged', handler);

    mutateParts({
      editor: asEditor(editor),
      source: 'test.multi',
      operations: [
        {
          editor: asEditor(editor),
          partId: 'word/styles.xml',
          operation: 'mutate',
          source: 'test',
          mutate({ part }) {
            (part as Record<string, unknown>).value = 2;
          },
        },
        {
          editor: asEditor(editor),
          partId: 'word/header1.xml',
          operation: 'create',
          source: 'test',
          initial: { elements: [] },
        },
      ],
    });

    expect(handler).toHaveBeenCalledOnce();
    const event = handler.mock.calls[0][0] as PartChangedEvent;
    expect(event.parts).toHaveLength(2);
    expect(event.source).toBe('test.multi');
  });

  it('rolls back all parts when a later operation fails', () => {
    withPart(editor, 'word/styles.xml', { value: 'original' });

    expect(() =>
      mutateParts({
        editor: asEditor(editor),
        source: 'test',
        operations: [
          {
            editor: asEditor(editor),
            partId: 'word/styles.xml',
            operation: 'mutate',
            source: 'test',
            mutate({ part }) {
              (part as Record<string, unknown>).value = 'modified';
            },
          },
          {
            editor: asEditor(editor),
            partId: 'word/header1.xml',
            operation: 'create',
            source: 'test',
            initial: { elements: [] },
          },
          {
            editor: asEditor(editor),
            partId: 'word/missing.xml',
            operation: 'mutate',
            source: 'test',
            mutate() {},
          },
        ],
      }),
    ).toThrow();

    // Both earlier operations should be rolled back
    expect((editor.converter.convertedXml['word/styles.xml'] as Record<string, unknown>).value).toBe('original');
    expect(editor.converter.convertedXml['word/header1.xml']).toBeUndefined();
  });

  it('increments revision exactly once for multi-part transaction', () => {
    withPart(editor, 'word/styles.xml', { value: 1 });
    const before = getRevision(asEditor(editor));

    mutateParts({
      editor: asEditor(editor),
      source: 'test',
      operations: [
        {
          editor: asEditor(editor),
          partId: 'word/styles.xml',
          operation: 'mutate',
          source: 'test',
          mutate({ part }) {
            (part as Record<string, unknown>).value = 2;
          },
        },
        {
          editor: asEditor(editor),
          partId: 'word/header1.xml',
          operation: 'create',
          source: 'test',
          initial: { elements: [] },
        },
      ],
    });

    const after = getRevision(asEditor(editor));
    expect(Number(after) - Number(before)).toBe(1);
  });

  it('returns empty result for empty operations', () => {
    const result = mutateParts({
      editor: asEditor(editor),
      source: 'test',
      operations: [],
    });

    expect(result.changed).toBe(false);
    expect(result.parts).toEqual([]);
  });

  it('preserves input order in result and event', () => {
    const handler = vi.fn();
    editor.on('partChanged', handler);

    mutateParts({
      editor: asEditor(editor),
      source: 'test',
      operations: [
        {
          editor: asEditor(editor),
          partId: 'word/header1.xml',
          operation: 'create',
          source: 'test',
          initial: { order: 1 },
        },
        {
          editor: asEditor(editor),
          partId: 'word/header2.xml',
          operation: 'create',
          source: 'test',
          initial: { order: 2 },
        },
      ],
    });

    const event = handler.mock.calls[0][0] as PartChangedEvent;
    expect(event.parts[0].partId).toBe('word/header1.xml');
    expect(event.parts[1].partId).toBe('word/header2.xml');
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('idempotency', () => {
  let editor: ReturnType<typeof createTestEditor>;

  beforeEach(() => {
    editor = createTestEditor();
    initRevision(asEditor(editor));
  });

  afterEach(() => {
    cleanupParts();
  });

  it('second identical mutation returns changed: false', () => {
    withPart(editor, 'word/styles.xml', { value: 1 });

    const mutate = ({ part }: { part: unknown }) => {
      (part as Record<string, unknown>).value = 2;
    };

    mutatePart({
      editor: asEditor(editor),
      partId: 'word/styles.xml',
      operation: 'mutate',
      source: 'test',
      mutate,
    });

    const result = mutatePart({
      editor: asEditor(editor),
      partId: 'word/styles.xml',
      operation: 'mutate',
      source: 'test',
      mutate,
    });

    expect(result.changed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Duplicate-partId rollback (Finding 1)
// ---------------------------------------------------------------------------

describe('rollback with duplicate partIds', () => {
  let editor: ReturnType<typeof createTestEditor>;

  beforeEach(() => {
    editor = createTestEditor();
    initRevision(asEditor(editor));
  });

  afterEach(() => {
    cleanupParts();
  });

  it('restores original state when same partId is mutated twice before a failure', () => {
    withPart(editor, 'word/styles.xml', { value: 0 });

    expect(() =>
      mutateParts({
        editor: asEditor(editor),
        source: 'test',
        operations: [
          {
            editor: asEditor(editor),
            partId: 'word/styles.xml',
            operation: 'mutate',
            source: 'test',
            mutate({ part }) {
              (part as Record<string, unknown>).value = 1;
            },
          },
          {
            editor: asEditor(editor),
            partId: 'word/styles.xml',
            operation: 'mutate',
            source: 'test',
            mutate({ part }) {
              (part as Record<string, unknown>).value = 2;
            },
          },
          {
            editor: asEditor(editor),
            partId: 'word/missing.xml',
            operation: 'mutate',
            source: 'test',
            mutate() {},
          },
        ],
      }),
    ).toThrow();

    expect((editor.converter.convertedXml['word/styles.xml'] as Record<string, unknown>).value).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Degraded result surface (Finding 2)
// ---------------------------------------------------------------------------

describe('degraded afterCommit', () => {
  let editor: ReturnType<typeof createTestEditor>;

  beforeEach(() => {
    editor = createTestEditor();
    initRevision(asEditor(editor));
  });

  afterEach(() => {
    cleanupParts();
  });

  it('surfaces degraded flag when afterCommit hook throws', () => {
    registerPartDescriptor({
      id: 'word/styles.xml',
      ensurePart: () => ({ elements: [] }),
      afterCommit() {
        throw new Error('afterCommit failed');
      },
    });

    withPart(editor, 'word/styles.xml', { value: 1 });

    const result = mutatePart({
      editor: asEditor(editor),
      partId: 'word/styles.xml',
      operation: 'mutate',
      source: 'test',
      mutate({ part }) {
        (part as Record<string, unknown>).value = 2;
      },
    });

    expect(result.changed).toBe(true);
    expect(result.degraded).toBe(true);
  });

  it('returns degraded: false on normal mutation', () => {
    withPart(editor, 'word/styles.xml', { value: 1 });

    const result = mutatePart({
      editor: asEditor(editor),
      partId: 'word/styles.xml',
      operation: 'mutate',
      source: 'test',
      mutate({ part }) {
        (part as Record<string, unknown>).value = 2;
      },
    });

    expect(result.degraded).toBe(false);
  });

  it('surfaces degraded flag in mutateParts result', () => {
    registerPartDescriptor({
      id: 'word/styles.xml',
      ensurePart: () => ({ elements: [] }),
      afterCommit() {
        throw new Error('afterCommit failed');
      },
    });

    withPart(editor, 'word/styles.xml', { value: 1 });

    const result = mutateParts({
      editor: asEditor(editor),
      source: 'test',
      operations: [
        {
          editor: asEditor(editor),
          partId: 'word/styles.xml',
          operation: 'mutate',
          source: 'test',
          mutate({ part }) {
            (part as Record<string, unknown>).value = 2;
          },
        },
      ],
    });

    expect(result.changed).toBe(true);
    expect(result.degraded).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Listener isolation (Finding 3)
// ---------------------------------------------------------------------------

describe('listener isolation', () => {
  let editor: ReturnType<typeof createTestEditor>;

  beforeEach(() => {
    editor = createTestEditor();
    initRevision(asEditor(editor));
  });

  afterEach(() => {
    cleanupParts();
  });

  it('does not throw when partChanged listener throws', () => {
    withPart(editor, 'word/styles.xml', { value: 1 });
    editor.on('partChanged', () => {
      throw new Error('listener exploded');
    });

    expect(() =>
      mutatePart({
        editor: asEditor(editor),
        partId: 'word/styles.xml',
        operation: 'mutate',
        source: 'test',
        mutate({ part }) {
          (part as Record<string, unknown>).value = 2;
        },
      }),
    ).not.toThrow();
  });

  it('invokes all listeners even when an earlier listener throws', () => {
    withPart(editor, 'word/styles.xml', { value: 1 });
    editor.on('partChanged', () => {
      throw new Error('first listener exploded');
    });
    const secondListener = vi.fn();
    editor.on('partChanged', secondListener);

    mutatePart({
      editor: asEditor(editor),
      partId: 'word/styles.xml',
      operation: 'mutate',
      source: 'test',
      mutate({ part }) {
        (part as Record<string, unknown>).value = 2;
      },
    });

    expect(secondListener).toHaveBeenCalledOnce();
  });

  it('still runs invalidation when partChanged listener throws', () => {
    withPart(editor, 'word/styles.xml', { value: 1 });
    editor.on('partChanged', () => {
      throw new Error('listener exploded');
    });
    const invalidationHandler = vi.fn();
    registerInvalidationHandler('word/styles.xml', invalidationHandler);

    mutatePart({
      editor: asEditor(editor),
      partId: 'word/styles.xml',
      operation: 'mutate',
      source: 'test',
      mutate({ part }) {
        (part as Record<string, unknown>).value = 2;
      },
    });

    expect(invalidationHandler).toHaveBeenCalledOnce();
  });
});
