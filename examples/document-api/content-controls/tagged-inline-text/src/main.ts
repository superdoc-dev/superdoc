/**
 * Tagged inline text: the smallest content-control workflow.
 *
 * Setup (not the lesson):
 *   1. Seed a single paragraph.
 *   2. Wrap the word "Acme" in an inline text content control with tag "customer".
 *
 * Teaching surface (the lesson):
 *   1. `editor.doc.contentControls.selectByTag({ tag: 'customer' })` finds the control.
 *   2. `editor.doc.contentControls.text.setValue({ target, value })` updates its text.
 *
 * Every operation goes through `editor.doc.*`. The same operation set
 * runs headless via the Node SDK and CLI.
 *
 * For a composed runtime workflow (smart fields + versioned sections),
 * see `demos/contract-templates`. For a packaged React authoring UI
 * (`{{` trigger menu, linked field groups, owner/signer types, export),
 * see `@superdoc-dev/template-builder`.
 */

import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import './style.css';

type NodeKind = 'block' | 'inline';
type LockMode = 'unlocked' | 'sdtLocked' | 'contentLocked' | 'sdtContentLocked';

type SelectionTarget = {
  kind: 'selection';
  start: { kind: 'text'; blockId: string; offset: number };
  end: { kind: 'text'; blockId: string; offset: number };
};

type ContentControlTarget = { kind: NodeKind; nodeType: 'sdt'; nodeId: string };

type MutationResult =
  | { success: true; contentControl: ContentControlTarget }
  | { success: false; failure: { code: string; message: string } };

type DocumentApi = {
  clearContent(input: Record<string, never>): { success: boolean; failure?: { code: string; message: string } };
  insert(input: { value: string; type: 'markdown' }): { success: boolean; failure?: { code: string; message: string } };
  extract(input: Record<string, never>): { blocks: Array<{ nodeId: string; type: string; text: string }> };
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

const TAG = 'customer';
const INITIAL = 'Acme';
const SEED = `# Mutual NDA\n\n${INITIAL} agrees that the confidential information shall be used only for evaluating the proposed engagement.`;
const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

const statusEl = qs<HTMLElement>('#status');
const valueInput = qs<HTMLInputElement>('#value');
valueInput.value = INITIAL;

let api: DocumentApi | null = null;
setBusy(true);

const superdoc = new SuperDoc({
  selector: '#editor',
  documentMode: 'editing',
  jsonOverride: EMPTY_DOC,
  modules: { comments: false },
  telemetry: { enabled: false },
  onReady: ({ superdoc: sd }) => void initialize(sd as SuperDoc & { activeEditor: { doc: DocumentApi } | null }),
});

qs<HTMLButtonElement>('#apply').addEventListener('click', () => void apply());

async function initialize(sd: SuperDoc & { activeEditor: { doc: DocumentApi } | null }): Promise<void> {
  if (!sd.activeEditor?.doc) return setStatus('Document API unavailable');
  api = sd.activeEditor.doc;

  // Setup: seed one paragraph, then wrap "Acme" in one inline content control.
  const cleared = api.clearContent({});
  if (!cleared.success && cleared.failure?.code !== 'NO_OP') return setStatus(cleared.failure?.message ?? 'Setup failed');

  const inserted = api.insert({ value: SEED, type: 'markdown' });
  if (!inserted.success) return setStatus(inserted.failure?.message ?? 'Setup failed');

  const block = api.extract({}).blocks.find((b) => b.text.includes(INITIAL));
  if (!block) return setStatus('Setup failed: anchor block not found');
  const start = block.text.indexOf(INITIAL);
  const wrap = api.create.contentControl({
    kind: 'inline',
    controlType: 'text',
    at: { kind: 'selection', start: { kind: 'text', blockId: block.nodeId, offset: start }, end: { kind: 'text', blockId: block.nodeId, offset: start + INITIAL.length } },
    tag: TAG,
    alias: 'Customer',
    lockMode: 'unlocked',
  });
  if (!wrap.success) return setStatus(wrap.failure.message);

  setStatus('Ready');
  setBusy(false);
}

// The lesson: find by tag, push a value.
async function apply(): Promise<void> {
  if (!api) return;
  setBusy(true);
  const { items } = api.contentControls.selectByTag({ tag: TAG });
  if (items.length === 0) {
    setStatus('No control found');
    setBusy(false);
    return;
  }
  for (const { target } of items) {
    const result = api.contentControls.text.setValue({ target, value: valueInput.value });
    if (!result.success && result.failure.code !== 'NO_OP') {
      setStatus(result.failure.message);
      setBusy(false);
      return;
    }
  }
  setStatus('Applied');
  setBusy(false);
}

function setBusy(busy: boolean): void {
  document.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.disabled = busy));
}

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function qs<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element ${selector}`);
  return el;
}

const teardown = () => superdoc.destroy();
window.addEventListener('beforeunload', teardown);
if (import.meta.hot) import.meta.hot.dispose(teardown);
