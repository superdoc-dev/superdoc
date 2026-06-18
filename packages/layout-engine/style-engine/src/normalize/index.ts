/**
 * Editor-neutral normalize layer.
 *
 * Maps the typed style-engine `ParagraphProperties` / `RunProperties` into
 * the visual subset of `@superdoc/contracts` `ParagraphAttrs` / `TextRun`
 * that the v2 review-layout adapter can safely emit without depending on
 * ProseMirror or v1 editor runtime.
 */

export { normalizeParagraphAttrsFromOoxml } from './paragraph-attrs.js';
export { normalizeRunAttrsFromOoxml, type NormalizeRunAttrsContext } from './run-attrs.js';
export type { TextRunStyleAttrs, ParagraphAttrs } from './types.js';
export { applyThemeTintShade, normalizeHexColor, resolveThemeColor } from './colors.js';
export {
  PX_PER_EIGHTH_POINT,
  PX_PER_POINT,
  PX_PER_TWIP,
  eighthPointsToPx,
  halfPointsToPx,
  twipsToPx,
} from './units.js';
