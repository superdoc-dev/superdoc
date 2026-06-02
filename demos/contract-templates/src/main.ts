/**
 * Contract templates: build a contract template on Word content controls (SDTs)
 * with a fully custom UI. SuperDoc's built-in SDT chrome is off
 * (`modules.contentControls.chrome: 'none'`), so the demo paints the field/clause
 * look itself (style.css) and drives every interaction through the public
 * surface: `editor.doc.*` and `superdoc/ui` (events, viewport.positionAt,
 * contentControls.scrollIntoView / focus / setLockMode).
 *
 * The starting document is a Mutual NDA (`public/nda-template.docx`) with
 * controls already in place:
 *   - Inline plain-text fields across five keys (disclosing party, receiving
 *     party, effective date, purpose, term). Receiving party and Purpose each
 *     appear twice: in the header sentence and nested inside the Permitted Use
 *     block clause.
 *   - Six block rich-text clauses tagged `{ kind: 'reusableSection', sectionId }`.
 *
 * The model:
 *   - Every control is `contentLocked`, so it can't be edited by typing in the
 *     document. This is a locked template surface; the custom UI drives changes.
 *   - Template tab = the building-block library. Two catalogs: smart-field chips
 *     (reusable variables) and clause cards (governed sections, single-use). A
 *     chip drags/clicks in as an inline field. A clause card shows category /
 *     jurisdiction / version and a status: "Add clause" when available (drag or
 *     click to add) or "In contract" once placed (click reveals the existing one
 *     - a clause appears once, like an inclusion checklist). An unfilled field
 *     shows its field-name token (e.g. DISCLOSING_PARTY) as a stand-in
 *     placeholder - literal text content, not a native SDT placeholder.
 *   - A clause is assembled from structured `parts`: prose plus `{ field }`
 *     slots. Inserting it creates the block and wraps each slot as a nested,
 *     locked inline smart field - so an inserted "Permitted Use" carries real
 *     Receiving party / Purpose fields, like the seeded one.
 *   - Values tab = fill the fields. Editing a value debounces ~250ms and fans it
 *     to every occurrence, including ones nested in clauses (the write briefly
 *     unlocks clauses, since a clause's content lock otherwise vetoes nested
 *     writes), via `selectByTag` + `text.setValue`.
 *   - Export: raw DOCX keeps the controls/tags; clean DOCX flattens to values.
 *
 * Out of scope (deliberately): clause version review / replace. That's a clause
 * lifecycle demo; this one proves template assembly.
 *
 * Every mutation goes through `editor.doc.*`, so the same operations run headless
 * via the Node SDK and CLI. For a packaged React authoring component, see
 * `@superdoc-dev/template-builder`.
 */

import { SuperDoc } from 'superdoc';
import { createSuperDocUI } from 'superdoc/ui';
import 'superdoc/style.css';
import './style.css';

