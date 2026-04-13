import type { Transaction, EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Editor } from '../Editor.js';

// Command interfaces — imported directly for reliable cross-package typing.
// Module augmentation doesn't survive the npm package boundary, so we
// compose EditorCommands as an explicit intersection of all command interfaces.
import type { CoreCommandSignatures } from '../commands/core-command-map.js';
import type { CommentCommands } from '../../extensions/types/comment-commands.js';
import type { FormattingCommandAugmentations } from '../../extensions/types/formatting-commands.js';
import type { HistoryLinkTableCommandAugmentations } from '../../extensions/types/history-link-table-commands.js';
import type { SpecializedCommandAugmentations } from '../../extensions/types/specialized-commands.js';
import type { ParagraphCommands } from '../../extensions/types/paragraph-commands.js';
import type { BlockNodeCommands } from '../../extensions/types/block-node-commands.js';
import type { ImageCommands } from '../../extensions/types/image-commands.js';
import type { MiscellaneousCommands } from '../../extensions/types/miscellaneous-commands.js';
import type { TrackChangesCommands } from '../../extensions/types/track-changes-commands.js';

/**
 * Map of built-in command names to their parameter signatures.
 * Populated via core-command-map.d.ts module augmentation.
 */
export interface CoreCommandMap {}

/**
 * Map of extension command names to their parameter signatures.
 * Kept for backward compat with any external module augmentations.
 */
export interface ExtensionCommandMap {}

type AnyCommand = (...args: unknown[]) => unknown;
type RegisteredCommands = CoreCommandMap & ExtensionCommandMap;
type KnownCommandKey = keyof RegisteredCommands;

type UntypedCommandFallback<_K extends PropertyKey> =
  /** @deprecated Add command to ExtensionCommandMap to type this command */ (...args: unknown[]) => boolean;

type ExtractCommand<K extends PropertyKey> = K extends KnownCommandKey
  ? RegisteredCommands[K]
  : UntypedCommandFallback<K>;
type NormalizeCommand<F> = F extends (...args: infer A) => (props: CommandProps) => infer R ? (...args: A) => R : F;
type CommandForKey<K extends PropertyKey> = NormalizeCommand<ExtractCommand<K>>;
type CommandArgs<K extends PropertyKey> = Parameters<CommandForKey<K>>;
type CommandResult<K extends PropertyKey> = ReturnType<CommandForKey<K>>;

type KnownCommandRecord = {
  [K in keyof RegisteredCommands]: CommandForKey<K>;
};

/**
 * Union of all command interfaces via explicit imports.
 * Module augmentation doesn't survive the npm boundary, so this is the
 * single source of truth for the built-in command surface. Used by
 * EditorCommands, ChainableCommandObject, and CanObject.
 */
type AllCommandSignatures = CoreCommandSignatures &
  CommentCommands &
  FormattingCommandAugmentations &
  HistoryLinkTableCommandAugmentations &
  SpecializedCommandAugmentations &
  ParagraphCommands &
  BlockNodeCommands &
  ImageCommands &
  MiscellaneousCommands &
  TrackChangesCommands;

/**
 * Transforms a command interface so every method returns ChainableCommandObject
 * instead of boolean, preserving parameter types.
 */
type Chainified<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => unknown ? (...args: A) => ChainableCommandObject : T[K];
};

/**
 * Commands from module augmentation, transformed for chaining.
 * Empty for npm consumers (augmentation doesn't survive the boundary),
 * but consumers who augment ExtensionCommandMap get their custom commands
 * on chain() for free.
 */
type AugmentedChainedCommands = Chainified<KnownCommandRecord>;

/** Same but with original return types for can(). */
type AugmentedCanCommands = KnownCommandRecord;

/**
 * A chainable version of an editor command keyed by command name.
 */
export type ChainedCommand<K extends string = string> = (...args: CommandArgs<K>) => ChainableCommandObject;

/**
 * Chainable command object returned by `createChain`.
 * Only `run()` returns boolean — all other methods return ChainableCommandObject.
 *
 * Includes AugmentedChainedCommands so consumers who extend ExtensionCommandMap
 * via module augmentation get their custom commands on chain() automatically.
 */
export type ChainableCommandObject = {
  run: () => boolean;
} & Chainified<AllCommandSignatures> &
  AugmentedChainedCommands;

/**
 * A command that can be checked for availability.
 */
export type CanCommand<K extends string = string> = (...args: CommandArgs<K>) => CommandResult<K>;

/**
 * Map of commands that can be checked.
 */
export type CanCommands = Record<string, CanCommand>;

/**
 * Object returned by `createCan`: typed boolean commands + a `chain()` helper.
 *
 * Includes AugmentedCanCommands so consumers who extend ExtensionCommandMap
 * via module augmentation get their custom commands on can() automatically.
 */
export type CanObject = AllCommandSignatures &
  AugmentedCanCommands & {
    chain: () => ChainableCommandObject;
  };

/**
 * Core editor commands available on all instances.
 */
export type CoreCommands = Pick<KnownCommandRecord, keyof CoreCommandMap>;

/**
 * Commands added by extensions - populated via module augmentation.
 */
export type ExtensionCommands = Pick<KnownCommandRecord, keyof ExtensionCommandMap>;

/**
 * All available editor commands.
 *
 * Composed from AllCommandSignatures (explicit imports) for reliable
 * cross-package typing, plus CoreCommands/ExtensionCommands (module
 * augmentation) and a Record fallback for dynamic/plugin commands.
 */
export type EditorCommands = CoreCommands & ExtensionCommands & AllCommandSignatures & Record<string, AnyCommand>;

/**
 * Command props made available to every command handler.
 */
export interface CommandProps {
  /** The editor instance */
  editor: Editor;

  /** The ProseMirror transaction */
  tr: Transaction;

  /** The current editor state */
  state: EditorState;

  /** The active editor view */
  view: EditorView;

  /** Optional dispatcher */
  dispatch?: (tr: Transaction) => void;

  /** Helper to build command chains */
  chain: () => ChainableCommandObject;

  /** Helper to check command availability */
  can: () => CanObject;

  /** Lazy command map bound to current props */
  commands: EditorCommands;
}

/**
 * A command handler invoked by the command service.
 */
export type Command = (props: CommandProps) => boolean;

/**
 * Command service options
 */
export interface CommandServiceOptions {
  /** The editor instance */
  editor: Editor;
}
