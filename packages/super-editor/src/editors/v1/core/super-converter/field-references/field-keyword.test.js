// @ts-check
import { describe, expect, it } from 'vitest';
import { extractFieldKeyword } from './field-keyword.js';

describe('extractFieldKeyword', () => {
  it.each([
    [null, ''],
    [undefined, ''],
    ['', ''],
    ['   ', ''],
    [' page \\* arabic ', 'PAGE'],
    ['toc \\o "1-3"', 'TOC'],
  ])('extracts the uppercase dispatch keyword from %s', (instruction, expected) => {
    expect(extractFieldKeyword(instruction)).toBe(expected);
  });
});
