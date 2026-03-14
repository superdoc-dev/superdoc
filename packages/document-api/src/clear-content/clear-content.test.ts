import { executeClearContent } from './clear-content.js';
import type { ClearContentAdapter } from './clear-content.js';
import type { Receipt } from '../types/receipt.js';

const SUCCESS_RECEIPT: Receipt = { success: true };
const NOOP_RECEIPT: Receipt = { success: false, failure: { code: 'NO_OP', message: 'Document is already empty.' } };

describe('executeClearContent', () => {
  it('delegates to adapter.clearContent with input and options', () => {
    const adapter: ClearContentAdapter = {
      clearContent: vi.fn(() => SUCCESS_RECEIPT),
    };

    const result = executeClearContent(adapter, {}, { expectedRevision: 'r1' });

    expect(result).toBe(SUCCESS_RECEIPT);
    expect(adapter.clearContent).toHaveBeenCalledWith({}, { expectedRevision: 'r1' });
  });

  it('returns adapter result when NO_OP', () => {
    const adapter: ClearContentAdapter = {
      clearContent: vi.fn(() => NOOP_RECEIPT),
    };

    const result = executeClearContent(adapter, {});

    expect(result).toEqual(NOOP_RECEIPT);
    expect(result.success).toBe(false);
  });
});
