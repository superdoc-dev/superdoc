import { describe, it, expect, vi } from 'vitest';
import { executeMarkdownToFragment } from './markdown-to-fragment.js';
import type { MarkdownToFragmentAdapter, MarkdownToFragmentInput } from './markdown-to-fragment.js';
import type { SDMarkdownToFragmentResult } from '../types/sd-contract.js';

describe('executeMarkdownToFragment', () => {
  it('delegates input to the adapter and returns result', () => {
    const result: SDMarkdownToFragmentResult = {
      fragment: { kind: 'paragraph', paragraph: { inlines: [{ kind: 'run', run: { text: 'hello' } }] } },
      lossy: false,
      diagnostics: [],
    };
    const adapter: MarkdownToFragmentAdapter = {
      markdownToFragment: vi.fn(() => result),
    };
    const input: MarkdownToFragmentInput = { markdown: '# Hello' };

    const output = executeMarkdownToFragment(adapter, input);

    expect(output).toBe(result);
    expect(adapter.markdownToFragment).toHaveBeenCalledWith(input);
  });

  it('returns lossy result with diagnostics when appropriate', () => {
    const result: SDMarkdownToFragmentResult = {
      fragment: [{ kind: 'paragraph', paragraph: { inlines: [{ kind: 'run', run: { text: 'quoted' } }] } }],
      lossy: true,
      diagnostics: [{ code: 'MD_BLOCKQUOTE', severity: 'warning', message: 'Blockquotes have no direct equivalent.' }],
    };
    const adapter: MarkdownToFragmentAdapter = {
      markdownToFragment: vi.fn(() => result),
    };
    const input: MarkdownToFragmentInput = { markdown: '> blockquote' };

    const output = executeMarkdownToFragment(adapter, input);

    expect(output.lossy).toBe(true);
    expect(output.diagnostics).toHaveLength(1);
    expect(output.diagnostics[0].code).toBe('MD_BLOCKQUOTE');
  });
});
