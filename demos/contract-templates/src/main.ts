/**
 * Contract templates: a runtime workflow on Word content controls.
 *
 * The document is a Mutual NDA (`public/nda-template.docx`)
 * with content controls already in place:
 *   - Seven inline plain-text SDTs across five field keys (disclosing
 *     party, receiving party, effective date, purpose, term length).
 *     Receiving party and Purpose each appear twice: once in the header
 *     sentence and once nested inside the Permitted Use block clause.
 *   - Six block plain-text SDTs (Preamble, Confidentiality, Permitted Use,
 *     Term and Termination, Governing Law, Limitation of Liability). Each
 *     block carries `{ kind: 'reusableSection', sectionId, version }` in
 *     its tag.
 *
 * The app:
 *   1. Loads the fixture as its starting document.
 *   2. Reads each field's text and each clause's version from the parsed SDTs.
 *   3. Compares clause versions against the local library and surfaces
 *      "Library update available" on every stale clause with a one-line
 *      summary of the change.
 *   4. Field inputs are reactive: typing in a value debounces by ~250ms and
 *      fans the new text to every occurrence via `selectByTag` + `replaceContent`.
 *   5. "Suggest library update" runs `doc.replace` with `changeMode: 'tracked'`
 *      against the clause body (located by `query.match`). The SDT tag stays
 *      at v1; the document shows redlines. Accept calls `trackChanges.decide`
 *      then patches the tag via `contentControls.patch`. Reject reverts the
 *      body and leaves the tag at v1. Tag flips only after acceptance.
 *   6. On Export, produces a `.docx` blob with content controls preserved.
 *
 * Every mutation goes through `editor.doc.*`. The same operation set runs
 * headless via the Node SDK and CLI.
 *
 * For a packaged React authoring component (`{{` trigger, linked field
 * groups, owner/signer types, DOCX export), see `@superdoc-dev/template-builder`.
 */

import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import './style.css';

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

type SelectionTarget =
  | { kind: 'selection'; start: Record<string, unknown>; end: Record<string, unknown> }
  | { kind: 'text'; blockId: string; range: { start: number; end: number } };

type TrackedChange = { entityId: string; type: string };

