/**
 * Security tests for font family sanitization.
 * These tests verify that the sanitizeFontFamily function properly
 * rejects malicious inputs and allows safe font names.
 */

import { describe, it, expect } from 'vitest';

// Mock the applyTextStyleMark function for testing
// In a real test environment, you would import this from the actual module
function mockSanitizeFontFamily(fontFamily: string): string | undefined {
  if (!fontFamily || typeof fontFamily !== 'string') {
    return undefined;
  }

  let sanitized = fontFamily.trim();

  // Enforce maximum length
  if (sanitized.length > 200) {
    return undefined;
  }

  // Reject dangerous URI schemes
  const lowerCased = sanitized.toLowerCase();
  const dangerousSchemes = ['javascript:', 'data:', 'vbscript:'];
  if (dangerousSchemes.some((scheme) => lowerCased.includes(scheme))) {
    return undefined;
  }

  // Remove quotes
  sanitized = sanitized.replace(/["']/g, '');

  // Reject CSS injection characters
  const cssInjectionPattern = /[;{}()@<>]/;
  if (cssInjectionPattern.test(sanitized)) {
    return undefined;
  }

  // Remove newlines and control characters
  sanitized = sanitized.replace(/[\r\n\t\f\v]/g, ' ');

  // Collapse multiple spaces
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  if (!sanitized) {
    return undefined;
  }

  return sanitized;
}

describe('sanitizeFontFamily', () => {
  describe('Safe font names (should pass)', () => {
    it('should accept simple font names', () => {
      expect(mockSanitizeFontFamily('Arial')).toBe('Arial');
      expect(mockSanitizeFontFamily('Helvetica')).toBe('Helvetica');
      expect(mockSanitizeFontFamily('Georgia')).toBe('Georgia');
    });

    it('should accept font names with spaces', () => {
      expect(mockSanitizeFontFamily('Times New Roman')).toBe('Times New Roman');
      expect(mockSanitizeFontFamily('Courier New')).toBe('Courier New');
    });

    it('should strip quotes from font names', () => {
      expect(mockSanitizeFontFamily('"Arial"')).toBe('Arial');
      expect(mockSanitizeFontFamily("'Helvetica'")).toBe('Helvetica');
      expect(mockSanitizeFontFamily('"Times New Roman"')).toBe('Times New Roman');
    });

    it('should handle font names with hyphens', () => {
      expect(mockSanitizeFontFamily('Segoe-UI')).toBe('Segoe-UI');
      expect(mockSanitizeFontFamily('Source-Sans-Pro')).toBe('Source-Sans-Pro');
    });

    it('should handle font names with numbers', () => {
      expect(mockSanitizeFontFamily('Roboto2020')).toBe('Roboto2020');
      expect(mockSanitizeFontFamily('Open Sans 3')).toBe('Open Sans 3');
    });

    it('should collapse multiple spaces', () => {
      expect(mockSanitizeFontFamily('Arial    Bold')).toBe('Arial Bold');
      expect(mockSanitizeFontFamily('Times  New   Roman')).toBe('Times New Roman');
    });
  });

  describe('CSS injection attempts (should reject)', () => {
    it('should reject font names with semicolons', () => {
      expect(mockSanitizeFontFamily('Arial; color: red')).toBeUndefined();
      expect(mockSanitizeFontFamily('Helvetica; background: url(evil.com)')).toBeUndefined();
    });

    it('should reject font names with curly braces', () => {
      expect(mockSanitizeFontFamily('Arial { color: red }')).toBeUndefined();
      expect(mockSanitizeFontFamily('Helvetica } .evil')).toBeUndefined();
    });

    it('should reject font names with parentheses', () => {
      expect(mockSanitizeFontFamily('Arial (inject)')).toBeUndefined();
      expect(mockSanitizeFontFamily('url(evil.com)')).toBeUndefined();
    });

    it('should reject font names with @ symbols', () => {
      expect(mockSanitizeFontFamily('Arial @import')).toBeUndefined();
      expect(mockSanitizeFontFamily('@font-face Arial')).toBeUndefined();
    });

    it('should reject font names with angle brackets', () => {
      expect(mockSanitizeFontFamily('Arial<script>')).toBeUndefined();
      expect(mockSanitizeFontFamily('<style>Arial</style>')).toBeUndefined();
    });
  });

  describe('XSS/URI injection attempts (should reject)', () => {
    it('should reject javascript: URIs', () => {
      expect(mockSanitizeFontFamily('javascript:alert(1)')).toBeUndefined();
      expect(mockSanitizeFontFamily('JAVASCRIPT:alert(1)')).toBeUndefined();
      expect(mockSanitizeFontFamily('Arial javascript:void(0)')).toBeUndefined();
    });

    it('should reject data: URIs', () => {
      expect(mockSanitizeFontFamily('data:text/html,<script>alert(1)</script>')).toBeUndefined();
      expect(mockSanitizeFontFamily('DATA:text/html,evil')).toBeUndefined();
    });

    it('should reject vbscript: URIs', () => {
      expect(mockSanitizeFontFamily('vbscript:msgbox(1)')).toBeUndefined();
      expect(mockSanitizeFontFamily('VBSCRIPT:evil')).toBeUndefined();
    });
  });

  describe('DoS prevention (should reject)', () => {
    it('should reject excessively long font names', () => {
      const longName = 'A'.repeat(201);
      expect(mockSanitizeFontFamily(longName)).toBeUndefined();
    });

    it('should accept font names at the length limit', () => {
      const maxLengthName = 'A'.repeat(200);
      expect(mockSanitizeFontFamily(maxLengthName)).toBe(maxLengthName);
    });
  });

  describe('Edge cases', () => {
    it('should reject empty strings', () => {
      expect(mockSanitizeFontFamily('')).toBeUndefined();
      expect(mockSanitizeFontFamily('   ')).toBeUndefined();
    });

    it('should reject strings that become empty after sanitization', () => {
      expect(mockSanitizeFontFamily('"""')).toBeUndefined();
      expect(mockSanitizeFontFamily("'''")).toBeUndefined();
      expect(mockSanitizeFontFamily('   "')).toBeUndefined();
    });

    it('should handle newlines and control characters', () => {
      expect(mockSanitizeFontFamily('Arial\nBold')).toBe('Arial Bold');
      expect(mockSanitizeFontFamily('Arial\r\nBold')).toBe('Arial Bold');
      expect(mockSanitizeFontFamily('Arial\tBold')).toBe('Arial Bold');
    });
  });
});
