/**
 * Allowlist for `check-public-method-coverage.mjs`.
 *
 * The script enumerates public instance methods + getters on the
 * `SuperDoc` class and requires each to have at least one consumer-side
 * fixture reference (Parameters<>, ReturnType<>, or a real call site).
 * Use this file ONLY for members that are intentionally not part of
 * the consumer-callable surface but escaped the `private` modifier
 * for legitimate reasons (e.g. called by extensions or composables
 * that live in the workspace but aren't exposed through the public
 * facade). This file also carries explicit carve-outs for V2-only
 * assertions that now live in the private `superdoc/tests` lane.
 *
 * Each entry MUST carry a one-line reason. The key is the SuperDoc
 * member name (no path needed since it scopes to one class). The
 * value is the reason.
 */
module.exports = {
  // Lifecycle/relay methods called by SuperDoc.vue and extension code.
  // Not part of `superdoc.X()` consumer surface; consumers register
  // callbacks on Config (`onEditorBeforeCreate`, etc.) and SuperDoc
  // relays via these broadcast helpers.
  broadcastReady: 'Internal lifecycle relay; called by editor/Vue glue, not by consumers.',
  broadcastEditorBeforeCreate: 'Internal lifecycle relay; called by editor/Vue glue, not by consumers.',
  broadcastEditorCreate: 'Internal lifecycle relay; called by editor/Vue glue, not by consumers.',
  broadcastEditorDestroy: 'Internal lifecycle relay; called by editor/Vue glue, not by consumers.',
  broadcastPdfDocumentReady: 'Internal lifecycle relay; called by editor/Vue glue, not by consumers.',
  broadcastSidebarToggle: 'Internal lifecycle relay; called by editor/Vue glue, not by consumers.',
  setActiveEditor: 'Internal setter; called by editor lifecycle, not by consumers.',
  onContentError: 'Internal handler bound to editor `content-error`; consumers use Config.onContentError.',
  getV2FeatureMatrix:
    'V2-only metadata assertion moved to superdoc/tests/consumer-typecheck-private; no longer covered by the public consumer fixture lane.',
  v2:
    'V2-only metadata assertion moved to superdoc/tests/consumer-typecheck-private; no longer covered by the public consumer fixture lane.',
};
