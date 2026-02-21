/**
 * Error thrown by the SuperDoc SDK when a CLI operation fails.
 *
 * Includes a machine-readable `code` for programmatic error handling
 * and optional `details` with structured diagnostic context.
 */
export class SuperDocCliError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly exitCode?: number;

  constructor(message: string, options: { code: string; details?: unknown; exitCode?: number }) {
    super(message);
    this.name = 'SuperDocCliError';
    this.code = options.code;
    this.details = options.details;
    this.exitCode = options.exitCode;
  }
}
