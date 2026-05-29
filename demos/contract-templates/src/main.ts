/**
 * Contract templates: a runtime workflow on Word content controls.
 *
 * The document is a Mutual NDA (`public/nda-template.docx`)
 * with content controls already in place:
 *   - Seven inline plain-text content controls across five field keys
 *     (disclosing party, receiving party, effective date, purpose, term
 *     length). Authored via Word's `ContentControls.Add(1, range)`, so their
 *     `w:sdtPr` carries `<w:text/>` and they resolve as `controlType: 'text'`.
 *     Receiving party and Purpose each appear twice: once in the header
 *     sentence and once nested inside the Permitted Use block clause.
 *   - Six block rich-text content controls (Preamble, Confidentiality,
 *     Permitted Use, Term and Termination, Governing Law, Limitation of
 *     Liability). Authored via `ContentControls.Add(0, range)`, which
 *     produces typeless sdtPr that resolves as `controlType: 'richText'`
 *     per ECMA-376 §17.5.2.26. Each block carries
 *     `{ kind: 'reusableSection', sectionId, version }` in its tag.
 *
 * The app:
 *   1. Loads the fixture as its starting document.
 *   2. Reads each field's text and each clause's version from the parsed SDTs.
 *   3. Compares clause versions against the local library and surfaces a
 *      Review CTA on every stale clause with a one-line summary of the change.
 *   4. Field inputs are reactive: typing in a value debounces by ~250ms and
 *      fans the new text to every occurrence via `selectByTag` + per-occurrence
 *      `text.setValue` (the typed API path for plain-text controls).
 *   5. Review expands a card showing the in-document clause alongside the
 *      library version. Replace with library clause swaps body via
 *      `replaceContent` and bumps the tag version via `patch`.
 *   6. Export has two paths: raw DOCX keeps content controls for future
 *      template/library updates; clean DOCX flattens controls to final values.
 *
 * Every mutation goes through `editor.doc.*`. The same operation set runs
 * headless via the Node SDK and CLI.
 *
 * For a packaged React authoring component (`{{` trigger, linked field
 * groups, owner/signer types, DOCX export), see `@superdoc-dev/template-builder`.
 */

import { SuperDoc } from 'superdoc';
import { createSuperDocUI } from 'superdoc/ui';
import 'superdoc/style.css';
import './style.css';
import { attachFieldChip } from './field-chip.js';

type NodeKind = 'block' | 'inline';
type LockMode = 'unlocked' | 'sdtLocked' | 'contentLocked' | 'sdtContentLocked';
type ContentControlTarget = { kind: NodeKind; nodeType: 'sdt'; nodeId: string };

type ContentControlInfo = {
  target: ContentControlTarget;
  controlType: string;
  lockMode: LockMode;
  properties?: { tag?: string; alias?: string };
  text?: string;
};

type MutationResult =
  | { success: true; contentControl: ContentControlTarget }
  | { success: false; failure: { code: string; message: string } };

type DocumentApi = {
  contentControls: {
    list(input?: Record<string, unknown>): { items: ContentControlInfo[]; total: number };
    selectByTag(input: { tag: string }): { items: ContentControlInfo[]; total: number };
    patch(input: { target: ContentControlTarget; tag?: string; alias?: string }): MutationResult;
    replaceContent(input: { target: ContentControlTarget; content: string; format?: 'text' }): MutationResult;
    text: {
      setValue(input: { target: ContentControlTarget; value: string }): MutationResult;
    };
  };
};

type DemoEditor = { doc: DocumentApi };
type DemoSuperDoc = SuperDoc & { activeEditor: DemoEditor | null };

// ---------------------------------------------------------------------------
// Library: fields and clauses (matches the keys/sectionIds in the fixture)
// ---------------------------------------------------------------------------

type FieldKey = 'disclosingParty' | 'receivingParty' | 'effectiveDate' | 'purpose' | 'termLength';

const FIELDS: { key: FieldKey; label: string }[] = [
  { key: 'disclosingParty', label: 'Disclosing party' },
  { key: 'receivingParty', label: 'Receiving party' },
  { key: 'effectiveDate', label: 'Effective date' },
  { key: 'purpose', label: 'Purpose' },
  { key: 'termLength', label: 'Term' },
];

type ClauseId =
  | 'preamble'
  | 'confidentiality'
  | 'permittedUse'
  | 'termination'
  | 'governingLaw'
  | 'limitationOfLiability';

type PreviewSegment = { kind: 'same' | 'insert' | 'delete'; text: string };

