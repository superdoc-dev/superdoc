// @ts-check

import { createLogger as createBaseLogger } from '@superdoc/common/logger';

/**
 * Create a debug logger for SuperValidator and validators.
 *
 * Thin adapter over the shared `@superdoc/common/logger`: the validator's
 * `debug` flag maps to the logger level (`debug` when on, `silent` when off),
 * and nested prefixes compose into the logger namespace.
 *
 * @param {boolean} debug
 * @param {string[]} [additionalPrefixes]
 * @returns {import('../types.js').ValidatorLogger}
 */
export function createLogger(debug, additionalPrefixes = []) {
  const namespace = ['SuperValidator', ...additionalPrefixes.map(String)].join(':');
  const base = createBaseLogger(namespace, { level: debug ? 'debug' : 'silent' });

  return {
    debug: (...args) => base.debug(...args),
    withPrefix: (prefix) => createLogger(debug, [...additionalPrefixes, prefix]),
  };
}
