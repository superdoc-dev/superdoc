/**
 * Tests that exercise the exact code patterns shown in:
 *   - apps/docs/document-api/overview.mdx  (Common workflows)
 *   - packages/document-api/src/README.md  (Workflow examples)
 *
 * If any of these tests break, the corresponding documentation example is wrong
 * and must be updated to match.
 */
import { describe, expect, it, vi } from 'vitest';
import { createDocumentApi } from './index.js';
import type { DocumentApiCapabilities } from './capabilities/capabilities.js';
import type { SelectionTarget } from './types/index.js';

// ---------------------------------------------------------------------------
// Shared mock-adapter factories (mirrors index.test.ts patterns)
// ---------------------------------------------------------------------------

const SELECTION_TARGET: SelectionTarget = {
  kind: 'selection',
  start: { kind: 'text', blockId: 'p1', offset: 0 },
  end: { kind: 'text', blockId: 'p1', offset: 3 },
};

function makeTextMutationReceipt() {
  return {
    success: true as const,
    resolution: {
      target: { kind: 'text' as const, blockId: 'p1', range: { start: 0, end: 3 } },
      range: { from: 1, to: 4 },
      text: 'foo',
    },
    inserted: [{ kind: 'entity' as const, entityType: 'trackedChange' as const, entityId: 'tc-1' }],
  };
}

