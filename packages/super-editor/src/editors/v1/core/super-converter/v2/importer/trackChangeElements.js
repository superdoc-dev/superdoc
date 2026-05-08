const TRACK_CHANGE_ELEMENT_NAMES = new Set(['w:del', 'w:ins', 'w:moveFrom', 'w:moveTo']);
const TRANSLATED_TRACK_CHANGE_ELEMENT_NAMES = new Set(['w:del', 'w:ins']);

export const isTrackChangeElement = (node) => TRACK_CHANGE_ELEMENT_NAMES.has(node?.name);
export const isTranslatedTrackChangeElement = (node) => TRANSLATED_TRACK_CHANGE_ELEMENT_NAMES.has(node?.name);
