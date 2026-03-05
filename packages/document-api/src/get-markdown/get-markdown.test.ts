import { executeGetMarkdown } from './get-markdown.js';
import type { GetMarkdownAdapter } from './get-markdown.js';

describe('executeGetMarkdown', () => {
  it('delegates to adapter.getMarkdown with the input', () => {
    const adapter: GetMarkdownAdapter = {
      getMarkdown: vi.fn(() => '# Hello\n\nworld\n'),
    };

    const result = executeGetMarkdown(adapter, {});

    expect(result).toBe('# Hello\n\nworld\n');
    expect(adapter.getMarkdown).toHaveBeenCalledWith({});
  });
});
