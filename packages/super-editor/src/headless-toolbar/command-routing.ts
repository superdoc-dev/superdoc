import type { PublicToolbarItemId } from './types.js';

/**
 * Routing classification for a public toolbar command. Encodes the rule
 * `ui.commands.<id>.execute()` follows: which layer owns the mutation.
 *
 * - `document-api`: Mutation goes through `editor.doc.*`. Pair tests in
 *   `command-routing.test.ts` assert identical post-state vs the explicit
 *   doc-api call. This is the only routing where toolbar-side and
 *   doc-api-side calls must produce the same document state.
 *
 * - `legacy-editor-command`: No doc-api operation exists yet. Falls back
 *   to `editor.commands.*` (TipTap shape). Each entry MUST carry a
 *   `gapTicket` linking to the open Linear ticket that resolves either
 *   to a doc-api operation or to "this should not be public at all."
 *
 * - `ui-session`: Browser/UI/session-only operation. Will not exist on
 *   `editor.doc.*` because there is no document mutation. Long term these
 *   move out of `ui.commands.*` to dedicated `ui.<domain>.*` surfaces
 *   (SD-2799). Until then they stay routed here.
 *
 * - `internal`: Reserved for entries that should not appear in the public
 *   registry. Currently empty. New entries here require deliberate review.
 */
export type ToolbarRoute = 'document-api' | 'legacy-editor-command' | 'ui-session' | 'internal';

/**
 * How the toolbar's execute path maps onto the doc-api surface.
 *
 * - `single-doc-op`: One deterministic call. Payload → operation, no
 *   selection-state read needed.
 * - `composed-doc-ops`: Toolbar reads selection state (active mark, list
 *   membership, etc.) and picks one of several doc-api calls. Toggle
 *   behavior lives here, not on the contract.
 * - `single-doc-op-with-collapsed-fallback`: Non-collapsed path goes
 *   through doc-api; collapsed-cursor path falls back to
 *   `editor.commands.*` because doc-api has no stored-mark / pending-
 *   format primitive yet. Each such entry carries a `collapsedFallbackGapTicket`.
 * - `ui-session`: No doc-api call.
 * - `legacy-gap`: `editor.commands.*` fallback for the whole command;
 *   only valid when route is `legacy-editor-command`.
 */
export type ToolbarExecution =
  | 'single-doc-op'
  | 'composed-doc-ops'
  | 'single-doc-op-with-collapsed-fallback'
  | 'ui-session'
  | 'legacy-gap';

/**
 * Discriminated routing entry. The shape varies by route:
 *
 * - `document-api`: must list the operations it calls (used by the pair
 *   test to know which doc-api receipts to compare against).
 * - `legacy-editor-command`: must point at a Linear gap ticket so the
 *   debt is tracked and the entry can be promoted once the gap closes.
 * - `ui-session`: optional `relocationTicket` pointing at SD-2799 or
 *   wherever the move-to-`ui.<domain>` work is filed.
 * - `internal`: no extra fields. Must be reviewed deliberately.
 *
 * `notes` is free-form rationale on every entry — useful for "why is this
 * in Bucket 2 instead of Bucket 1" answers without spinning up a separate
 * doc that goes stale.
 */
export type ToolbarCommandRouting =
  | {
      route: 'document-api';
      execution: 'single-doc-op' | 'composed-doc-ops' | 'single-doc-op-with-collapsed-fallback';
      operations: readonly string[];
      collapsedFallbackGapTicket?: string;
      notes?: string;
    }
  | {
      route: 'legacy-editor-command';
      execution: 'legacy-gap';
      gapTicket: string;
      notes?: string;
    }
  | {
      route: 'ui-session';
      execution: 'ui-session';
      relocationTicket?: string;
      notes?: string;
    }
  | {
      route: 'internal';
      execution: 'legacy-gap';
      notes?: string;
    };

/**
 * Canonical routing table for every public toolbar command.
 *
 * The `satisfies Record<PublicToolbarItemId, ToolbarCommandRouting>` clause
 * is the compile-time exhaustiveness gate: adding a new entry to
 * `PublicToolbarItemId` without an entry here is a type error.
 *
 * Pair tests (`command-routing.test.ts`) walk this table at runtime to
 * assert every `document-api` entry has a paired test asserting equivalent
 * post-state vs the listed operations.
 *
 * SD-2798 installs this table. Subsequent PRs in the umbrella reroute
 * each `document-api` entry's executor to actually call those operations
 * (today most still call `editor.commands.*`).
 */
