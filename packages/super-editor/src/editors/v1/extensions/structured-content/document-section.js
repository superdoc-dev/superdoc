// @ts-nocheck

import { Node } from '@core/Node.js';
import { Attribute } from '@core/Attribute.js';
import { DocumentSectionView } from './document-section/DocumentSectionView.js';
import { htmlHandler } from '@core/InputRule.js';
import { Selection } from 'prosemirror-state';
import { DOMParser as PMDOMParser } from 'prosemirror-model';
import { findParentNode } from '@helpers/index.js';
import { SectionHelpers } from './document-section/helpers.js';

/**
 * Document section creation options
 * @typedef {Object} SectionCreate
 * @property {number} [id] - Unique ID. Auto-increments from existing sections if omitted
 * @property {string} [title="Document section"] - Label shown in section header
 * @property {string} [description] - Metadata for tracking (stored in Word's w:tag)
 * @property {string} [sectionType] - Business classification
 * @property {boolean} [isLocked=false] - Prevent editing when true
 * @property {string} [html] - HTML content to insert
 * @property {Object} [json] - ProseMirror JSON (overrides html if both provided)
 */

/**
 * Update an existing section
 * @typedef {Object} SectionUpdate
 * @property {number} id - Target section ID (required)
 * @property {string} [html] - Replace content with HTML
 * @property {Object} [json] - Replace content with ProseMirror JSON (overrides html)
 * @property {Partial<DocumentSectionAttributes>} [attrs] - Update attributes only (preserves content)
 */

/**
 * Configuration options for DocumentSection
 * @typedef {Object} DocumentSectionOptions
 * @category Options
 * @property {Object} [htmlAttributes] - HTML attributes for document sections
 */

/**
 * Attributes for document section nodes
 * @typedef {Object} DocumentSectionAttributes
 * @category Attributes
 * @property {number} [id] - Unique section identifier
 * @property {string} [title] - Section display label (becomes w:alias in Word)
 * @property {string} [description] - Additional metadata stored in w:tag
 * @property {string} [sectionType] - Business type for filtering/logic (e.g., 'legal', 'pricing')
 * @property {boolean} [isLocked=false] - Lock state (maps to w:lock="sdtContentLocked")
 * @property {string} [sdBlockId] @internal - Internal block tracking
 */

/**
 * @module DocumentSection
 * @sidebarTitle Document Section
 * @snippetPath /snippets/extensions/document-section.mdx
 */
