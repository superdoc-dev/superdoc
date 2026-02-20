import { CONTRACT_VERSION } from '@superdoc/document-api';
import type { CliError } from './errors';

const CLI_VERSION = CONTRACT_VERSION;

export type SuccessEnvelope = {
  ok: true;
  command: string;
  data: unknown;
  meta: {
    version: string;
    elapsedMs: number;
  };
};

export type FailureEnvelope = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    version: string;
    elapsedMs: number;
  };
};

export function createSuccessEnvelope(command: string, data: unknown, elapsedMs: number): SuccessEnvelope {
  return {
    ok: true,
    command,
    data,
    meta: {
      version: CLI_VERSION,
      elapsedMs,
    },
  };
}

export function createFailureEnvelope(error: CliError, elapsedMs: number): FailureEnvelope {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
    },
    meta: {
      version: CLI_VERSION,
      elapsedMs,
    },
  };
}
