const TRACK_CHANGE_ELEMENT_NAMES = new Set(['w:del', 'w:ins', 'w:moveFrom', 'w:moveTo']);
const TRANSLATED_TRACK_CHANGE_ELEMENT_NAMES = new Set(['w:del', 'w:ins']);
// Constructive wrappers carry content the user keeps when accepting the
// change (insertion / move-to). Destructive wrappers (w:del / w:moveFrom)
// hold content that disappears on accept — visual side-effects there are
// invisible to the user.
const CONSTRUCTIVE_TRACK_CHANGE_ELEMENT_NAMES = new Set(['w:ins', 'w:moveTo']);

export const isTrackChangeElement = (node) => TRACK_CHANGE_ELEMENT_NAMES.has(node?.name);
export const isTranslatedTrackChangeElement = (node) => TRANSLATED_TRACK_CHANGE_ELEMENT_NAMES.has(node?.name);
export const isConstructiveTrackChangeElement = (node) => CONSTRUCTIVE_TRACK_CHANGE_ELEMENT_NAMES.has(node?.name);