type NodeKind = 'block' | 'inline';
type LockMode = 'unlocked' | 'sdtLocked' | 'contentLocked' | 'sdtContentLocked';
type ContentControlTarget = { kind: NodeKind; nodeType: 'sdt'; nodeId: string };
// Minimal shapes for inserting at the caret (see `editor.doc.create.contentControl`).
type SelectionPoint = { kind: 'text'; blockId: string; offset: number };
type SelectionTarget = { kind: 'selection'; start: SelectionPoint; end: SelectionPoint };

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
  create: {
    contentControl(input: {
      kind: NodeKind;
      controlType?: 'text' | 'richText';
      at?: SelectionTarget;
      content?: string;
      tag?: string;
      alias?: string;
      lockMode?: LockMode;
    }): MutationResult;
  };
  contentControls: {
    list(input?: Record<string, unknown>): { items: ContentControlInfo[]; total: number };
    selectByTag(input: { tag: string }): { items: ContentControlInfo[]; total: number };
    patch(input: { target: ContentControlTarget; tag?: string; alias?: string }): MutationResult;
    setLockMode(input: { target: ContentControlTarget; lockMode: LockMode }): MutationResult;
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
  | 'limitationOfLiability'
  | 'indemnification'
  | 'returnOfMaterials';

type ClauseCategory = 'Core' | 'Confidentiality' | 'Termination' | 'Risk Allocation';

/**
 * A clause-body part: literal prose, or a `{ field }` slot that becomes a nested
 * inline smart-field SDT when the clause is inserted. The slot renders as the
 * field's current display (value if filled, otherwise its name token).
 */
type ClausePart = string | { field: FieldKey };

/**
 * A governed clause in the library catalog: a label + metadata for the sidebar
 * card, and the structured `parts` used to assemble the clause when it's
 * inserted. The catalog includes clauses that aren't in the document yet.
 */
type LibraryClause = {
  id: ClauseId;
  label: string;
  category: ClauseCategory;
  jurisdiction: string;
  version: string;
  parts: ClausePart[];
};

const CLAUSE_LIBRARY: LibraryClause[] = [
  {
    id: 'preamble',
    label: 'Preamble',
    category: 'Core',
    jurisdiction: 'General',
    version: 'v1',
    parts: [
      'The parties wish to share Confidential Information for the purposes described above and acknowledge the obligations set out in this Agreement.',
    ],
  },
  {
    id: 'confidentiality',
    label: 'Confidentiality Obligations',
    category: 'Confidentiality',
    jurisdiction: 'General',
    version: 'v1',
    parts: [
      'Each party will treat the other party’s Confidential Information as confidential and will protect it with at least the same care it uses for its own confidential information. These obligations survive disclosure for two (2) years.',
    ],
  },
  {
    id: 'permittedUse',
    label: 'Permitted Use',
    category: 'Confidentiality',
    jurisdiction: 'General',
    version: 'v1',
    // Carries nested smart fields: inserting this clause creates real inline
    // SDTs for Receiving party and Purpose that fill from the Values form.
    parts: [
      'The ',
      { field: 'receivingParty' },
      ' may use Confidential Information solely for ',
      { field: 'purpose' },
      ', and for no other purpose, and will limit access to its employees and advisors with a need to know.',
    ],
  },
  {
    id: 'termination',
    label: 'Term and Termination',
    category: 'Termination',
    jurisdiction: 'General',
    version: 'v1',
    parts: [
      'Either party may terminate this Agreement upon thirty (30) days’ written notice. Confidentiality obligations survive termination for the period specified above.',
    ],
  },
  {
    id: 'governingLaw',
    label: 'Governing Law',
    category: 'Core',
    jurisdiction: 'US-CA',
    version: 'v1',
    parts: ['This Agreement is governed by the laws of the State of California, without regard to its conflicts of law provisions.'],
  },
  {
    id: 'limitationOfLiability',
    label: 'Limitation of Liability',
    category: 'Risk Allocation',
    jurisdiction: 'General',
    version: 'v1',
    parts: ['Each party’s aggregate liability under this Agreement is limited to fees paid in the twelve (12) months preceding the claim.'],
  },
  {
    // A library-only clause: not in the seeded document, so it starts "Add clause".
    // Insert it to add a new governed section to the contract.
    id: 'indemnification',
    label: 'Indemnification',
    category: 'Risk Allocation',
    jurisdiction: 'General',
    version: 'v1',
    parts: ['Each party will indemnify and hold the other harmless from third-party claims arising out of its breach of this Agreement.'],
  },
  {
    // Library-only and carries a nested field slot: adding it shows that an
    // inserted clause's embedded variables become real, broadcast-linked SDTs.
    id: 'returnOfMaterials',
    label: 'Return of Materials',
    category: 'Confidentiality',
    jurisdiction: 'General',
    version: 'v1',
    parts: [
      'Upon termination or at the disclosing party’s request, ',
      { field: 'receivingParty' },
      ' will promptly return or destroy all Confidential Information in its possession.',
    ],
  },
];

// ---------------------------------------------------------------------------
// Tag helpers
// ---------------------------------------------------------------------------

type SmartFieldTag = { kind: 'smartField'; key: FieldKey };
type ReusableSectionTag = { kind: 'reusableSection'; sectionId: ClauseId; version: string };
type TagPayload = SmartFieldTag | ReusableSectionTag;

const fieldTag = (key: FieldKey) => JSON.stringify({ kind: 'smartField', key } satisfies SmartFieldTag);
// version is vestigial now (the version lifecycle was removed); inserted clauses
// carry v1 so the tag shape stays valid and parses as a reusableSection.
const clauseTag = (sectionId: ClauseId) =>
  JSON.stringify({ kind: 'reusableSection', sectionId, version: 'v1' } satisfies ReusableSectionTag);

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
  /** Smart-tag chip mirrored as active when the caret is in a matching field. */
  activeTagKey: null as FieldKey | null,
  /** Clause card mirrored as active when the caret is in a matching clause. */
  activeClauseId: null as ClauseId | null,
  /** UI controller; created in `initialize`, disposed by `teardown`. */
  ui: null as ReturnType<typeof createSuperDocUI> | null,
  /** Detaches the document -> palette highlight listeners. */
  smartTagSyncTeardown: null as (() => void) | null,
  /** Detaches the field drag-and-drop listeners on the editor host. */
  dragDropTeardown: null as (() => void) | null,
};