function makeFindAdapter() {
  return {
    find: vi.fn(() => ({
      evaluatedRevision: '',
      total: 1,
      items: [
        {
          id: 'p1',
          handle: { ref: 'p1', refStability: 'ephemeral' as const, targetKind: 'text' as const },
          matchKind: 'text' as const,
          address: { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: 'p1' },
          target: SELECTION_TARGET,
          snippet: 'foo',
          highlightRange: { start: 0, end: 3 },
          blocks: [
            {
              blockId: 'p1',
              nodeType: 'paragraph',
              range: { start: 0, end: 3 },
              text: 'foo',
              ref: 'ref:block-1',
              runs: [
                {
                  range: { start: 0, end: 3 },
                  text: 'foo',
                  styles: {
                    bold: false,
                    italic: false,
                    underline: false,
                    strike: false,
                  },
                  ref: 'ref:run-1',
                },
              ],
            },
          ],
          context: { target: SELECTION_TARGET, textRanges: [SELECTION_TARGET] },
        },
      ],
      page: { limit: 1, offset: 0, returned: 1 },
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

function makeSDMutationReceipt() {
  return {
    success: true as const,
    resolution: {
      target: {
        kind: 'text' as const,
        blockId: 'p1',
        range: { start: 0, end: 3 },
      },
    },
  };
}

function makeWriteAdapter() {
  return {
    write: vi.fn(() => makeTextMutationReceipt()),
    insertStructured: vi.fn(() => makeSDMutationReceipt()),
    replaceStructured: vi.fn(() => makeSDMutationReceipt()),
  };
}

function makeSelectionMutationAdapter() {
  return {
    execute: vi.fn(() => makeTextMutationReceipt()),
  };
}

function makeParagraphsAdapter() {
  const ok = () => ({
    success: true as const,
    target: { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: 'p1' },
    resolution: { target: { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: 'p1' } },
  });

  return {
    setStyle: vi.fn(ok),
    clearStyle: vi.fn(ok),
    resetDirectFormatting: vi.fn(ok),
    setAlignment: vi.fn(ok),
    clearAlignment: vi.fn(ok),
    setIndentation: vi.fn(ok),
    clearIndentation: vi.fn(ok),
    setSpacing: vi.fn(ok),
    clearSpacing: vi.fn(ok),
    setKeepOptions: vi.fn(ok),
    setOutlineLevel: vi.fn(ok),
    setFlowOptions: vi.fn(ok),
    setTabStop: vi.fn(ok),
    clearTabStop: vi.fn(ok),
    clearAllTabStops: vi.fn(ok),
    setBorder: vi.fn(ok),
    clearBorder: vi.fn(ok),
    setShading: vi.fn(ok),
    clearShading: vi.fn(ok),
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
      evaluatedRevision: 'r1',
      total: 1,
      items: [
        {
          id: 'c1',
          handle: { ref: 'comment:c1', refStability: 'stable' as const, targetKind: 'comment' as const },
          address: { kind: 'entity' as const, entityType: 'comment' as const, entityId: 'c1' },
          commentId: 'c1',
          status: 'open' as const,
          text: 'Review this section.',
        },
      ],
      page: { limit: 1, offset: 0, returned: 1 },
    })),
  };
}

function makeTrackChangesAdapter() {
  return {
    list: vi.fn(() => ({ evaluatedRevision: 'r1', total: 0, items: [], page: { limit: 0, offset: 0, returned: 0 } })),
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
  const mutateResult = () => ({
    success: true as const,
    item: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-1' },
  });

  return {
    list: vi.fn(() => ({
      evaluatedRevision: 'r1',
      total: 1,
      items: [
        {
          id: 'li-1',
          handle: { ref: 'li-1', refStability: 'stable' as const, targetKind: 'list' as const },
          address: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-1' },
          kind: 'ordered' as const,
          level: 0,
          text: 'List item',
        },
      ],
      page: { limit: 1, offset: 0, returned: 1 },
    })),
    get: vi.fn(() => ({
      address: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-1' },
      listId: 'list-1',
      kind: 'ordered' as const,
      level: 0,
      text: 'List item',
    })),
    insert: vi.fn(() => ({
      success: true as const,
      item: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-2' },
      insertionPoint: { kind: 'text' as const, blockId: 'li-2', range: { start: 0, end: 0 } },
    })),
    indent: vi.fn(mutateResult),
    outdent: vi.fn(mutateResult),
    create: vi.fn(() => ({
      success: true as const,
      listId: 'list-new',
      item: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-new' },
    })),
    attach: vi.fn(mutateResult),
    detach: vi.fn(() => ({
      success: true as const,
      paragraph: { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: 'p1' },
    })),
    join: vi.fn(() => ({ success: true as const, listId: 'list-1' })),
    canJoin: vi.fn(() => ({ canJoin: true })),
    separate: vi.fn(() => ({ success: true as const, listId: 'list-new', numId: 2 })),
    setLevel: vi.fn(mutateResult),
    setValue: vi.fn(mutateResult),
    continuePrevious: vi.fn(mutateResult),
    canContinuePrevious: vi.fn(() => ({ canContinue: true })),
    setLevelRestart: vi.fn(mutateResult),
    convertToText: vi.fn(() => ({
      success: true as const,
      paragraph: { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: 'p1' },
    })),
    applyTemplate: vi.fn(mutateResult),
    applyPreset: vi.fn(mutateResult),
    captureTemplate: vi.fn(() => ({
      success: true as const,
      template: { version: 1, levels: [] },
    })),
    setLevelNumbering: vi.fn(mutateResult),
    setLevelBullet: vi.fn(mutateResult),
    setLevelPictureBullet: vi.fn(mutateResult),
    setLevelAlignment: vi.fn(mutateResult),
    setLevelIndents: vi.fn(mutateResult),
    setLevelTrailingCharacter: vi.fn(mutateResult),
    setLevelMarkerFont: vi.fn(mutateResult),
    clearLevelOverrides: vi.fn(mutateResult),
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
    format: { supportedInlineProperties: {} as DocumentApiCapabilities['format']['supportedInlineProperties'] },
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
        'format.apply',
        'create.paragraph',
        'create.heading',
        'lists.list',
        'lists.get',
        'lists.insert',
        'lists.create',
        'lists.indent',
        'lists.outdent',
        'lists.detach',
        'lists.attach',
        'comments.create',
        'comments.patch',
        'comments.delete',
        'comments.get',
        'comments.list',
        'trackChanges.list',
        'trackChanges.get',
        'trackChanges.decide',
        'capabilities.get',
        'query.match',
        'mutations.preview',
        'mutations.apply',
      ].map((id) => [id, { available: true, tracked: true, dryRun: true }]),
    ) as DocumentApiCapabilities['operations'],
    planEngine: {
      supportedStepOps: [],
      supportedNonUniformStrategies: [],
      supportedSetMarks: [],
      regex: { maxPatternLength: 1024, maxExecutionMs: 100 },
    },
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
    selectionMutation: makeSelectionMutationAdapter(),
    paragraphs: makeParagraphsAdapter(),
    trackChanges: makeTrackChangesAdapter(),
    create: makeCreateAdapter(),
    lists: makeListsAdapter(),
    query: {
      match: vi.fn(() => ({
        evaluatedRevision: 'r1',
        total: 1,
        items: [
          {
            id: 'm:1',
            handle: {
              ref: 'ref:match-1',
              refStability: 'stable' as const,
              targetKind: 'text' as const,
            },
            matchKind: 'text' as const,
            address: {
              kind: 'block' as const,
              nodeType: 'paragraph' as const,
              nodeId: 'p1',
            },
            target: SELECTION_TARGET,
            snippet: 'foo',
            highlightRange: { start: 0, end: 3 },
            blocks: [
              {
                blockId: 'p1',
                nodeType: 'paragraph',
                range: { start: 0, end: 3 },
                text: 'foo',
                ref: 'ref:block-1',
                runs: [
                  {
                    range: { start: 0, end: 3 },
                    text: 'foo',
                    styles: {
                      bold: false,
                      italic: false,
                      underline: false,
                      strike: false,
                    },
                    ref: 'ref:run-1',
                  },
                ],
              },
            ],
          },
        ],
        page: { limit: 1, offset: 0, returned: 1 },
      })),
    },
    mutations: {
      preview: vi.fn(() => ({ evaluatedRevision: 'r1', steps: [], valid: true })),
      apply: vi.fn(() => ({
        success: true as const,
        revision: { before: 'r1', after: 'r2' },
        steps: [],
        trackedChanges: [],
        timing: { totalMs: 0 },
      })),
    },
  });
}

