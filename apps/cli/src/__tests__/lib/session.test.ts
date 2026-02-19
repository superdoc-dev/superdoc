import { describe, expect, test } from 'bun:test';
import { generateSessionId, validateSessionId } from '../../lib/session';
import { CliError } from '../../lib/errors';

describe('validateSessionId', () => {
  test('accepts valid session ids', () => {
    expect(validateSessionId('my-session')).toBe('my-session');
    expect(validateSessionId('abc123')).toBe('abc123');
    expect(validateSessionId('file.docx')).toBe('file.docx');
    expect(validateSessionId('a_b-c.d')).toBe('a_b-c.d');
    expect(validateSessionId('x')).toBe('x');
  });

  test('accepts ids up to 64 characters', () => {
    const longId = 'a'.repeat(64);
    expect(validateSessionId(longId)).toBe(longId);
  });

  test('rejects empty string', () => {
    expect(() => validateSessionId('')).toThrow(CliError);
  });

  test('rejects ids over 64 characters', () => {
    const tooLong = 'a'.repeat(65);
    expect(() => validateSessionId(tooLong)).toThrow(CliError);
  });

  test('rejects ids with special characters', () => {
    expect(() => validateSessionId('has space')).toThrow(CliError);
    expect(() => validateSessionId('has/slash')).toThrow(CliError);
    expect(() => validateSessionId('has@at')).toThrow(CliError);
    expect(() => validateSessionId('has$dollar')).toThrow(CliError);
  });

  test('uses custom source in error message', () => {
    try {
      validateSessionId('bad id!', 'active session');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).message).toContain('active session');
    }
  });
});

describe('generateSessionId', () => {
  test('produces valid session ids', () => {
    const id = generateSessionId('report.docx');
    expect(() => validateSessionId(id)).not.toThrow();
  });

  test('derives base from file name', () => {
    const id = generateSessionId('My Report.docx');
    expect(id).toMatch(/^my-report-[a-f0-9]{6}$/);
  });

  test('handles stdin marker', () => {
    const id = generateSessionId('-');
    expect(id).toMatch(/^stdin-[a-f0-9]{6}$/);
  });

  test('handles file with no extension', () => {
    const id = generateSessionId('README');
    expect(id).toMatch(/^readme-[a-f0-9]{6}$/);
  });

  test('respects max length', () => {
    const longName = 'a'.repeat(100) + '.docx';
    const id = generateSessionId(longName);
    expect(id.length).toBeLessThanOrEqual(64);
    expect(() => validateSessionId(id)).not.toThrow();
  });

  test('produces unique ids', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateSessionId('test.docx')));
    expect(ids.size).toBe(20);
  });
});
