export * from './Node.js';
export * from './Mark.js';
export * from './Schema.js';
export * from './Attribute.js';
export * from './CommandService.js';
export * from './Extension.js';
export * from './PositionTracker.js';
export * from './super-converter/SuperConverter.js';

export * as coreExtensions from './extensions/index.js';
export * as helpers from './helpers/index.js';
export * as utilities from './utilities/index.js';

// This needs to be last otherwise it causes circular dependencies
export * from './Editor.js';

export { default as DocxZipper } from './DocxZipper.js';

// Export types
export type * from './types/EditorTypes.js';
export type * from './types/EditorEvents.js';
export type * from './EventEmitter.js';

// Export ChainedCommands types explicitly to avoid duplicate with JSDoc typedefs
export type {
  ChainedCommand,
  ChainableCommandObject,
  CanCommand,
  CanCommands,
  CanObject,
  CoreCommands,
  ExtensionCommands,
  EditorCommands,
  CommandProps,
  Command,
  CommandServiceOptions,
} from './types/ChainedCommands.js';
