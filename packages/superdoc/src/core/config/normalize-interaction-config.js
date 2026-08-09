/**
 * Interaction policy: what a user is allowed to do, as distinct from what
 * SuperDoc draws.
 *
 * `modules.comments` currently mixes the two. `highlightColors` and
 * `displayMode` describe the built-in comment UI and belong with the other
 * presentation settings, but `readOnly` and `allowResolve` decide whether an
 * action is permitted at all — and they stay meaningful when the application
 * renders its own comment UI. Under `ui: false` the built-in dialog is gone
 * while `readOnly` still has to reject mutations, so the two cannot live in
 * the same bucket.
 *
 * Splitting them also removes a trap: an application that disables built-in
 * comments to render its own would otherwise have to keep a
 * `modules.comments` object alive purely to carry policy that has nothing to
 * do with rendering.
 */

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Resolve the effective interaction policy.
 *
 * Reads `interaction.comments` first, then the legacy fields on
 * `modules.comments`, so both spellings work while the migration lands.
 *
 * @param {Record<string, any>} [config] Raw consumer config.
 * @returns {{ comments: { readOnly: boolean, allowResolve: boolean } }}
 */
export function normalizeInteractionConfig(config = {}) {
  const interaction = isPlainObject(config.interaction) ? config.interaction : {};
  const interactionComments = isPlainObject(interaction.comments) ? interaction.comments : {};

  // `modules.comments` is `false | object | undefined`. `false` disables the
  // built-in UI, which says nothing about policy, so it contributes no
  // legacy values rather than reading as "everything permitted".
  const legacyComments = isPlainObject(config.modules?.comments) ? config.modules.comments : {};

  return {
    comments: {
      // Defaults match today's runtime: mutations allowed, resolve shown.
      readOnly: (interactionComments.readOnly ?? legacyComments.readOnly ?? false) === true,
      allowResolve: (interactionComments.allowResolve ?? legacyComments.allowResolve ?? true) !== false,
    },
  };
}
