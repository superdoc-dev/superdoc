import type { Schema } from 'prosemirror-model';

/**
 * Extracts the names of all atomic or leaf node types from a ProseMirror schema.
 *
 * Atomic nodes (like images, hard breaks, etc.) and leaf nodes are indivisible elements
 * that cannot contain other content. This function identifies them by checking the
 * isAtom and isLeaf properties on each node type in the schema.
 *
 * @param schema - The ProseMirror schema to extract node types from
 * @returns Array of node type names that are atomic or leaf nodes (excludes 'text')
 *
 * @remarks
 * - Returns empty array if schema is null or undefined
 * - Explicitly excludes 'text' node type even though it might be considered atomic
 * - Returns empty array if schema traversal throws an error
 * - Used for special handling in selection and layout logic
 */
export function getAtomNodeTypes(schema: Schema | null | undefined): string[] {
  if (!schema) return [];

  const types: string[] = [];
  try {
    // schema.nodes is a record/object mapping node names to NodeType instances
    for (const name in schema.nodes) {
      if (name === 'text') {
        continue;
      }
      const nodeType = schema.nodes[name];
      if (nodeType && (nodeType.isAtom || nodeType.isLeaf)) {
        types.push(name);
      }
    }
  } catch {
    return [];
  }

  return types;
}
