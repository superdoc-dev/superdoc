/**
 * Shared safety envelope for running model-authored JS against a live v1
 * editor session: snapshot → executeCode → rollback on uncaught failure.
 *
 * Used by BOTH the `execute code` command and the preset-dispatch shim
 * (`doc.preset.dispatch` → `superdoc_execute_code`) so a script that mutates
 * and then throws never leaves partial edits behind, no matter which path
 * dispatched it. Success paths are untouched: mutations persist exactly as
 * before.
 */

import type { EditorWithDoc } from './document';
import { executeCode, type ExecuteCodeOptions, type ExecuteCodeResult } from './execute-code';

export type ExecuteCodeRollbackOutcome = {
  /** The script result; `rolledBack: true` marks a restored crash. */
  result: ExecuteCodeResult & { rolledBack?: boolean };
  revisionBefore: string | undefined;
  /**
   * Post-run revision, with a successful rollback normalized back to
   * `revisionBefore` — the restore-dispatch itself must not read as a
   * mutation (it would persist a content-identical file and bump the
   * session revision for nothing).
   */
  revisionAfter: string | undefined;
  /** True when the document changed and stayed changed (persist + mark dirty). */
  mutated: boolean;
};

/**
 * Capture a revision reader bound to the doc's ORIGINAL `info` BEFORE model
 * code runs. The same `doc` object is handed to arbitrary model JS, which
 * could reassign `doc.info` to a stub that hides a mutation; binding up front
 * means our before/after revision comparison always uses the real reader.
 */
export function makeRevisionReader(editor: EditorWithDoc): () => string | undefined {
  const info = editor.doc.info;
  const boundInfo = typeof info === 'function' ? info.bind(editor.doc) : null;
  return () => {
    if (!boundInfo) return undefined;
    try {
      const result = boundInfo({}) as { revision?: unknown } | undefined;
      const revision = result?.revision;
      return typeof revision === 'string' ? revision : revision != null ? String(revision) : undefined;
    } catch {
      return undefined;
    }
  };
}

export async function executeCodeWithRollback(
  editor: EditorWithDoc,
  code: string,
  options: ExecuteCodeOptions = {},
): Promise<ExecuteCodeRollbackOutcome> {
  // Bind the revision reader to the ORIGINAL info BEFORE running model code.
  const readRevision = makeRevisionReader(editor);
  const revisionBefore = readRevision();

  // Snapshot the document before running model-authored code so a script that
  // mutates and THEN crashes can be rolled back instead of leaving
  // half-destroyed content behind (scripts dispatch real transactions as they
  // run; an uncaught throw mid-loop otherwise commits the prefix).
  const editorForRollback = editor as unknown as {
    state?: { doc?: { content?: unknown }; tr?: unknown };
    dispatch?: (tr: unknown) => void;
  };
  const docBefore = editorForRollback.state?.doc ?? null;

  // Run the model's JS against the SYNCHRONOUS in-host doc. Never throws.
  const result: ExecuteCodeResult & { rolledBack?: boolean } = await executeCode(editor.doc, code, options);

  let revisionAfter = readRevision();
  let rolledBack = false;
  // Roll back on uncaught failure whenever we hold a pre-script snapshot.
  // The revision comparison is only a "nothing changed, skip" optimization:
  // if the revision reader is unavailable (null either side), we cannot
  // prove the doc is untouched, so we restore rather than risk leaving a
  // half-mutated document behind.
  const revisionMoved = revisionBefore == null || revisionAfter == null || revisionAfter !== revisionBefore;
  if (!result.ok && docBefore != null && revisionMoved) {
    // Uncaught script failure after partial mutation — restore the
    // pre-script document. Semantic failures the script catches and
    // returns as values cannot be detected here; doc.history.undo
    // remains available to the agent for those.
    try {
      // Same dispatch path the document-api adapters use: a fresh
      // editor.state.tr dispatched via editor.dispatch.
      const state = editorForRollback.state as
        | {
            tr?: { replaceWith?: (from: number, to: number, content: unknown) => unknown };
            doc?: { content?: { size?: number } };
          }
        | undefined;
      const tr = state?.tr as { replaceWith?: (from: number, to: number, content: unknown) => unknown } | undefined;
      const size = state?.doc?.content?.size;
      if (typeof editorForRollback.dispatch === 'function' && tr?.replaceWith && typeof size === 'number') {
        const restore = tr.replaceWith(0, size, (docBefore as { content: unknown }).content);
        editorForRollback.dispatch(restore);
        rolledBack = true;
        revisionAfter = readRevision();
      }
    } catch {
      // rollback is best-effort; fall through with the mutated state
    }
  }
  if (rolledBack) {
    result.rolledBack = true;
    revisionAfter = revisionBefore;
  }

  // Best-effort change detection: the in-host doc revision moved while the
  // script ran. Only persist (and bump session revision) when it changed.
  const mutated = revisionBefore != null && revisionAfter != null && revisionBefore !== revisionAfter;

  return { result, revisionBefore, revisionAfter, mutated };
}