// ---------------------------------------------------------------------------
// overview.mdx — "Common workflows"
// ---------------------------------------------------------------------------

describe('overview.mdx examples', () => {
  describe('Plan with query.match, then apply with mutations', () => {
    // Mirrors the exact code block from overview.mdx § "Plan with query.match, then apply with mutations"
    it('matches, previews, and applies a deterministic plan', () => {
      const doc = makeApi();

      const match = doc.query.match({
        select: { type: 'text', pattern: 'foo' },
        require: 'first',
      });

      const ref = match.items?.[0]?.handle?.ref;
      if (!ref) return;

      const plan = {
        expectedRevision: match.evaluatedRevision,
        atomic: true as const,
        changeMode: 'direct' as const,
        steps: [
          {
            id: 'replace-foo',
            op: 'text.rewrite',
            where: { by: 'ref' as const, ref },
            args: { replacement: { text: 'bar' } },
          },
        ],
      };

      const preview = doc.mutations.preview(plan);
      if (preview.valid) {
        doc.mutations.apply(plan);
      }

      expect(ref).toBeDefined();
      expect(preview.valid).toBe(true);
    });
  });

  describe('Run multiple edits as one plan', () => {
    // Mirrors the exact code block from overview.mdx § "Run multiple edits as one plan"
    it('runs multiple steps through preview + apply', () => {
      const doc = makeApi();

      const match = doc.query.match({
        select: { type: 'text', pattern: 'payment terms' },
        require: 'first',
      });

      const ref = match.items?.[0]?.handle?.ref;
      if (!ref) return;

      const plan = {
        expectedRevision: match.evaluatedRevision,
        atomic: true as const,
        changeMode: 'direct' as const,
        steps: [
          {
            id: 'rewrite-terms',
            op: 'text.rewrite',
            where: { by: 'ref' as const, ref },
            args: {
              replacement: { text: 'updated payment terms' },
            },
          },
          {
            id: 'style-terms',
            op: 'format.apply',
            where: { by: 'ref' as const, ref },
            args: { inline: { bold: true } },
          },
        ],
      };

      const preview = doc.mutations.preview(plan);
      if (preview.valid) {
        doc.mutations.apply(plan);
      }

      expect(ref).toBeDefined();
      expect(preview.valid).toBe(true);
    });
  });

  describe('Quick search and single edit', () => {
    // Mirrors the exact code block from overview.mdx § "Quick search and single edit"
    it('finds and replaces with direct operations', () => {
      const doc = makeApi();

      const result = doc.find({
        select: { type: 'text', pattern: 'foo' },
        require: 'first',
      });

      const target = result.items?.[0]?.context?.textRanges?.[0];
      if (target) {
        doc.replace({ target, text: 'bar' });
      }

      expect(target).toBeDefined();
      expect(target?.kind).toBe('selection');
    });
  });

  describe('Tracked-mode insert', () => {
    // Mirrors the exact code block from overview.mdx § "Tracked-mode insert"
    it('insert text with changeMode tracked', () => {
      const doc = makeApi();

      const receipt = doc.insert({ value: 'new content' }, { changeMode: 'tracked' });

      expect(receipt.resolution).toBeDefined();
      expect(receipt.resolution.target).toBeDefined();
    });
  });

  describe('Check capabilities before acting', () => {
    // Mirrors the exact code block from overview.mdx § "Check capabilities before acting"
    it('branch on capabilities', () => {
      const doc = makeApi();

      const caps = doc.capabilities();
      const target = SELECTION_TARGET;

      if (caps.operations['format.apply'].available) {
        doc.format.apply({ target, inline: { bold: true } });
      }

      if (caps.global.trackChanges.enabled) {
        doc.insert({ value: 'tracked' }, { changeMode: 'tracked' });
      }

      // Both branches should execute with our fully-capable mock
      expect(caps.operations['format.apply'].available).toBe(true);
      expect(caps.global.trackChanges.enabled).toBe(true);
    });
  });

  describe('Dry-run preview', () => {
    // Mirrors the exact code block from overview.mdx § "Dry-run preview"
    it('insert with dryRun true', () => {
      const doc = makeApi();
      const target = { kind: 'text' as const, blockId: 'p1', range: { start: 0, end: 3 } };

      const preview = doc.insert({ target, value: 'hello' }, { dryRun: true });
      // preview.success tells you whether the insert would succeed
      // preview.resolution shows the resolved target (TextAddress)

      expect(preview).toHaveProperty('success');
      expect(preview).toHaveProperty('resolution');
      expect(preview.resolution).toHaveProperty('target');
    });
  });
});

