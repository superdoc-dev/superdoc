import { Node, Attribute } from '@core/index.js';

const toSuperscriptDigits = (value) => {
  const map = {
    0: '⁰',
    1: '¹',
    2: '²',
    3: '³',
    4: '⁴',
    5: '⁵',
    6: '⁶',
    7: '⁷',
    8: '⁸',
    9: '⁹',
  };
  return String(value ?? '')
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('');
};

const resolveFootnoteDisplayNumber = (editor, id) => {
  const key = id == null ? null : String(id);
  if (!key) return null;
  const map = editor?.converter?.footnoteNumberById;
  const mapped = map && typeof map === 'object' ? map[key] : undefined;
  return typeof mapped === 'number' && Number.isFinite(mapped) && mapped > 0 ? mapped : null;
};

export class FootnoteReferenceNodeView {
  constructor(node, getPos, decorations, editor, htmlAttributes = {}) {
    void decorations;
    this.node = node;
    this.getPos = getPos;
    this.editor = editor;
    this.dom = this.#renderDom(node, htmlAttributes);
  }

  #renderDom(node, htmlAttributes) {
    const el = document.createElement('sup');
    el.className = 'sd-footnote-ref';
    el.setAttribute('contenteditable', 'false');
    el.setAttribute('aria-label', 'Footnote reference');

    Object.entries(htmlAttributes).forEach(([key, value]) => {
      if (value != null && value !== false) {
        el.setAttribute(key, String(value));
      }
    });

    const id = node?.attrs?.id;
    if (id != null) {
      el.setAttribute('data-footnote-id', String(id));
      const display = resolveFootnoteDisplayNumber(this.editor, id) ?? id;
      el.textContent = toSuperscriptDigits(display);
    } else {
      el.textContent = '*';
    }

    return el;
  }

  update(node) {
    const incomingType = node?.type?.name;
    const currentType = this.node?.type?.name;
    if (!incomingType || incomingType !== currentType) return false;
    this.node = node;

    const id = node?.attrs?.id;
    if (id != null) {
      this.dom.setAttribute('data-footnote-id', String(id));
      const display = resolveFootnoteDisplayNumber(this.editor, id) ?? id;
      this.dom.textContent = toSuperscriptDigits(display);
    } else {
      this.dom.removeAttribute('data-footnote-id');
      this.dom.textContent = '*';
    }

    return true;
  }
}

export const FootnoteReference = Node.create({
  name: 'footnoteReference',

  group: 'inline',

  inline: true,

  atom: true,

  selectable: false,

  draggable: false,

  addOptions() {
    return {
      htmlAttributes: {
        'data-footnote-ref': 'true',
      },
    };
  },

  addAttributes() {
    return {
      id: {
        default: null,
      },
      customMarkFollows: {
        default: null,
      },
    };
  },

  addNodeView() {
    return ({ node, editor, getPos, decorations }) => {
      const htmlAttributes = this.options.htmlAttributes;
      return new FootnoteReferenceNodeView(node, getPos, decorations, editor, htmlAttributes);
    };
  },

  parseDOM() {
    return [{ tag: 'sup[data-footnote-id]' }];
  },

  renderDOM({ htmlAttributes }) {
    return ['sup', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes)];
  },
});