/** dataTransfer MIME used when dragging a field chip from the palette. */
const FIELD_MIME = 'application/x-superdoc-field';
/** dataTransfer MIME used when dragging a clause card from the palette. */
const CLAUSE_MIME = 'application/x-superdoc-clause';

const statusEl = qs<HTMLElement>('#status');
const summaryEl = qs<HTMLElement>('#summary');
const fieldsPanelEl = qs<HTMLElement>('#fields-panel');
const valuesPanelEl = qs<HTMLElement>('#values-panel');
// The clause cards live in a section inside the Template panel; this container
// is created by renderClausesSection() and re-rendered by renderClausesPanel().
let clausesListEl: HTMLElement | null = null;

setBusy(true);

const superdoc = new SuperDoc({
  selector: '#editor',
  documentMode: 'editing',
  document: '/nda-template.docx',
  // Disable SuperDoc's built-in SDT chrome (border, label, hover/selection
  // highlight). The wrappers and data-sdt-* datasets are preserved, so the demo
  // paints its own field look in style.css and drives its own UI (Smart-tags
  // palette, Locate/Focus) through the public surface.
  modules: {
    comments: false,
    contentControls: { chrome: 'none' },
    // responsiveToContainer collapses toolbar items that overflow the editor
    // column into an overflow menu, so the toolbar can't spill over the sidebar.
    toolbar: { selector: '#superdoc-toolbar', responsiveToContainer: true },
  },
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
  // Show each field's name as a placeholder and lock it; values are filled only
  // through the Values form, which starts empty (see showFieldNamesAndLock).
  showFieldNamesAndLock();
  // Lock the seeded clause blocks too, so their prose can't be edited by typing
  // in the document. Fields nested in them still fill through the Values form.
  lockClauses();
  renderPanels();
  refreshSummary();

  // The public `superdoc/ui` controller (no framework) backs the demo's UI:
  // the Smart-tags palette (insert/focus), Locate, and the document -> palette
  // highlight below. Stashed on `state` so `teardown()` can dispose it on page
  // unload / Vite HMR (otherwise each hot reload leaks the previous controller).
  state.ui = createSuperDocUI({ superdoc: instance });

  // Document -> palette: clicking a smart-field token in the editor highlights
  // its chip in the sidebar (dogfoods content-control:click). Cleared on blur.
  const onTokenClick = ({ target }: { target: { tag?: string } }) => {
    const parsed = target?.tag ? parseTag(target.tag) : null;
    state.activeTagKey = parsed?.kind === 'smartField' ? (parsed.key as FieldKey) : null;
    state.activeClauseId = parsed?.kind === 'reusableSection' ? (parsed.sectionId as ClauseId) : null;
    highlightActiveTag();
    highlightActiveClause();
  };
  const onActiveChange = ({ active }: { active: { tag?: string } | null }) => {
    if (active) return;
    state.activeTagKey = null;
    state.activeClauseId = null;
    highlightActiveTag();
    highlightActiveClause();
  };
  instance.on('content-control:click', onTokenClick);
  instance.on('content-control:active-change', onActiveChange);
  state.smartTagSyncTeardown = () => {
    instance.off('content-control:click', onTokenClick);
    instance.off('content-control:active-change', onActiveChange);
  };

  // Palette -> document: drag a field or clause onto the editor to insert it at
  // the drop point (dogfoods ui.viewport.positionAt + create.contentControl).
  state.dragDropTeardown = setupPaletteDragDrop();

  setStatus('Ready');
  setBusy(false);
}


// ---------------------------------------------------------------------------
// Mutations: smart fields, clause updates, export
// ---------------------------------------------------------------------------

/**
 * Push a field's value to every occurrence. The field controls are
 * `contentLocked` so a user can't type into them in the document; the Values
 * form is the only writer. `text.setValue` is itself blocked on a locked
 * control, so briefly unlock, write, then relock. The relock is in `finally`
 * so a failed write never strands a field unlocked (editable by the user).
 */
function applyField(key: FieldKey, value: string): void {
  const doc = state.editor?.doc;
  if (!doc) return;
  state.values[key] = value;
  // Filled -> the value; cleared -> back to the field-name placeholder.
  const display = fieldDisplay(key);

  // A field can sit inside a clause (Receiving party / Purpose appear inside the
  // Permitted Use clause). A clause's content lock SILENTLY vetoes writes to
  // anything nested in it - text.setValue even reports success - so the value
  // wouldn't broadcast to the nested occurrence. Briefly unlock every clause
  // around the write, then relock them in `finally` so they never stay unlocked.
  const clauseControls = () =>
    doc.contentControls.list({}).items.filter((c) => parseTag(c.properties?.tag)?.kind === 'reusableSection');
  for (const c of clauseControls()) {
    reportMutation(doc.contentControls.setLockMode({ target: c.target, lockMode: 'unlocked' }), 'Unlock clause');
  }
  try {
    for (const ctrl of doc.contentControls.selectByTag({ tag: fieldTag(key) }).items) {
      // Skip the write if unlock fails - the field stays locked (safe), just stale.
      if (!reportMutation(doc.contentControls.setLockMode({ target: ctrl.target, lockMode: 'unlocked' }), `Unlock ${key}`)) {
        continue;
      }
      try {
        reportMutation(doc.contentControls.text.setValue({ target: ctrl.target, value: display }), `Update ${key}`);
      } finally {
        // A failed relock would leave the field editable, so make it loud.
        reportMutation(doc.contentControls.setLockMode({ target: ctrl.target, lockMode: 'contentLocked' }), `Relock ${key}`);
      }
    }
  } finally {
    for (const c of clauseControls()) {
      reportMutation(doc.contentControls.setLockMode({ target: c.target, lockMode: 'contentLocked' }), 'Relock clause');
    }
  }
}

/**
 * Put the document into its starting template state. Each smart field's content
 * is set to its field-name token (e.g. DISCLOSING_PARTY) as a stand-in
 * placeholder - this is literal text content, NOT a native SDT placeholder
 * (those are renderer-hardcoded and not settable via the API). Then each field
 * is `contentLocked`, so values change only through the Values form, never by
 * typing in the document. The form starts empty (every field unfilled). Content
 * is written before locking, since a locked control rejects content writes.
 */
function showFieldNamesAndLock(): void {
  const doc = state.editor?.doc;
  if (!doc) return;
  for (const field of FIELDS) {
    state.values[field.key] = '';
    for (const ctrl of doc.contentControls.selectByTag({ tag: fieldTag(field.key) }).items) {
      reportMutation(doc.contentControls.text.setValue({ target: ctrl.target, value: fieldDisplay(field.key) }), `Reset ${field.key}`);
      reportMutation(doc.contentControls.setLockMode({ target: ctrl.target, lockMode: 'contentLocked' }), `Lock ${field.key}`);
    }
  }
}

/**
 * Lock every clause block as `contentLocked`, like the inline fields, so its
 * prose can't be edited by typing in the document. The clauses are a fixed,
 * read-only part of the loaded template.
 */
function lockClauses(): void {
  const doc = state.editor?.doc;
  if (!doc) return;
  for (const ctrl of doc.contentControls.list({}).items) {
    if (parseTag(ctrl.properties?.tag)?.kind === 'reusableSection') {
      reportMutation(doc.contentControls.setLockMode({ target: ctrl.target, lockMode: 'contentLocked' }), 'Lock clause');
    }
  }
}

/** The token text shown inside an unfilled field (e.g. `disclosingParty` -> `DISCLOSING_PARTY`). */
const tokenFor = (key: FieldKey): string => key.replace(/([A-Z])/g, '_$1').toUpperCase();

/**
 * What a field control should display: the entered value if the field is filled,
 * otherwise its field-name token (e.g. `DISCLOSING_PARTY`) as a visible
 * placeholder. The Values form is the source of truth for filled/unfilled.
 */
const fieldDisplay = (key: FieldKey): string => {
  const value = state.values[key] ?? '';
  return value.trim() ? value : tokenFor(key);
};

/**
 * Insert a smart-tag field as an inline SDT at `target` (a collapsed
 * SelectionTarget). The control shows the field name as its placeholder
 * (`fieldDisplay`, e.g. DISCLOSING_PARTY) and is `contentLocked`, so it behaves
 * like the seeded fields: filled only through the Values form. It's tagged so it
 * paints with the same `.superdoc-structured-content-inline` look as the palette
 * chips. Shared by click-to-insert (caret) and drag-and-drop (drop point); only
 * how `target` is resolved differs. Then scroll it into view so the user sees it.
 */
function insertField(key: FieldKey, label: string, target: SelectionTarget): void {
  const ui = state.ui;
  const editor = state.editor;
  if (!ui || !editor?.doc) return;
  const result = editor.doc.create.contentControl({
    kind: 'inline',
    controlType: 'text',
    at: target,
    content: fieldDisplay(key),
    tag: fieldTag(key),
    alias: label,
    lockMode: 'contentLocked',
  });
  if (result.success) {
    state.values[key] = state.values[key] ?? '';
    void ui.contentControls.scrollIntoView({ id: result.contentControl.nodeId, block: 'center' });
  }
}

/**
 * Insert a field at the caret (click-to-insert). Captures the caret as a
 * TextTarget and bridges it to a collapsed SelectionTarget (the verified recipe).
 */
function insertFieldAtCursor(key: FieldKey, label: string): void {
  const ui = state.ui;
  if (!ui || !state.editor?.doc) return;
  const seg = ui.selection.capture()?.target?.segments?.[0];
  if (!seg) {
    // No caret to insert at — tell the user instead of silently no-op'ing.
    setStatus('Place the cursor in the document (or drag the field in), then click a tag to insert it.');
    return;
  }
  const point: SelectionPoint = { kind: 'text', blockId: seg.blockId, offset: seg.range.start };
  insertField(key, label, { kind: 'selection', start: point, end: point });
}

/** The clause's plain text; each field slot renders as its current display. */
function clauseText(clause: LibraryClause): string {
  return clause.parts.map((part) => (typeof part === 'string' ? part : fieldDisplay(part.field))).join('');
}

/** Character ranges of each field slot within `clauseText`, for wrapping as SDTs. */
function clauseFieldRanges(clause: LibraryClause): { field: FieldKey; start: number; end: number }[] {
  const ranges: { field: FieldKey; start: number; end: number }[] = [];
  let offset = 0;
  for (const part of clause.parts) {
    const text = typeof part === 'string' ? part : fieldDisplay(part.field);
    if (typeof part !== 'string') ranges.push({ field: part.field, start: offset, end: offset + text.length });
    offset += text.length;
  }
  return ranges;
}

/**
 * Insert a governed clause as a locked block SDT at the START of `blockId`
 * (offset 0, a clean block boundary - inserting at the raw drop caret would
 * split a paragraph mid-text). The clause is assembled from its parts: the block
 * holds the prose, and each `{ field }` slot is wrapped as a nested, locked
 * inline smart-field SDT - so an inserted "Permitted Use" carries real Receiving
 * party / Purpose fields that fill from the Values form, like the seeded one.
 * Inserts unlocked, wraps the slots, then locks the clause.
 */
async function insertClause(clauseId: ClauseId, blockId: string): Promise<void> {
  const ui = state.ui;
  const editor = state.editor;
  if (!ui || !editor?.doc) return;
  const doc = editor.doc;
  const clause = CLAUSE_LIBRARY.find((c) => c.id === clauseId);
  if (!clause) return;

  const point: SelectionPoint = { kind: 'text', blockId, offset: 0 };
  const created = doc.create.contentControl({
    kind: 'block',
    controlType: 'richText',
    at: { kind: 'selection', start: point, end: point },
    content: clauseText(clause),
    tag: clauseTag(clauseId),
    alias: clause.label,
    lockMode: 'unlocked', // unlocked so the field slots can be wrapped, then locked
  });
  if (!reportMutation(created, `Insert ${clause.label}`) || !created.success) return;
  const clauseTarget = created.contentControl;

  // Wrap each field slot as a nested inline smart-field SDT. Focus the new block
  // to resolve its inner text blockId (no coordinates needed), then wrap by
  // character range - last slot first, so wrapping one can't shift another's
  // offsets.
  await ui.contentControls.focus({ id: clauseTarget.nodeId });
  const innerBlockId = ui.selection.capture()?.target?.segments?.[0]?.blockId;
  if (innerBlockId) {
    for (const range of [...clauseFieldRanges(clause)].reverse()) {
      reportMutation(
        doc.create.contentControl({
          kind: 'inline',
          controlType: 'text',
          at: {
            kind: 'selection',
            start: { kind: 'text', blockId: innerBlockId, offset: range.start },
            end: { kind: 'text', blockId: innerBlockId, offset: range.end },
          },
          tag: fieldTag(range.field),
          alias: FIELDS.find((f) => f.key === range.field)?.label ?? range.field,
          lockMode: 'contentLocked',
        }),
        `Nest ${range.field}`,
      );
    }
  }

  // Lock the clause now that its slots are wrapped, then refresh the cards
  // (the card flips to "In contract") and scroll the new clause into view.
  reportMutation(doc.contentControls.setLockMode({ target: clauseTarget, lockMode: 'contentLocked' }), 'Lock clause');
  renderClausesPanel();
  void ui.contentControls.scrollIntoView({ id: clauseTarget.nodeId, block: 'center' });
}

/** Insert a clause at the caret's block boundary (click-to-insert). */
function insertClauseAtCursor(clauseId: ClauseId): void {
  const ui = state.ui;
  if (!ui || !state.editor?.doc) return;
  // Single-use: if it's already in the contract, reveal it instead of duplicating.
  if (isClauseInDocument(clauseId)) {
    revealClause(clauseId);
    return;
  }
  const seg = ui.selection.capture()?.target?.segments?.[0];
  if (!seg) {
    setStatus('Place the cursor in the document, then click a clause to add it.');
    return;
  }
  void insertClause(clauseId, seg.blockId);
}

/**
 * Palette -> document drag-and-drop for both building blocks. Resolves the drop
 * point with the public `ui.viewport.positionAt`, then: a field inserts inline
 * at the exact caret; a clause inserts as a block at the drop block's boundary
 * (see insertClause). Returns a teardown.
 */
function setupPaletteDragDrop(): () => void {
  const host = qs<HTMLElement>('#editor');
  const draggingPaletteItem = (event: DragEvent) =>
    event.dataTransfer?.types.includes(FIELD_MIME) || event.dataTransfer?.types.includes(CLAUSE_MIME);

  const onDragOver = (event: DragEvent): void => {
    if (!draggingPaletteItem(event)) return;
    // preventDefault on dragover is what makes an element a valid drop target.
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'copy';
    host.classList.add('drop-target');
  };
  const onDragLeave = (event: DragEvent): void => {
    // Only clear when leaving the host itself, not when crossing child nodes.
    if (event.target === host) host.classList.remove('drop-target');
  };
  const onDrop = (event: DragEvent): void => {
    host.classList.remove('drop-target');
    const fieldKey = event.dataTransfer?.getData(FIELD_MIME) as FieldKey | '';
    const clauseId = event.dataTransfer?.getData(CLAUSE_MIME) as ClauseId | '';
    if (!fieldKey && !clauseId) return;
    event.preventDefault();
    const hit = state.ui?.viewport.positionAt({ x: event.clientX, y: event.clientY });
    // A text caret is the only droppable target (a node-edge hit has no offset).
    if (!hit || hit.point.kind !== 'text') {
      setStatus('Drop onto the document text.');
      return;
    }
    if (fieldKey) {
      const field = FIELDS.find((f) => f.key === fieldKey);
      if (!field) return;
      const point: SelectionPoint = { kind: 'text', blockId: hit.point.blockId, offset: hit.point.offset };
      insertField(field.key, field.label, { kind: 'selection', start: point, end: point });
    } else if (clauseId) {
      const clause = CLAUSE_LIBRARY.find((c) => c.id === clauseId);
      if (!clause) return;
      // Single-use: a clause already in the contract reveals instead of duplicating.
      if (isClauseInDocument(clause.id)) revealClause(clause.id);
      else void insertClause(clause.id, hit.point.blockId); // offset 0 (block boundary)
    }
  };

  host.addEventListener('dragover', onDragOver);
  host.addEventListener('dragleave', onDragLeave);
  host.addEventListener('drop', onDrop);
  return () => {
    host.removeEventListener('dragover', onDragOver);
    host.removeEventListener('dragleave', onDragLeave);
    host.removeEventListener('drop', onDrop);
  };
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
  renderValuesPanel();
}

/**
 * Smart-tags palette: a searchable list of variable chips. Clicking a chip
 * inserts that field as an inline SDT at the caret (authoring). The chips use
 * the same token look (.smart-tag / --tag-*) as the painted in-editor field, so
 * the sidebar tag and the inserted field are visually identical.
 */
function renderSmartTagsPalette(): void {
  const section = document.createElement('div');
  section.className = 'smart-tags';
  section.innerHTML = `
    <p class="smart-tags-hint">Drag a field into the document, or click to insert it at the cursor.</p>
    <input class="smart-tags-search" type="search" placeholder="Search fields…" aria-label="Search fields" />
    <div class="smart-tags-group">Template fields</div>
    <div class="smart-tags-list">
      ${FIELDS.map(
        (f) =>
          `<button class="smart-tag" type="button" draggable="true" data-tag-key="${escapeAttr(f.key)}" title="Drag into the document, or click to insert ${escapeAttr(f.label)} at the cursor">${escapeHtml(tokenFor(f.key))}</button>`,
      ).join('')}
    </div>
  `;
  fieldsPanelEl.appendChild(section);

  section.querySelectorAll<HTMLButtonElement>('.smart-tag').forEach((btn) => {
    const field = FIELDS.find((f) => f.key === (btn.dataset.tagKey as FieldKey));
    btn.addEventListener('click', () => {
      if (field) insertFieldAtCursor(field.key, field.label);
    });
    btn.addEventListener('dragstart', (event) => {
      if (!field || !event.dataTransfer) return;
      event.dataTransfer.setData(FIELD_MIME, field.key);
      event.dataTransfer.effectAllowed = 'copy';
    });
  });

  const search = section.querySelector<HTMLInputElement>('.smart-tags-search');
  search?.addEventListener('input', () => {
    const q = search.value.trim().toUpperCase();
    section.querySelectorAll<HTMLButtonElement>('.smart-tag').forEach((btn) => {
      btn.style.display = !q || (btn.textContent ?? '').includes(q) ? '' : 'none';
    });
  });

  highlightActiveTag();
}

/**
 * Mirror the active field in the palette: the chip whose key matches
 * `state.activeTagKey` gets `.is-active`. Driven by `content-control:click`
 * (and cleared on blur via `content-control:active-change`) — the document ->
 * sidebar half of the two-way loop.
 */
function highlightActiveTag(): void {
  fieldsPanelEl.querySelectorAll<HTMLButtonElement>('.smart-tag').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.tagKey === state.activeTagKey);
  });
}

