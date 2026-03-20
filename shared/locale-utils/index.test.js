import { describe, expect, it } from 'bun:test';
import { defaultDecimalSeparatorFor, isCommaLocale } from './index.js';

describe('locale-utils', () => {
  describe('defaultDecimalSeparatorFor', () => {
    describe('comma locales - language-only codes', () => {
      it('should return comma for German (de)', () => {
        expect(defaultDecimalSeparatorFor('de')).toBe(',');
      });

      it('should return comma for French (fr)', () => {
        expect(defaultDecimalSeparatorFor('fr')).toBe(',');
      });

      it('should return comma for Italian (it)', () => {
        expect(defaultDecimalSeparatorFor('it')).toBe(',');
      });

      it('should return comma for Spanish (es)', () => {
        expect(defaultDecimalSeparatorFor('es')).toBe(',');
      });

      it('should return comma for Dutch (nl)', () => {
        expect(defaultDecimalSeparatorFor('nl')).toBe(',');
      });

      it('should return comma for Russian (ru)', () => {
        expect(defaultDecimalSeparatorFor('ru')).toBe(',');
      });

      it('should return comma for Polish (pl)', () => {
        expect(defaultDecimalSeparatorFor('pl')).toBe(',');
      });

      it('should return comma for Turkish (tr)', () => {
        expect(defaultDecimalSeparatorFor('tr')).toBe(',');
      });

      it('should return comma for Swedish (sv)', () => {
        expect(defaultDecimalSeparatorFor('sv')).toBe(',');
      });

      it('should return comma for Finnish (fi)', () => {
        expect(defaultDecimalSeparatorFor('fi')).toBe(',');
      });

      it('should return comma for Danish (da)', () => {
        expect(defaultDecimalSeparatorFor('da')).toBe(',');
      });

      it('should return comma for Norwegian Bokmål (nb)', () => {
        expect(defaultDecimalSeparatorFor('nb')).toBe(',');
      });

      it('should return comma for Czech (cs)', () => {
        expect(defaultDecimalSeparatorFor('cs')).toBe(',');
      });

      it('should return comma for Slovak (sk)', () => {
        expect(defaultDecimalSeparatorFor('sk')).toBe(',');
      });

      it('should return comma for Hungarian (hu)', () => {
        expect(defaultDecimalSeparatorFor('hu')).toBe(',');
      });

      it('should return comma for Romanian (ro)', () => {
        expect(defaultDecimalSeparatorFor('ro')).toBe(',');
      });

      it('should return comma for Ukrainian (uk)', () => {
        expect(defaultDecimalSeparatorFor('uk')).toBe(',');
      });

      it('should return comma for Greek (el)', () => {
        expect(defaultDecimalSeparatorFor('el')).toBe(',');
      });

      it('should return comma for Serbian (sr)', () => {
        expect(defaultDecimalSeparatorFor('sr')).toBe(',');
      });

      it('should return comma for Croatian (hr)', () => {
        expect(defaultDecimalSeparatorFor('hr')).toBe(',');
      });

      it('should return comma for Bulgarian (bg)', () => {
        expect(defaultDecimalSeparatorFor('bg')).toBe(',');
      });

      it('should return comma for Lithuanian (lt)', () => {
        expect(defaultDecimalSeparatorFor('lt')).toBe(',');
      });

      it('should return comma for Latvian (lv)', () => {
        expect(defaultDecimalSeparatorFor('lv')).toBe(',');
      });

      it('should return comma for Estonian (et)', () => {
        expect(defaultDecimalSeparatorFor('et')).toBe(',');
      });
    });

    describe('comma locales - with region codes', () => {
      it('should return comma for de-DE (German Germany)', () => {
        expect(defaultDecimalSeparatorFor('de-DE')).toBe(',');
      });

      it('should return comma for fr-FR (French France)', () => {
        expect(defaultDecimalSeparatorFor('fr-FR')).toBe(',');
      });

      it('should return comma for it-IT (Italian Italy)', () => {
        expect(defaultDecimalSeparatorFor('it-IT')).toBe(',');
      });

      it('should return comma for es-ES (Spanish Spain)', () => {
        expect(defaultDecimalSeparatorFor('es-ES')).toBe(',');
      });

      it('should return comma for nl-NL (Dutch Netherlands)', () => {
        expect(defaultDecimalSeparatorFor('nl-NL')).toBe(',');
      });

      it('should return comma for de-AT (German Austria)', () => {
        expect(defaultDecimalSeparatorFor('de-AT')).toBe(',');
      });

      it('should return comma for fr-BE (French Belgium)', () => {
        expect(defaultDecimalSeparatorFor('fr-BE')).toBe(',');
      });
    });

    describe('dot locales', () => {
      it('should return dot for English (en)', () => {
        expect(defaultDecimalSeparatorFor('en')).toBe('.');
      });

      it('should return dot for en-US (English United States)', () => {
        expect(defaultDecimalSeparatorFor('en-US')).toBe('.');
      });

      it('should return dot for en-GB (English United Kingdom)', () => {
        expect(defaultDecimalSeparatorFor('en-GB')).toBe('.');
      });

      it('should return dot for Japanese (ja)', () => {
        expect(defaultDecimalSeparatorFor('ja')).toBe('.');
      });

      it('should return dot for Chinese (zh)', () => {
        expect(defaultDecimalSeparatorFor('zh')).toBe('.');
      });

      it('should return dot for zh-CN (Chinese China)', () => {
        expect(defaultDecimalSeparatorFor('zh-CN')).toBe('.');
      });

      it('should return dot for Korean (ko)', () => {
        expect(defaultDecimalSeparatorFor('ko')).toBe('.');
      });

      it('should return dot for Arabic (ar)', () => {
        expect(defaultDecimalSeparatorFor('ar')).toBe('.');
      });

      it('should return dot for Hindi (hi)', () => {
        expect(defaultDecimalSeparatorFor('hi')).toBe('.');
      });

      it('should return dot for Thai (th)', () => {
        expect(defaultDecimalSeparatorFor('th')).toBe('.');
      });

      it('should return dot for Vietnamese (vi)', () => {
        expect(defaultDecimalSeparatorFor('vi')).toBe('.');
      });
    });

    describe('Portuguese special cases', () => {
      it('should return comma for pt-PT (Portuguese Portugal)', () => {
        expect(defaultDecimalSeparatorFor('pt-PT')).toBe(',');
      });

      it('should return comma for pt-pt (lowercase)', () => {
        expect(defaultDecimalSeparatorFor('pt-pt')).toBe(',');
      });

      it('should return dot for pt-BR (Portuguese Brazil)', () => {
        expect(defaultDecimalSeparatorFor('pt-BR')).toBe('.');
      });

      it('should return dot for pt-br (lowercase)', () => {
        expect(defaultDecimalSeparatorFor('pt-br')).toBe('.');
      });

      it('should return dot for pt (Portuguese without region)', () => {
        expect(defaultDecimalSeparatorFor('pt')).toBe('.');
      });

      it('should return dot for pt-AO (Portuguese Angola)', () => {
        expect(defaultDecimalSeparatorFor('pt-AO')).toBe('.');
      });

      it('should return dot for pt-MZ (Portuguese Mozambique)', () => {
        expect(defaultDecimalSeparatorFor('pt-MZ')).toBe('.');
      });
    });

    describe('case insensitivity', () => {
      it('should handle uppercase locale codes', () => {
        expect(defaultDecimalSeparatorFor('DE')).toBe(',');
        expect(defaultDecimalSeparatorFor('FR')).toBe(',');
        expect(defaultDecimalSeparatorFor('EN')).toBe('.');
      });

      it('should handle mixed case locale codes', () => {
        expect(defaultDecimalSeparatorFor('De')).toBe(',');
        expect(defaultDecimalSeparatorFor('Fr-FR')).toBe(',');
        expect(defaultDecimalSeparatorFor('En-US')).toBe('.');
      });

      it('should handle uppercase region codes', () => {
        expect(defaultDecimalSeparatorFor('de-DE')).toBe(',');
        expect(defaultDecimalSeparatorFor('fr-FR')).toBe(',');
        expect(defaultDecimalSeparatorFor('PT-PT')).toBe(',');
        expect(defaultDecimalSeparatorFor('PT-BR')).toBe('.');
      });
    });

    describe('locales with script codes', () => {
      it('should return dot for zh-Hans-CN (Chinese Simplified China)', () => {
        expect(defaultDecimalSeparatorFor('zh-Hans-CN')).toBe('.');
      });

      it('should return dot for zh-Hant-TW (Chinese Traditional Taiwan)', () => {
        expect(defaultDecimalSeparatorFor('zh-Hant-TW')).toBe('.');
      });

      it('should return comma for sr-Cyrl-RS (Serbian Cyrillic Serbia)', () => {
        expect(defaultDecimalSeparatorFor('sr-Cyrl-RS')).toBe(',');
      });

      it('should return comma for sr-Latn-RS (Serbian Latin Serbia)', () => {
        expect(defaultDecimalSeparatorFor('sr-Latn-RS')).toBe(',');
      });
    });

    describe('edge cases - null, undefined, empty', () => {
      it('should return dot for null', () => {
        expect(defaultDecimalSeparatorFor(null)).toBe('.');
      });

      it('should return dot for undefined', () => {
        expect(defaultDecimalSeparatorFor(undefined)).toBe('.');
      });

      it('should return dot for empty string', () => {
        expect(defaultDecimalSeparatorFor('')).toBe('.');
      });

      it('should return dot for whitespace-only string', () => {
        expect(defaultDecimalSeparatorFor('   ')).toBe('.');
      });
    });

    describe('edge cases - non-string types', () => {
      it('should return dot for number', () => {
        // @ts-expect-error - Testing invalid input
        expect(defaultDecimalSeparatorFor(123)).toBe('.');
      });

      it('should return dot for boolean', () => {
        // @ts-expect-error - Testing invalid input
        expect(defaultDecimalSeparatorFor(true)).toBe('.');
      });

      it('should return dot for object', () => {
        // @ts-expect-error - Testing invalid input
        expect(defaultDecimalSeparatorFor({})).toBe('.');
      });

      it('should return dot for array', () => {
        // @ts-expect-error - Testing invalid input
        expect(defaultDecimalSeparatorFor([])).toBe('.');
      });

      it('should return dot for function', () => {
        // @ts-expect-error - Testing invalid input
        expect(defaultDecimalSeparatorFor(() => {})).toBe('.');
      });
    });

    describe('malformed locale strings', () => {
      it('should still extract primary language code from double hyphen (de--DE)', () => {
        // The function splits on '-', so 'de--DE' becomes ['de', '', 'DE']
        // and primary = 'de', which is in the comma list
        expect(defaultDecimalSeparatorFor('de--DE')).toBe(',');
      });

      it('should return dot for leading hyphen (-de)', () => {
        // '-de' splits to ['', 'de'], primary = '', not in list
        expect(defaultDecimalSeparatorFor('-de')).toBe('.');
      });

      it('should still extract primary language code from trailing hyphen (de-)', () => {
        // 'de-' splits to ['de', ''], primary = 'de', which is in the comma list
        expect(defaultDecimalSeparatorFor('de-')).toBe(',');
      });

      it('should return dot for invalid locale code (xxx)', () => {
        expect(defaultDecimalSeparatorFor('xxx')).toBe('.');
      });

      it('should return dot for invalid locale with region (xx-YY)', () => {
        expect(defaultDecimalSeparatorFor('xx-YY')).toBe('.');
      });

      it('should return dot for underscore instead of hyphen (de_DE)', () => {
        // 'de_DE' is not split (no hyphen), so primary = 'de_de' (after lowercase)
        // which is not in the list
        expect(defaultDecimalSeparatorFor('de_DE')).toBe('.');
      });
    });

    describe('unknown but valid locales', () => {
      it('should return dot for unknown language codes', () => {
        expect(defaultDecimalSeparatorFor('sw')).toBe('.'); // Swahili
        expect(defaultDecimalSeparatorFor('af')).toBe('.'); // Afrikaans
        expect(defaultDecimalSeparatorFor('ms')).toBe('.'); // Malay
      });
    });
  });

  describe('isCommaLocale', () => {
    describe('comma locales', () => {
      it('should return true for German', () => {
        expect(isCommaLocale('de')).toBe(true);
        expect(isCommaLocale('de-DE')).toBe(true);
      });

      it('should return true for French', () => {
        expect(isCommaLocale('fr')).toBe(true);
        expect(isCommaLocale('fr-FR')).toBe(true);
      });

      it('should return true for Italian', () => {
        expect(isCommaLocale('it')).toBe(true);
        expect(isCommaLocale('it-IT')).toBe(true);
      });

      it('should return true for Spanish', () => {
        expect(isCommaLocale('es')).toBe(true);
        expect(isCommaLocale('es-ES')).toBe(true);
      });

      it('should return true for Portuguese Portugal', () => {
        expect(isCommaLocale('pt-PT')).toBe(true);
        expect(isCommaLocale('pt-pt')).toBe(true);
      });
    });

    describe('dot locales', () => {
      it('should return false for English', () => {
        expect(isCommaLocale('en')).toBe(false);
        expect(isCommaLocale('en-US')).toBe(false);
      });

      it('should return false for Portuguese Brazil', () => {
        expect(isCommaLocale('pt-BR')).toBe(false);
        expect(isCommaLocale('pt-br')).toBe(false);
      });

      it('should return false for Japanese', () => {
        expect(isCommaLocale('ja')).toBe(false);
      });

      it('should return false for Chinese', () => {
        expect(isCommaLocale('zh')).toBe(false);
        expect(isCommaLocale('zh-CN')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should return false for null', () => {
        expect(isCommaLocale(null)).toBe(false);
      });

      it('should return false for undefined', () => {
        expect(isCommaLocale(undefined)).toBe(false);
      });

      it('should return false for empty string', () => {
        expect(isCommaLocale('')).toBe(false);
      });

      it('should return false for non-string types', () => {
        // @ts-expect-error - Testing invalid input
        expect(isCommaLocale(123)).toBe(false);
        // @ts-expect-error - Testing invalid input
        expect(isCommaLocale({})).toBe(false);
        // @ts-expect-error - Testing invalid input
        expect(isCommaLocale([])).toBe(false);
      });

      it('should handle malformed locale strings consistently with defaultDecimalSeparatorFor', () => {
        // These behave according to the primary language code extraction logic
        expect(isCommaLocale('de--DE')).toBe(true); // primary = 'de'
        expect(isCommaLocale('-de')).toBe(false); // primary = ''
        expect(isCommaLocale('de-')).toBe(true); // primary = 'de'
      });
    });

    describe('case insensitivity', () => {
      it('should handle uppercase comma locales', () => {
        expect(isCommaLocale('DE')).toBe(true);
        expect(isCommaLocale('FR')).toBe(true);
      });

      it('should handle uppercase dot locales', () => {
        expect(isCommaLocale('EN')).toBe(false);
        expect(isCommaLocale('PT-BR')).toBe(false);
      });

      it('should handle mixed case', () => {
        expect(isCommaLocale('De-DE')).toBe(true);
        expect(isCommaLocale('En-US')).toBe(false);
      });
    });
  });

  describe('consistency between functions', () => {
    const testCases = [
      // Comma locales
      { locale: 'de', expectedSeparator: ',', expectedIsComma: true },
      { locale: 'fr', expectedSeparator: ',', expectedIsComma: true },
      { locale: 'it', expectedSeparator: ',', expectedIsComma: true },
      { locale: 'de-DE', expectedSeparator: ',', expectedIsComma: true },
      { locale: 'pt-PT', expectedSeparator: ',', expectedIsComma: true },
      // Dot locales
      { locale: 'en', expectedSeparator: '.', expectedIsComma: false },
      { locale: 'en-US', expectedSeparator: '.', expectedIsComma: false },
      { locale: 'pt-BR', expectedSeparator: '.', expectedIsComma: false },
      { locale: 'ja', expectedSeparator: '.', expectedIsComma: false },
      { locale: 'zh', expectedSeparator: '.', expectedIsComma: false },
      // Edge cases
      { locale: null, expectedSeparator: '.', expectedIsComma: false },
      { locale: undefined, expectedSeparator: '.', expectedIsComma: false },
      { locale: '', expectedSeparator: '.', expectedIsComma: false },
    ];

    testCases.forEach(({ locale, expectedSeparator, expectedIsComma }) => {
      it(`should be consistent for locale: ${locale === null ? 'null' : locale === undefined ? 'undefined' : locale === '' ? '(empty)' : locale}`, () => {
        const separator = defaultDecimalSeparatorFor(locale);
        const isComma = isCommaLocale(locale);

        expect(separator).toBe(expectedSeparator);
        expect(isComma).toBe(expectedIsComma);
        expect(isComma).toBe(separator === ',');
      });
    });
  });
});
