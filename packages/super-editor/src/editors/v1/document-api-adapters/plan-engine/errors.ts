/**
 * Plan engine error types.
 *
 * All pre-mutation failures throw typed errors with machine-readable codes.
 */

export class PlanError extends Error {
  readonly code: string;
  readonly stepId?: string;
  readonly details?: unknown;

  constructor(code: string, message: string, stepId?: string, details?: unknown) {
    super(message);
    this.name = 'PlanError';
    this.code = code;
    this.stepId = stepId;
    this.details = details;
  }
}

export function planError(code: string, message: string, stepId?: string, details?: unknown): PlanError {
  return new PlanError(code, `${code} — ${message}`, stepId, details);
}
