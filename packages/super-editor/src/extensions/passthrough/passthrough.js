import { Node } from '@core/index.js';

const sharedAttributes = () => ({
  originalName: {
    default: null,
  },
  originalXml: {
    default: null,
  },
});

const hiddenRender = (type) => ['sd-passthrough', { 'data-sd-passthrough': type, style: 'display: none;' }];

export const PassthroughBlock = Node.create({
  name: 'passthroughBlock',
  group: 'block',
  atom: true,
  draggable: false,
  selectable: false,
  defining: true,

  parseDOM() {
    return [{ tag: 'sd-passthrough[data-sd-passthrough="block"]' }];
  },

  renderDOM() {
    return hiddenRender('block');
  },

  addAttributes() {
    return sharedAttributes();
  },
});

export const PassthroughInline = Node.create({
  name: 'passthroughInline',
  group: 'inline',
  inline: true,
  marks: '',
  // IMPORTANT: This node is registered in pm-adapter/src/constants.ts ATOMIC_INLINE_TYPES
  // If you change atom to false, you MUST remove it from that set to avoid positioning bugs
  atom: true,
  draggable: false,
  selectable: false,

  parseDOM() {
    return [{ tag: 'sd-passthrough[data-sd-passthrough="inline"]' }];
  },

  renderDOM() {
    return hiddenRender('inline');
  },

  addAttributes() {
    return sharedAttributes();
  },
});