/**
 * Mirror the active clause: the card whose id matches `state.activeClauseId`
 * gets `.is-active`. Driven by `content-control:click` on a clause block (and
 * cleared on blur) — the clauses' half of the document -> sidebar loop.
 */
function highlightActiveClause(): void {
  clausesListEl?.querySelectorAll<HTMLElement>('.clause').forEach((card) => {
    card.classList.toggle('is-active', card.dataset.clauseId === state.activeClauseId);
  });
}

/**
 * Template tab: the contract's building blocks. Two catalogs - inline Smart tags
 * (reusable variable chips, drag or click to insert) and block Clauses (governed,
 * single-use cards with metadata + a status; an available clause adds by drag or
 * click, one already in the contract reveals it). Values are filled on the
 * Values tab.
 */
function renderFieldsPanel(): void {
  fieldsPanelEl.innerHTML = '';
  renderSmartTagsPalette();
  renderClausesSection();
}

/**
 * Clauses section of the Template tab: a search + the clause cards. Mirrors the
 * Smart-tags section's style (group header, search) but the clauses render as
 * compact blue cards, not pills, since they're block controls. Creates the
 * list container (clausesListEl) that renderClausesPanel re-renders into.
 */
function renderClausesSection(): void {
  const section = document.createElement('div');
  section.className = 'clauses-section';
  section.innerHTML = `
    <div class="smart-tags-group">Clauses</div>
    <p class="smart-tags-hint">Drag a clause into the document, or click to insert it at the cursor.</p>
    <input class="smart-tags-search clauses-search" type="search" placeholder="Search clauses…" aria-label="Search clauses" />
    <div class="clauses-list"></div>
  `;
  fieldsPanelEl.appendChild(section);
  clausesListEl = section.querySelector<HTMLElement>('.clauses-list');

  const search = section.querySelector<HTMLInputElement>('.clauses-search');
  search?.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    clausesListEl?.querySelectorAll<HTMLElement>('.clause').forEach((card) => {
      const label = (card.querySelector('.clause-label')?.textContent ?? '').toLowerCase();
      card.style.display = !q || label.includes(q) ? '' : 'none';
    });
  });

  renderClausesPanel();
}

