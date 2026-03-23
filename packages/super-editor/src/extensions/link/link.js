// @ts-nocheck
import { Mark } from '@core/Mark.js';
import { Attribute } from '@core/Attribute.js';
import { getMarkRange } from '@core/helpers/getMarkRange.js';
import { findOrCreateRelationship } from '@core/parts/adapters/relationships-mutation.js';
import { sanitizeHref, encodeTooltip, UrlValidationConstants } from '@superdoc/url-validation';

/**
 * Target frame options
 * @typedef {'_top' | '_self' | '_parent' | '_blank' | string} TargetFrameOptions
 */

/**
 * Configuration options for Link
 * @typedef {Object} LinkOptions
 * @category Options
 * @property {string[]} [protocols=['http', 'https']] - Allowed URL protocols
 * @property {Object} [htmlAttributes] - HTML attributes for link elements
 * @property {string} [htmlAttributes.target=null] - Default link target
 * @property {string} [htmlAttributes.rel='noopener noreferrer nofollow'] - Default rel attribute
 * @property {string} [htmlAttributes.class=null] - CSS class
 * @property {string} [htmlAttributes.title=null] - Title attribute
 */

/**
 * Attributes for link marks
 * @typedef {Object} LinkAttributes
 * @category Attributes
 * @property {string} [href] - URL or anchor reference
 * @property {TargetFrameOptions} [target='_blank'] - Link target window
 * @property {string} [rel='noopener noreferrer nofollow'] - Relationship attributes
 * @property {string} [text] - Display text for the link
 * @property {string} [name] - Anchor name for internal references
 * @property {boolean} [history=true] - Whether to add to viewed hyperlinks list
 * @property {string} [anchor] - Bookmark target name (ignored if rId and href specified)
 * @property {string} [docLocation] - Location in target hyperlink
 * @property {string} [tooltip] - Tooltip for the link
 * @property {string} [rId] @internal Word relationship ID for internal links
 */

/**
 * Link options for setLink command
 * @typedef {Object} SetLinkOptions
 * @property {string} [href] - URL for the link
 * @property {string} [text] - Display text (uses selection if omitted)
 */

/**
 * @module Link
 * @sidebarTitle Link
 * @snippetPath /snippets/extensions/link.mdx
 * @note Non-inclusive mark that doesn't expand when typing at edges
 */
