import { describe, expect, it, mock } from 'bun:test';
import { executeGetHtml } from './get-html.js';
import type { GetHtmlAdapter } from './get-html.js';

describe('executeGetHtml', () => {
  it('delegates to adapter.getHtml with the input', () => {
    const adapter: GetHtmlAdapter = {
      getHtml: mock(() => '<p>Hello world</p>'),
    };

    const result = executeGetHtml(adapter, {});

    expect(result).toBe('<p>Hello world</p>');
    expect(adapter.getHtml).toHaveBeenCalledWith({});
  });

  it('passes unflattenLists option through to the adapter', () => {
    const adapter: GetHtmlAdapter = {
      getHtml: mock(() => '<ol><li>item</li></ol>'),
    };

    const result = executeGetHtml(adapter, { unflattenLists: false });

    expect(result).toBe('<ol><li>item</li></ol>');
    expect(adapter.getHtml).toHaveBeenCalledWith({ unflattenLists: false });
  });

  it('rejects invalid story locator', () => {
    const adapter: GetHtmlAdapter = { getHtml: mock(() => '') };

    expect(() => executeGetHtml(adapter, { in: { kind: 'bogus' } as any })).toThrow(/StoryLocator/);
    expect(adapter.getHtml).not.toHaveBeenCalled();
  });

  it('allows valid story locator', () => {
    const adapter: GetHtmlAdapter = { getHtml: mock(() => '<p>ok</p>') };

    expect(() => executeGetHtml(adapter, { in: { kind: 'story', storyType: 'body' } as any })).not.toThrow();
  });

  it('rejects null input', () => {
    const adapter: GetHtmlAdapter = { getHtml: mock(() => '') };

    expect(() => executeGetHtml(adapter, null as any)).toThrow(/non-null object/);
  });
});
