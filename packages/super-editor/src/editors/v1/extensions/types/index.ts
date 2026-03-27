/**
 * Types-only entrypoint that imports all command and attribute augmentations.
 * This file ensures all module augmentations are loaded when the package types are used.
 *
 * @module ExtensionTypes
 */

// Command augmentations (existing)
import './formatting-commands.js';
import './specialized-commands.js';
import './history-link-table-commands.js';

// Command augmentations (new)
import './paragraph-commands.js';
import './block-node-commands.js';
import './image-commands.js';
import './comment-commands.js';
import './track-changes-commands.js';
import './miscellaneous-commands.js';

// Attribute augmentations
import './node-attributes.js';
import './mark-attributes.js';

// Re-export common types for convenience
export type {
  EditorCommands,
  CommandProps,
  Command,
  ChainedCommand,
  ChainableCommandObject,
} from '../../core/types/ChainedCommands.js';

export type { NodeAttributesMap, NodeName, NodeAttrs, TypedNode } from '../../core/types/NodeAttributesMap.js';

export type { MarkAttributesMap, MarkName, MarkAttrs } from '../../core/types/MarkAttributesMap.js';
