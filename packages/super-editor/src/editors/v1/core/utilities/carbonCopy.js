import { createLogger } from '@superdoc/common/logger';

const log = createLogger('carbon-copy');

/**
 *
 * @template T
 * @param {T} obj
 * @returns {T}
 */
export const carbonCopy = (obj) => {
  if (!obj) return undefined;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    log.error('Error in carbonCopy', obj, e);
    return undefined;
  }
};
