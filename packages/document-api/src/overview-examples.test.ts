/**
 * Tests that exercise the exact code patterns shown in:
 *   - apps/docs/document-api/overview.mdx  (Common workflows + Programmatic invocation)
 *   - packages/document-api/src/README.md  (Workflow examples)
 *
 * If any of these tests break, the corresponding documentation example is wrong
 * and must be updated to match.
 */
import { describe, expect, it, vi } from 'vitest';
import { createDocumentApi } from './index.js';
import type { DocumentApiCapabilities } from './capabilities/capabilities.js';
import type { OperationId } from './contract/types.js';
import type { TextAddress } from './types/index.js';

// ---------------------------------------------------------------------------
// Shared mock-adapter factories (mirrors index.test.ts patterns)
// ---------------------------------------------------------------------------

const TEXT_TARGET: TextAddress = { kind: 'text', blockId: 'p1', range: { start: 0, end: 3 } };

function makeTextMutationReceipt(target = TEXT_TARGET) {
  return {
    success: true as const,
    resolution: {
      target,
      range: { from: 1, to: 4 },
      text: 'foo',
    },
    inserted: [{ kind: 'entity' as const, entityType: 'trackedChange' as const, entityId: 'tc-1' }],
  };
}

function makeFindAdapter() {
  return {
    find: vi.fn(() => ({
      matches: [{ kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: 'p1' }],
      total: 1,
      context: [
        {
          textRanges: [TEXT_TARGET],
        },
      ],
    })),
  };
}

function makeGetNodeAdapter() {
  return {
    getNode: vi.fn(() => ({ nodeType: 'paragraph', kind: 'block', properties: {} })),
    getNodeById: vi.fn(() => ({ nodeType: 'paragraph', kind: 'block', properties: {} })),
  };
}

function makeGetTextAdapter() {
  return { getText: vi.fn(() => 'hello') };
}

function makeInfoAdapter() {
  return {
    info: vi.fn(() => ({
      counts: { words: 0, paragraphs: 0, headings: 0, tables: 0, images: 0, comments: 0 },
      outline: [],
      capabilities: { canFind: true, canGetNode: true, canComment: true, canReplace: true },
    })),
  };
}

function makeWriteAdapter() {
  return { write: vi.fn(() => makeTextMutationReceipt()) };
}

function makeFormatAdapter() {
  return {
    bold: vi.fn(() => makeTextMutationReceipt()),
    italic: vi.fn(() => makeTextMutationReceipt()),
    underline: vi.fn(() => makeTextMutationReceipt()),
    strikethrough: vi.fn(() => makeTextMutationReceipt()),
  };
}

function makeCommentsAdapter() {
  return {
    add: vi.fn(() => ({ success: true as const })),
    edit: vi.fn(() => ({ success: true as const })),
    reply: vi.fn(() => ({ success: true as const })),
    move: vi.fn(() => ({ success: true as const })),
    resolve: vi.fn(() => ({ success: true as const })),
    remove: vi.fn(() => ({ success: true as const })),
    setInternal: vi.fn(() => ({ success: true as const })),
    setActive: vi.fn(() => ({ success: true as const })),
    goTo: vi.fn(() => ({ success: true as const })),
    get: vi.fn(() => ({
      address: { kind: 'entity' as const, entityType: 'comment' as const, entityId: 'c1' },
      commentId: 'c1',
      status: 'open' as const,
      text: 'Review this section.',
    })),
    list: vi.fn(() => ({
      matches: [
        {
          address: { kind: 'entity' as const, entityType: 'comment' as const, entityId: 'c1' },
          commentId: 'c1',
          status: 'open' as const,
          text: 'Review this section.',
        },
      ],
      total: 1,
    })),
  };
}

function makeTrackChangesAdapter() {
  return {
    list: vi.fn(() => ({ matches: [], total: 0 })),
    get: vi.fn((input: { id: string }) => ({
      address: { kind: 'entity' as const, entityType: 'trackedChange' as const, entityId: input.id },
      id: input.id,
      type: 'insert' as const,
    })),
    accept: vi.fn(() => ({ success: true as const })),
    reject: vi.fn(() => ({ success: true as const })),
    acceptAll: vi.fn(() => ({ success: true as const })),
    rejectAll: vi.fn(() => ({ success: true as const })),
  };
}

function makeCreateAdapter() {
  return {
    paragraph: vi.fn(() => ({
      success: true as const,
      paragraph: { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: 'new-p' },
      insertionPoint: { kind: 'text' as const, blockId: 'new-p', range: { start: 0, end: 0 } },
    })),
    heading: vi.fn(() => ({
      success: true as const,
      heading: { kind: 'block' as const, nodeType: 'heading' as const, nodeId: 'new-h' },
      insertionPoint: { kind: 'text' as const, blockId: 'new-h', range: { start: 0, end: 0 } },
    })),
  };
}

