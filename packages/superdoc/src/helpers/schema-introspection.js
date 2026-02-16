import { Editor, getRichTextExtensions, getStarterExtensions } from '@superdoc/super-editor';

/**
 * @typedef {Object} SchemaIntrospectionOptions
 * @property {import('@superdoc/super-editor').Editor} [editor] - Existing Editor instance to introspect.
 * @property {Array} [extensions] - Extension list to build a schema from.
 * @property {'docx' | 'text' | 'html'} [mode] - Editor mode when building a schema. Defaults to 'docx'.
 */

/**
 * Build a schema summary with nodes, marks, and their attribute definitions.
 *
 * Returns a JSON object describing all nodes and marks in the schema, including
 * attribute names, default values, and whether each attribute is required.
 * Useful for AI agents, documentation generation, or schema validation.
 *
 * @param {SchemaIntrospectionOptions} [options] - Configuration options.
 * @returns {Promise<import('@core/types/EditorSchema').SchemaSummaryJSON>} Schema summary with nodes and marks.
 * @throws {Error} If the editor schema is not initialized.
 *
 * @example
 * // Get schema for DOCX mode (default)
 * const schema = await getSchemaIntrospection();
 * console.log(schema.nodes); // Array of node definitions
 *
 * @example
 * // Get schema for HTML mode
 * const schema = await getSchemaIntrospection({ mode: 'html' });
 *
 * @example
 * // Use existing editor instance
 * const schema = await getSchemaIntrospection({ editor: myEditor });
 */
export const getSchemaIntrospection = async (options = {}) => {
  const { editor, extensions, mode = 'docx' } = options;

  if (editor) {
    return editor.getSchemaSummaryJSON();
  }

  const resolvedExtensions =
    Array.isArray(extensions) && extensions.length
      ? extensions
      : mode === 'docx'
        ? getStarterExtensions()
        : getRichTextExtensions();

  const tempEditor = new Editor({
    extensions: resolvedExtensions,
    mode,
    isHeadless: true,
    deferDocumentLoad: true,
    telemetry: { enabled: false },
  });

  try {
    return await tempEditor.getSchemaSummaryJSON();
  } finally {
    if (typeof tempEditor.destroy === 'function') {
      tempEditor.destroy();
    }
  }
};
