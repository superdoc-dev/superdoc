import type { Node as PMNode } from 'prosemirror-model';

/**
 * Represents a ProseMirror position range with inclusive start and exclusive end.
 */
type Position = { start: number; end: number };

/**
 * Maps JSON document nodes to their corresponding ProseMirror position ranges.
 *
 * @remarks
 * Uses a WeakMap to avoid memory leaks when JSON nodes are garbage collected.
 */
type PositionMap = WeakMap<object, Position>;

/**
 * Type guard that checks if a value is a plain object.
 *
 * @param value - The value to check
 * @returns True if the value is a non-null object, false otherwise
 */
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * Builds a position map by traversing a ProseMirror document and its corresponding JSON representation.
 *
 * @param pmDoc - The ProseMirror document node
 * @param jsonDoc - The JSON representation of the document (typically from doc.toJSON())
 * @returns A WeakMap mapping JSON nodes to their PM position ranges, or null if the structures don't match
 *
 * @remarks
 * This function performs a parallel walk of both the ProseMirror document tree and its JSON
 * representation, verifying that they have matching structure and recording the position range
 * for each JSON node.
 *
 * The position mapping follows ProseMirror's position semantics:
 * - For the root document node, positions span the entire content (0 to doc.content.size)
 * - For non-root nodes, positions include the opening and closing tokens (nodeSize)
 * - Text nodes are treated as leaf nodes with their character positions
 *
 * Validation performed:
 * - Node types must match between PM and JSON (pmNode.type.name === jsonNode.type)
 * - Child counts must match for non-leaf nodes
 * - All child nodes must be valid objects in the JSON
 *
 * Returns null if any structural mismatch is detected, indicating that the JSON does not
 * accurately represent the ProseMirror document. This can happen if:
 * - The JSON was generated from a different document
 * - The JSON was modified after generation
 * - The document uses custom node types with special serialization
 */
export function buildPositionMapFromPmDoc(pmDoc: PMNode, jsonDoc: unknown): PositionMap | null {
  if (!pmDoc || !isObject(jsonDoc)) return null;

  const map: PositionMap = new WeakMap();

  const walk = (pmNode: PMNode, jsonNode: Record<string, unknown>, pos: number, isDoc: boolean): boolean => {
    const jsonType = jsonNode.type;
    const expectedType = pmNode.isText ? 'text' : pmNode.type?.name;
    if (!expectedType || jsonType !== expectedType) {
      return false;
    }

    const end = pos + (isDoc ? pmNode.content.size : pmNode.nodeSize);
    map.set(jsonNode, { start: pos, end });

    if (pmNode.isLeaf) {
      return true;
    }

    const jsonContent = Array.isArray(jsonNode.content) ? jsonNode.content : [];
    if (pmNode.childCount !== jsonContent.length) {
      return false;
    }

    const base = pos + (isDoc ? 0 : 1);
    let ok = true;
    pmNode.forEach((child, offset, index) => {
      const jsonChild = jsonContent[index];
      if (!isObject(jsonChild)) {
        ok = false;
        return;
      }
      if (!walk(child, jsonChild, base + offset, false)) {
        ok = false;
      }
    });

    return ok;
  };

  const ok = walk(pmDoc, jsonDoc, 0, true);
  if (!ok) return null;
  return map;
}
