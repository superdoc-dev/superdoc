import { useEffect, useRef, useState } from 'react';
import type { CustomCommandRegistrationResult, SuperDocUIState } from 'superdoc/ui';
import { useSuperDocUI, useSuperDocSlice } from '../lib/SuperDocUIProvider';

/**
 * Hardcoded clause library for the demo. A real consumer would fetch
 * this from their own API and gate it on permissions / authoring
 * context — exactly the kind of state SuperDoc has no way to know
 * about, which is why `register({ getState })` + `invalidate()` exist.
 */
const CLAUSES = [
  {
    id: 'confidentiality',
    title: 'Confidentiality',
    body: 'Each party agrees to maintain the confidentiality of all information disclosed by the other party in connection with this agreement and to use such information solely for the purposes contemplated herein.',
  },
  {
    id: 'governing-law',
    title: 'Governing law',
    body: 'This agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of laws principles.',
  },
  {
    id: 'severability',
    title: 'Severability',
    body: 'If any provision of this agreement is held to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.',
  },
] as const;

type ClauseId = (typeof CLAUSES)[number]['id'];

interface InsertCluasePayload {
  clauseId: ClauseId;
}

/**
 * Demonstrates `ui.commands.register({...})` — the surface SuperDoc
 * exposes for consumer-defined toolbar buttons. The component:
 *
 *   1. Registers `'company.insertClause'` on mount and unregisters
 *      on unmount, so the command's lifetime matches the component's.
 *      Real consumer apps usually hold the registration for the
 *      session, but the pattern is the same.
 *
 *   2. Reads its disabled state from `ui.selection` — you can only
 *      insert a clause when the cursor is in the document. That's
 *      derived from `state.selection.empty === false || state has
 *      a target`, the kind of cross-state check `getState` is for.
 *
 *   3. Routes the actual mutation through the live SuperDoc instance.
 *      The clause text is inserted at the current cursor via
 *      `editor.commands.insertContent(text)` — the doc-api-based
 *      equivalent (a structured create/text op) would also work but
 *      this kept the example small.
 *
 * Capturing the registration return value (`reg.handle`) is the
 * realistic typed path: `ui.commands['company.insertClause']` works
 * at runtime but degrades to `unknown` at compile time without
 * module augmentation.
 */
export function InsertClauseButton() {
  const ui = useSuperDocUI();
  const [open, setOpen] = useState(false);
  const regRef = useRef<CustomCommandRegistrationResult<InsertCluasePayload, unknown> | null>(null);

  // Disable the button when there's no editor selection to insert into.
  // Selecting the bool directly (instead of the full state) means
  // shallowEqual short-circuits re-emits when readiness doesn't flip.
  const ready = useSuperDocSlice<boolean>(
    (controller) => controller.select(deriveReady, (a, b) => a === b),
    false,
  );

  // Register the custom command on mount; unregister on unmount.
  // `ui` is null until `<EditorMount>` reports onReady — until then
  // there's nothing to register against.
  useEffect(() => {
    if (!ui) return;

    const reg = ui.commands.register<InsertCluasePayload>({
      id: 'company.insertClause',
      getState: ({ state }) => ({
        active: false,
        disabled: !deriveReady(state),
      }),
      execute: ({ payload }) => {
        if (!payload) return false;
        const clause = CLAUSES.find((c) => c.id === payload.clauseId);
        if (!clause) return false;
        // The doc-api equivalents (`format.apply`, `comments.create`,
        // `tables.insertRow`, …) are the right home for *structured*
        // mutations. Plain "insert this text at the cursor" still
        // routes through `editor.commands` for now — the contract
        // doesn't expose a public text-insert primitive yet, and
        // that's a separate ticket.
        const editor = (ui as any).superdoc?.activeEditor;
        editor?.commands?.insertContent?.(clause.body);
        return true;
      },
    });

    regRef.current = reg;
    return () => {
      reg.unregister();
      regRef.current = null;
    };
  }, [ui]);

  const insert = (clauseId: ClauseId) => {
    setOpen(false);
    regRef.current?.handle.execute({ clauseId });
  };

  return (
    <div className="clause-menu">
      <button
        className="tb-btn"
        disabled={!ui || !ready}
        title="Insert standard clause"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Insert clause
      </button>
      {open && (
        <div className="menu" role="menu">
          {CLAUSES.map((clause) => (
            <button key={clause.id} role="menuitem" onClick={() => insert(clause.id)}>
              <div className="clause-title">{clause.title}</div>
              <div className="clause-preview">{clause.body}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "Can a clause be inserted right now?" Used both in `getState` (so
 * `snapshot.commands['company.insertClause']` reflects the truth)
 * and in this component's local subscription to drive the button's
 * own `disabled`.
 *
 * For an Insert action, "ready" means the editor has loaded *and*
 * the cursor is in the document — we don't require a non-collapsed
 * range because Insert places at the caret. A real product might
 * also check permissions, doc mode, etc.
 */
function deriveReady(state: SuperDocUIState): boolean {
  if (!state.ready) return false;
  if (state.documentMode === 'viewing') return false;
  // Empty selection (cursor only) is fine — Insert goes at the caret.
  // Selection target null means we don't have a positionable cursor at
  // all (no focus / no editor).
  return state.selection.target !== null || state.selection.empty;
}
