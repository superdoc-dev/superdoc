/**
 * Contract templates: a runtime workflow on Word content controls.
 *
 * The document is a Mutual NDA (`public/nda-template.docx`)
 * with content controls already in place:
 *   - Five inline plain-text SDTs in the header (disclosing party,
 *     receiving party, effective date, purpose, term length).
 *   - Six block plain-text SDTs (Preamble, Confidentiality, Permitted Use,
 *     Term and Termination, Governing Law, Limitation of Liability). Each
 *     block carries `{ kind: 'reusableSection', sectionId, version }` in
 *     its tag.
 *
 * The app:
 *   1. Loads the fixture as its starting document.
 *   2. Reads each field's text and each clause's version from the parsed SDTs.
 *   3. Compares clause versions against the local library and surfaces a
 *      per-clause "Update to vN" CTA on every clause that has a newer
 *      version available.
 *   4. On Apply, pushes field values via `selectByTag` + `replaceContent`.
 *   5. On Update, swaps clause body via `replaceContent` and bumps the
 *      version in the tag via `patch`.
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

type DocumentApi = {
  contentControls: {
    list(input?: Record<string, unknown>): { items: ContentControlInfo[]; total: number };
    selectByTag(input: { tag: string }): { items: ContentControlInfo[]; total: number };
    patch(input: { target: ContentControlTarget; tag?: string; alias?: string }): MutationResult;
    replaceContent(input: { target: ContentControlTarget; content: string; format?: 'text' }): MutationResult;
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

const state = {
  editor: null as DemoEditor | null,
  values: {} as Record<FieldKey, string>,
  versions: {} as Record<ClauseId, string>,
  expandedClause: null as ClauseId | null,
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

async function applyAllFields(): Promise<void> {
  const doc = getDoc();
  for (const field of FIELDS) {
    const value = state.values[field.key];
    if (value == null) continue;
    const { items } = doc.contentControls.selectByTag({ tag: fieldTag(field.key) });
    for (const ctrl of items) {
      assertMutation(
        doc.contentControls.replaceContent({ target: ctrl.target, content: value, format: 'text' }),
        `Could not update ${field.label}`,
        true,
      );
    }
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
  }
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.className = 'btn primary';
  apply.textContent = 'Apply fields';
  apply.addEventListener('click', () => {
    for (const field of FIELDS) {
      const input = fieldsPanelEl.querySelector<HTMLInputElement>(`input[data-field="${field.key}"]`);
      if (input) state.values[field.key] = input.value;
    }
    void run('Fields applied', applyAllFields);
  });
  fieldsPanelEl.appendChild(apply);
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
      const currentText = findClauseControl(clause.id)?.text ?? '';
      card.innerHTML = `
        <header class="clause-header">
          <h3 class="clause-label">${escapeHtml(clause.label)}</h3>
          <span class="clause-status">Update available</span>
        </header>
        <p class="clause-summary">${escapeHtml(upgrade.summary)}</p>
        <p class="clause-meta">Document ${escapeHtml(inDoc)} \u00b7 Library ${escapeHtml(upgrade.version)}</p>
        <button class="btn clause-review" type="button">${expanded ? 'Hide' : 'Review'}</button>
        ${
          expanded
            ? `
          <div class="clause-review-panel">
            <div class="review-section">
              <div class="review-label">In your document</div>
              <p class="review-text">${escapeHtml(currentText)}</p>
            </div>
            <div class="review-section">
              <div class="review-label">From the library</div>
              <p class="review-text">${escapeHtml(upgrade.body)}</p>
            </div>
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