export const DocumentSection = Node.create({
  name: 'documentSection',
  group: 'block',
  content: 'block*',
  atom: true,
  isolating: true,

  addOptions() {
    return {
      htmlAttributes: {
        class: 'sd-document-section-block',
        'aria-label': 'Structured content block',
      },
    };
  },

  parseDOM() {
    return [
      {
        tag: 'div.sd-document-section-block',
        priority: 60,
      },
    ];
  },

  renderDOM({ htmlAttributes }) {
    return ['div', Attribute.mergeAttributes(this.options.htmlAttributes, htmlAttributes), 0];
  },

  addAttributes() {
    return {
      id: {},
      sdBlockId: {
        default: null,
        keepOnSplit: false,
        parseDOM: (elem) => elem.getAttribute('data-sd-block-id'),
        renderDOM: (attrs) => {
          return attrs.sdBlockId ? { 'data-sd-block-id': attrs.sdBlockId } : {};
        },
      },
      title: {},
      description: {},
      sectionType: {},
      isLocked: { default: false },
    };
  },

  addNodeView() {
    return ({ node, editor, getPos, decorations }) => {
      return new DocumentSectionView(node, getPos, decorations, editor);
    };
  },

  // @ts-expect-error - Command signatures will be fixed in TS migration
  addCommands() {
    return {
      /**
       * Create a lockable content section
       * @category Command
       * @param {SectionCreate} [options={}] - Section configuration
       * @example
       * editor.commands.createDocumentSection({
       *   id: 1,
       *   title: 'Terms & Conditions',
       *   isLocked: true,
       *   html: '<p>Legal content...</p>'
       * })
       */
      createDocumentSection:
        (options = {}) =>
        ({ tr, state, dispatch, editor }) => {
          const { selection } = state;
          let { from, to } = selection;

          let content = selection.content().content;
          const { html: optionsHTML, json: optionsJSON } = options;

          // If HTML is provided, parse it and convert to ProseMirror nodes
          if (optionsHTML) {
            const html = htmlHandler(optionsHTML, this.editor);
            const doc = PMDOMParser.fromSchema(this.editor.schema).parse(html);
            content = doc.content;
          }

          // JSON takes priority over HTML
          if (optionsJSON) {
            content = this.editor.schema.nodeFromJSON(optionsJSON);
          }

          if (!content?.content?.length) {
            content = this.editor.schema.nodeFromJSON({ type: 'paragraph', content: [] });
          }

          // We assign IDs as positive integers starting from 0.
          if (!options.id) {
            const allSections = SectionHelpers.getAllSections(editor);
            options.id = allSections.length + 1;
          }

          if (!options.title) {
            options.title = 'Document section';
          }

          const node = this.type.createAndFill(options, content);
          if (!node) return false;

          const isAlreadyInSdtBlock = findParentNode((node) => node.type.name === 'documentSection')(selection);
          if (isAlreadyInSdtBlock && isAlreadyInSdtBlock.node) {
            const insertPos = isAlreadyInSdtBlock.pos + isAlreadyInSdtBlock.node.nodeSize;
            from = insertPos;
            to = insertPos;
          }

          // Replace the selection with the new node
          tr.replaceRangeWith(from, to, node);

          // Calculate where the node ends after insertion
          const nodeEnd = from + node.nodeSize;

          // Only insert paragraph if we're not at the document boundary and there's space
          let shouldInsertParagraph = true;
          let insertPos = nodeEnd;

          // Check if we can safely insert at this position
          if (nodeEnd >= tr.doc.content.size) {
            // We're at or beyond the document end
            insertPos = tr.doc.content.size;

            // Check if there's already content at the end
            if (insertPos > 0) {
              const $endPos = tr.doc.resolve(insertPos);
              if ($endPos.nodeBefore && $endPos.nodeBefore.type.name === 'paragraph') {
                shouldInsertParagraph = false; // There's already a paragraph
              }
            }
          }

          if (shouldInsertParagraph) {
            const emptyParagraph = tr.doc.type.schema.nodes.paragraph.create();
            tr.insert(insertPos, emptyParagraph);
          }

          if (dispatch) {
            tr.setMeta('documentSection', { action: 'create' });
            dispatch(tr);

            // Set selection after the DOM has updated
            setTimeout(() => {
              try {
                const currentState = editor.state;
                const docSize = currentState.doc.content.size;

                // Calculate target position more safely
                let targetPos = from + node.nodeSize;

                // If we inserted a paragraph, position inside it
                if (shouldInsertParagraph) {
                  targetPos += 1; // +1 to get inside the paragraph
                }

                // Ensure we don't go beyond document bounds
                targetPos = Math.min(targetPos, docSize);

                // Ensure we have a valid position (at least 1 if document has content)
                if (targetPos < docSize && targetPos > 0) {
                  const newSelection = Selection.near(currentState.doc.resolve(targetPos));
                  const newTr = currentState.tr.setSelection(newSelection);
                  editor.view.dispatch(newTr);
                }
              } catch (e) {
                console.warn('Could not set delayed selection:', e);
              }
            }, 0);
          }

          return true;
        },

      /**
       * Remove section wrapper at cursor, preserving its content
       * @category Command
       * @example
       * editor.commands.removeSectionAtSelection()
       * @note Content stays in document, only section wrapper is removed
       */
      removeSectionAtSelection:
        () =>
        ({ tr, dispatch }) => {
          const sdtNode = findParentNode((node) => node.type.name === 'documentSection')(tr.selection);
          if (!sdtNode) return false;

          const { node, pos } = sdtNode;

          // Calculate positions before making changes
          const nodeStart = pos;
          const nodeEnd = nodeStart + node.nodeSize;

          // Extract the content we want to preserve
          const contentToPreserve = node.content;

          // Delete the entire structured content block
          tr.delete(nodeStart, nodeEnd);

          // Insert the preserved content at the same position
          if (contentToPreserve.size > 0) {
            tr.insert(nodeStart, contentToPreserve);
          }

          // Set selection to a safe position after the operation
          const newPos = Math.min(nodeStart, tr.doc.content.size);
          tr.setSelection(Selection.near(tr.doc.resolve(newPos)));

          if (dispatch) {
            tr.setMeta('documentSection', { action: 'delete' });
            dispatch(tr);
          }

          return true;
        },

      /**
       * Delete section and all its content
       * @category Command
       * @param {number} id - Section to delete
       * @example
       * editor.commands.removeSectionById(123)
       */
      removeSectionById:
        (id) =>
        ({ tr, dispatch }) => {
          const sections = SectionHelpers.getAllSections(this.editor);
          const sectionToRemove = sections.find(({ node }) => node.attrs.id === id);
          if (!sectionToRemove) return false;

          const { pos, node } = sectionToRemove;
          const nodeStart = pos;
          const nodeEnd = nodeStart + node.nodeSize;

          // Delete the entire structured content block
          tr.delete(nodeStart, nodeEnd);

          if (dispatch) {
            tr.setMeta('documentSection', { action: 'delete', id });
            dispatch(tr);
          }

          return true;
        },

      /**
       * Lock section against edits
       * @category Command
       * @param {number} id - Section to lock
       * @example
       * editor.commands.lockSectionById(123)
       */
      lockSectionById:
        (id) =>
        ({ tr, dispatch }) => {
          const sections = SectionHelpers.getAllSections(this.editor);
          const sectionToLock = sections.find(({ node }) => node.attrs.id === id);
          if (!sectionToLock) return false;

          tr.setNodeMarkup(sectionToLock.pos, null, { ...sectionToLock.node.attrs, isLocked: true });

          if (dispatch) {
            tr.setMeta('documentSection', { action: 'lock', id });
            dispatch(tr);
          }

          return true;
        },

      /**
       * Modify section attributes or content
       * @category Command
       * @param {SectionUpdate} options - Changes to apply
       * @example
       * editor.commands.updateSectionById({ id: 123, attrs: { isLocked: false } })
       * editor.commands.updateSectionById({ id: 123, html: '<p>New content</p>' })
       * editor.commands.updateSectionById({
       *   id: 123,
       *   html: '<p>Updated</p>',
       *   attrs: { title: 'New Title' }
       * })
       */
      updateSectionById:
        ({ id, html, json, attrs }) =>
        ({ tr, dispatch, editor }) => {
          const sections = SectionHelpers.getAllSections(editor || this.editor);
          const sectionToUpdate = sections.find(({ node }) => node.attrs.id === id);
          if (!sectionToUpdate) return false;

          const { pos, node } = sectionToUpdate;
          let newContent = null;

          // If HTML is provided, parse it and convert to ProseMirror nodes
          if (html) {
            const htmlDoc = htmlHandler(html, editor || this.editor);
            const doc = PMDOMParser.fromSchema((editor || this.editor).schema).parse(htmlDoc);
            newContent = doc.content;
          }

          // JSON takes priority over HTML
          if (json) {
            newContent = (editor || this.editor).schema.nodeFromJSON(json);
          }

          // If no new content, keep the old content
          if (!newContent) {
            newContent = node.content;
          }

          const updatedNode = node.type.create({ ...node.attrs, ...attrs }, newContent, node.marks);

          tr.replaceWith(pos, pos + node.nodeSize, updatedNode);

          if (dispatch) {
            tr.setMeta('documentSection', { action: 'update', id, attrs });
            dispatch(tr);
          }

          return true;
        },
    };
  },

  addHelpers() {
    return {
      ...SectionHelpers,
    };
  },
});
