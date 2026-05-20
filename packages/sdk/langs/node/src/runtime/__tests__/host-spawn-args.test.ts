import { describe, expect, test } from 'bun:test';
import { buildHostSpawnArgs } from '../host.js';

describe('buildHostSpawnArgs', () => {
  test('omits --request-timeout-ms when requestTimeoutMs is unset', () => {
    expect(buildHostSpawnArgs([], {})).toEqual(['host', '--stdio']);
  });

  test('omits --request-timeout-ms when requestTimeoutMs is undefined', () => {
    expect(buildHostSpawnArgs([], { requestTimeoutMs: undefined })).toEqual(['host', '--stdio']);
  });

  test('forwards requestTimeoutMs as separate argv tokens', () => {
    expect(buildHostSpawnArgs([], { requestTimeoutMs: 120000 })).toEqual([
      'host',
      '--stdio',
      '--request-timeout-ms',
      '120000',
    ]);
  });

  test('preserves prefixArgs (e.g. when the binary is a .js wrapped by node)', () => {
    expect(buildHostSpawnArgs(['/path/to/cli.js'], { requestTimeoutMs: 60000 })).toEqual([
      '/path/to/cli.js',
      'host',
      '--stdio',
      '--request-timeout-ms',
      '60000',
    ]);
  });

  test('forwards requestTimeoutMs=0 as "0" so the host can reject it', () => {
    // Validation lives in the host parser (positive-finite-number check). The
    // SDK forwards verbatim and lets the host produce a structured error.
    expect(buildHostSpawnArgs([], { requestTimeoutMs: 0 })).toEqual(['host', '--stdio', '--request-timeout-ms', '0']);
  });

  test('forwards a positive non-integer (float) verbatim', () => {
    expect(buildHostSpawnArgs([], { requestTimeoutMs: 1500.5 })).toEqual([
      'host',
      '--stdio',
      '--request-timeout-ms',
      '1500.5',
    ]);
  });
});
