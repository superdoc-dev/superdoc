// Recognize a v2 host `mutation:rejected` event that means "an author identity
// is required" (plan 06). The v2 kernel fail-closes revision-overlap and
// tracked authoring with `no-author-configured` when no current author is
// configured; the adapter maps that to the public `PRECONDITION_FAILED`
// receipt. A normally-mounted SuperDoc always has an author (DEFAULT_USER), so
// this only fires for a lower-level/authorless session — the shell turns it
// into ONE non-terminal, actionable notification rather than a silent drop.

const NO_AUTHOR_SIGNAL = 'no-author-configured';

/** Stable, non-terminal exception code surfaced to consumers. */
export const V2_AUTHOR_REQUIRED_CODE = 'author-required';

/**
 * Content-safe, actionable message. Contains no document text, imported author,
 * email, path, or source key — only how to fix the configuration.
 */
export const V2_AUTHOR_REQUIRED_MESSAGE =
  'This edit needs an author identity. Set `user.name` in your SuperDoc configuration and reopen the document to make tracked or revision-overlapping edits.';

function messageHasNoAuthorSignal(message) {
  return typeof message === 'string' && message.includes(NO_AUTHOR_SIGNAL);
}

/**
 * @param {any} event - a `v2-host-event` payload.
 * @returns {boolean} true when the rejection means the session needs an author.
 */
export function isV2AuthorRequiredRejection(event) {
  if (!event || event.type !== 'mutation:rejected') return false;
  // Receipt-source: the kernel reason mapped to a public receipt.
  if (event.failureSource === 'receipt') {
    const failure = event.failure;
    if (!failure) return false;
    return failure.code === 'PRECONDITION_FAILED' && messageHasNoAuthorSignal(failure.message);
  }
  // Shell-source: the editable-input bridge's own rejection taxonomy.
  if (event.failureSource === 'shell') {
    if (event.reason === V2_AUTHOR_REQUIRED_CODE) return true;
    return event.reason === 'PRECONDITION_FAILED' && messageHasNoAuthorSignal(event.message);
  }
  return false;
}

/**
 * Deduplicate the non-terminal notification per mounted document/session.
 * A successful mutation or a reopened session clears only its own scope, so a
 * rejection in one document cannot silence another document in the same
 * SuperDoc instance.
 */
export function createV2AuthorRequiredNotificationGate() {
  const notifiedScopes = new Set();
  const keyFor = (scope) => (typeof scope === 'string' && scope.length > 0 ? scope : '__default__');
  return {
    shouldNotify(scope, event) {
      if (!isV2AuthorRequiredRejection(event)) return false;
      const key = keyFor(scope);
      if (notifiedScopes.has(key)) return false;
      notifiedScopes.add(key);
      return true;
    },
    clear(scope) {
      notifiedScopes.delete(keyFor(scope));
    },
  };
}
