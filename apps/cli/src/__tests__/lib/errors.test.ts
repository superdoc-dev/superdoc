import { describe, expect, test } from 'bun:test';
import { CliError, toCliError } from '../../lib/errors';

describe('CliError', () => {
  test('sets code, message, and details', () => {
    const error = new CliError('INVALID_ARGUMENT', 'bad input', { field: 'name' });
    expect(error.code).toBe('INVALID_ARGUMENT');
    expect(error.message).toBe('bad input');
    expect(error.details).toEqual({ field: 'name' });
    expect(error.exitCode).toBe(1);
  });

  test('defaults exitCode to 1', () => {
    const error = new CliError('COMMAND_FAILED', 'fail');
    expect(error.exitCode).toBe(1);
  });

  test('accepts custom exitCode', () => {
    const error = new CliError('COMMAND_FAILED', 'fail', undefined, 2);
    expect(error.exitCode).toBe(2);
  });

  test('is instanceof Error', () => {
    const error = new CliError('COMMAND_FAILED', 'fail');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof CliError).toBe(true);
  });

  test('has name set to CliError', () => {
    const error = new CliError('COMMAND_FAILED', 'fail');
    expect(error.name).toBe('CliError');
  });
});

describe('toCliError', () => {
  test('returns CliError as-is', () => {
    const original = new CliError('INVALID_ARGUMENT', 'bad');
    expect(toCliError(original)).toBe(original);
  });

  test('wraps Error into CliError', () => {
    const original = new Error('something broke');
    const wrapped = toCliError(original);
    expect(wrapped).toBeInstanceOf(CliError);
    expect(wrapped.code).toBe('COMMAND_FAILED');
    expect(wrapped.message).toBe('something broke');
  });

  test('wraps non-Error into CliError', () => {
    const wrapped = toCliError('string error');
    expect(wrapped).toBeInstanceOf(CliError);
    expect(wrapped.code).toBe('COMMAND_FAILED');
    expect(wrapped.message).toBe('Unknown error');
    expect(wrapped.details).toEqual({ error: 'string error' });
  });

  test('wraps null into CliError', () => {
    const wrapped = toCliError(null);
    expect(wrapped).toBeInstanceOf(CliError);
    expect(wrapped.code).toBe('COMMAND_FAILED');
  });
});
