import packageJson from '../../package.json';

const LOG_PREFIX = '🦋 🦸‍♀️ [superdoc-ai]';
const PACKAGE_NAME = '@superdoc-dev/ai';
const PACKAGE_VERSION = packageJson.version ?? '0.0.0';

let hasLoggedVersion = false;

/**
 * Logger class for production-ready logging
 * Supports different log levels and conditional logging
 */
export class Logger {
  constructor(private readonly enableLogging: boolean = false) {}

  /**
   * Log debug messages (only when logging is enabled)
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.enableLogging) {
      (console.debug || console.log)(LOG_PREFIX, message, ...args);
    }
  }

  /**
   * Log error messages
   * Errors respect enableLogging flag - only log when enabled
   * This allows tests and production code to control error visibility
   */
  error(message: string, error?: unknown, ...args: unknown[]): void {
    if (this.enableLogging) {
      if (error) {
        // Include error in the same call for backward compatibility
        console.error(LOG_PREFIX, message, ...args, error);
      } else {
        console.error(LOG_PREFIX, message, ...args);
      }
    }
  }

  /**
   * Log warning messages (always logged)
   */
  warn(message: string, ...args: unknown[]): void {
    console.warn(LOG_PREFIX, message, ...args);
  }

  /**
   * Log info messages (only when logging is enabled)
   */
  info(message: string, ...args: unknown[]): void {
    if (this.enableLogging) {
      console.log(LOG_PREFIX, message, ...args);
    }
  }
}

/**
 * Legacy log function for backward compatibility
 * @deprecated Use Logger class instead
 */
export const log = (...args: unknown[]) => {
  (console.debug ? console.debug : console.log)(LOG_PREFIX, ...args);
};

export const logPackageVersion = (): void => {
  if (hasLoggedVersion) {
    return;
  }

  hasLoggedVersion = true;
  log(`Using ${PACKAGE_NAME} version:`, PACKAGE_VERSION);
};
