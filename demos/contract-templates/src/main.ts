/**
 * Content controls: durable, tag-keyed regions you drive from your app.
 *
 * One primitive, two flows:
 *
 * 1. Smart fields. Inline content controls share a `tag` value
 *    ("customer-name", "jurisdiction", ...) across every occurrence.
 *    Push a value with `selectByTag` + `text.setValue` across every match.
 *
 * 2. Reusable sections. A block content control carries
 *    `{ sectionId, version }` in its `tag`. The app reads the live
 *    version from `contentControls.list` after every change and
 *    offers an "update available" CTA when the document's version
 *    falls behind the section library. Updating is `replaceContent`
 *    + `patch`.
 *
 * Every operation is on `editor.doc.*`. The demo never reaches
 * into the editor extensions or the converter directly.
 *
 * The `findBlock(text)` lookup at seed time is for the example only.
 * Real apps capture the `target` returned by `doc.create.contentControl`
 * or store the `nodeId` from `doc.extract` once at creation time.
 */

import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import './style.css';
import type {
  ContentControlInfo,
  ContentControlTarget,
  DocumentApi,
  ExtractBlock,
  FieldKey,
  MutationResult,
  SectionVersion,
  SelectionTarget,
  TagPayload,
} from './types';

type DemoEditor = { doc: DocumentApi };
type DemoSuperDoc = SuperDoc & { activeEditor: DemoEditor | null };

const SECTION_ID = 'limitation-liability';
const LATEST_VERSION: SectionVersion = 'v2';

const FIELDS: Array<{ key: FieldKey; label: string; prefix: string; value: string }> = [
  { key: 'customerName', label: 'Customer', prefix: 'Customer: ', value: 'Acme Therapeutics' },
  { key: 'jurisdiction', label: 'Jurisdiction', prefix: 'Jurisdiction: ', value: 'California' },
  { key: 'effectiveDate', label: 'Effective date', prefix: 'Effective date: ', value: 'May 13, 2026' },
];

const SECTIONS: Record<SectionVersion, string> = {
  v1: 'Supplier liability is limited to fees paid in the prior 12 months, excluding confidentiality and indemnity obligations.',
  v2: 'Supplier liability is limited to fees paid in the prior 24 months. Data security, confidentiality, and indemnity obligations are excluded from the cap.',
};

const SECTION_LABEL = 'Limitation of liability';

const SEED = [
  '# Service agreement',
  '',
  ...FIELDS.flatMap((f) => [`${f.prefix}${f.value}`, '']),
  'The parties agree to provide services under the terms below.',
  '',
  SECTIONS.v1,
].join('\n');

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

const state = {
  editor: null as DemoEditor | null,
  sectionVersion: 'v1' as SectionVersion,
};

const statusEl = qs<HTMLElement>('#status');
const sectionVersionEl = qs<HTMLElement>('#section-version');
const updateBannerEl = qs<HTMLElement>('#update-banner');
const applyUpdateBtn = qs<HTMLButtonElement>('#apply-update');

const fieldInputs = Object.fromEntries(
  FIELDS.map((f) => [f.key, qs<HTMLInputElement>(`#field-${f.key}`)]),
) as Record<FieldKey, HTMLInputElement>;

for (const field of FIELDS) {
  fieldInputs[field.key].value = field.value;
}

setBusy(true);

const superdoc = new SuperDoc({
  selector: '#editor',
  documentMode: 'editing',
  jsonOverride: EMPTY_DOC,
  modules: { comments: false },
  telemetry: { enabled: false },
  onReady: ({ superdoc }) => {
    void initialize(superdoc as DemoSuperDoc);
  },
});

// Debug handle so the example is inspectable from the console.
(window as unknown as { __cc: { superdoc: SuperDoc; doc: () => DocumentApi | null } }).__cc = {
  superdoc,
  doc: () => state.editor?.doc ?? null,
};

qs<HTMLButtonElement>('#apply-fields').addEventListener('click', () => {
  void run('Smart fields applied', applySmartFields);
});

applyUpdateBtn.addEventListener('click', () => {
  void run(`Section updated to ${LATEST_VERSION}`, () => applySection(LATEST_VERSION));
});

async function initialize(instance: DemoSuperDoc): Promise<void> {
  if (!instance.activeEditor?.doc) {
    setStatus('Document API unavailable');
    return;
  }
  state.editor = instance.activeEditor;
  await seedDocument();
  setStatus('Ready');
  setBusy(false);
}

