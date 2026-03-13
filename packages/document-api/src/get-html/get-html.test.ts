import { executeGetHtml } from './get-html.js';
import type { GetHtmlAdapter } from './get-html.js';

describe('executeGetHtml', () => {
  it('delegates to adapter.getHtml with the input', () => {
    const adapter: GetHtmlAdapter = {
      getHtml: vi.fn(() => '<p>Hello world</p>'),
    };

    const result = executeGetHtml(adapter, {});

    expect(result).toBe('<p>Hello world</p>');
    expect(adapter.getHtml).toHaveBeenCalledWith({});
  });

  it('passes unflattenLists option through to the adapter', () => {
    const adapter: GetHtmlAdapter = {
      getHtml: vi.fn(() => '<ol><li>item</li></ol>'),
    };

    const result = executeGetHtml(adapter, { unflattenLists: false });

    expect(result).toBe('<ol><li>item</li></ol>');
    expect(adapter.getHtml).toHaveBeenCalledWith({ unflattenLists: false });
  });
});