export const TOOLBAR_COMMAND_ROUTING = {
  bold: {
    route: 'document-api',
    execution: 'single-doc-op-with-collapsed-fallback',
    operations: ['format.bold', 'format.apply'],
    collapsedFallbackGapTicket: 'SD-2804',
    notes:
      'Toggle composed in executor: read state → format.bold (apply) or format.apply({inline:{bold:false}}) (clear). Collapsed-cursor path needs a stored-mark primitive that doc-api does not have yet (SD-2804); falls back to editor.commands.toggleBold for that case only.',
  },
  italic: {
    route: 'document-api',
    execution: 'single-doc-op-with-collapsed-fallback',
    operations: ['format.italic', 'format.apply'],
    collapsedFallbackGapTicket: 'SD-2804',
    notes: 'Same shape as bold.',
  },
  underline: {
    route: 'document-api',
    execution: 'single-doc-op-with-collapsed-fallback',
    operations: ['format.underline', 'format.apply'],
    collapsedFallbackGapTicket: 'SD-2804',
    notes: 'Underline is an object patch (not a boolean); clear via format.apply({inline:{underline:null}}).',
  },
  strikethrough: {
    route: 'document-api',
    execution: 'single-doc-op-with-collapsed-fallback',
    operations: ['format.strike', 'format.apply'],
    collapsedFallbackGapTicket: 'SD-2804',
  },
  'font-size': {
    route: 'document-api',
    execution: 'single-doc-op-with-collapsed-fallback',
    operations: ['format.fontSize', 'format.apply'],
    collapsedFallbackGapTicket: 'SD-2804',
    notes: 'Set-to-value. Empty/null payload clears via format.apply.',
  },
  'font-family': {
    route: 'document-api',
    execution: 'single-doc-op-with-collapsed-fallback',
    operations: ['format.fontFamily', 'format.apply'],
    collapsedFallbackGapTicket: 'SD-2804',
  },
  'text-color': {
    route: 'document-api',
    execution: 'single-doc-op-with-collapsed-fallback',
    operations: ['format.color', 'format.apply'],
    collapsedFallbackGapTicket: 'SD-2804',
  },
  'highlight-color': {
    route: 'document-api',
    execution: 'single-doc-op-with-collapsed-fallback',
    operations: ['format.highlight', 'format.apply'],
    collapsedFallbackGapTicket: 'SD-2804',
  },
  link: {
    route: 'document-api',
    execution: 'composed-doc-ops',
    operations: ['hyperlinks.wrap', 'hyperlinks.remove'],
    notes: 'UI layer owns the link prompt. Mutation routes through doc-api once payload has {href}; null href removes.',
  },
  'text-align': {
    route: 'document-api',
    execution: 'single-doc-op',
    operations: ['format.paragraph.setAlignment'],
  },
  'line-height': {
    route: 'document-api',
    execution: 'single-doc-op',
    operations: ['format.paragraph.setSpacing'],
  },
  'linked-style': {
    route: 'document-api',
    execution: 'single-doc-op',
    operations: ['styles.paragraph.setStyle'],
    notes:
      'Pair test must be strict — if the toolbar path does anything beyond apply-style (cursor moves, mark cleanup, etc.), the test must surface it.',
  },
  'bullet-list': {
    route: 'document-api',
    execution: 'composed-doc-ops',
    operations: ['lists.create', 'lists.attach', 'lists.detach'],
    notes: 'Toggle into/out of list.',
  },
  'numbered-list': {
    route: 'document-api',
    execution: 'composed-doc-ops',
    operations: ['lists.create', 'lists.attach', 'lists.detach'],
  },
  'indent-increase': {
    route: 'document-api',
    execution: 'composed-doc-ops',
    operations: ['lists.indent', 'format.paragraph.setIndentation'],
    notes: 'Branch on context: lists.indent inside a list, format.paragraph.setIndentation otherwise.',
  },
  'indent-decrease': {
    route: 'document-api',
    execution: 'composed-doc-ops',
    operations: ['lists.outdent', 'format.paragraph.setIndentation'],
  },
  undo: {
    route: 'document-api',
    execution: 'single-doc-op',
    operations: ['history.undo'],
    notes: 'Editor-session state, but the contract owns it via history.undo, so ui.commands.undo must not bypass it.',
  },
  redo: {
    route: 'document-api',
    execution: 'single-doc-op',
    operations: ['history.redo'],
  },
  'clear-formatting': {
    route: 'document-api',
    execution: 'single-doc-op',
    operations: ['format.paragraph.resetDirectFormatting'],
  },
  'track-changes-accept-selection': {
    route: 'document-api',
    execution: 'single-doc-op',
    operations: ['trackChanges.decide'],
  },
  'track-changes-reject-selection': {
    route: 'document-api',
    execution: 'single-doc-op',
    operations: ['trackChanges.decide'],
  },
  image: {
    route: 'document-api',
    execution: 'single-doc-op',
    operations: ['create.image'],
    notes: 'UI layer owns the file picker / upload dialog. Mutation goes through doc-api.',
  },
  'table-insert': {
    route: 'document-api',
    execution: 'single-doc-op',
    operations: ['create.table'],
  },
  'table-add-row-before': {
    route: 'document-api',
    execution: 'single-doc-op',
    operations: ['tables.insertRow'],
  },
  'table-add-row-after': {
    route: 'document-api',
    execution: 'single-doc-op',
    operations: ['tables.insertRow'],
  },
  'table-delete-row': {
    route: 'document-api',
    execution: 'single-doc-op',
    operations: ['tables.deleteRow'],
  },
  'table-add-column-before': {
    route: 'document-api',
    execution: 'single-doc-op',
    operations: ['tables.insertColumn'],
  },
  'table-add-column-after': {
    route: 'document-api',
    execution: 'single-doc-op',
    operations: ['tables.insertColumn'],
  },
  'table-delete-column': {
    route: 'document-api',
    execution: 'single-doc-op',
    operations: ['tables.deleteColumn'],
  },
  'table-delete': {
    route: 'document-api',
    execution: 'single-doc-op',
    operations: ['tables.delete'],
  },
  'table-merge-cells': {
    route: 'document-api',
    execution: 'single-doc-op',
    operations: ['tables.mergeCells'],
  },
  'table-split-cell': {
    route: 'document-api',
    execution: 'single-doc-op',
    operations: ['tables.splitCell'],
  },
  'table-remove-borders': {
    route: 'document-api',
    execution: 'single-doc-op',
    operations: ['tables.clearBorder'],
  },
  'table-fix': {
    route: 'legacy-editor-command',
    execution: 'legacy-gap',
    gapTicket: 'SD-2805',
    notes:
      'Recovery operation that re-runs ProseMirror fixTables against the document. Open question whether it should be public at all — SD-2805 answers that before any doc-api shape.',
  },
  ruler: {
    route: 'ui-session',
    execution: 'ui-session',
    relocationTicket: 'SD-2799',
    notes: 'Toggles a UI affordance. No document state changes. Long-term moves to ui.viewport.toggleRuler.',
  },
  zoom: {
    route: 'ui-session',
    execution: 'ui-session',
    relocationTicket: 'SD-2799',
    notes: 'Scales the rendered view. Long-term moves to ui.viewport.setZoom.',
  },
  'document-mode': {
    route: 'ui-session',
    execution: 'ui-session',
    relocationTicket: 'SD-2799',
    notes: 'Switches editing/suggesting/viewing mode. Long-term moves to ui.session.setMode (or similar).',
  },
  'copy-format': {
    route: 'ui-session',
    execution: 'ui-session',
    relocationTicket: 'SD-2799',
    notes: 'Clipboard-style UI gesture (capture format, paint on next selection). Stateful UI flow, not a mutation.',
  },
} as const satisfies Record<PublicToolbarItemId, ToolbarCommandRouting>;

export type ToolbarCommandRoutingMap = typeof TOOLBAR_COMMAND_ROUTING;

/**
 * Look up a command's routing. Throws if the id is not in the map — should
 * be unreachable thanks to the `satisfies` clause above, but defensively
 * surfaced so callers do not silently no-op on typos.
 */
export function getCommandRouting<Id extends PublicToolbarItemId>(id: Id): ToolbarCommandRoutingMap[Id] {
  return TOOLBAR_COMMAND_ROUTING[id];
}