export const Link = Mark.create({
  name: 'link',
  priority: 1000,
  keepOnSplit: false,
  inclusive: false,

  addOptions() {
    return {
      protocols: ['http', 'https'],
      htmlAttributes: {
        target: null,
        rel: 'noopener noreferrer nofollow',
        class: null,
        title: null,
      },
    };
  },

  parseDOM() {
    return [{ tag: 'a' }];
  },

  renderDOM({ htmlAttributes }) {
    const sanitizedHref = sanitizeLinkHref(htmlAttributes.href, this.options.protocols);
    const attrs = { ...htmlAttributes };
    attrs.href = sanitizedHref ? sanitizedHref.href : '';
    return ['a', Attribute.mergeAttributes(this.options.htmlAttributes, attrs), 0];
  },

  addAttributes() {
    return {
      /**
       * @category Attribute
       * @param {string} [href] - URL or anchor reference
       */
      href: {
        default: null,
        renderDOM: ({ href, name }) => {
          const sanitized = sanitizeLinkHref(href, this.options.protocols);
          if (sanitized) return { href: sanitized.href };
          if (name) return { href: `#${name}` };
          return {};
        },
      },
      /**
       * @category Attribute
       * @param {TargetFrameOptions} [target='_blank'] - Link target window
       */
      target: {
        default: this.options.htmlAttributes.target,
        renderDOM: ({ target, href }) => {
          if (target) return { target };
          const sanitized = sanitizeLinkHref(href, this.options.protocols);
          if (sanitized && sanitized.isExternal) return { target: '_blank' };
          return {};
        },
      },
      /**
       * @category Attribute
       * @param {string} [rel='noopener noreferrer nofollow'] - Relationship attributes
       */
      rel: { default: this.options.htmlAttributes.rel },
      /**
       * @private
       * @category Attribute
       * @param {string} [rId] - Word relationship ID for internal links
       */
      rId: { default: this.options.htmlAttributes.rId || null },
      /**
       * @category Attribute
       * @param {string} [text] - Display text for the link
       */
      text: { default: null },
      /**
       * @category Attribute
       * @param {string} [name] - Anchor name for internal references
       */
      name: { default: null },
      /**
       * @category Attribute
       * @param {boolean} [history] - Specifies whether the target of the hyperlink  shall be added to a list of viewed hyperlinks when it is invoked.
       */
      history: { default: true, rendered: false },
      /**
       * @category Attribute
       * @param {string|null} [anchor] - Specifies the name of a bookmark that is the target of this link. If the rId and href attributes are specified, then this attribute is ignored.
       */
      anchor: { rendered: false },
      /**
       * @category Attribute
       * @param {string|null} [docLocation] - Specifies a location in the target of the hyperlink.
       */
      docLocation: { rendered: false },
      /**
       * @category Attribute
       * @param {string|null} [tooltip] - A tooltip for the link
       */
      tooltip: {
        default: null,
        renderDOM: ({ tooltip }) => {
          const result = encodeTooltip(tooltip);
          if (result) {
            // Use raw text - browser will escape when setting attribute
            const attrs = { title: result.text };
            if (result.wasTruncated) {
              attrs['data-link-tooltip-truncated'] = 'true';
            }
            return attrs;
          }
          return {};
        },
      },
    };
  },

  addCommands() {
    return {
      /**
       * Create or update a link
       * @category Command
       * @param {SetLinkOptions} [options] - Link configuration
       * @example
       * editor.commands.setLink({ href: 'https://example.com' })
       * editor.commands.setLink({
       *   href: 'https://example.com',
       *   text: 'Visit Example'
       * })
       * @note Automatically adds underline formatting and trims whitespace from link boundaries
       */
      setLink:
        ({ href, text } = {}) =>
        ({ state, dispatch, editor }) => {
          const { selection } = state;
          const linkMarkType = editor.schema.marks.link;
          const underlineMarkType = editor.schema.marks.underline;

          const sanitizedHref = href ? sanitizeLinkHref(href, this.options.protocols) : null;
          if (href && !sanitizedHref) {
            return false;
          }

          let from = selection.from;
          let to = selection.to;

          // Expand empty selection to cover existing link
          if (selection.empty) {
            const range = getMarkRange(selection.$from, linkMarkType);
            if (range) {
              from = range.from;
              to = range.to;
            }
          } else {
            // Handle partial link selections
            const fromLinkRange = getMarkRange(selection.$from, linkMarkType);
            const toLinkRange = getMarkRange(selection.$to, linkMarkType);
            if (fromLinkRange || toLinkRange) {
              const linkRange = fromLinkRange || toLinkRange;
              from = linkRange.from;
              to = linkRange.to;
            }
          }

          ({ from, to } = trimRange(state.doc, from, to));

          const currentText = state.doc.textBetween(from, to);
          const computedText = text ?? currentText;
          const fallbackHref = sanitizedHref?.href ?? '';
          const finalText = computedText && computedText.length > 0 ? computedText : fallbackHref;
          let tr = state.tr;

          if (finalText && currentText !== finalText) {
            tr = tr.insertText(finalText, from, to);
            to = from + finalText.length;
          }

          if (linkMarkType) tr = tr.removeMark(from, to, linkMarkType);
          if (underlineMarkType) tr = tr.removeMark(from, to, underlineMarkType);

          if (underlineMarkType) tr = tr.addMark(from, to, underlineMarkType.create());

          let rId = null;
          if (editor.options.mode === 'docx') {
            const id = addLinkRelationship({ editor, href });
            if (id) rId = id;
          }

          const linkAttrs = { text: finalText, rId };
          if (sanitizedHref?.href) {
            linkAttrs.href = sanitizedHref.href;
          }

          const newLinkMarkType = linkMarkType.create(linkAttrs);
          tr = tr.addMark(from, to, newLinkMarkType);

          dispatch(tr.scrollIntoView());
          return true;
        },

      /**
       * Remove link and associated formatting
       * @category Command
       * @example
       * editor.commands.unsetLink()
       * @note Also removes underline and text color
       */
      unsetLink:
        () =>
        ({ chain }) => {
          return chain()
            .unsetMark('underline', { extendEmptyMarkRange: true })
            .unsetColor()
            .unsetMark('link', { extendEmptyMarkRange: true })
            .run();
        },

      /**
       * Toggle link on selection
       * @category Command
       * @param {SetLinkOptions} [options] - Link configuration
       * @example
       * editor.commands.toggleLink({ href: 'https://example.com' })
       * editor.commands.toggleLink()
       */
      toggleLink:
        ({ href, text } = {}) =>
        ({ commands }) => {
          if (!href) return commands.unsetLink();
          return commands.setLink({ href, text });
        },
    };
  },
});