async function seedDocument(): Promise<void> {
  const doc = getDoc();

  const cleared = doc.clearContent({});
  if (!cleared.success && cleared.failure?.code !== 'NO_OP') throw new Error(cleared.failure?.message);

  const inserted = doc.insert({ value: SEED, type: 'markdown' });
  if (!inserted.success) throw new Error(inserted.failure?.message ?? 'Failed to insert seed content.');

  for (const field of FIELDS) {
    const text = `${field.prefix}${field.value}`;
    const block = findBlock(doc.extract({}).blocks, text);
    assertMutation(
      doc.create.contentControl({
        kind: 'inline',
        controlType: 'text',
        at: textSelection(block.nodeId, field.prefix.length, text.length),
        tag: tagForField(field.key),
        alias: field.label,
        lockMode: 'unlocked',
      }),
      `Could not create ${field.label} field.`,
    );
  }

  const sectionBlock = findBlock(doc.extract({}).blocks, SECTIONS.v1);
  assertMutation(
    doc.create.contentControl({
      kind: 'block',
      controlType: 'text',
      at: blockSelection(sectionBlock),
      tag: tagForSection('v1'),
      alias: `${SECTION_LABEL} (v1)`,
      lockMode: 'unlocked',
    }),
    'Could not create reusable section.',
  );

  state.sectionVersion = 'v1';
  refreshState();
}

async function applySmartFields(): Promise<void> {
  const doc = getDoc();
  for (const field of FIELDS) {
    const controls = doc.contentControls.selectByTag({ tag: tagForField(field.key) }).items;
    for (const control of controls) {
      assertMutation(
        doc.contentControls.text.setValue({
          target: control.target,
          value: fieldInputs[field.key].value,
        }),
        `Could not update ${field.label}.`,
        true,
      );
    }
  }
}

async function applySection(version: SectionVersion): Promise<void> {
  const doc = getDoc();
  const control = findSectionControl();
  if (!control) throw new Error('Reusable section is not in the document.');

  assertMutation(
    doc.contentControls.replaceContent({
      target: control.target,
      content: SECTIONS[version],
      format: 'text',
    }),
    'Could not replace section content.',
    true,
  );
  const refreshed = findSectionControl() ?? control;
  assertMutation(
    doc.contentControls.patch({
      target: refreshed.target,
      tag: tagForSection(version),
      alias: `${SECTION_LABEL} (${version})`,
    }),
    'Could not patch section metadata.',
    true,
  );

  state.sectionVersion = version;
}

async function run(status: string, action: () => Promise<void>): Promise<void> {
  setBusy(true);
  setStatus('Working');
  try {
    await action();
    refreshState();
    setStatus(status);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Operation failed');
  } finally {
    setBusy(false);
  }
}

function refreshState(): void {
  const doc = state.editor?.doc;
  if (!doc) return;
  const control = findSectionControl();
  const tag = parseTag(control?.properties?.tag);
  if (tag?.kind === 'reusableSection') state.sectionVersion = tag.version;

  sectionVersionEl.textContent = state.sectionVersion;

  const outOfDate = state.sectionVersion !== LATEST_VERSION;
  updateBannerEl.hidden = !outOfDate;
}

function findSectionControl(): ContentControlInfo | undefined {
  const doc = getDoc();
  return doc.contentControls
    .list({})
    .items.find((c) => parseTag(c.properties?.tag)?.kind === 'reusableSection');
}

function getDoc(): DocumentApi {
  if (!state.editor?.doc) throw new Error('Document API is not ready.');
  return state.editor.doc;
}

function findBlock(blocks: ExtractBlock[], text: string): ExtractBlock {
  const block = blocks.find((b) => b.text === text);
  if (!block) throw new Error(`Could not find seed block: ${text}`);
  return block;
}

function textSelection(blockId: string, start: number, end: number): SelectionTarget {
  return {
    kind: 'selection',
    start: { kind: 'text', blockId, offset: start },
    end: { kind: 'text', blockId, offset: end },
  };
}

function blockSelection(block: ExtractBlock): SelectionTarget {
  const node = { kind: 'block' as const, nodeType: block.type, nodeId: block.nodeId };
  return {
    kind: 'selection',
    start: { kind: 'nodeEdge', node, edge: 'before' },
    end: { kind: 'nodeEdge', node, edge: 'after' },
  };
}

function tagForField(key: FieldKey): string {
  return JSON.stringify({ kind: 'smartField', key } satisfies TagPayload);
}

function tagForSection(version: SectionVersion): string {
  return JSON.stringify({ kind: 'reusableSection', sectionId: SECTION_ID, version } satisfies TagPayload);
}

function parseTag(tag: string | undefined): TagPayload | null {
  if (!tag) return null;
  try {
    const payload = JSON.parse(tag) as TagPayload;
    if (payload.kind === 'smartField' || payload.kind === 'reusableSection') return payload;
    return null;
  } catch {
    return null;
  }
}

function assertMutation(result: MutationResult, message: string, allowNoOp = false): void {
  if (result.success) return;
  if (allowNoOp && result.failure.code === 'NO_OP') return;
  throw new Error(result.failure.message || message);
}

function setBusy(busy: boolean): void {
  document.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    button.disabled = busy;
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

const teardown = () => {
  superdoc.destroy();
};
window.addEventListener('beforeunload', teardown);
if (import.meta.hot) import.meta.hot.dispose(teardown);
