/**
 * Command type augmentations for block node operations.
 *
 * @module BlockNodeCommands
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';

export interface BlockNodeCommands {
  /**
   * Replace a block node by its sdBlockId with new content
   * @param id - The sdBlockId of the node to replace
   * @param contentNode - The replacement ProseMirror node
   */
  replaceBlockNodeById: (id: string, contentNode: ProseMirrorNode) => boolean;

  /**
   * Delete a block node by its sdBlockId
   * @param id - The sdBlockId of the node to delete
   */
  deleteBlockNodeById: (id: string) => boolean;

  /**
   * Update attributes of a block node by its sdBlockId
   * @param id - The sdBlockId of the node to update
   * @param attrs - Attributes to merge with existing ones
   */
  updateBlockNodeAttributes: (id: string, attrs?: Record<string, unknown>) => boolean;
}

declare module '../../core/types/ChainedCommands.js' {
  interface ExtensionCommandMap extends BlockNodeCommands {}
}