/**
 * Normalize protocol values into a consistent array format.
 *
 * Converts protocol configuration (string or object format) into a normalized
 * array of lowercase protocol strings, filtering out invalid entries.
 *
 * @private
 * @param {Array<string | {scheme: string}>} [protocols=[]] - Protocol configurations
 * @returns {string[]} Array of normalized lowercase protocol strings
 * @example
 * normalizeProtocols(['HTTP', { scheme: 'FTP' }]) // Returns: ['http', 'ftp']
 */
function normalizeProtocols(protocols = []) {
  const result = [];
  protocols.forEach((protocol) => {
    if (!protocol) return;
    if (typeof protocol === 'string' && protocol.trim()) {
      result.push(protocol.trim().toLowerCase());
    } else if (typeof protocol === 'object' && typeof protocol.scheme === 'string' && protocol.scheme.trim()) {
      result.push(protocol.scheme.trim().toLowerCase());
    }
  });
  return result;
}

/**
 * Sanitize a link href using the url-validation package.
 *
 * Wraps the external sanitizeHref function with protocol merging logic,
 * combining default allowed protocols with custom protocols from configuration.
 *
 * @private
 * @param {string | null | undefined} href - URL string to sanitize
 * @param {Array<string | {scheme: string}>} [protocols] - Additional protocols to allow
 * @returns {import('@superdoc/url-validation').SanitizedLink | null} Sanitized link object or null
 * @example
 * sanitizeLinkHref('https://example.com', ['ftp'])
 * // Returns: { href: 'https://example.com', protocol: 'https', isExternal: true }
 */
function sanitizeLinkHref(href, protocols) {
  if (!href) return null;

  // Validate protocols is array-like before processing
  const normalizedProtocols = Array.isArray(protocols) ? normalizeProtocols(protocols) : [];

  const allowedProtocols = Array.from(
    new Set([...UrlValidationConstants.DEFAULT_ALLOWED_PROTOCOLS, ...normalizedProtocols]),
  );
  return sanitizeHref(href, { allowedProtocols });
}

/**
 * Trim node boundaries from range
 * @private
 * @param {Object} doc - Document node
 * @param {number} from - Start position
 * @param {number} to - End position
 * @returns {{from: number, to: number}} Trimmed range
 * @note A "non-user" position is one that produces **no text** when we ask
 * `doc.textBetween(pos, pos + 1, '')`.
 * That happens at node boundaries (between the doc node and its first child,
 * between paragraphs, etc.).
 *
 * A regular space typed by the user **does** produce text (" "), so it will
 * NOT be trimmed.
 */
const trimRange = (doc, from, to) => {
  // Skip positions that produce no text output (node boundaries).
  while (from < to && doc.textBetween(from, from + 1, '') === '') {
    from += 1;
  }

  while (to > from && doc.textBetween(to - 1, to, '') === '') {
    to -= 1;
  }

  // This should now normalize the from and to selections to require
  // starting and ending without doc specific whitespace
  return { from, to };
};

function addLinkRelationship({ editor, href }) {
  return findOrCreateRelationship(editor, 'link:addLinkRelationship', {
    target: href,
    type: 'hyperlink',
  });
}
