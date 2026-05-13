/**
 * Reusable section: a tagged block that knows its version.
 *
 * The section is wrapped in a block content control whose `tag` encodes
 * `{ kind: 'reusableSection', sectionId, version }`. The app reads the
 * live version from `contentControls.list`, compares it to the library's
 * latest version, and offers an in-place update when they diverge.
 *
 * Updating is `contentControls.replaceContent` (new body) + `contentControls.patch`
 * (new tag carrying the new version).
 *
 * Every operation goes through `editor.doc.*`. The same operation set
 * runs headless via the Node SDK and CLI.
 */

import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import './style.css';

type NodeKind = 'block' | 'inline';
type LockMode = 'unlocked' | 'sdtLocked' | 'contentLocked' | 'sdtContentLocked';
type SectionVersion = 'v1' | 'v2';

type SelectionPoint =
  | { kind: 'text'; blockId: string; offset: number }
  | { kind: 'nodeEdge'; node: { kind: 'block'; nodeType: string; nodeId: string }; edge: 'before' | 'after' };

type SelectionTarget = { kind: 'selection'; start: SelectionPoint; end: SelectionPoint };
type ContentControlTarget = { kind: NodeKind; nodeType: 'sdt'; nodeId: string };

type MutationResult =
  | { success: true; contentControl: ContentControlTarget }
  | { success: false; failure: { code: string; message: string } };

type ExtractBlock = { nodeId: string; type: string; text: string };

type ContentControlInfo = {
  target: ContentControlTarget;
  controlType: string;
  lockMode: LockMode;
  properties?: { tag?: string; alias?: string };
  text?: string;
};

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
    list(input?: Record<string, unknown>): { items: ContentControlInfo[]; total: number };
    patch(input: { target: ContentControlTarget; tag?: string; alias?: string }): MutationResult;
    replaceContent(input: { target: ContentControlTarget; content: string; format?: 'text' }): MutationResult;
  };
};

type DemoEditor = { doc: DocumentApi };

type TagPayload = { kind: 'reusableSection'; sectionId: string; version: SectionVersion };

const SECTION_ID = 'limitation-liability';
const LATEST: SectionVersion = 'v2';
const LABEL = 'Limitation of liability';

const SECTIONS: Record<SectionVersion, string> = {
  v1: 'Supplier liability is limited to fees paid in the prior 12 months, excluding confidentiality and indemnity obligations.',
  v2: 'Supplier liability is limited to fees paid in the prior 24 months. Data security, confidentiality, and indemnity obligations are excluded from the cap.',
};

const SEED = ['# Service agreement', '', 'The parties agree to the terms below.', '', SECTIONS.v1].join('\n');
const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

const statusEl = qs<HTMLElement>('#status');
const versionEl = qs<HTMLElement>('#version');
const bannerEl = qs<HTMLElement>('#banner');
const applyBtn = qs<HTMLButtonElement>('#apply');

let editor: DemoEditor | null = null;
let currentVersion: SectionVersion = 'v1';

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

applyBtn.addEventListener('click', () => {
  void run(`Updated to ${LATEST}`, () => applyUpdate(LATEST));
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

  // Wrap the v1 section paragraph in a block content control with a structured tag.
  // In production, capture the `target` returned by create.contentControl instead of
  // scanning blocks again — this lookup is for demo simplicity.
  const block = doc.extract({}).blocks.find((b) => b.text === SECTIONS.v1);
  if (!block) throw new Error('Seed block not found.');

  const node = { kind: 'block' as const, nodeType: block.type, nodeId: block.nodeId };
  assertMutation(
    doc.create.contentControl({
      kind: 'block',
      controlType: 'text',
      at: {
        kind: 'selection',
        start: { kind: 'nodeEdge', node, edge: 'before' },
        end: { kind: 'nodeEdge', node, edge: 'after' },
      },
      tag: tagFor('v1'),
      alias: `${LABEL} (v1)`,
      lockMode: 'unlocked',
    }),
    'Could not wrap section.',
  );

  currentVersion = 'v1';
  refresh();
}

async function applyUpdate(version: SectionVersion): Promise<void> {
  const doc = getDoc();
  const control = findSection();
  if (!control) throw new Error('Section not found.');

  assertMutation(
    doc.contentControls.replaceContent({
      target: control.target,
      content: SECTIONS[version],
      format: 'text',
    }),
    'Could not replace section.',
    true,
  );
  const after = findSection();
  if (after) {
    assertMutation(
      doc.contentControls.patch({
        target: after.target,
        tag: tagFor(version),
        alias: `${LABEL} (${version})`,
      }),
      'Could not patch tag.',
      true,
    );
  }

  currentVersion = version;
}

async function run(status: string, action: () => Promise<void>): Promise<void> {
  setBusy(true);
  setStatus('Working');
  try {
    await action();
    refresh();
    setStatus(status);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Operation failed');
  } finally {
    setBusy(false);
  }
}

function refresh(): void {
  const doc = editor?.doc;
  if (!doc) return;
  const control = findSection();
  const tag = parseTag(control?.properties?.tag);
  if (tag) currentVersion = tag.version;
  versionEl.textContent = currentVersion;
  bannerEl.hidden = currentVersion === LATEST;
}

function findSection(): ContentControlInfo | undefined {
  const doc = getDoc();
  return doc.contentControls.list({}).items.find((c) => parseTag(c.properties?.tag));
}

function tagFor(version: SectionVersion): string {
  return JSON.stringify({ kind: 'reusableSection', sectionId: SECTION_ID, version } satisfies TagPayload);
}

function parseTag(tag: string | undefined): TagPayload | null {
  if (!tag) return null;
  try {
    const p = JSON.parse(tag) as TagPayload;
    return p.kind === 'reusableSection' ? p : null;
  } catch {
    return null;
  }
}

function getDoc(): DocumentApi {
  if (!editor?.doc) throw new Error('Document API is not ready.');
  return editor.doc;
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