type LibraryClause = {
  id: ClauseId;
  label: string;
  latestVersion: string;
  /** Upgrade prose. Only defined when `latestVersion` differs from v1. */
  upgrade?: {
    version: string;
    summary: string;
    body: string;
    /** Hand-authored proposed-change view shown in the review panel. */
    preview: PreviewSegment[];
  };
};

const CLAUSE_LIBRARY: LibraryClause[] = [
  { id: 'preamble', label: 'Preamble', latestVersion: 'v1' },
  {
    id: 'confidentiality',
    label: 'Confidentiality Obligations',
    latestVersion: 'v2',
    upgrade: {
      version: 'v2',
      summary: 'Extends survival period from 2 years to 5 years.',
      body: 'Each party will treat the other party\u2019s Confidential Information as confidential and will protect it with at least the same care it uses for its own confidential information. These obligations survive disclosure for five (5) years.',
      preview: [
        { kind: 'same', text: 'Each party will treat the other party\u2019s Confidential Information as confidential and will protect it with at least the same care it uses for its own confidential information. These obligations survive disclosure for ' },
        { kind: 'delete', text: 'two (2) years' },
        { kind: 'insert', text: 'five (5) years' },
        { kind: 'same', text: '.' },
      ],
    },
  },
  { id: 'permittedUse', label: 'Permitted Use', latestVersion: 'v1' },
  { id: 'termination', label: 'Term and Termination', latestVersion: 'v1' },
  {
    id: 'governingLaw',
    label: 'Governing Law',
    latestVersion: 'v2',
    upgrade: {
      version: 'v2',
      summary: 'Changes governing law from California to New York.',
      body: 'This Agreement is governed by the laws of the State of New York, without regard to its conflicts of law provisions.',
      preview: [
        { kind: 'same', text: 'This Agreement is governed by the laws of the State of ' },
        { kind: 'delete', text: 'California' },
        { kind: 'insert', text: 'New York' },
        { kind: 'same', text: ', without regard to its conflicts of law provisions.' },
      ],
    },
  },
  {
    id: 'limitationOfLiability',
    label: 'Limitation of Liability',
    latestVersion: 'v2',
    upgrade: {
      version: 'v2',
      summary: 'Extends liability cap from 12 to 24 months and excludes confidentiality and indemnity obligations.',
      body: 'Each party\u2019s aggregate liability under this Agreement is limited to fees paid in the twenty-four (24) months preceding the claim. Confidentiality breaches and indemnity obligations are excluded from this cap.',
      preview: [
        { kind: 'same', text: 'Each party\u2019s aggregate liability under this Agreement is limited to fees paid in the ' },
        { kind: 'delete', text: 'twelve (12)' },
        { kind: 'insert', text: 'twenty-four (24)' },
        { kind: 'same', text: ' months preceding the claim.' },
        { kind: 'insert', text: ' Confidentiality breaches and indemnity obligations are excluded from this cap.' },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Tag helpers
// ---------------------------------------------------------------------------

type SmartFieldTag = { kind: 'smartField'; key: FieldKey };
type ReusableSectionTag = { kind: 'reusableSection'; sectionId: ClauseId; version: string };
type TagPayload = SmartFieldTag | ReusableSectionTag;

const fieldTag = (key: FieldKey) => JSON.stringify({ kind: 'smartField', key } satisfies SmartFieldTag);
const clauseTag = (sectionId: ClauseId, version: string) =>
  JSON.stringify({ kind: 'reusableSection', sectionId, version } satisfies ReusableSectionTag);

const parseTag = (tag: string | undefined): TagPayload | null => {
  if (!tag) return null;
  try {
    const p = JSON.parse(tag) as TagPayload;
    if (p.kind === 'smartField' || p.kind === 'reusableSection') return p;
    return null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// State and DOM
// ---------------------------------------------------------------------------

const state = {
  editor: null as DemoEditor | null,
  values: {} as Record<FieldKey, string>,
  versions: {} as Record<ClauseId, string>,
  expandedClause: null as ClauseId | null,
  /** UI controller; created in `initialize`, disposed by `teardown`. */
  ui: null as ReturnType<typeof createSuperDocUI> | null,
  /** Field-chip detach handle; created in `initialize`, called by `teardown`. */
  fieldChipTeardown: null as (() => void) | null,
};

const statusEl = qs<HTMLElement>('#status');
const summaryEl = qs<HTMLElement>('#summary');
const fieldsPanelEl = qs<HTMLElement>('#fields-panel');
const clausesPanelEl = qs<HTMLElement>('#clauses-panel');

setBusy(true);

const superdoc = new SuperDoc({
  selector: '#editor',
  documentMode: 'editing',
  document: '/nda-template.docx',
  // Disable SuperDoc's built-in SDT chrome (border, label, hover/selection
  // highlight). The wrappers and data-sdt-* datasets are preserved, so the
  // contextual field chip (field-chip.ts) and the document API still work;
  // this demo paints its own SDT visuals in style.css instead.
  modules: { comments: false, contentControls: { chrome: 'none' } },
  telemetry: { enabled: false },
  onReady: ({ superdoc: sd }) => void initialize(sd as DemoSuperDoc),
});

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

document.querySelectorAll<HTMLButtonElement>('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    if (!target) return;
    document.querySelectorAll<HTMLButtonElement>('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    document
      .querySelectorAll<HTMLElement>('[data-panel]')
      .forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== target));
  });
});

// ---------------------------------------------------------------------------
// Top toolbar
// ---------------------------------------------------------------------------

qs<HTMLButtonElement>('#export-raw').addEventListener(
  'click',
  () => void run('Exported raw Mutual NDA.docx', () => exportDocument('raw')),
);
qs<HTMLButtonElement>('#export-clean').addEventListener(
  'click',
  () => void run('Exported clean Mutual NDA.docx', () => exportDocument('clean')),
);

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

async function initialize(instance: DemoSuperDoc): Promise<void> {
  if (!instance.activeEditor?.doc) {
    setStatus('Document API unavailable');
    return;
  }
  state.editor = instance.activeEditor;
  readStateFromDocument();
  renderPanels();
  refreshSummary();

  // Contextual smart-field chip (SD-3157). Plain TS — uses the
  // public `superdoc/ui` controller directly, no framework. The chip
  // anchors over the active smart-field SDT and shows the field's
  // label + current value tracked in `state.values`. See
  // `field-chip.ts` for the scope cut and follow-up notes.
  //
  // Both the UI controller and the chip teardown are stashed on
  // `state` so the module-level `teardown()` handler can dispose them
  // on page unload / Vite HMR. Without that, every hot reload would
  // leave the previous controller's scroll/resize listeners attached
  // to `window` and the previous chip element in the DOM.
  state.ui = createSuperDocUI({ superdoc: instance });
  // Active control comes from the SuperDoc event (SD-3232); placement from
  // the UI controller's getRect (SD-3157).
  state.fieldChipTeardown = attachFieldChip(instance, state.ui, {
    labelFor: (key) => FIELDS.find((f) => f.key === (key as FieldKey))?.label ?? key,
    valueFor: (key) => state.values[key as FieldKey],
  });

  setStatus('Ready');
  setBusy(false);
}

/** Read field values and clause versions from the loaded fixture. */
function readStateFromDocument(): void {
  const doc = getDoc();
  for (const ctrl of doc.contentControls.list({}).items) {
    const tag = parseTag(ctrl.properties?.tag);
    if (!tag) continue;
    if (tag.kind === 'smartField') {
      state.values[tag.key] = ctrl.text ?? '';
    } else if (tag.kind === 'reusableSection') {
      state.versions[tag.sectionId] = tag.version;
    }
  }
}

// ---------------------------------------------------------------------------
// Mutations: smart fields, clause updates, export
// ---------------------------------------------------------------------------

/** Push a single field's value to every occurrence in the document. */
function applyField(key: FieldKey, value: string): void {
  if (!state.editor?.doc) return;
  state.values[key] = value;
  const { items } = state.editor.doc.contentControls.selectByTag({ tag: fieldTag(key) });
  for (const ctrl of items) {
    state.editor.doc.contentControls.text.setValue({ target: ctrl.target, value });
  }
}

async function applyClauseVersion(clauseId: ClauseId, toVersion: string, body: string): Promise<void> {
  const doc = getDoc();
  const clause = CLAUSE_LIBRARY.find((c) => c.id === clauseId);
  if (!clause) return;

  const ctrl = findClauseControl(clauseId);
  if (!ctrl) throw new Error(`Clause ${clauseId} not in document`);

  assertMutation(
    doc.contentControls.replaceContent({ target: ctrl.target, content: body, format: 'text' }),
    `Could not update ${clause.label}`,
    true,
  );

  const refreshed = findClauseControl(clauseId) ?? ctrl;
  assertMutation(
    doc.contentControls.patch({
      target: refreshed.target,
      tag: clauseTag(clauseId, toVersion),
      alias: `${clause.label} (${toVersion})`,
    }),
    `Could not patch clause tag for ${clause.label}`,
    true,
  );

  state.versions[clauseId] = toVersion;
}

async function exportDocument(mode: 'raw' | 'clean'): Promise<void> {
  await superdoc.export({
    exportedName: mode === 'raw' ? 'Mutual NDA - raw' : 'Mutual NDA - clean',
    isFinalDoc: mode === 'clean',
    triggerDownload: true,
  });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Scroll the first control carrying `tag` into view. Dogfoods the shipped
 * public API: resolve the control id by tag (`selectByTag`), then
 * `ui.contentControls.scrollIntoView`. Scroll-only - it does not move the
 * cursor into the control (focus/activate is a separate concern).
 */
function locateByTag(tag: string): void {
  const ui = state.ui;
  const editor = state.editor;
  if (!ui || !editor?.doc) return;
  const { items } = editor.doc.contentControls.selectByTag({ tag });
  const first = items[0];
  if (!first) return;
  // `target.nodeId` is the SDT node id (= the painted `data-sdt-id`), which is
  // what scrollIntoView matches on.
  void ui.contentControls.scrollIntoView({ id: first.target.nodeId, block: 'center' });
}

/**
 * Focus the first control carrying `tag`: scroll to it AND put the caret
 * inside (ui.contentControls.focus), so the user can start editing. The
 * counterpart to locateByTag (scroll only).
 */
function focusByTag(tag: string): void {
  const ui = state.ui;
  const editor = state.editor;
  if (!ui || !editor?.doc) return;
  const { items } = editor.doc.contentControls.selectByTag({ tag });
  const first = items[0];
  if (!first) return;
  void ui.contentControls.focus({ id: first.target.nodeId, block: 'center' });
}

function renderPanels(): void {
  renderFieldsPanel();
  renderClausesPanel();
}

function renderFieldsPanel(): void {
  fieldsPanelEl.innerHTML = '';
  for (const field of FIELDS) {
    // A <div> wrapper (not <label>): a <label> may not contain interactive
    // content, so the Locate <button> must be a sibling of the input, with a
    // real <label for> tying the field name to the input.
    const row = document.createElement('div');
    row.className = 'row';
    const inputId = `field-${field.key}`;
    row.innerHTML = `
      <div class="row-label">
        <label class="row-label-text" for="${inputId}">${escapeHtml(field.label)}</label>
        <span class="row-actions">
          <button class="locate" type="button" data-locate-field="${escapeAttr(field.key)}" aria-label="Locate ${escapeAttr(field.label)} in the document" title="Scroll to this field">Locate</button>
          <button class="focus" type="button" data-focus-field="${escapeAttr(field.key)}" aria-label="Focus ${escapeAttr(field.label)} in the document" title="Scroll to this field and place the cursor in it">Focus</button>
        </span>
      </div>
      <input id="${inputId}" data-field="${field.key}" value="${escapeAttr(state.values[field.key] ?? '')}" />
    `;
    fieldsPanelEl.appendChild(row);
    row.querySelector<HTMLButtonElement>('.locate')?.addEventListener('click', () => {
      locateByTag(fieldTag(field.key));
    });
    row.querySelector<HTMLButtonElement>('.focus')?.addEventListener('click', () => {
      focusByTag(fieldTag(field.key));
    });
    const input = row.querySelector<HTMLInputElement>('input');
    if (!input) continue;
    // Reactive: each keystroke debounces ~250ms and fans the value to every
    // occurrence of this field's tag. Bypasses the `run()` wrapper so the
    // status bar doesn't flash on every keystroke.
    let timer: number | null = null;
    input.addEventListener('input', () => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        applyField(field.key, input.value);
      }, 250);
    });
  }
}