function makeListsAdapter() {
  return {
    list: vi.fn(() => ({
      matches: [{ kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-1' }],
      total: 1,
      items: [
        {
          address: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-1' },
          kind: 'ordered' as const,
          level: 0,
          text: 'List item',
        },
      ],
    })),
    get: vi.fn(() => ({
      address: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-1' },
      kind: 'ordered' as const,
      level: 0,
      text: 'List item',
    })),
    insert: vi.fn(() => ({
      success: true as const,
      item: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-2' },
      insertionPoint: { kind: 'text' as const, blockId: 'li-2', range: { start: 0, end: 0 } },
    })),
    setType: vi.fn(() => ({
      success: true as const,
      item: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-2' },
    })),
    indent: vi.fn(() => ({
      success: true as const,
      item: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-2' },
    })),
    outdent: vi.fn(() => ({
      success: true as const,
      item: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-1' },
    })),
    restart: vi.fn(() => ({
      success: true as const,
      item: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-1' },
    })),
    exit: vi.fn(() => ({
      success: true as const,
      paragraph: { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: 'p1' },
    })),
  };
}

function makeCapabilitiesAdapter(): { get: ReturnType<typeof vi.fn> } {
  const caps: DocumentApiCapabilities = {
    global: {
      trackChanges: { enabled: true },
      comments: { enabled: true },
      lists: { enabled: true },
      dryRun: { enabled: true },
    },
    operations: Object.fromEntries(
      [
        'find',
        'getNode',
        'getNodeById',
        'getText',
        'info',
        'insert',
        'replace',
        'delete',
        'format.bold',
        'format.italic',
        'format.underline',
        'format.strikethrough',
        'create.paragraph',
        'create.heading',
        'lists.list',
        'lists.get',
        'lists.insert',
        'lists.setType',
        'lists.indent',
        'lists.outdent',
        'lists.restart',
        'lists.exit',
        'comments.add',
        'comments.edit',
        'comments.reply',
        'comments.move',
        'comments.resolve',
        'comments.remove',
        'comments.setInternal',
        'comments.setActive',
        'comments.goTo',
        'comments.get',
        'comments.list',
        'trackChanges.list',
        'trackChanges.get',
        'trackChanges.accept',
        'trackChanges.reject',
        'trackChanges.acceptAll',
        'trackChanges.rejectAll',
        'capabilities.get',
      ].map((id) => [id, { available: true, tracked: true, dryRun: true }]),
    ) as DocumentApiCapabilities['operations'],
  };
  return { get: vi.fn(() => caps) };
}

function makeApi() {
  return createDocumentApi({
    find: makeFindAdapter(),
    getNode: makeGetNodeAdapter(),
    getText: makeGetTextAdapter(),
    info: makeInfoAdapter(),
    capabilities: makeCapabilitiesAdapter(),
    comments: makeCommentsAdapter(),
    write: makeWriteAdapter(),
    format: makeFormatAdapter(),
    trackChanges: makeTrackChangesAdapter(),
    create: makeCreateAdapter(),
    lists: makeListsAdapter(),
  });
}

// ---------------------------------------------------------------------------
// overview.mdx — "Common workflows"
// ---------------------------------------------------------------------------

describe('overview.mdx examples', () => {
  describe('Find and mutate', () => {
    // Mirrors the exact code block from overview.mdx § "Find and mutate"
    it('find text then replace it', () => {
      const doc = makeApi();

      const result = doc.find({ type: 'text', text: 'foo' });
      const target = result.context?.[0]?.textRanges?.[0];
      if (target) {
        doc.replace({ target, text: 'bar' });
      }

      expect(target).toBeDefined();
      expect(target!.kind).toBe('text');
    });
  });

  describe('Tracked-mode insert', () => {
    // Mirrors the exact code block from overview.mdx § "Tracked-mode insert"
    it('insert text with changeMode tracked', () => {
      const doc = makeApi();

      const receipt = doc.insert({ text: 'new content' }, { changeMode: 'tracked' });

      expect(receipt.resolution).toBeDefined();
      expect(receipt.resolution.target).toBeDefined();
    });
  });

  describe('Check capabilities before acting', () => {
    // Mirrors the exact code block from overview.mdx § "Check capabilities before acting"
    it('branch on capabilities', () => {
      const doc = makeApi();
      const target = TEXT_TARGET;

      const caps = doc.capabilities();

      if (caps.operations['format.bold'].available) {
        doc.format.bold({ target });
      }

      if (caps.global.trackChanges.enabled) {
        doc.insert({ text: 'tracked' }, { changeMode: 'tracked' });
      }

      // Both branches should execute with our fully-capable mock
      expect(caps.operations['format.bold'].available).toBe(true);
      expect(caps.global.trackChanges.enabled).toBe(true);
    });
  });

  describe('Dry-run preview', () => {
    // Mirrors the exact code block from overview.mdx § "Dry-run preview"
    it('insert with dryRun true', () => {
      const doc = makeApi();
      const target = TEXT_TARGET;

      const preview = doc.insert({ target, text: 'hello' }, { dryRun: true });
      // preview.success tells you whether the insert would succeed
      // preview.resolution shows the resolved target range

      expect(preview).toHaveProperty('success');
      expect(preview).toHaveProperty('resolution');
      expect(preview.resolution).toHaveProperty('target');
      expect(preview.resolution).toHaveProperty('range');
    });
  });

  describe('Programmatic invocation', () => {
    // Mirrors the exact code block from overview.mdx § "Programmatic invocation"
    it('invoke with operationId string', () => {
      const doc = makeApi();

      const result = doc.invoke({
        operationId: 'insert',
        input: { text: 'hello' },
        options: { changeMode: 'tracked' },
      });

      expect(result).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// src/README.md — "Workflow:" examples
// ---------------------------------------------------------------------------

describe('src/README.md workflow examples', () => {
  describe('Workflow: Find + Mutate', () => {
    // Mirrors the exact code block from src/README.md § "Workflow: Find + Mutate"
    it('find then replace', () => {
      const doc = makeApi();

      const result = doc.find({ type: 'text', text: 'foo' });
      const target = result.context?.[0]?.textRanges?.[0];
      if (target) {
        doc.replace({ target, text: 'bar' });
      }

      expect(target).toBeDefined();
    });
  });

  describe('Workflow: Tracked-Mode Insert', () => {
    // Mirrors the exact code block from src/README.md § "Workflow: Tracked-Mode Insert"
    it('insert in tracked mode and access receipt properties', () => {
      const doc = makeApi();

      const receipt = doc.insert({ text: 'new content' }, { changeMode: 'tracked' });
      // receipt.resolution.target contains the resolved insertion point
      // receipt.inserted contains TrackedChangeAddress entries for the new change

      expect(receipt.resolution.target).toBeDefined();
      if (receipt.success) {
        expect(receipt.inserted).toBeDefined();
      }
    });
  });

  describe('Workflow: Comment Thread Lifecycle', () => {
    // Mirrors the exact code block from src/README.md § "Workflow: Comment Thread Lifecycle"
    it('add comment, reply, then resolve', () => {
      const doc = makeApi();

      // Simulate having a find result in scope (the example assumes `result` exists)
      const result = doc.find({ type: 'text', text: 'something' });
      const target = result.context?.[0]?.textRanges?.[0];
      const addReceipt = doc.comments.add({ target: target!, text: 'Review this section.' });
      // Use the comment ID from the receipt to reply
      const comments = doc.comments.list();
      const thread = comments.matches[0];
      doc.comments.reply({ parentCommentId: thread.commentId, text: 'Looks good.' });
      doc.comments.resolve({ commentId: thread.commentId });

      expect(addReceipt.success).toBe(true);
      expect(thread.commentId).toBeDefined();
    });
  });

  describe('Workflow: List Manipulation', () => {
    // Mirrors the exact code block from src/README.md § "Workflow: List Manipulation"
    it('insert list item, set type, indent', () => {
      const doc = makeApi();

      const lists = doc.lists.list();
      const firstItem = lists.matches[0];
      const insertResult = doc.lists.insert({ target: firstItem, position: 'after', text: 'New item' });
      if (insertResult.success) {
        doc.lists.setType({ target: insertResult.item, kind: 'ordered' });
        doc.lists.indent({ target: insertResult.item });
      }

      expect(insertResult.success).toBe(true);
      if (insertResult.success) {
        expect(insertResult.item).toBeDefined();
      }
    });
  });

  describe('Workflow: Capabilities-Aware Branching', () => {
    // Mirrors the exact code block from src/README.md § "Workflow: Capabilities-Aware Branching"
    it('branch on per-operation capabilities', () => {
      const doc = makeApi();
      const target = TEXT_TARGET;

      const caps = doc.capabilities();
      if (caps.operations['format.bold'].available) {
        doc.format.bold({ target });
      }
      if (caps.global.trackChanges.enabled) {
        doc.insert({ text: 'tracked' }, { changeMode: 'tracked' });
      }
      if (caps.operations['create.heading'].dryRun) {
        const preview = doc.create.heading({ level: 2, text: 'Preview' }, { dryRun: true });
        expect(preview).toBeDefined();
      }

      expect(caps.operations['format.bold'].available).toBe(true);
      expect(caps.global.trackChanges.enabled).toBe(true);
      expect(caps.operations['create.heading'].dryRun).toBe(true);
    });
  });
});