// ---------------------------------------------------------------------------
// common-workflows.mdx — "Find text and insert at position"
// ---------------------------------------------------------------------------

describe('common-workflows.mdx: Find text and insert at position', () => {
  it('query.match → create.paragraph with at: after', () => {
    const doc = makeApi();

    // Step 1: Find the heading by text content
    const match = doc.query.match({
      select: { type: 'text', pattern: 'Materials and methods' },
      require: 'first',
    });

    const address = match.items?.[0]?.address;
    if (!address) return;

    // Step 2: Insert a paragraph after the heading
    const result = doc.create.paragraph({
      at: { kind: 'after', target: address },
      text: 'New section content goes here.',
    });

    expect(address.kind).toBe('block');
    expect(result.success).toBe(true);
  });

  it('query.match → create.paragraph with tracked changes', () => {
    const doc = makeApi();

    const match = doc.query.match({
      select: { type: 'text', pattern: 'Materials and methods' },
      require: 'first',
    });

    const address = match.items?.[0]?.address;
    if (!address) return;

    const result = doc.create.paragraph(
      { at: { kind: 'after', target: address }, text: 'Suggested addition.' },
      { changeMode: 'tracked' },
    );

    expect(result.success).toBe(true);
  });

  it('query.match accepts flat TextSelector shorthand', () => {
    const doc = makeApi();

    // Shorthand: pass TextSelector directly instead of { select: ... }
    const match = doc.query.match({ type: 'text', pattern: 'Materials and methods' });

    expect(match.items).toBeDefined();
  });

  it('query.match accepts flat NodeSelector shorthand', () => {
    const doc = makeApi();

    // Shorthand: pass NodeSelector directly instead of { select: ... }
    const match = doc.query.match({ type: 'node', nodeType: 'paragraph' });

    expect(match.items).toBeDefined();
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

      const match = doc.query.match({
        select: { type: 'text', pattern: 'foo' },
        require: 'first',
      });

      const target = match.items?.[0]?.target;
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

      const receipt = doc.insert({ value: 'new content' }, { changeMode: 'tracked' });
      // receipt.resolution.target contains the resolved insertion point (TextAddress)
      // receipt.success tells you whether the tracked insert applied

      expect(receipt.resolution).toBeDefined();
      expect(receipt.resolution!.target).toBeDefined();
      expect(receipt.success).toBe(true);
    });
  });

  describe('Workflow: Comment Thread Lifecycle', () => {
    // Mirrors the exact code block from src/README.md § "Workflow: Comment Thread Lifecycle"
    it('create comment, reply, then resolve', () => {
      const doc = makeApi();

      // Simulate having a comment target
      const target = { kind: 'text' as const, blockId: 'p1', range: { start: 0, end: 3 } };
      const createReceipt = doc.comments.create({ target, text: 'Review this section.' });
      // Use the comment ID from the receipt to reply
      const comments = doc.comments.list();
      const thread = comments.items[0];
      doc.comments.create({ parentCommentId: thread.id, text: 'Looks good.' });
      doc.comments.patch({ commentId: thread.id, status: 'resolved' });

      expect(createReceipt.success).toBe(true);
      expect(thread.id).toBeDefined();
    });
  });

  describe('Workflow: List Manipulation', () => {
    // Mirrors the exact code block from src/README.md § "Workflow: List Manipulation"
    it('insert list item, set type, indent', () => {
      const doc = makeApi();

      const lists = doc.lists.list();
      const firstItem = lists.items[0].address;
      const insertResult = doc.lists.insert({ target: firstItem, position: 'after', text: 'New item' });
      if (insertResult.success) {
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
      const target = SELECTION_TARGET;

      const caps = doc.capabilities();
      if (caps.operations['format.apply'].available) {
        doc.format.apply({ target, inline: { bold: true } });
      }
      if (caps.global.trackChanges.enabled) {
        doc.insert({ value: 'tracked' }, { changeMode: 'tracked' });
      }
      if (caps.operations['create.heading'].dryRun) {
        const preview = doc.create.heading({ level: 2, text: 'Preview' }, { dryRun: true });
        expect(preview).toBeDefined();
      }

      expect(caps.operations['format.apply'].available).toBe(true);
      expect(caps.global.trackChanges.enabled).toBe(true);
      expect(caps.operations['create.heading'].dryRun).toBe(true);
    });
  });
});
