import type { DocumentInfo } from '../types/index.js';
import { executeInfo } from './info.js';
import type { InfoAdapter } from './info.js';

const DEFAULT_INFO: DocumentInfo = {
  counts: { words: 42, paragraphs: 3, headings: 1, tables: 0, images: 0, comments: 0 },
  outline: [{ level: 1, text: 'Heading', nodeId: 'h1' }],
  capabilities: { canFind: true, canGetNode: true, canComment: true, canReplace: true },
};

describe('executeInfo', () => {
  it('delegates to adapter.info with the input', () => {
    const adapter: InfoAdapter = {
      info: vi.fn(() => DEFAULT_INFO),
    };

    const result = executeInfo(adapter, {});

    expect(result).toBe(DEFAULT_INFO);
    expect(adapter.info).toHaveBeenCalledWith({});
  });
});
