import { describe, expect, it, mock } from 'bun:test';
import { executeGetText } from './get-text.js';
import type { GetTextAdapter } from './get-text.js';

describe('executeGetText', () => {
  it('delegates to adapter.getText with the input', () => {
    const adapter: GetTextAdapter = {
      getText: mock(() => 'Hello world'),
    };

    const result = executeGetText(adapter, {});

    expect(result).toBe('Hello world');
    expect(adapter.getText).toHaveBeenCalledWith({});
  });

  it('rejects invalid story locator', () => {
    const adapter: GetTextAdapter = { getText: mock(() => '') };

    expect(() => executeGetText(adapter, { in: { kind: 'wrong' } as any })).toThrow(/StoryLocator/);
    expect(adapter.getText).not.toHaveBeenCalled();
  });

  it('allows valid story locator', () => {
    const adapter: GetTextAdapter = { getText: mock(() => 'text') };

    const result = executeGetText(adapter, { in: { kind: 'story', storyType: 'body' } as any });

    expect(result).toBe('text');
  });

  it('allows omitted story locator', () => {
    const adapter: GetTextAdapter = { getText: mock(() => 'text') };

    expect(() => executeGetText(adapter, {})).not.toThrow();
  });

  it('rejects null input', () => {
    const adapter: GetTextAdapter = { getText: mock(() => '') };

    expect(() => executeGetText(adapter, null as any)).toThrow(/non-null object/);
    expect(adapter.getText).not.toHaveBeenCalled();
  });

  it('rejects undefined input', () => {
    const adapter: GetTextAdapter = { getText: mock(() => '') };

    expect(() => executeGetText(adapter, undefined as any)).toThrow(/non-null object/);
  });
});
