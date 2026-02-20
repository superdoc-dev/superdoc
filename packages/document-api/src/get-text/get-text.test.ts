import { executeGetText } from './get-text.js';
import type { GetTextAdapter } from './get-text.js';

describe('executeGetText', () => {
  it('delegates to adapter.getText with the input', () => {
    const adapter: GetTextAdapter = {
      getText: vi.fn(() => 'Hello world'),
    };

    const result = executeGetText(adapter, {});

    expect(result).toBe('Hello world');
    expect(adapter.getText).toHaveBeenCalledWith({});
  });
});
