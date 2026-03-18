import { Mark, Attribute } from '@core/index.js';
import { TrackInsertMarkName } from './constants.js';

const trackInsertClass = 'track-insert';

export const TrackInsert = Mark.create({
  name: TrackInsertMarkName,

  group: 'track',

  inclusive: false,

  addOptions() {
    return {
      htmlAttributes: {
        class: trackInsertClass,
      },
    };
  },

  addAttributes() {
    return {
      id: {
        default: '',
        parseDOM: (elem) => elem.getAttribute('data-id'),
        renderDOM: (attrs) => {
          if (!attrs.id) return {};
          return {
            'data-id': attrs.id,
          };
        },
      },

      author: {
        default: '',
        parseDOM: (elem) => elem.getAttribute('data-author'),
        renderDOM: (attrs) => {
          if (!attrs.author) return {};
          return {
            'data-author': attrs.author,
          };
        },
      },

      authorEmail: {
        default: '',
        parseDOM: (elem) => elem.getAttribute('data-authoremail'),
        renderDOM: (attrs) => {
          if (!attrs.authorEmail) return {};
          return {
            'data-authoremail': attrs.authorEmail,
          };
        },
      },

      authorImage: {
        default: '',
        parseDOM: (elem) => elem.getAttribute('data-authorimage'),
        renderDOM: (attrs) => {
          if (!attrs.authorImage) return {};
          return {
            'data-authorimage': attrs.authorImage,
          };
        },
      },

      date: {
        default: '',
        parseDOM: (elem) => elem.getAttribute('data-date'),
        renderDOM: (attrs) => {
          if (!attrs.date) return {};
          return {
            'data-date': attrs.date,
          };
        },
      },

      sourceId: {
        default: '',
        rendered: false,
      },

      importedAuthor: {
        default: '',
        rendered: false,
      },
    };
  },

  parseDOM() {
    return false;
  },

  renderDOM({ htmlAttributes }) {
    return ['span', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), 0];
  },
});
