import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./helpers/chainableEditorState.js', () => ({
  chainableEditorState: vi.fn(() => 'mocked-chain-state'),
}));

import { chainableEditorState } from './helpers/chainableEditorState.js';
import { CommandService } from './CommandService.js';

describe('CommandService', () => {
  let editor;
  let view;
  let tr;

  beforeEach(() => {
    tr = {
      getMeta: vi.fn(() => false),
      setMeta: vi.fn(),
    };

    view = {
      dispatch: vi.fn(),
    };

    editor = {
      state: { tr },
      view,
      extensionService: { commands: {} },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('executes a command and dispatches when dispatch is allowed', () => {
    const commandResult = 'expected-result';
    const rawCommand = vi.fn((arg) => {
      expect(arg).toBe('payload');
      return (props) => {
        expect(props.editor).toBe(editor);
        expect(props.view).toBe(view);
        expect(props.tr).toBe(tr);
        expect(chainableEditorState).toHaveBeenCalledWith(tr, editor.state);
        expect(props.state).toBe('mocked-chain-state');
        expect(typeof props.dispatch).toBe('function');
        return commandResult;
      };
    });

    editor.extensionService.commands = { runSomething: rawCommand };

    const service = new CommandService({ editor });

    const result = service.commands.runSomething('payload');

    expect(result).toBe(commandResult);
    expect(view.dispatch).toHaveBeenCalledWith(tr);
    expect(rawCommand).toHaveBeenCalledTimes(1);
  });

  it('skips dispatch when preventDispatch meta is set', () => {
    tr.getMeta = vi.fn((key) => (key === 'preventDispatch' ? true : undefined));

    const rawCommand = vi.fn(() => {
      return () => true;
    });

    editor.extensionService.commands = { guarded: rawCommand };

    const service = new CommandService({ editor });

    const result = service.commands.guarded();

    expect(result).toBe(true);
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it('creates chainable commands that dispatch once and return aggregated result', () => {
    const rawCommand = vi.fn(() => {
      return () => true;
    });

    editor.extensionService.commands = { first: rawCommand };

    const service = new CommandService({ editor });

    const chain = service.chain();

    expect(chain.first('arg')).toBe(chain);

    const runResult = chain.run();

    expect(runResult).toBe(true);
    expect(rawCommand).toHaveBeenCalledTimes(1);
    expect(view.dispatch).toHaveBeenCalledWith(tr);
  });

  it('chain created within can() does not dispatch', () => {
    const rawCommand = vi.fn(() => {
      return (props) => {
        expect(props.dispatch).toBeUndefined();
        return true;
      };
    });

    editor.extensionService.commands = { nullable: rawCommand };

    const service = new CommandService({ editor });

    const can = service.can();

    expect(can.nullable()).toBe(true);

    const chain = can.chain();
    chain.nullable();
    const runResult = chain.run();

    expect(runResult).toBe(true);
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  /**
   * Headless mode dispatch behavior tests
   *
   * These tests verify that CommandService properly handles headless mode execution
   * where no DOM view is available. The key behavior being tested:
   *
   * 1. Automatic fallback: When view.dispatch is unavailable (null, undefined, or not a function),
   *    the service should automatically fall back to editor.dispatch
   * 2. Consistent behavior: Both regular commands and chain commands should support headless mode
   * 3. Concurrent safety: Multiple commands can execute in headless mode without conflicts
   * 4. Error handling: Errors in headless mode are wrapped with proper context
   *
   * This enables SuperDoc to run in server-side or testing environments without a browser DOM.
   */
  describe('Headless mode dispatch behavior', () => {
    it('falls back to editor.dispatch when view is null (headless mode)', () => {
      const editorDispatch = vi.fn();
      editor.view = null;
      editor.dispatch = editorDispatch;

      const rawCommand = vi.fn(() => {
        return () => true;
      });

      editor.extensionService.commands = { headlessCommand: rawCommand };

      const service = new CommandService({ editor });

      const result = service.commands.headlessCommand();

      expect(result).toBe(true);
      expect(editorDispatch).toHaveBeenCalledWith(tr);
    });

    it('falls back to editor.dispatch when view is undefined (headless mode)', () => {
      const editorDispatch = vi.fn();
      editor.view = undefined;
      editor.dispatch = editorDispatch;

      const rawCommand = vi.fn(() => {
        return () => true;
      });

      editor.extensionService.commands = { headlessCommand: rawCommand };

      const service = new CommandService({ editor });

      const result = service.commands.headlessCommand();

      expect(result).toBe(true);
      expect(editorDispatch).toHaveBeenCalledWith(tr);
    });

    it('falls back to editor.dispatch when view.dispatch is not a function', () => {
      const editorDispatch = vi.fn();
      editor.view = {}; // view exists but has no dispatch method
      editor.dispatch = editorDispatch;

      const rawCommand = vi.fn(() => {
        return () => true;
      });

      editor.extensionService.commands = { headlessCommand: rawCommand };

      const service = new CommandService({ editor });

      const result = service.commands.headlessCommand();

      expect(result).toBe(true);
      expect(editorDispatch).toHaveBeenCalledWith(tr);
    });
  });

  describe('Destroyed editor behavior', () => {
    let consoleWarnSpy;

    beforeEach(() => {
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    it('skips dispatch when editor.isDestroyed is true', () => {
      editor.isDestroyed = true;

      const rawCommand = vi.fn(() => {
        return () => true;
      });

      editor.extensionService.commands = { destroyedCommand: rawCommand };

      const service = new CommandService({ editor });

      const result = service.commands.destroyedCommand();

      expect(result).toBe(false);
      expect(view.dispatch).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith('[CommandService] Cannot dispatch: editor is destroyed');
    });

    it('skips chain dispatch when editor.isDestroyed is true', () => {
      editor.isDestroyed = true;

      const rawCommand = vi.fn(() => {
        return () => true;
      });

      editor.extensionService.commands = { chainCommand: rawCommand };

      const service = new CommandService({ editor });

      const chain = service.chain();
      chain.chainCommand();
      const result = chain.run();

      expect(result).toBe(false);
      expect(view.dispatch).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith('[CommandService] Cannot dispatch: editor is destroyed');
    });

    it('returns false when editor is destroyed with preventDispatch', () => {
      editor.isDestroyed = true;
      tr.getMeta = vi.fn((key) => (key === 'preventDispatch' ? true : undefined));

      const rawCommand = vi.fn(() => {
        return () => true;
      });

      editor.extensionService.commands = { destroyedCommand: rawCommand };

      const service = new CommandService({ editor });

      const result = service.commands.destroyedCommand();

      expect(result).toBe(true);
      expect(view.dispatch).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('handles editor becoming destroyed during chain execution', () => {
      const rawCommand1 = vi.fn(() => {
        return () => {
          editor.isDestroyed = true;
          return true;
        };
      });

      const rawCommand2 = vi.fn(() => {
        return () => true;
      });

      editor.extensionService.commands = {
        firstCommand: rawCommand1,
        secondCommand: rawCommand2,
      };

      const service = new CommandService({ editor });

      const chain = service.chain();
      chain.firstCommand();
      chain.secondCommand();
      const result = chain.run();

      expect(result).toBe(false);
      expect(view.dispatch).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith('[CommandService] Cannot dispatch: editor is destroyed');
    });
  });

  describe('Warning when no dispatch method available', () => {
    let consoleWarnSpy;

    beforeEach(() => {
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    it('warns when neither view.dispatch nor editor.dispatch is available', () => {
      editor.view = null;
      editor.dispatch = undefined;

      const rawCommand = vi.fn(() => {
        return () => true;
      });

      editor.extensionService.commands = { noDispatchCommand: rawCommand };

      const service = new CommandService({ editor });

      const result = service.commands.noDispatchCommand();

      expect(result).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[CommandService] No dispatch method available (editor may not be initialized)',
      );
    });

    it('warns when neither dispatch method is available in chain', () => {
      editor.view = null;
      editor.dispatch = undefined;

      const rawCommand = vi.fn(() => {
        return () => true;
      });

      editor.extensionService.commands = { chainCommand: rawCommand };

      const service = new CommandService({ editor });

      const chain = service.chain();
      chain.chainCommand();
      const result = chain.run();

      expect(result).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[CommandService] No dispatch method available (editor may not be initialized)',
      );
    });
  });

  describe('Error handling during dispatch', () => {
    it('wraps errors that occur during view.dispatch with context', () => {
      const dispatchError = new Error('Dispatch failed');
      view.dispatch = vi.fn(() => {
        throw dispatchError;
      });

      const rawCommand = vi.fn(() => {
        return () => true;
      });

      editor.extensionService.commands = { errorCommand: rawCommand };

      const service = new CommandService({ editor });

      expect(() => {
        service.commands.errorCommand();
      }).toThrow('[CommandService] Dispatch failed: Dispatch failed');
    });

    it('wraps errors that occur during editor.dispatch in headless mode', () => {
      const dispatchError = new Error('Headless dispatch failed');
      editor.view = null;
      editor.dispatch = vi.fn(() => {
        throw dispatchError;
      });

      const rawCommand = vi.fn(() => {
        return () => true;
      });

      editor.extensionService.commands = { errorCommand: rawCommand };

      const service = new CommandService({ editor });

      expect(() => {
        service.commands.errorCommand();
      }).toThrow('[CommandService] Dispatch failed: Headless dispatch failed');
    });

    it('wraps errors that occur during chain dispatch', () => {
      const dispatchError = new Error('Chain dispatch failed');
      view.dispatch = vi.fn(() => {
        throw dispatchError;
      });

      const rawCommand = vi.fn(() => {
        return () => true;
      });

      editor.extensionService.commands = { chainCommand: rawCommand };

      const service = new CommandService({ editor });

      const chain = service.chain();
      chain.chainCommand();

      expect(() => {
        chain.run();
      }).toThrow('[CommandService] Dispatch failed: Chain dispatch failed');
    });

    it('wraps errors that occur during chain dispatch in headless mode', () => {
      const dispatchError = new Error('Headless chain dispatch failed');
      editor.view = null;
      editor.dispatch = vi.fn(() => {
        throw dispatchError;
      });

      const rawCommand = vi.fn(() => {
        return () => true;
      });

      editor.extensionService.commands = { chainCommand: rawCommand };

      const service = new CommandService({ editor });

      const chain = service.chain();
      chain.chainCommand();

      expect(() => {
        chain.run();
      }).toThrow('[CommandService] Dispatch failed: Headless chain dispatch failed');
    });
  });

  describe('Chain dispatch in headless mode', () => {
    it('successfully dispatches chain using editor.dispatch when view is null', () => {
      const editorDispatch = vi.fn();
      editor.view = null;
      editor.dispatch = editorDispatch;

      const rawCommand1 = vi.fn(() => {
        return () => true;
      });

      const rawCommand2 = vi.fn(() => {
        return () => true;
      });

      editor.extensionService.commands = {
        firstCommand: rawCommand1,
        secondCommand: rawCommand2,
      };

      const service = new CommandService({ editor });

      const chain = service.chain();
      chain.firstCommand();
      chain.secondCommand();
      const result = chain.run();

      expect(result).toBe(true);
      expect(editorDispatch).toHaveBeenCalledWith(tr);
      expect(rawCommand1).toHaveBeenCalledTimes(1);
      expect(rawCommand2).toHaveBeenCalledTimes(1);
    });

    it('successfully dispatches chain using editor.dispatch when view.dispatch is not a function', () => {
      const editorDispatch = vi.fn();
      editor.view = { someOtherProperty: 'value' };
      editor.dispatch = editorDispatch;

      const rawCommand = vi.fn(() => {
        return () => true;
      });

      editor.extensionService.commands = { chainCommand: rawCommand };

      const service = new CommandService({ editor });

      const chain = service.chain();
      chain.chainCommand();
      const result = chain.run();

      expect(result).toBe(true);
      expect(editorDispatch).toHaveBeenCalledWith(tr);
    });

    it('respects shouldDispatch=false in chain even in headless mode', () => {
      const editorDispatch = vi.fn();
      editor.view = null;
      editor.dispatch = editorDispatch;

      const rawCommand = vi.fn(() => {
        return () => true;
      });

      editor.extensionService.commands = { chainCommand: rawCommand };

      const service = new CommandService({ editor });

      const chain = service.createChain(undefined, false);
      chain.chainCommand();
      const result = chain.run();

      expect(result).toBe(true);
      expect(editorDispatch).not.toHaveBeenCalled();
    });

    it('handles concurrent command execution in headless mode', () => {
      const editorDispatch = vi.fn();
      editor.view = null;
      editor.dispatch = editorDispatch;

      const tr1 = {
        getMeta: vi.fn(() => false),
        setMeta: vi.fn(),
      };

      const tr2 = {
        getMeta: vi.fn(() => false),
        setMeta: vi.fn(),
      };

      editor.state = { tr: tr1 };

      const rawCommand1 = vi.fn(() => {
        return () => true;
      });

      const rawCommand2 = vi.fn(() => {
        return () => true;
      });

      editor.extensionService.commands = {
        command1: rawCommand1,
        command2: rawCommand2,
      };

      const service = new CommandService({ editor });

      const result1 = service.commands.command1();
      editor.state = { tr: tr2 };
      const result2 = service.commands.command2();

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(editorDispatch).toHaveBeenCalledTimes(2);
      expect(editorDispatch).toHaveBeenNthCalledWith(1, tr1);
      expect(editorDispatch).toHaveBeenNthCalledWith(2, tr2);
    });
  });
});
