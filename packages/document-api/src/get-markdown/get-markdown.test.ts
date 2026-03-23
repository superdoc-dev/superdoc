import { describe, expect, it, mock } from 'bun:test';
import { executeGetMarkdown } from './get-markdown.js';
import type { GetMarkdownAdapter } from './get-markdown.js';

describe('executeGetMarkdown', () => {
  it('delegates to adapter.getMarkdown with the input', () => {
    const adapter: GetMarkdownAdapter = {
      getMarkdown: mock(() => '# Hello\n\nworld\n'),
    };

    const result = executeGetMarkdown(adapter, {});

    expect(result).toBe('# Hello\n\nworld\n');
    expect(adapter.getMarkdown).toHaveBeenCalledWith({});
  });

  it('rejects invalid story locator', () => {
    const adapter: GetMarkdownAdapter = { getMarkdown: mock(() => '') };

    expect(() => executeGetMarkdown(adapter, { in: { kind: 'bogus' } as any })).toThrow(/StoryLocator/);
    expect(adapter.getMarkdown).not.toHaveBeenCalled();
  });

  it('allows valid story locator', () => {
    const adapter: GetMarkdownAdapter = { getMarkdown: mock(() => 'md') };

    expect(() => executeGetMarkdown(adapter, { in: { kind: 'story', storyType: 'body' } as any })).not.toThrow();
  });

  it('rejects null input', () => {
    const adapter: GetMarkdownAdapter = { getMarkdown: mock(() => '') };

    expect(() => executeGetMarkdown(adapter, null as any)).toThrow(/non-null object/);
  });
});