function renderClausesPanel(): void {
  clausesPanelEl.innerHTML = '';
  for (const clause of CLAUSE_LIBRARY) {
    const inDoc = state.versions[clause.id] ?? clause.latestVersion;
    const stale = clause.upgrade != null && inDoc !== clause.latestVersion;
    const expanded = stale && state.expandedClause === clause.id;

    const card = document.createElement('article');
    card.className = 'clause' + (stale ? ' stale' : ' current') + (expanded ? ' expanded' : '');

    if (stale && clause.upgrade) {
      const upgrade = clause.upgrade;
      const previewHtml = upgrade.preview.map(renderSegment).join('');
      card.innerHTML = `
        <header class="clause-header">
          <h3 class="clause-label">${escapeHtml(clause.label)}</h3>
          <div class="clause-actions">
            <span class="clause-status">Update available</span>
            <button class="locate" type="button" data-locate-clause="${escapeAttr(clause.id)}" aria-label="Locate ${escapeAttr(clause.label)} in the document" title="Scroll to this clause">Locate</button>
            <button class="focus" type="button" data-focus-clause="${escapeAttr(clause.id)}" aria-label="Focus ${escapeAttr(clause.label)} in the document" title="Scroll to this clause and place the cursor in it">Focus</button>
          </div>
        </header>
        <p class="clause-summary">${escapeHtml(upgrade.summary)}</p>
        <p class="clause-meta">Document ${escapeHtml(inDoc)} \u00b7 Library ${escapeHtml(upgrade.version)}</p>
        <button class="btn clause-review" type="button">${expanded ? 'Hide' : 'Review'}</button>
        ${
          expanded
            ? `
          <div class="clause-review-panel">
            <div class="review-label">Proposed change</div>
            <p class="clause-preview">${previewHtml}</p>
            <button class="btn primary clause-replace" type="button">Replace with library clause</button>
          </div>
        `
            : ''
        }
      `;
      card.querySelector<HTMLButtonElement>('.clause-review')?.addEventListener('click', () => {
        state.expandedClause = expanded ? null : clause.id;
        renderClausesPanel();
      });
      card.querySelector<HTMLButtonElement>('.clause-replace')?.addEventListener('click', () => {
        void run(`${clause.label}: replaced with library clause`, async () => {
          await applyClauseVersion(clause.id, upgrade.version, upgrade.body);
          state.expandedClause = null;
        });
      });
    } else {
      card.innerHTML = `
        <header class="clause-header">
          <h3 class="clause-label">${escapeHtml(clause.label)}</h3>
          <div class="clause-actions">
            <span class="clause-status muted">Current</span>
            <button class="locate" type="button" data-locate-clause="${escapeAttr(clause.id)}" aria-label="Locate ${escapeAttr(clause.label)} in the document" title="Scroll to this clause">Locate</button>
            <button class="focus" type="button" data-focus-clause="${escapeAttr(clause.id)}" aria-label="Focus ${escapeAttr(clause.label)} in the document" title="Scroll to this clause and place the cursor in it">Focus</button>
          </div>
        </header>
        <p class="clause-meta">Document ${escapeHtml(inDoc)}</p>
      `;
    }

    card.querySelector<HTMLButtonElement>('.locate')?.addEventListener('click', () => {
      locateByTag(clauseTag(clause.id, inDoc));
    });
    card.querySelector<HTMLButtonElement>('.focus')?.addEventListener('click', () => {
      focusByTag(clauseTag(clause.id, inDoc));
    });
    clausesPanelEl.appendChild(card);
  }
}

