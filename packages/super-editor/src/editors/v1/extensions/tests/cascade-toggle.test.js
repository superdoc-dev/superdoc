import { describe, expect, it, vi } from 'vitest';
import { createCascadeToggleCommands } from '../shared/cascade-toggle.js';

describe('createCascadeToggleCommands', () => {
  it('requires a mark name', () => {
    expect(() => createCascadeToggleCommands()).toThrow('markName');
  });

  it('provides default command names and calls through to command service', () => {
    const commands = {
      setMark: vi.fn(() => true),
      unsetMark: vi.fn(() => true),
      toggleMarkCascade: vi.fn(() => true),
    };
    const { setFoo, unsetFoo, toggleFoo } = createCascadeToggleCommands({ markName: 'foo' });

    setFoo()({ commands });
    unsetFoo()({ commands });
    toggleFoo()({ commands });

    expect(commands.setMark).toHaveBeenCalledWith('foo');
    expect(commands.unsetMark).toHaveBeenCalledWith('foo');
    expect(commands.toggleMarkCascade).toHaveBeenCalledWith('foo', {});
  });

  it('passes cascade options and supports custom command names', () => {
    const commands = {
      setMark: vi.fn(() => true),
      unsetMark: vi.fn(() => true),
      toggleMarkCascade: vi.fn(() => true),
    };

    const options = {
      markName: 'bar',
      setCommand: 'applyBar',
      unsetCommand: 'removeBar',
      toggleCommand: 'cycleBar',
      negationAttrs: { value: '0' },
      isNegation: vi.fn(),
      extendEmptyMarkRange: false,
    };

    const commandsMap = createCascadeToggleCommands(options);

    commandsMap.applyBar()({ commands });
    commandsMap.removeBar()({ commands });
    commandsMap.cycleBar()({ commands });

    expect(commands.toggleMarkCascade).toHaveBeenCalledWith('bar', {
      negationAttrs: { value: '0' },
      isNegation: options.isNegation,
      extendEmptyMarkRange: false,
    });
    expect(options.isNegation).not.toHaveBeenCalled();
  });

  it('omits cascade options when values are empty or non-functional', () => {
    const commands = {
      setMark: vi.fn(() => true),
      unsetMark: vi.fn(() => true),
      toggleMarkCascade: vi.fn(() => true),
    };

    const { toggleFoo } = createCascadeToggleCommands({
      markName: 'foo',
      negationAttrs: null,
      isNegation: true,
      extendEmptyMarkRange: undefined,
    });

    toggleFoo()({ commands });

    expect(commands.toggleMarkCascade).toHaveBeenCalledWith('foo', {});
  });
});
