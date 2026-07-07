/**
 * Agent runtime integration tests.
 *
 * Exercises superdoc_inspect / agent_apply / agent_verify against an in-memory
 * mock of BoundDocApi. The mock implements the methods the snapshot reads
 * from and the methods our test plans drive — including a save() hook so
 * save/reopen verification can be observed.
 */
import { describe, expect, test } from 'bun:test';
import type { BoundDocApi } from '../generated/client.ts';
import {
  agentApply,
  agentInspect,
  agentOperation,
  agentVerify,
  buildDocumentSnapshot,
  resolveSnapshotSelector,
  type AgentPlan,
} from '../agent/index.ts';
import { dispatchSuperDocTool } from '../tools.ts';

type Block = { ordinal: number; nodeId: string; nodeType: string; text: string };

function createMockDoc(initialBlocks?: Block[]): {
  doc: BoundDocApi;
  calls: {
    infoCalls: number;
    blockListCalls: number;
    commentListCalls: number;
    replaceCalls: number;
    formatApplyCalls: number;
    saveCalls: number;
  };
  state: {
    revision: string;
    blocks: Block[];
    comments: Array<{ id: string; text: string; nodeId: string }>;
    formats: Map<string, Record<string, unknown>>;
  };
} {
  const state = {
    revision: 'rev-1',
    blocks: initialBlocks ?? [
      { ordinal: 1, nodeId: 'n1', nodeType: 'paragraph', text: 'Hello old world.' },
      { ordinal: 2, nodeId: 'n2', nodeType: 'heading', text: 'About' },
    ],
    comments: [{ id: 'c1', text: 'Review this paragraph.', nodeId: 'n1' }],
    formats: new Map<string, Record<string, unknown>>(),
  };
  let revisionCounter = 1;
  function bumpRevision() {
    revisionCounter += 1;
    state.revision = `rev-${revisionCounter}`;
  }
  const calls = {
    infoCalls: 0,
    blockListCalls: 0,
    commentListCalls: 0,
    replaceCalls: 0,
    formatApplyCalls: 0,
    saveCalls: 0,
  };

  const doc = {
    info: async () => {
      calls.infoCalls += 1;
      return {
        counts: {
          words: 0,
          characters: 0,
          paragraphs: state.blocks.filter((b) => b.nodeType === 'paragraph').length,
          headings: state.blocks.filter((b) => b.nodeType === 'heading').length,
          tables: 0,
          images: 0,
          comments: state.comments.length,
          trackedChanges: 0,
          sdtFields: 0,
          lists: 0,
        },
        outline: [],
        capabilities: { canFind: true, canGetNode: true, canComment: true, canReplace: true },
        revision: state.revision,
      };
    },
    blocks: {
      list: async () => {
        calls.blockListCalls += 1;
        return {
          total: state.blocks.length,
          blocks: state.blocks.map((b) => ({
            ordinal: b.ordinal,
            nodeId: b.nodeId,
            nodeType: b.nodeType,
            text: b.text,
            textPreview: b.text,
          })),
          revision: state.revision,
        };
      },
    },
    comments: {
      list: async () => {
        calls.commentListCalls += 1;
        return {
          items: state.comments.map((comment) => ({
            id: comment.id,
            text: comment.text,
            status: 'open',
            target: {
              segments: [{ blockId: comment.nodeId, range: { start: 0, end: comment.text.length } }],
            },
          })),
        };
      },
    },
    format: {
      apply: async (args: { blockId: string; inline?: Record<string, unknown> }) => {
        calls.formatApplyCalls += 1;
        state.formats.set(args.blockId, { ...(args.inline ?? {}) });
        bumpRevision();
        return { success: true };
      },
    },
    replace: async (args: { find: string; replace: string }) => {
      calls.replaceCalls += 1;
      for (const block of state.blocks) {
        block.text = block.text.split(args.find).join(args.replace);
      }
      bumpRevision();
      return { success: true, revision: { before: 'rev-prev', after: state.revision } };
    },
    save: async () => {
      calls.saveCalls += 1;
      return { success: true };
    },
  } as unknown as BoundDocApi;

  return { doc, calls, state };
}

