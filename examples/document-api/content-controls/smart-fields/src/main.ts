/**
 * Smart fields: one value, every occurrence.
 *
 * Each occurrence of "Acme" in the seed paragraph is wrapped in an
 * inline content control sharing the same `tag` ("customer"). A single
 * `contentControls.selectByTag` + `contentControls.text.setValue` pass
 * updates every match in one transaction.
 *
 * Every operation goes through `editor.doc.*`. The same operation set
 * runs headless via the Node SDK and CLI.
 *
 * For a polished React component that builds on this pattern with a
 * `{{` insertion trigger, linked field groups, and DOCX export, see
 * `@superdoc-dev/template-builder`.
 */

import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import './style.css';

type NodeKind = 'block' | 'inline';
type LockMode = 'unlocked' | 'sdtLocked' | 'contentLocked' | 'sdtContentLocked';

type SelectionPoint =
  | { kind: 'text'; blockId: string; offset: number }
  | { kind: 'nodeEdge'; node: { kind: 'block'; nodeType: string; nodeId: string }; edge: 'before' | 'after' };

type SelectionTarget = {
  kind: 'selection';
  start: SelectionPoint;
  end: SelectionPoint;
};

type ContentControlTarget = { kind: NodeKind; nodeType: 'sdt'; nodeId: string };

type MutationResult =
  | { success: true; contentControl: ContentControlTarget }
  | { success: false; failure: { code: string; message: string } };

type ExtractBlock = { nodeId: string; type: string; text: string };

type DocumentApi = {
  clearContent(input: Record<string, never>): { success: boolean; failure?: { code: string; message: string } };
  insert(input: { value: string; type: 'markdown' }): { success: boolean; failure?: { code: string; message: string } };
  extract(input: Record<string, never>): { blocks: ExtractBlock[] };
  create: {
    contentControl(input: {
      kind: NodeKind;
      controlType: 'text';
      at: SelectionTarget;
      tag: string;
      alias: string;
      lockMode: LockMode;
    }): MutationResult;
  };
  contentControls: {
    selectByTag(input: { tag: string }): { items: Array<{ target: ContentControlTarget; text?: string }>; total: number };
    text: { setValue(input: { target: ContentControlTarget; value: string }): MutationResult };
  };
};

type DemoEditor = { doc: DocumentApi };

const TAG = 'customer';
const INITIAL_VALUE = 'Acme';

const SEED = [
  '# Mutual NDA',
  '',
  `${INITIAL_VALUE} agrees that the confidential information provided by ${INITIAL_VALUE} shall be used only for evaluating the proposed engagement.`,
  '',
  `${INITIAL_VALUE} will hold all confidential information in strict confidence.`,
].join('\n');

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

const statusEl = qs<HTMLElement>('#status');
const input = qs<HTMLInputElement>('#field-customer');
input.value = INITIAL_VALUE;

let editor: DemoEditor | null = null;

setBusy(true);

const superdoc = new SuperDoc({
  selector: '#editor',
  documentMode: 'editing',
  jsonOverride: EMPTY_DOC,
  modules: { comments: false },
  telemetry: { enabled: false },
  onReady: ({ superdoc }) => {
    void initialize(superdoc as SuperDoc & { activeEditor: DemoEditor });
  },
});

qs<HTMLButtonElement>('#apply').addEventListener('click', () => {
  void run('Applied', applyValue);
});

async function initialize(instance: SuperDoc & { activeEditor: DemoEditor }): Promise<void> {
  if (!instance.activeEditor?.doc) {
    setStatus('Document API unavailable');
    return;
  }
  editor = instance.activeEditor;
  await seed();
  setStatus('Ready');
  setBusy(false);
}

async function seed(): Promise<void> {
  const doc = getDoc();
  const cleared = doc.clearContent({});
  if (!cleared.success && cleared.failure?.code !== 'NO_OP') throw new Error(cleared.failure?.message);

  const inserted = doc.insert({ value: SEED, type: 'markdown' });
  if (!inserted.success) throw new Error(inserted.failure?.message ?? 'Failed to insert seed.');

  // Wrap every occurrence of "Acme" in an inline text content control sharing the same tag.
  // In production, you would capture each `target` returned by `create.contentControl`
  // and reuse it instead of scanning blocks again.
  for (const block of doc.extract({}).blocks) {
    let offset = block.text.indexOf(INITIAL_VALUE);
    while (offset !== -1) {
      assertMutation(
        doc.create.contentControl({
          kind: 'inline',
          controlType: 'text',
          at: textSelection(block.nodeId, offset, offset + INITIAL_VALUE.length),
          tag: TAG,
          alias: 'Customer',
          lockMode: 'unlocked',
        }),
        'Could not wrap field.',
      );
      // After wrapping, the block's text shifts. Re-extract for the same block.
      const refreshed = doc.extract({}).blocks.find((b) => b.nodeId === block.nodeId);
      if (!refreshed) break;
      offset = refreshed.text.indexOf(INITIAL_VALUE, offset + INITIAL_VALUE.length);
    }
  }
}

async function applyValue(): Promise<void> {
  const doc = getDoc();
  const targets = doc.contentControls.selectByTag({ tag: TAG }).items;
  if (targets.length === 0) throw new Error('No matching fields.');
  for (const t of targets) {
    assertMutation(
      doc.contentControls.text.setValue({ target: t.target, value: input.value }),
      'Could not update field.',
      true,
    );
  }
}

async function run(status: string, action: () => Promise<void>): Promise<void> {
  setBusy(true);
  setStatus('Working');
  try {
    await action();
    setStatus(status);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Operation failed');
  } finally {
    setBusy(false);
  }
}

function getDoc(): DocumentApi {
  if (!editor?.doc) throw new Error('Document API is not ready.');
  return editor.doc;
}

function textSelection(blockId: string, start: number, end: number): SelectionTarget {
  return {
    kind: 'selection',
    start: { kind: 'text', blockId, offset: start },
    end: { kind: 'text', blockId, offset: end },
  };
}

function assertMutation(result: MutationResult, message: string, allowNoOp = false): void {
  if (result.success) return;
  if (allowNoOp && result.failure.code === 'NO_OP') return;
  throw new Error(result.failure.message || message);
}

function setBusy(busy: boolean): void {
  document.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.disabled = busy;
  });
}

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function qs<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element ${selector}`);
  return element;
}

const teardown = () => superdoc.destroy();
window.addEventListener('beforeunload', teardown);
if (import.meta.hot) import.meta.hot.dispose(teardown);