type DocumentApi = {
  contentControls: {
    list(input?: Record<string, unknown>): { items: ContentControlInfo[]; total: number };
    selectByTag(input: { tag: string }): { items: ContentControlInfo[]; total: number };
    patch(input: { target: ContentControlTarget; tag?: string; alias?: string }): MutationResult;
    replaceContent(input: { target: ContentControlTarget; content: string; format?: 'text' }): MutationResult;
  };
  query: {
    match(input: { select: { type: 'text'; pattern: string }; require?: 'first' | 'any' }): {
      items: Array<{ target: SelectionTarget }>;
      total: number;
    };
  };
  replace(input: { target: SelectionTarget; text: string }, options?: { changeMode?: 'direct' | 'tracked' }): {
    success: boolean;
    failure?: { code: string; message: string };
  };
  extract(input: Record<string, never>): { blocks: Array<{ nodeId: string; type: string; text: string }>; trackedChanges: TrackedChange[] };
  trackChanges: {
    decide(input: { target: { id: string } | { scope: 'all' }; decision: 'accept' | 'reject' }): { success: boolean; failure?: { code: string; message: string } };
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

type LibraryClause = {
  id: ClauseId;
  label: string;
  latestVersion: string;
  /** Upgrade prose. Only defined when `latestVersion` differs from v1. */
  upgrade?: { version: string; summary: string; body: string };
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

type PendingReview = { toVersion: string; entityIds: string[] };

const state = {
  editor: null as DemoEditor | null,
  values: {} as Record<FieldKey, string>,
  versions: {} as Record<ClauseId, string>,
  pending: {} as Partial<Record<ClauseId, PendingReview>>,
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
  modules: { comments: false },
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

qs<HTMLButtonElement>('#export').addEventListener('click', () => void run('Exported Mutual NDA.docx', exportDocument));

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
    state.editor.doc.contentControls.replaceContent({
      target: ctrl.target,
      content: value,
      format: 'text',
    });
  }
}

/**
 * Suggest a library update as a tracked change inside the clause SDT.
 * The SDT tag stays at v1 until the reviewer accepts; if they reject, the
 * document body reverts and the tag is unchanged. No lying documents.
 */
async function suggestClauseUpdate(clauseId: ClauseId, toVersion: string, body: string): Promise<void> {
  const doc = getDoc();
  const ctrl = findClauseControl(clauseId);
  if (!ctrl?.text) throw new Error(`Clause ${clauseId} not in document`);

  // Locate the clause body via text match. Acceptable because the demo's fixture
  // text is controlled. In production, prefer a Document API "inner content of
  // this content control" target once one exists.
  const match = doc.query.match({ select: { type: 'text', pattern: ctrl.text }, require: 'first' });
  const target = match.items?.[0]?.target;
  if (!target) throw new Error(`Could not locate clause body for ${clauseId}`);

  const before = new Set(doc.extract({}).trackedChanges.map((c) => c.entityId));

  const replaceResult = doc.replace({ target, text: body }, { changeMode: 'tracked' });
  if (!replaceResult.success) {
    throw new Error(replaceResult.failure?.message ?? 'Tracked replace failed');
  }

  const newEntityIds = doc
    .extract({})
    .trackedChanges.filter((c) => !before.has(c.entityId))
    .map((c) => c.entityId);

  state.pending[clauseId] = { toVersion, entityIds: newEntityIds };
}

/** Accept the pending tracked change and patch the SDT tag. */
async function acceptClauseUpdate(clauseId: ClauseId): Promise<void> {
  const doc = getDoc();
  const pending = state.pending[clauseId];
  if (!pending) return;

  // Decide each entity. Paired replacement may collapse after accepting one,
  // so a subsequent "not found" is expected and benign.
  for (const id of pending.entityIds) {
    try {
      doc.trackChanges.decide({ target: { id }, decision: 'accept' });
    } catch {
      /* paired entity already resolved */
    }
  }

  const ctrl = findClauseControl(clauseId);
  const clause = CLAUSE_LIBRARY.find((c) => c.id === clauseId);
  if (ctrl && clause) {
    doc.contentControls.patch({
      target: ctrl.target,
      tag: clauseTag(clauseId, pending.toVersion),
      alias: `${clause.label} (${pending.toVersion})`,
    });
    state.versions[clauseId] = pending.toVersion;
  }

  delete state.pending[clauseId];
}

/** Reject the pending tracked change. Body reverts; SDT tag stays at v1. */
async function rejectClauseUpdate(clauseId: ClauseId): Promise<void> {
  const doc = getDoc();
  const pending = state.pending[clauseId];
  if (!pending) return;

  for (const id of pending.entityIds) {
    try {
      doc.trackChanges.decide({ target: { id }, decision: 'reject' });
    } catch {
      /* paired entity already resolved */
    }
  }

  delete state.pending[clauseId];
}

async function exportDocument(): Promise<void> {
  await superdoc.export({ exportedName: 'Mutual NDA', isFinalDoc: true, triggerDownload: true });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderPanels(): void {
  renderFieldsPanel();
  renderClausesPanel();
}

function renderFieldsPanel(): void {
  fieldsPanelEl.innerHTML = '';
  for (const field of FIELDS) {
    const row = document.createElement('label');
    row.className = 'row';
    row.innerHTML = `
      <span class="row-label">${escapeHtml(field.label)}</span>
      <input data-field="${field.key}" value="${escapeAttr(state.values[field.key] ?? '')}" />
    `;
    fieldsPanelEl.appendChild(row);
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
    const pending = state.pending[clause.id];

    const card = document.createElement('article');
    const cls = pending ? 'pending' : stale ? 'stale' : 'current';
    card.className = `clause ${cls}`;

    if (pending && clause.upgrade) {
      // Reviewer is deciding. Tag stays v1; document shows tracked redlines.
      card.innerHTML = `
        <header class="clause-header">
          <h3 class="clause-label">${escapeHtml(clause.label)}</h3>
          <span class="clause-status pending">Pending review</span>
        </header>
        <p class="clause-summary">${escapeHtml(clause.upgrade.summary)}</p>
        <p class="clause-meta">Document ${escapeHtml(inDoc)} \u00b7 Library ${escapeHtml(pending.toVersion)}</p>
        <div class="clause-actions">
          <button class="btn clause-reject" type="button">Reject</button>
          <button class="btn primary clause-accept" type="button">Accept library clause</button>
        </div>
      `;
      card.querySelector<HTMLButtonElement>('.clause-accept')?.addEventListener('click', () => {
        void run(`${clause.label}: accepted`, async () => {
          await acceptClauseUpdate(clause.id);
        });
      });
      card.querySelector<HTMLButtonElement>('.clause-reject')?.addEventListener('click', () => {
        void run(`${clause.label}: rejected`, async () => {
          await rejectClauseUpdate(clause.id);
        });
      });
    } else if (stale && clause.upgrade) {
      const upgrade = clause.upgrade;
      card.innerHTML = `
        <header class="clause-header">
          <h3 class="clause-label">${escapeHtml(clause.label)}</h3>
          <span class="clause-status">Library update available</span>
        </header>
        <p class="clause-summary">${escapeHtml(upgrade.summary)}</p>
        <p class="clause-meta">Document ${escapeHtml(inDoc)} \u00b7 Library ${escapeHtml(upgrade.version)}</p>
        <button class="btn primary clause-suggest" type="button">Suggest library update</button>
      `;
      card.querySelector<HTMLButtonElement>('.clause-suggest')?.addEventListener('click', () => {
        void run(`${clause.label}: suggested as tracked change`, async () => {
          await suggestClauseUpdate(clause.id, upgrade.version, upgrade.body);
        });
      });
    } else {
      card.innerHTML = `
        <header class="clause-header">
          <h3 class="clause-label">${escapeHtml(clause.label)}</h3>
          <span class="clause-status muted">Current</span>
        </header>
        <p class="clause-meta">Document ${escapeHtml(inDoc)}</p>
      `;
    }

    clausesPanelEl.appendChild(card);
  }
}

function refreshSummary(): void {
  const stale = CLAUSE_LIBRARY.filter(
    (c) => c.upgrade != null && !state.pending[c.id] && (state.versions[c.id] ?? c.latestVersion) !== c.latestVersion,
  ).length;
  const pending = Object.keys(state.pending).length;
  const parts = [`${FIELDS.length} fields`, `${CLAUSE_LIBRARY.length} clauses`];
  if (pending > 0) parts.push(`${pending} pending review`);
  if (stale > 0) parts.push(`${stale} update${stale === 1 ? '' : 's'} available`);
  if (pending === 0 && stale === 0) parts.push('all clauses current');
  summaryEl.textContent = parts.join(' \u00b7 ');
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

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

(window as unknown as { __demo: unknown }).__demo = {
  superdoc,
  state,
  doc: () => state.editor?.doc ?? null,
};

const teardown = () => superdoc.destroy();
window.addEventListener('beforeunload', teardown);
if (import.meta.hot) import.meta.hot.dispose(teardown);
