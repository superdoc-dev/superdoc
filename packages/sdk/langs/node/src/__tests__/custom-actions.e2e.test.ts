/**
 * Custom-action END-TO-END test against the real CLI host.
 *
 * Registers an `extendPreset('core', { id:'acme', actions: footnoteActions })`
 * preset, opens a real .docx, and dispatches `footnotes.add` then
 * `footnotes.list` as run-tier custom actions. Proves the whole path —
 * dispatch → run(doc, args) → doc.footnotes.* over JSON-RPC → receipt — works
 * with ZERO CLI host changes.
 *
 * Requires the spawned host (SUPERDOC_CLI_BIN → apps/cli/src/index.ts, run via
 * bun). Skips nothing — if the host cannot start, the test fails loudly.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { createSuperDocClient } from '../index.ts';
import { registerPreset, unregisterPreset } from '../tools.ts';
import { dispatchSuperDocTool, chooseTools, createAgentToolkit } from '../tools.ts';
import { extendPreset } from '../actions/define.ts';
import { footnoteActions } from './fixtures/footnotes.ts';

// packages/sdk/langs/node/src/__tests__ → repo root
const REPO_ROOT = path.resolve(import.meta.dir, '../../../../../..');
const CLI_BIN = path.join(REPO_ROOT, 'apps/cli/src/index.ts');
const FIXTURE_DOC = path.join(REPO_ROOT, 'packages/super-editor/src/editors/v1/tests/data/advanced-text.docx');

const E2E_TIMEOUT_MS = 60_000;

describe('custom footnote actions (e2e)', () => {
  beforeAll(() => {
    registerPreset(extendPreset('core', { id: 'acme', actions: footnoteActions }));
  });
  afterAll(() => {
    try {
      unregisterPreset('acme');
    } catch {
      // ignore
    }
  });

  test('footnote action names appear in the acme superdoc_perform_action enum', async () => {
    const { tools } = await chooseTools({ provider: 'anthropic', preset: 'acme' });
    const actionTool = tools.find((t) => (t as { name?: string }).name === 'superdoc_perform_action') as
      | { input_schema?: { properties?: { action?: { enum?: string[] } } } }
      | undefined;
    const names = actionTool?.input_schema?.properties?.action?.enum ?? [];
    for (const r of footnoteActions) expect(names).toContain(r.name);
  });

  test(
    'dispatch footnotes.add then footnotes.list shows the inserted note',
    async () => {
      const client = createSuperDocClient({
        env: { SUPERDOC_CLI_BIN: CLI_BIN },
      });
      try {
        await client.connect();
        const doc = await client.open({ doc: FIXTURE_DOC });

        // Find a body paragraph block to anchor the footnote on.
        const blocks = (await doc.blocks.list({ limit: 50, includeText: true })) as {
          blocks: Array<{ nodeId: string; nodeType: string; text?: string }>;
        };
        const para = blocks.blocks.find((b) => b.nodeType === 'paragraph' && (b.text?.length ?? 0) > 0);
        expect(para).toBeDefined();
        const at = {
          kind: 'text',
          segments: [{ blockId: para!.nodeId, range: { start: 0, end: 0 } }],
        };

        const addReceipt = (await dispatchSuperDocTool(
          doc,
          'superdoc_perform_action',
          { action: 'footnotes.add', at, content: 'Inserted by the footnotes.add custom action.' },
          { preset: 'acme' },
        )) as { status: string; action: string; result?: unknown };

        expect(addReceipt.action).toBe('footnotes.add');
        expect(addReceipt.status).toBe('succeeded');

        const listReceipt = (await dispatchSuperDocTool(
          doc,
          'superdoc_perform_action',
          { action: 'footnotes.list' },
          { preset: 'acme' },
        )) as { status: string; result?: { items?: unknown[] } };

        expect(listReceipt.status).toBe('succeeded');
        const items = listReceipt.result?.items ?? [];
        expect(Array.isArray(items)).toBe(true);
        expect(items.length).toBeGreaterThanOrEqual(1);

        await doc.close({ discard: true });
      } finally {
        await client.dispose();
      }
    },
    E2E_TIMEOUT_MS,
  );

  test(
    'a custom action executes through the one-call createAgentToolkit dispatch',
    async () => {
      // The whole point of the review item: build the toolkit from `actions`
      // and run a custom action through the RETURNED dispatch (no preset id).
      const kit = await createAgentToolkit({ provider: 'anthropic', actions: footnoteActions });
      const client = createSuperDocClient({ env: { SUPERDOC_CLI_BIN: CLI_BIN } });
      try {
        await client.connect();
        const doc = await client.open({ doc: FIXTURE_DOC });
        const blocks = (await doc.blocks.list({ limit: 50, includeText: true })) as {
          blocks: Array<{ nodeId: string; nodeType: string; text?: string }>;
        };
        const para = blocks.blocks.find((b) => b.nodeType === 'paragraph' && (b.text?.length ?? 0) > 0);
        expect(para).toBeDefined();
        const at = { kind: 'text', segments: [{ blockId: para!.nodeId, range: { start: 0, end: 0 } }] };

        const addReceipt = (await kit.dispatch(doc, 'superdoc_perform_action', {
          action: 'footnotes.add',
          at,
          content: 'Inserted via the one-call toolkit dispatch.',
        })) as { status: string; action: string };
        expect(addReceipt.action).toBe('footnotes.add');
        expect(addReceipt.status).toBe('succeeded');

        const listReceipt = (await kit.dispatch(doc, 'superdoc_perform_action', {
          action: 'footnotes.list',
        })) as { status: string; result?: { items?: unknown[] } };
        expect(listReceipt.status).toBe('succeeded');
        expect((listReceipt.result?.items ?? []).length).toBeGreaterThanOrEqual(1);

        await doc.close({ discard: true });
      } finally {
        await client.dispose();
      }
    },
    E2E_TIMEOUT_MS,
  );
});