function refreshSummary(): void {
  const stale = CLAUSE_LIBRARY.filter(
    (c) => c.upgrade != null && (state.versions[c.id] ?? c.latestVersion) !== c.latestVersion,
  ).length;
  const updateText = stale === 0 ? 'all clauses current' : `${stale} update${stale === 1 ? '' : 's'} available`;
  summaryEl.textContent = `${FIELDS.length} fields \u00b7 ${CLAUSE_LIBRARY.length} clauses \u00b7 ${updateText}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findClauseControl(clauseId: ClauseId): ContentControlInfo | undefined {
  const doc = getDoc();
  return doc.contentControls.list({}).items.find((ctrl) => {
    const t = parseTag(ctrl.properties?.tag);
    return t?.kind === 'reusableSection' && t.sectionId === clauseId;
  });
}

async function run(status: string, action: () => Promise<void>): Promise<void> {
  setBusy(true);
  setStatus('Working');
  try {
    await action();
    renderClausesPanel();
    refreshSummary();
    setStatus(status);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Operation failed');
  } finally {
    setBusy(false);
  }
}

function getDoc(): DocumentApi {
  if (!state.editor?.doc) throw new Error('Document API is not ready.');
  return state.editor.doc;
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}

function renderSegment(seg: PreviewSegment): string {
  const text = escapeHtml(seg.text);
  if (seg.kind === 'insert') return `<ins>${text}</ins>`;
  if (seg.kind === 'delete') return `<del>${text}</del>`;
  return text;
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

(window as unknown as { __demo: unknown }).__demo = {
  superdoc,
  state,
  doc: () => state.editor?.doc ?? null,
};

const teardown = () => {
  // Order matters: detach the field chip first (it relies on the UI
  // controller for `getRect`), then destroy the UI controller, then
  // the SuperDoc instance. Each step is best-effort so a late error in
  // one branch doesn't strand the others.
  try {
    state.fieldChipTeardown?.();
  } catch {
    /* best-effort teardown */
  }
  state.fieldChipTeardown = null;
  try {
    state.ui?.destroy();
  } catch {
    /* best-effort teardown */
  }
  state.ui = null;
  superdoc.destroy();
};
window.addEventListener('beforeunload', teardown);
if (import.meta.hot) import.meta.hot.dispose(teardown);
