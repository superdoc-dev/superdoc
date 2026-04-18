//@ts-check
import { chainableEditorState } from './helpers/chainableEditorState.js';

/**
 * @typedef {import('prosemirror-state').Transaction} Transaction
 * @typedef {import('./commands/types/index.js').ChainableCommandObject} ChainableCommandObject
 */

/**
 * CommandService is the main class to work with commands.
 */
export class CommandService {
  editor;

  rawCommands;

  /**
   * @param {import('./commands/types/index.js').CommandServiceOptions} props
   */
  constructor(props) {
    this.editor = props.editor;
    this.rawCommands = this.editor.extensionService.commands;
  }

  /**
   * Static method for creating a service.
   * @param {import('./commands/types/index.js').CommandServiceOptions} params for the constructor.
   * @returns {CommandService} New instance of CommandService
   */
  static create(params) {
    return new CommandService(params);
  }

  /**
   * Get editor state.
   * @returns {import("prosemirror-state").EditorState} Editor state
   */
  get state() {
    return this.editor.state;
  }

  /**
   * Get all editor commands. Commands are executable methods that modify the editor state
   * via transactions. In headless mode (when view is unavailable), commands automatically
   * fall back to using editor.dispatch instead of view.dispatch.
   *
   * @returns {import('./commands/types/index.js').EditorCommands} Commands object containing all registered commands
   *
   * @example
   * // In mounted mode (with view)
   * editor.commands.insertText('hello'); // uses view.dispatch
   *
   * @example
   * // In headless mode (no view)
   * editor.commands.insertText('hello'); // falls back to editor.dispatch
   */
  get commands() {
    const { editor, state } = this;
    const { view } = editor;
    const { tr } = state;
    const props = this.createProps(tr);

    const entries = Object.entries(this.rawCommands).map(([name, command]) => {
      /** @type {(...args: any[]) => boolean} */
      const method = (...args) => {
        const fn = command(...args)(props);

        if (!tr.getMeta('preventDispatch')) {
          if (!this.#dispatchWithFallback(tr, { editor, view })) {
            return false;
          }
        }

        return fn;
      };

      return [name, method];
    });

    return /** @type {import('./commands/types/index.js').EditorCommands} */ Object.fromEntries(entries);
  }

  /**
   * Create a chain of commands to call multiple commands at once.
   * @returns {(startTr?: Transaction, shouldDispatch?: boolean) => ChainableCommandObject} Function that creates a command chain
   */
  get chain() {
    return () => this.createChain();
  }

  /**
   * Check if a command or a chain of commands can be executed. Without executing it.
   * @returns {() => import('./commands/types/index.js').CanObject} Function that creates a can object
   */
  get can() {
    return () => this.createCan();
  }

  /**
   * Creates a chain of commands. Allows multiple commands to be executed in sequence
   * on the same transaction, with a single dispatch at the end. In headless mode,
   * the chain automatically falls back to using editor.dispatch instead of view.dispatch.
   *
   * @param {import("prosemirror-state").Transaction} [startTr] - Optional transaction to use as the starting point. If not provided, uses state.tr.
   * @param {boolean} [shouldDispatch=true] - Whether to dispatch the transaction when run() is called.
   * @returns {import('./commands/types/index.js').ChainableCommandObject} The command chain object with all commands and a run() method.
   *
   * @example
   * // Chain multiple commands in mounted mode
   * editor.chain()
   *   .insertText('hello')
   *   .selectAll()
   *   .run(); // dispatches once via view.dispatch
   *
   * @example
   * // Chain in headless mode
   * headlessEditor.chain()
   *   .insertText('hello')
   *   .run(); // falls back to editor.dispatch
   *
   * @example
   * // Chain without dispatching (for testing/validation)
   * const canExecute = editor.chain()
   *   .insertText('test')
   *   .run(); // returns boolean but doesn't dispatch
   */
  createChain(startTr, shouldDispatch = true) {
    const { editor, state, rawCommands } = this;
    const { view } = editor;
    const callbacks = [];
    const hasStartTr = !!startTr;
    const tr = startTr || state.tr;

    const run = () => {
      if (!hasStartTr && shouldDispatch && !tr.getMeta('preventDispatch')) {
        if (!this.#dispatchWithFallback(tr, { editor, view })) {
          return false;
        }
      }

      return callbacks.every((cb) => cb === true);
    };

    const entries = Object.entries(rawCommands).map(([name, command]) => {
      const chainedCommand = (...args) => {
        const props = this.createProps(tr, shouldDispatch);
        const callback = command(...args)(props);
        callbacks.push(callback);
        return chain;
      };

      return [name, chainedCommand];
    });

    const chain = {
      ...Object.fromEntries(entries),
      run,
    };

    return chain;
  }