/**
 * Values tab: fill the fields that are in the document. Editing a value
 * debounces ~250ms and fans it to every occurrence of that field's tag
 * (`selectByTag` + per-occurrence `text.setValue`). Locate/Focus jump to the
 * first occurrence.
 */
function renderValuesPanel(): void {
  valuesPanelEl.innerHTML = '';
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
      <input id="${inputId}" data-field="${field.key}" value="${escapeAttr(state.values[field.key] ?? '')}" placeholder="${escapeAttr(field.label)}" />
    `;
    valuesPanelEl.appendChild(row);
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

/**
 * Render the clause cards: one card per clause, styled like the in-document
 * block clause (blue left rail). Like the smart-tag chips, a card is draggable
 * into the document or click-to-insert at the cursor (insertClause snaps to a
 * block boundary). A card highlights when its clause is clicked in the document.
 */
/** Every control in the document for a given clause (used internally for counts). */
function clauseControls(clauseId: ClauseId): ContentControlInfo[] {
  const doc = state.editor?.doc;
  if (!doc) return [];
  return doc.contentControls.list({}).items.filter((c) => {
    const t = parseTag(c.properties?.tag);
    return t?.kind === 'reusableSection' && t.sectionId === clauseId;
  });
}

/** A clause is single-use: it's either in the contract or available to add. */
function isClauseInDocument(clauseId: ClauseId): boolean {
  return clauseControls(clauseId).length > 0;
}

/** Scroll the clause's placement into view and highlight its card. */
function revealClause(clauseId: ClauseId): void {
  const ctrl = clauseControls(clauseId)[0];
  if (!state.ui || !ctrl) return;
  state.activeClauseId = clauseId;
  highlightActiveClause();
  void state.ui.contentControls.scrollIntoView({ id: ctrl.target.nodeId, block: 'center' });
}

/**
 * Render the clause library as a single-use inclusion checklist. Each card shows
 * the clause's category / jurisdiction / version and whether it's "In contract"
 * or available to "Add clause". A clause is governed and appears once: a card
 * that's already in the contract can't be inserted again - clicking it reveals
 * the existing clause instead; an available card inserts (click) or drags in.
 */
function renderClausesPanel(): void {
  const list = clausesListEl;
  if (!list) return;
  list.innerHTML = '';
  for (const clause of CLAUSE_LIBRARY) {
    const inDoc = isClauseInDocument(clause.id);
    const card = document.createElement('article');
    card.className =
      'clause ' + (inDoc ? 'is-present' : 'is-available') + (clause.id === state.activeClauseId ? ' is-active' : '');
    card.dataset.clauseId = clause.id;
    card.draggable = !inDoc; // single-use: can't drag a clause that's already in
    card.title = inDoc
      ? `${clause.label} is in the contract — click to reveal it`
      : `Drag into the document, or click to add the ${clause.label} clause at the cursor`;
    card.innerHTML = `
      <div class="clause-head">
        <h3 class="clause-label">${escapeHtml(clause.label)}</h3>
        <span class="clause-status">${inDoc ? 'In contract' : 'Add clause'}</span>
      </div>
      <p class="clause-meta">${escapeHtml(clause.category)} · ${escapeHtml(clause.jurisdiction)} · ${escapeHtml(clause.version)}</p>
    `;
    card.addEventListener('click', () => (isClauseInDocument(clause.id) ? revealClause(clause.id) : insertClauseAtCursor(clause.id)));
    card.addEventListener('dragstart', (event) => {
      if (!event.dataTransfer || isClauseInDocument(clause.id)) return;
      event.dataTransfer.setData(CLAUSE_MIME, clause.id);
      event.dataTransfer.effectAllowed = 'copy';
    });
    list.appendChild(card);
  }
}

function refreshSummary(): void {
  summaryEl.textContent = `${FIELDS.length} fields \u00b7 ${CLAUSE_LIBRARY.length} clauses`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/**
 * Surface a failed mutation instead of swallowing it. Returns whether it
 * succeeded so callers can branch (e.g. skip the write if the unlock failed).
 * NO_OP (value already matches) is treated as success. Used on the form-only
 * write path, where a silent failure would leave a field stale or - worse, on a
 * failed relock - editable by the user.
 */
function reportMutation(result: MutationResult, context: string): boolean {
  if (result.success || result.failure.code === 'NO_OP') return true;
  console.error(`[contract-templates] ${context} failed:`, result.failure);
  setStatus(`${context} failed: ${result.failure.message}`);
  return false;
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

const teardown = () => {
  // Detach the palette-sync listeners, then destroy the UI controller, then the
  // SuperDoc instance. Each step is best-effort so a late error in one branch
  // doesn't strand the others.
  try {
    state.smartTagSyncTeardown?.();
  } catch {
    /* best-effort teardown */
  }
  state.smartTagSyncTeardown = null;
  try {
    state.dragDropTeardown?.();
  } catch {
    /* best-effort teardown */
  }
  state.dragDropTeardown = null;
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
