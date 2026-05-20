import { describe, expect, test } from 'bun:test';
import { parseHostCommandTokens } from './server';
import { CliError } from '../lib/errors';

describe('parseHostCommandTokens', () => {
  test('parses --stdio', () => {
    expect(parseHostCommandTokens(['--stdio'])).toEqual({
      stdio: true,
      help: false,
      requestTimeoutMs: undefined,
    });
  });

  test('parses --help and -h', () => {
    expect(parseHostCommandTokens(['--help'])).toEqual({
      stdio: false,
      help: true,
      requestTimeoutMs: undefined,
    });
    expect(parseHostCommandTokens(['-h'])).toEqual({
      stdio: false,
      help: true,
      requestTimeoutMs: undefined,
    });
  });

  test('rejects unknown options', () => {
    expect(() => parseHostCommandTokens(['--bogus'])).toThrow(CliError);
  });

  describe('--request-timeout-ms', () => {
    test('accepts space-separated value', () => {
      expect(parseHostCommandTokens(['--stdio', '--request-timeout-ms', '120000'])).toEqual({
        stdio: true,
        help: false,
        requestTimeoutMs: 120000,
      });
    });

    test('accepts equals-separated value', () => {
      expect(parseHostCommandTokens(['--stdio', '--request-timeout-ms=180000'])).toEqual({
        stdio: true,
        help: false,
        requestTimeoutMs: 180000,
      });
    });

    test('rejects missing value', () => {
      expect(() => parseHostCommandTokens(['--request-timeout-ms'])).toThrow(/positive finite number/);
    });

    test('rejects empty value', () => {
      expect(() => parseHostCommandTokens(['--request-timeout-ms='])).toThrow(/positive finite number/);
    });

    test('rejects non-numeric value', () => {
      expect(() => parseHostCommandTokens(['--request-timeout-ms', 'soon'])).toThrow(/positive finite number/);
    });

    test('rejects zero and negatives', () => {
      expect(() => parseHostCommandTokens(['--request-timeout-ms', '0'])).toThrow(/positive finite number/);
      expect(() => parseHostCommandTokens(['--request-timeout-ms', '-1'])).toThrow(/positive finite number/);
    });

    test('accepts positive non-integer (float) values', () => {
      expect(parseHostCommandTokens(['--request-timeout-ms', '1500.5'])).toEqual({
        stdio: false,
        help: false,
        requestTimeoutMs: 1500.5,
      });
    });

    test('rejects NaN and Infinity', () => {
      expect(() => parseHostCommandTokens(['--request-timeout-ms', 'NaN'])).toThrow(/positive finite number/);
      expect(() => parseHostCommandTokens(['--request-timeout-ms', 'Infinity'])).toThrow(/positive finite number/);
      expect(() => parseHostCommandTokens(['--request-timeout-ms', '-Infinity'])).toThrow(/positive finite number/);
    });
  });
});
