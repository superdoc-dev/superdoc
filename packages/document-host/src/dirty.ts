/**
 * Dirty-tracking classification for the headless document session.
 *
 * A successful invoke dirties the session - forcing `export()` to re-serialize
 * instead of returning the original input bytes verbatim - iff the operation
 * actually changed the document. We approximate "changed" as: the operation
 * mutates (per the authoritative COMMAND_CATALOG) AND it did not run as a dryRun
 * preview. Getting this wrong in the clean direction silently drops a real edit
 * on the next export, so every ambiguous case fails safe to "mutating".
 *
 * COMMAND_CATALOG is re-exported from @superdoc/document-api's entry (the rpc
 * server imports it the same way). A leading `doc.` is stripped defensively.
 *
 * Two subtleties, both mirroring @superdoc/document-api exactly:
 *  - dryRun is only honored for ops that SUPPORT it (`supportsDryRun`). Ops that
 *    take RevisionGuardOptions (e.g. comments.create, clearContent) ignore a
 *    stray `dryRun` flag and still mutate, so we must keep the session dirty.
 *  - `formatRange` is a legacy-compat alias whose mutation flags live on its
 *    INPUT; the api resolves its dryRun as `input.dryRun ?? options.dryRun`
 *    (input precedence - an explicit `input.dryRun: false` overrides
 *    `options.dryRun: true` and the op mutates). Every other op reads dryRun
 *    from `options` only.
 */
import { COMMAND_CATALOG } from '@superdoc/document-api';

/** Ops whose dryRun is resolved from the input object (with precedence over options). */
const INPUT_DRYRUN_OPERATIONS: ReadonlySet<string> = new Set(['formatRange']);

/**
 * The effective dryRun the operation itself would compute, mirroring
 * @superdoc/document-api: `formatRange` uses `input.dryRun ?? options.dryRun`;
 * all other ops read `options.dryRun`. Only a literal `true` counts as a preview
 * (non-boolean dryRun is rejected by the api's own input validation).
 */
function resolveDryRun(opId: string, input: unknown, options: unknown): boolean {
  const optionsDryRun = (options as { dryRun?: unknown } | undefined)?.dryRun;
  if (INPUT_DRYRUN_OPERATIONS.has(opId)) {
    const inputDryRun = (input as { dryRun?: unknown } | undefined)?.dryRun;
    return (inputDryRun ?? optionsDryRun) === true;
  }
  return optionsDryRun === true;
}

/**
 * Decide whether a successful invoke should mark the session dirty.
 * @param operationId canonical document-api operation id (a leading `doc.` is tolerated)
 * @param input the op input (consulted for input-dryRun ops like formatRange)
 * @param options the op options (the standard home of dryRun)
 */
export function isMutatingInvoke(operationId: string, input: unknown, options: unknown): boolean {
  const opId = operationId.startsWith('doc.') ? operationId.slice(4) : operationId;
  const entry = COMMAND_CATALOG[opId as keyof typeof COMMAND_CATALOG];
  // Unknown op -> assume mutating (fail-safe: a new/unknown op must never produce a
  // false-clean save that silently drops a change).
  if (!entry) return true;
  // Read-only op -> never dirties.
  if (entry.mutates !== true) return false;
  // Mutating op stays clean only if it actually ran as a dryRun preview, and only ops
  // that support dryRun honor the flag at all.
  if (entry.supportsDryRun === true && resolveDryRun(opId, input, options)) return false;
  return true;
}
