/**
 * Metadata anchors: the smallest anchored-payload workflow.
 *
 * Setup (not the lesson):
 *   1. Seed one paragraph with anchor text.
 *
 * Teaching surface (the lesson, in click order):
 *   1. `editor.doc.metadata.attach({ target, namespace, id, payload })`
 *   2. `editor.doc.metadata.list({ namespace })`
 *   3. `editor.doc.metadata.get({ id })`
 *   4. `editor.doc.metadata.resolve({ id })`
 *   5. `editor.doc.metadata.remove({ id })`
 *
 * Every operation goes through `editor.doc.*`. The same operation set
 * runs headless via the Node SDK and CLI.
 *
 * A metadata anchor is a hidden inline content control around the
 * anchored text whose `w:tag` carries a stable id, paired with a JSON
 * payload in a namespaced custom XML data part. The customer-facing
 * use case people most often build on this is source-grounded
 * citations (see `demos/custom-ui`); the primitive is general and
 * works for any span-bound payload.
 */

import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import './style.css';

type SelectionTarget = {
  kind: 'selection';
  start: { kind: 'text'; blockId: string; offset: number };
  end: { kind: 'text'; blockId: string; offset: number };
};

type AnchoredMetadataPayload = Record<string, unknown>;

type AnchoredMetadataInfo = {
  id: string;
  namespace: string;
  partName: string;
  payload: AnchoredMetadataPayload;
};

type AnchoredMetadataResolveInfo = {
  id: string;
  target: SelectionTarget;
};

type AnchoredMetadataAttachResult =
  | { success: true; id: string; namespace: string; partName: string }
  | { success: false; failure: { code: string; message: string } };

type AnchoredMetadataMutationResult =
  | { success: true }
  | { success: false; failure: { code: string; message: string } };

type DocumentApi = {
  clearContent(input: Record<string, never>): { success: boolean; failure?: { code: string; message: string } };
  insert(input: { value: string }): { success: boolean; failure?: { code: string; message: string } };
  extract(input: Record<string, never>): { blocks: Array<{ nodeId: string; type: string; text: string }> };
  metadata: {
    attach(input: {
      target: SelectionTarget;
      namespace: string;
      id?: string;
      payload: AnchoredMetadataPayload;
    }): AnchoredMetadataAttachResult;
    list(input: { namespace?: string }): { total: number; items: Array<{ id: string; namespace: string; partName: string }> };
    get(input: { id: string }): AnchoredMetadataInfo | null;
    resolve(input: { id: string }): AnchoredMetadataResolveInfo | null;
    remove(input: { id: string }): AnchoredMetadataMutationResult;
  };
};

const NAMESPACE = 'urn:superdoc:example:metadata-anchors:1';
const ID = 'anchor-1';
const ANCHOR_PHRASE = 'metadata anchors';
const SEED = `Hover over ${ANCHOR_PHRASE} below to see this primitive in action. Open the console to follow the operation receipts.`;
const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

const statusEl = qs<HTMLElement>('#status');
const resultEl = qs<HTMLElement>('#result');
const attachBtn = qs<HTMLButtonElement>('#attach');
const listBtn = qs<HTMLButtonElement>('#list');
const getBtn = qs<HTMLButtonElement>('#get');
const resolveBtn = qs<HTMLButtonElement>('#resolve');
const removeBtn = qs<HTMLButtonElement>('#remove');

let api: DocumentApi | null = null;
let anchorTarget: SelectionTarget | null = null;
let attached = false;
setBusy(true);

const superdoc = new SuperDoc({
  selector: '#editor',
  documentMode: 'editing',
  jsonOverride: EMPTY_DOC,
  modules: { comments: false },
  telemetry: { enabled: false },
  onReady: ({ superdoc: sd }) => void initialize(sd as SuperDoc & { activeEditor: { doc: DocumentApi } | null }),
});

attachBtn.addEventListener('click', () => void run(doAttach));
listBtn.addEventListener('click', () => void run(doList));
getBtn.addEventListener('click', () => void run(doGet));
resolveBtn.addEventListener('click', () => void run(doResolve));
removeBtn.addEventListener('click', () => void run(doRemove));

async function initialize(sd: SuperDoc & { activeEditor: { doc: DocumentApi } | null }): Promise<void> {
  if (!sd.activeEditor?.doc) return setStatus('Document API unavailable');
  api = sd.activeEditor.doc;

  const cleared = api.clearContent({});
  if (!cleared.success && cleared.failure?.code !== 'NO_OP') return setStatus(cleared.failure?.message ?? 'Setup failed');

  const inserted = api.insert({ value: SEED });
  if (!inserted.success) return setStatus(inserted.failure?.message ?? 'Setup failed');

  // Cache the SelectionTarget for `ANCHOR_PHRASE` so each Attach click
  // re-runs the same operation against the same span.
  const block = api.extract({}).blocks.find((b) => b.text.includes(ANCHOR_PHRASE));
  if (!block) return setStatus('Setup failed: anchor span not found');
  const start = block.text.indexOf(ANCHOR_PHRASE);
  anchorTarget = {
    kind: 'selection',
    start: { kind: 'text', blockId: block.nodeId, offset: start },
    end: { kind: 'text', blockId: block.nodeId, offset: start + ANCHOR_PHRASE.length },
  };

  setStatus('Ready. Click Attach to anchor a payload to the highlighted span.');
  refreshButtons();
}

// The lesson.

function doAttach(): unknown {
  if (!api || !anchorTarget) return null;
  const result = api.metadata.attach({
    target: anchorTarget,
    namespace: NAMESPACE,
    id: ID,
    payload: { note: 'minimal example payload', createdAt: new Date().toISOString() },
  });
  if (result.success) attached = true;
  return result;
}

function doList(): unknown {
  if (!api) return null;
  return api.metadata.list({ namespace: NAMESPACE });
}

function doGet(): unknown {
  if (!api) return null;
  return api.metadata.get({ id: ID });
}

function doResolve(): unknown {
  if (!api) return null;
  return api.metadata.resolve({ id: ID });
}

function doRemove(): unknown {
  if (!api) return null;
  const result = api.metadata.remove({ id: ID });
  if (result.success) attached = false;
  return result;
}

function run(op: () => unknown): void {
  if (!api) return;
  setBusy(true);
  try {
    const out = op();
    resultEl.textContent = JSON.stringify(out, null, 2);
    setStatus('Done.');
  } catch (err) {
    resultEl.textContent = String(err);
    setStatus('Operation threw.');
  } finally {
    refreshButtons();
  }
}

function refreshButtons(): void {
  attachBtn.disabled = !api || attached;
  listBtn.disabled = !api;
  getBtn.disabled = !api || !attached;
  resolveBtn.disabled = !api || !attached;
  removeBtn.disabled = !api || !attached;
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