describe('agent runtime', () => {
  test('superdoc_inspect returns a deterministic snapshot', async () => {
    const { doc } = createMockDoc();
    const snapshot = await agentInspect(doc);
    expect(snapshot.revision).toBe('rev-1');
    expect(snapshot.counts.paragraphs).toBe(1);
    expect(snapshot.counts.headings).toBe(1);
    expect(snapshot.blocks).toHaveLength(2);
  });

  test('superdoc_inspect supports countsOnly without reading block or comment domains', async () => {
    const { doc, calls } = createMockDoc();
    const snapshot = await agentInspect(doc, { countsOnly: true });
    expect(snapshot.counts.paragraphs).toBe(1);
    expect(snapshot.counts.comments).toBe(1);
    expect(snapshot.blocks).toEqual([]);
    expect(snapshot.comments).toEqual([]);
    expect(calls.infoCalls).toBe(1);
    expect(calls.blockListCalls).toBe(0);
    expect(calls.commentListCalls).toBe(0);
  });

  test('superdoc_inspect can limit returned domains and block types', async () => {
    const { doc, calls } = createMockDoc([
      { ordinal: 1, nodeId: 'n1', nodeType: 'paragraph', text: 'Hello old world.' },
      { ordinal: 2, nodeId: 'n2', nodeType: 'heading', text: 'About' },
      { ordinal: 3, nodeId: 'n3', nodeType: 'paragraph', text: 'Closing paragraph.' },
    ]);
    const snapshot = await agentInspect(doc, {
      includeDomains: ['blocks'],
      blockNodeTypes: ['heading'],
    });
    expect(snapshot.blocks.map((block) => block.nodeId)).toEqual(['n2']);
    expect(snapshot.comments).toEqual([]);
    expect(calls.blockListCalls).toBe(1);
    expect(calls.commentListCalls).toBe(0);
  });

  test('agent_apply executes a validated plan and returns pre/post evidence', async () => {
    const { doc, calls } = createMockDoc();
    const plan: AgentPlan = {
      intent: 'replace text',
      steps: [
        { kind: 'inspect', operationId: 'doc.info', args: {} },
        { kind: 'select', selector: { kind: 'placement', at: 'document_start' } },
        { kind: 'apply', operationId: 'doc.replace', args: { find: 'old', replace: 'new' } },
        {
          kind: 'verify',
          checks: [{ kind: 'revision-changed' }, { kind: 'block-text-contains', nodeId: 'n1', text: 'new' }],
        },
      ],
    };
    const receipt = await agentApply(doc, { plan });
    expect(receipt.status).toBe('ok');
    expect(calls.replaceCalls).toBe(1);
    expect(receipt.executedOperations).toHaveLength(1);
    expect(receipt.executedOperations[0]?.operationId).toBe('doc.replace');
    expect(receipt.preSnapshot.revision).toBe('rev-1');
    expect(receipt.postSnapshot?.revision).toBe('rev-2');
    expect(receipt.verification.every((v) => v.passed)).toBe(true);
    expect(receipt.selectedTargets).toHaveLength(1);
    expect(receipt.selectedTargets[0]?.matched).toEqual(['n1']);
  });

  test('agent_apply fails closed when verification fails', async () => {
    const { doc } = createMockDoc();
    const plan: AgentPlan = {
      intent: 'replace text',
      steps: [
        { kind: 'apply', operationId: 'doc.replace', args: { find: 'old', replace: 'new' } },
        {
          kind: 'verify',
          checks: [{ kind: 'block-text-contains', nodeId: 'n1', text: 'will-not-be-there' }],
        },
      ],
    };
    const receipt = await agentApply(doc, { plan });
    expect(receipt.status).toBe('failed');
    expect(receipt.verification.some((v) => !v.passed)).toBe(true);
  });

  test('agent_apply rejects invalid IR before executing', async () => {
    const { doc, calls } = createMockDoc();
    const plan: AgentPlan = {
      intent: 'bogus',
      steps: [{ kind: 'apply', operationId: 'doc.unknown.thing', args: {} }],
    };
    const receipt = await agentApply(doc, { plan });
    expect(receipt.status).toBe('failed');
    expect(calls.replaceCalls).toBe(0);
    expect(receipt.errors?.some((e) => e.code === 'UNKNOWN_OPERATION')).toBe(true);
  });

  test('agent_apply surfaces ambiguity when requireUnique fails', async () => {
    const blocks: Block[] = [
      { ordinal: 1, nodeId: 'n1', nodeType: 'paragraph', text: 'one' },
      { ordinal: 2, nodeId: 'n2', nodeType: 'paragraph', text: 'two' },
    ];
    const { doc } = createMockDoc(blocks);
    const plan: AgentPlan = {
      intent: 'replace text',
      steps: [
        { kind: 'select', selector: { kind: 'document' }, requireUnique: true },
        { kind: 'apply', operationId: 'doc.replace', args: { find: 'a', replace: 'b' } },
        { kind: 'verify', checks: [{ kind: 'revision-changed' }] },
      ],
    };
    const receipt = await agentApply(doc, { plan });
    expect(receipt.status).toBe('aborted');
    expect(receipt.errors?.[0]?.code).toBe('AMBIGUOUS_SELECTOR');
  });

  test('agent_apply resolves bound inspect args and selector refs', async () => {
    const { doc, state, calls } = createMockDoc();
    const plan: AgentPlan = {
      intent: 'inspect then format',
      steps: [
        { kind: 'inspect', operationId: 'doc.blocks.list', args: { limit: 10 }, bind: 'page' },
        { kind: 'select', selector: { kind: 'placement', at: 'document_start' }, bind: 'target', requireUnique: true },
        { kind: 'select', selector: { kind: 'ref', ref: 'target' }, requireUnique: true },
        {
          kind: 'apply',
          operationId: 'doc.format.apply',
          args: { blockId: { ref: 'target' }, inline: { letterSpacing: 2 } },
        },
        { kind: 'verify', checks: [{ kind: 'revision-changed' }] },
      ],
    };
    const receipt = await agentApply(doc, { plan });
    expect(receipt.status).toBe('ok');
    expect(calls.formatApplyCalls).toBe(1);
    expect(state.formats.get('n1')?.letterSpacing).toBe(2);
    expect(receipt.selectedTargets[0]?.matched).toEqual(['n1']);
    expect(receipt.selectedTargets[1]?.matched).toEqual(['n1']);
  });

  test('agent_apply resolves inspect-path refs inside apply args', async () => {
    const { doc } = createMockDoc([
      { ordinal: 1, nodeId: 'n1', nodeType: 'paragraph', text: 'Hello old world.' },
      { ordinal: 2, nodeId: 'n2', nodeType: 'heading', text: 'About' },
    ]);
    const plan: AgentPlan = {
      intent: 'replace exact block text from inspected data',
      steps: [
        { kind: 'inspect', operationId: 'doc.blocks.list', args: { limit: 10 }, bind: 'page' },
        {
          kind: 'apply',
          operationId: 'doc.replace',
          args: { find: { ref: 'page', path: 'blocks.0.text' }, replace: 'Hello new world.' },
        },
        { kind: 'verify', checks: [{ kind: 'block-text-equals', nodeId: 'n1', text: 'Hello new world.' }] },
      ],
    };
    const receipt = await agentApply(doc, { plan });
    expect(receipt.status).toBe('ok');
  });

  test('agent_verify reports verification results without mutating', async () => {
    const { doc, calls } = createMockDoc();
    const receipt = await agentVerify(doc, {
      checks: [{ kind: 'block-text-contains', nodeId: 'n1', text: 'old' }],
    });
    expect(receipt.status).toBe('ok');
    expect(receipt.verification[0]?.passed).toBe(true);
    expect(calls.replaceCalls).toBe(0);
    expect(calls.saveCalls).toBe(0);
  });

  test('agent_verify with saveReopen records a save attempt', async () => {
    const { doc, calls } = createMockDoc();
    const receipt = await agentVerify(doc, {
      checks: [{ kind: 'save-reopen-text-contains', text: 'old' }],
      saveReopen: true,
    });
    expect(receipt.saveReopen?.attempted).toBe(true);
    expect(receipt.saveReopen?.succeeded).toBe(true);
    expect(calls.saveCalls).toBe(1);
  });

  test('agent_verify fails closed for missing save/reopen text', async () => {
    const { doc, calls } = createMockDoc();
    const receipt = await agentVerify(doc, {
      checks: [{ kind: 'save-reopen-text-contains', text: 'missing text' }],
    });
    expect(receipt.status).toBe('failed');
    expect(receipt.saveReopen?.attempted).toBe(true);
    expect(receipt.verification[0]?.passed).toBe(false);
    expect(calls.saveCalls).toBe(1);
  });

  test('agent_verify rejects revision-changed without a baseline', async () => {
    const { doc } = createMockDoc();
    const receipt = await agentVerify(doc, {
      checks: [{ kind: 'revision-changed' }],
    });
    expect(receipt.status).toBe('failed');
    expect(receipt.verification[0]?.detail).toMatch(/baseline snapshot/);
  });

  test('agent_operation dispatches a generated read operation', async () => {
    const { doc } = createMockDoc();
    const result = (await agentOperation(doc, { operationId: 'doc.info' })) as { revision: string };
    expect(result.revision).toBe('rev-1');
  });

  test('agent_operation refuses mutating ops when readOnly=true', async () => {
    const { doc } = createMockDoc();
    await expect(
      agentOperation(doc, {
        operationId: 'doc.replace',
        args: { find: 'a', replace: 'b' },
        readOnly: true,
      }),
    ).rejects.toThrow(/mutating/);
  });

  test('buildDocumentSnapshot tolerates missing sub-apis without throwing', async () => {
    const minimal = {
      info: async () => ({ counts: {}, outline: [], capabilities: {}, revision: 'rev-x' }),
      blocks: { list: async () => ({ total: 0, blocks: [], revision: 'rev-x' }) },
    } as unknown as BoundDocApi;
    const snapshot = await buildDocumentSnapshot(minimal);
    expect(snapshot.revision).toBe('rev-x');
    expect(snapshot.blocks).toEqual([]);
    expect(snapshot.diagnostics).toEqual([]);
  });

  test('bodyParagraphOrdinal excludes headings and relative selectors resolve siblings', async () => {
    const { doc } = createMockDoc([
      { ordinal: 1, nodeId: 'h1', nodeType: 'heading', text: 'Heading' },
      { ordinal: 2, nodeId: 'p1', nodeType: 'paragraph', text: 'First body paragraph.' },
      { ordinal: 3, nodeId: 'p2', nodeType: 'paragraph', text: 'Second body paragraph.' },
    ]);
    const snapshot = await buildDocumentSnapshot(doc);
    expect(
      resolveSnapshotSelector(snapshot, { kind: 'ordinal', ordinalKind: 'bodyParagraphOrdinal', value: 1 }),
    ).toEqual(['p1']);
    expect(
      resolveSnapshotSelector(snapshot, {
        kind: 'relative',
        position: 'after',
        target: { kind: 'nodeId', nodeId: 'p1' },
      }),
    ).toEqual(['p2']);
  });

  test('dispatchSuperDocTool routes agent tools via the core preset', async () => {
    const { doc } = createMockDoc();
    const result = (await dispatchSuperDocTool(doc, 'superdoc_inspect', {}, { preset: 'core' })) as {
      revision: string;
    };
    expect(result.revision).toBe('rev-1');
  });
});
