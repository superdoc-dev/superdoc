import type { Transaction, EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Editor } from '../Editor.js';

/**
 * Map of built-in command names to their parameter signatures.
 * Extensions can augment this interface to add more precise types.
 * Currently empty because built-in focus/blur are exposed directly on Editor,
 * not via `editor.commands`. Populate here when core commands are added.
 */
export interface CoreCommandMap {}

/**
 * Map of extension command names to their parameter signatures.
 * Each extension should augment this interface when adding typed commands.
 */
/**
 * Map of extension command names to their parameter signatures.
 * Extensions should augment this interface via module augmentation, e.g.:
 *
 * ```ts
 * declare module '@core/types/ChainedCommands.js' {
 *   interface ExtensionCommandMap {
 *     setFontSize: (fontSize: string | number) => boolean;
 *   }
 * }
 * ```
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
 * A chainable version of an editor command keyed by command name.
 */
export type ChainedCommand<K extends string = string> = (...args: CommandArgs<K>) => ChainableCommandObject;

type KnownChainedCommands = {
  [K in keyof RegisteredCommands]: (...args: CommandArgs<K>) => ChainableCommandObject;
};

/**
 * Chainable command object returned by `createChain`.
 * Has dynamic keys (one per command) and a `run()` method.
 */
export type ChainableCommandObject = {
  run: () => boolean;
} & KnownChainedCommands &
  Record<string, (...args: unknown[]) => ChainableCommandObject>;

/**
 * A command that can be checked for availability.
 */
export type CanCommand<K extends string = string> = (...args: CommandArgs<K>) => CommandResult<K>;

type KnownCanCommands = {
  [K in keyof RegisteredCommands]: (...args: CommandArgs<K>) => CommandResult<K>;
};

/**
 * Map of commands that can be checked.
 */
export type CanCommands = Record<string, CanCommand>;

/**
 * Object returned by `createCan`: dynamic boolean commands + a `chain()` helper.
 */
export type CanObject = KnownCanCommands &
  Record<string, CanCommand> & {
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
 * All available editor commands
 */
export type EditorCommands = CoreCommands & ExtensionCommands & Record<string, AnyCommand>;

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
