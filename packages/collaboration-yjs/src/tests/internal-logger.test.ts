import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { createLogger } from '../internal-logger/logger.js';

describe('createLogger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // The logger now routes through the shared @superdoc/common logger, whose
    // console sink writes `info`-level records via console.info.
    consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('prefixes output with the label', () => {
    const logger = createLogger('ConnectionHandler');

    logger('connected', 123);

    expect(consoleSpy).toHaveBeenCalledWith('[ConnectionHandler]', 'connected', 123);
  });

  test('prefixes output for any label', () => {
    const logger = createLogger('Custom');

    logger('info');

    expect(consoleSpy).toHaveBeenCalledWith('[Custom]', 'info');
  });

  test('returns a stable logging function', () => {
    const logger = createLogger('DocumentManager');
    const secondLogger = createLogger('DocumentManager');

    expect(typeof logger).toBe('function');
    expect(typeof secondLogger).toBe('function');
    expect(logger).not.toBe(secondLogger);
  });
});
