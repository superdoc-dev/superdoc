/**
 * Export namespace: engine-agnostic public API and adapter contract.
 *
 * Validates the requested mode at the public boundary so an invalid mode fails
 * closed with `INVALID_INPUT` before any document work happens, then delegates
 * byte production and degradation reporting to the engine adapter.
 */

import { DocumentApiValidationError } from '../errors.js';
import {
  DEFAULT_SD_EXPORT_MODE,
  SD_EXPORT_MODES,
  type ExportToDocxInput,
  type ExportToDocxResult,
  type SDExportMode,
} from './export.types.js';

// ---------------------------------------------------------------------------
// Adapter interface: implemented by each engine
// ---------------------------------------------------------------------------

export interface ExportAdapter {
  toDocx(input: { mode: SDExportMode }): ExportToDocxResult;
}

// ---------------------------------------------------------------------------
// Public API shape on DocumentApi
// ---------------------------------------------------------------------------

export interface ExportApi {
  toDocx(input?: ExportToDocxInput): ExportToDocxResult;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resolveMode(input: ExportToDocxInput | undefined): SDExportMode {
  if (input != null && !isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'export.toDocx input must be an object.');
  }
  const raw = input?.mode;
  if (raw === undefined) return DEFAULT_SD_EXPORT_MODE;
  if (typeof raw !== 'string' || !SD_EXPORT_MODES.includes(raw as SDExportMode)) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `export.toDocx mode must be one of: ${SD_EXPORT_MODES.join(', ')}.`,
      { mode: raw, allowedModes: [...SD_EXPORT_MODES] },
    );
  }
  return raw as SDExportMode;
}

// ---------------------------------------------------------------------------
// Execute function: bridge public API to adapter
// ---------------------------------------------------------------------------

export function executeExportToDocx(
  adapter: ExportAdapter | undefined,
  input: ExportToDocxInput = {},
): ExportToDocxResult {
  // Mode validation runs first so an invalid mode fails closed with
  // INVALID_INPUT regardless of adapter availability and before any work.
  const mode = resolveMode(input);
  if (!adapter) {
    throw new DocumentApiValidationError('CAPABILITY_UNSUPPORTED', 'export.toDocx is not available in this runtime.');
  }
  return adapter.toDocx({ mode });
}
