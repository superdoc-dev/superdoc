import { Mark } from '@core/Mark.js';
import { Attribute } from '@core/Attribute.js';
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

      authorId: {
        default: '',
        rendered: false,
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

      // Review graph metadata.
      // These optional persisted attrs carry logical review graph
      // state. They are never rendered as DOM attributes — graph metadata is
      // not visual state. Compatibility: older marks omit them and the graph
      // builder infers values from mark type and sibling adjacency.

      revisionGroupId: {
        default: '',
        rendered: false,
      },

      splitFromId: {
        default: '',
        rendered: false,
      },

      changeType: {
        default: '',
        rendered: false,
      },

      replacementGroupId: {
        default: '',
        rendered: false,
      },

      replacementSideId: {
        default: '',
        rendered: false,
      },

      overlapParentId: {
        default: '',
        rendered: false,
      },

      // Deterministic JSON object carrying raw Word ids / rsids when present.
      // Empty object is the canonical default at the graph level; on the mark
      // we store `null` so adjacent marks without source ids do not differ by
      // missing-vs-empty defaults during PM mark.eq comparison.
      sourceIds: {
        default: null,
        rendered: false,
      },

      origin: {
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
