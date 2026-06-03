import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from './logger.js';

// The validator logger is a thin adapter over @superdoc/common/logger. When
// `debug` is true it logs at the shared logger's `debug` level, whose console
// sink writes via console.debug and prepends a single `[namespace]` prefix.
// Nested prefixes compose into the namespace as `[SuperValidator:Prefix:...]`.
describe('createLogger', () => {
  let consoleDebugSpy;

  beforeEach(() => {
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleDebugSpy.mockRestore();
  });

  it('does not log when debug is false', () => {
    const logger = createLogger(false);
    logger.debug('should not log');
    expect(consoleDebugSpy).not.toHaveBeenCalled();
  });

  it('logs with the SuperValidator prefix when debug is true', () => {
    const logger = createLogger(true);
    logger.debug('hello', 'world');

    expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
    expect(consoleDebugSpy).toHaveBeenCalledWith('[SuperValidator]', 'hello', 'world');
  });

  it('composes an additional prefix into the namespace', () => {
    const logger = createLogger(true, ['MyValidator']);
    logger.debug('test');

    expect(consoleDebugSpy).toHaveBeenCalledWith('[SuperValidator:MyValidator]', 'test');
  });

  it('allows chaining withPrefix to add more prefixes', () => {
    const logger = createLogger(true).withPrefix('ValidatorA').withPrefix('Nested');
    logger.debug('deep');

    expect(consoleDebugSpy).toHaveBeenCalledWith('[SuperValidator:ValidatorA:Nested]', 'deep');
  });

  it('stringifies non-string prefixes', () => {
    const logger = createLogger(true, [123, null, undefined]);
    logger.debug('mixed');

    expect(consoleDebugSpy).toHaveBeenCalledWith('[SuperValidator:123:null:undefined]', 'mixed');
  });

  it('works with no additionalPrefixes provided', () => {
    const logger = createLogger(true);
    logger.debug('only base');

    expect(consoleDebugSpy).toHaveBeenCalledWith('[SuperValidator]', 'only base');
  });

  it('handles empty debug call gracefully', () => {
    const logger = createLogger(true);
    logger.debug();

    expect(consoleDebugSpy).toHaveBeenCalledWith('[SuperValidator]');
  });

  it('does not log from chained logger if debug is false', () => {
    const logger = createLogger(false).withPrefix('Sub');
    logger.debug('should not log');
    expect(consoleDebugSpy).not.toHaveBeenCalled();
  });
});
