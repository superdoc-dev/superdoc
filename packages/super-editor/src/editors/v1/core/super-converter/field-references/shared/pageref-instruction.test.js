import { describe, expect, it } from 'vitest';
import { parsePageRefInstruction } from './pageref-instruction.js';

describe('parsePageRefInstruction', () => {
  it('parses unquoted and case-insensitive PAGEREF targets', () => {
    expect(parsePageRefInstruction('PAGEREF _Toc123')).toMatchObject({
      instruction: 'PAGEREF _Toc123',
      bookmarkId: '_Toc123',
    });
    expect(parsePageRefInstruction('pageref _Toc123')).toMatchObject({
      bookmarkId: '_Toc123',
    });
  });

  it('parses quoted bookmark targets and hyperlink switches', () => {
    expect(parsePageRefInstruction('PAGEREF "_Toc123" \\h')).toMatchObject({
      bookmarkId: '_Toc123',
      hasHyperlinkSwitch: true,
    });
    expect(parsePageRefInstruction('PAGEREF _Toc123 \\H')).toMatchObject({
      bookmarkId: '_Toc123',
      hasHyperlinkSwitch: true,
    });
  });

  it('parses relative-position switches', () => {
    expect(parsePageRefInstruction('PAGEREF _Toc123 \\p')).toMatchObject({
      bookmarkId: '_Toc123',
      hasRelativePositionSwitch: true,
    });
    expect(parsePageRefInstruction('PAGEREF _Toc123 \\P')).toMatchObject({
      bookmarkId: '_Toc123',
      hasRelativePositionSwitch: true,
    });
    expect(parsePageRefInstruction('PAGEREF _Toc123 \\h \\p')).toMatchObject({
      hasHyperlinkSwitch: true,
      hasRelativePositionSwitch: true,
    });
  });

  it('maps supported general numeric formats', () => {
    expect(parsePageRefInstruction('PAGEREF _Toc123 \\* Roman').pageNumberFieldFormat).toEqual({
      format: 'upperRoman',
    });
    expect(parsePageRefInstruction('PAGEREF _Toc123 \\* roman').pageNumberFieldFormat).toEqual({
      format: 'lowerRoman',
    });
    expect(parsePageRefInstruction('PAGEREF _Toc123 \\* ArabicDash').pageNumberFieldFormat).toEqual({
      format: 'numberInDash',
    });
  });

  it('parses numeric picture switches', () => {
    expect(parsePageRefInstruction('PAGEREF _Toc123 \\# "00"')).toMatchObject({
      numericPictureFormat: { picture: '00' },
      pageNumberFieldFormat: { zeroPadding: 2 },
    });
    expect(parsePageRefInstruction('PAGEREF _Toc123 \\# #,##0')).toMatchObject({
      numericPictureFormat: { picture: '#,##0' },
    });
  });

  it('does not treat bare h as the hyperlink switch', () => {
    expect(parsePageRefInstruction('PAGEREF bh-target')).toMatchObject({
      bookmarkId: 'bh-target',
      hasHyperlinkSwitch: false,
    });
  });

  it('preserves unknown switches in rawSwitches', () => {
    expect(parsePageRefInstruction('PAGEREF _Toc123 \\z value').rawSwitches).toEqual([{ switch: '\\z' }]);
  });
});
