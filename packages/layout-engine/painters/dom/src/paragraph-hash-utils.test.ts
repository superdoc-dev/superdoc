import { describe, expect, it } from 'vitest';
import { hashParagraphBorders } from './paragraph-hash-utils.js';
import type { ParagraphBorders } from '@superdoc/contracts';

describe('hashParagraphBorders', () => {
  it('includes between border in hash', () => {
    const borders: ParagraphBorders = {
      top: { style: 'solid', width: 1, color: '#000' },
      between: { style: 'solid', width: 2, color: '#FF0000' },
    };
    const hash = hashParagraphBorders(borders);
    expect(hash).toContain('bw:[');
    expect(hash).toContain('s:solid');
    expect(hash).toContain('w:2');
    expect(hash).toContain('c:#FF0000');
  });

  it('produces different hashes for borders with and without between', () => {
    const withBetween: ParagraphBorders = {
      top: { style: 'solid', width: 1 },
      between: { style: 'solid', width: 1 },
    };
    const withoutBetween: ParagraphBorders = {
      top: { style: 'solid', width: 1 },
    };
    expect(hashParagraphBorders(withBetween)).not.toBe(hashParagraphBorders(withoutBetween));
  });

  it('does not include between segment when not defined', () => {
    const borders: ParagraphBorders = {
      top: { style: 'solid', width: 1 },
      bottom: { style: 'solid', width: 1 },
    };
    expect(hashParagraphBorders(borders)).not.toContain('bw:');
  });
});
