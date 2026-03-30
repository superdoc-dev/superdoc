import { describe, it, expect } from 'vitest';
import { ErrorWithDetails } from './ErrorWithDetails.js';

describe('ErrorWithDetails', () => {
  it('stores name, message, details, and stack', () => {
    const error = new ErrorWithDetails('CustomError', 'Something went wrong', { id: 42 });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('CustomError');
    expect(error.message).toBe('Something went wrong');
    expect(error.details).toEqual({ id: 42 });
    expect(typeof error.stack).toBe('string');
  });
});
