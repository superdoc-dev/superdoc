import { describe, it, expect, vi } from 'vitest';
import { createCascadeToggleCommands } from './cascade-toggle.js';

const invoke = (command, commands) => command()({ commands });

describe('createCascadeToggleCommands', () => {
  it('requires markName', () => {
    expect(() => createCascadeToggleCommands()).toThrow('markName');
  });

  it('provides default set/unset/toggle command names', () => {
    const commands = {
      setMark: vi.fn(),
      unsetMark: vi.fn(),
      toggleMarkCascade: vi.fn(),
    };

    const { setFoo, unsetFoo, toggleFoo } = createCascadeToggleCommands({ markName: 'foo' });

    invoke(setFoo, commands);
    invoke(unsetFoo, commands);
    invoke(toggleFoo, commands);

    expect(commands.setMark).toHaveBeenCalledWith('foo');
    expect(commands.unsetMark).toHaveBeenCalledWith('foo');
    expect(commands.toggleMarkCascade).toHaveBeenCalledWith('foo', {});
  });

  it('supports custom command names', () => {
    const commands = {
      setMark: vi.fn(),
      unsetMark: vi.fn(),
      toggleMarkCascade: vi.fn(),
    };

    const cmds = createCascadeToggleCommands({
      markName: 'foo',
      setCommand: 'applyFoo',
      unsetCommand: 'removeFoo',
      toggleCommand: 'cycleFoo',
    });

    invoke(cmds.applyFoo, commands);
    invoke(cmds.removeFoo, commands);
    invoke(cmds.cycleFoo, commands);

    expect(commands.setMark).toHaveBeenCalledWith('foo');
    expect(commands.unsetMark).toHaveBeenCalledWith('foo');
    expect(commands.toggleMarkCascade).toHaveBeenCalledWith('foo', {});
  });

  it('passes through cascade options only when provided', () => {
    const commands = {
      setMark: vi.fn(),
      unsetMark: vi.fn(),
      toggleMarkCascade: vi.fn(),
    };
    const isNegation = vi.fn();

    const { toggleFoo } = createCascadeToggleCommands({
      markName: 'foo',
      negationAttrs: { value: '0' },
      isNegation,
      extendEmptyMarkRange: false,
    });

    invoke(toggleFoo, commands);

    expect(commands.toggleMarkCascade).toHaveBeenCalledWith('foo', {
      negationAttrs: { value: '0' },
      isNegation,
      extendEmptyMarkRange: false,
    });
  });

  it('omits undefined cascade options', () => {
    const commands = { toggleMarkCascade: vi.fn(), setMark: vi.fn(), unsetMark: vi.fn() };

    const { toggleFoo } = createCascadeToggleCommands({
      markName: 'foo',
      negationAttrs: null,
      isNegation: true,
    });

    invoke(toggleFoo, commands);

    expect(commands.toggleMarkCascade).toHaveBeenCalledWith('foo', {});
  });
});