  /**
   * Creates a can check for commands.
   * @param {import("prosemirror-state").Transaction} [startTr] - Start transaction.
   * @returns {import('./commands/types/index.js').CanObject} The can object.
   */
  createCan(startTr) {
    const { rawCommands, state } = this;
    const dispatch = false;
    const tr = startTr || state.tr;
    const props = this.createProps(tr, dispatch);

    /** @type {Record<string, import('./commands/types/index.js').CanCommand>} */
    const commands = Object.fromEntries(
      Object.entries(rawCommands).map(([name, command]) => {
        return [name, (...args) => command(...args)({ ...props, dispatch: undefined })];
      }),
    );

    const result = {
      ...commands,
      chain: () => this.createChain(tr, dispatch),
    };

    return /** @type {import('./commands/types/index.js').CanObject} */ (result);
  }

  /**
   * Creates default props for the command method.
   * @param {import("prosemirror-state").Transaction} tr Transaction.
   * @param {boolean} shouldDispatch Check if should dispatch.
   * @returns {Object} Props object.
   */
  createProps(tr, shouldDispatch = true) {
    const { editor, state, rawCommands } = this;
    const { view } = editor;

    const props = {
      tr,
      editor,
      view,
      state: chainableEditorState(tr, state),
      // Commands check truthiness of `dispatch` to know if side effects are allowed.
      // Actual dispatching is handled by CommandService after command returns.
      dispatch: shouldDispatch ? () => undefined : undefined,
      chain: () => this.createChain(tr, shouldDispatch),
      can: () => this.createCan(tr),
      get commands() {
        return Object.fromEntries(
          Object.entries(rawCommands).map(([name, command]) => {
            return [name, (...args) => command(...args)(props)];
          }),
        );
      },
    };

    return props;
  }

  /**
   * Private helper method to dispatch transactions with automatic fallback for headless mode.
   * Prefers view.dispatch when available (mounted editor), falls back to editor.dispatch
   * for headless mode. Includes validation checks and wraps errors with context.
   *
   * @param {import("prosemirror-state").Transaction} tr - The transaction to dispatch.
   * @param {Object} options - Dispatch options.
   * @param {Object} options.editor - The editor instance.
   * @param {Object} [options.view] - The editor view (may be null/undefined in headless mode).
   * @returns {boolean} True if dispatch succeeded, false if editor was destroyed or unavailable.
   *
   * @throws {Error} Throws wrapped error with context: `[CommandService] Dispatch failed: <original error message>`
   */
  #dispatchWithFallback(tr, { editor, view }) {
    if (editor?.isDestroyed) {
      console.warn('[CommandService] Cannot dispatch: editor is destroyed');
      return false;
    }

    try {
      if (view && typeof view.dispatch === 'function') {
        view.dispatch(tr);
      } else if (typeof editor?.dispatch === 'function') {
        editor.dispatch(tr);
      } else {
        console.warn('[CommandService] No dispatch method available (editor may not be initialized)');
        return false;
      }
      return true;
    } catch (error) {
      const err = new Error(`[CommandService] Dispatch failed: ${error.message}`);
      // @ts-expect-error - cause is supported in modern environments
      err.cause = error;
      throw err;
    }
  }
}
