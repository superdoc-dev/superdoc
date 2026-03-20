import { describe, it, expect, mock } from 'bun:test';
import { createCascadeToggleCommands } from '../shared/cascade-toggle.js';

describe('createCascadeToggleCommands', () => {
  it('requires a mark name', () => {
    expect(() => createCascadeToggleCommands()).toThrow('markName');
  });

  it('provides default command names and calls through to command service', () => {
    const commands = {
      setMark: mock(() => true),
      unsetMark: mock(() => true),
      toggleMarkCascade: mock(() => true),
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
      setMark: mock(() => true),
      unsetMark: mock(() => true),
      toggleMarkCascade: mock(() => true),
    };

    const options = {
      markName: 'bar',
      setCommand: 'applyBar',
      unsetCommand: 'removeBar',
      toggleCommand: 'cycleBar',
      negationAttrs: { value: '0' },
      isNegation: mock(),
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
      setMark: mock(() => true),
      unsetMark: mock(() => true),
      toggleMarkCascade: mock(() => true),
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
