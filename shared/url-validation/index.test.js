import { describe, expect, it, beforeEach, afterEach, spyOn } from 'bun:test';
import { sanitizeHref, encodeTooltip, UrlValidationConstants, buildAllowedProtocols } from './index.js';

describe('url-validation', () => {
  describe('sanitizeHref', () => {
    it('allows fully-qualified https URLs', () => {
      const result = sanitizeHref('https://example.com');
      expect(result).toBeTruthy();
      expect(result?.href).toBe('https://example.com');
      expect(result?.protocol).toBe('https');
      expect(result?.isExternal).toBe(true);
    });

    it('rejects relative paths and bare hostnames', () => {
      expect(sanitizeHref('/docs/page')).toBeNull();
      expect(sanitizeHref('www.example.com')).toBeNull();
      expect(sanitizeHref('./foo')).toBeNull();
    });

    it('allows anchors with valid characters', () => {
      const result = sanitizeHref('#section-1');
      expect(result).toEqual({ href: '#section-1', protocol: null, isExternal: false });
    });

    it('SECURITY: rejects anchors with colons to prevent ambiguity', () => {
      // Colons removed from ANCHOR_NAME_PATTERN to align with DOM painter
      expect(sanitizeHref('#section:1')).toBeNull();
      expect(sanitizeHref('#http:foo')).toBeNull();
    });

    it('SECURITY: rejects anchors with unsafe characters', () => {
      expect(sanitizeHref('#section with spaces')).toBeNull();
      expect(sanitizeHref('#section"evil')).toBeNull();
      expect(sanitizeHref("#section'evil")).toBeNull();
      expect(sanitizeHref('#section<script>')).toBeNull();
    });

    it('allows anchors with dots, underscores, and hyphens', () => {
      expect(sanitizeHref('#section.1')).not.toBeNull();
      expect(sanitizeHref('#section_1')).not.toBeNull();
      expect(sanitizeHref('#section-1')).not.toBeNull();
      expect(sanitizeHref('#Section1')).not.toBeNull();
    });

    it('rejects blocked protocols', () => {
      expect(sanitizeHref('javascript:alert(1)')).toBeNull();
      expect(
        sanitizeHref('ftp://example.com/resource', {
          allowedProtocols: UrlValidationConstants.DEFAULT_ALLOWED_PROTOCOLS,
        }),
      ).toBeNull();
    });

    it('supports optional protocols when enabled', () => {
      const result = sanitizeHref('ftp://example.com/file', {
        optionalProtocols: ['ftp'],
      });
      expect(result?.protocol).toBe('ftp');
    });

    it('SECURITY: blocks dangerous protocols in optionalProtocols config', () => {
      // Critical security test: Ensure dangerous schemes can't bypass via optionalProtocols
      expect(
        sanitizeHref('javascript:alert(1)', {
          optionalProtocols: ['javascript'],
        }),
      ).toBeNull();

      expect(
        sanitizeHref('data:text/html,<script>alert(1)</script>', {
          optionalProtocols: ['data'],
        }),
      ).toBeNull();

      expect(
        sanitizeHref('vbscript:msgbox(1)', {
          optionalProtocols: ['vbscript'],
        }),
      ).toBeNull();
    });

    it('SECURITY: only allows whitelisted optional protocols', () => {
      // Should allow whitelisted optional protocols
      expect(
        sanitizeHref('ftp://example.com', {
          optionalProtocols: ['ftp'],
        }),
      ).not.toBeNull();

      expect(
        sanitizeHref('sftp://example.com', {
          optionalProtocols: ['sftp'],
        }),
      ).not.toBeNull();

      // Should silently ignore non-whitelisted protocols
      expect(
        sanitizeHref('custom://example.com', {
          optionalProtocols: ['custom'],
        }),
      ).toBeNull();
    });

    it('applies redirect blocklist by hostname', () => {
      expect(
        sanitizeHref('https://blocked.example.com/path', { redirectBlocklist: ['blocked.example.com'] }),
      ).toBeNull();
    });
  });

  describe('Query parameter XSS protection', () => {
    it('blocks URLs with < in query params', () => {
      expect(sanitizeHref('https://example.com?x=<script>alert(1)</script>')).toBeNull();
    });

    it('blocks URLs with > in query params', () => {
      expect(sanitizeHref('https://example.com?foo=bar>evil')).toBeNull();
    });

    it('blocks URLs with quotes in query params', () => {
      expect(sanitizeHref('https://example.com?x="evil"')).toBeNull();
      expect(sanitizeHref("https://example.com?x='evil'")).toBeNull();
    });

    it('allows safe query parameters', () => {
      const result = sanitizeHref('https://example.com?foo=bar&baz=123');
      expect(result).not.toBeNull();
      expect(result?.href).toBe('https://example.com?foo=bar&baz=123');
    });

    it('blocks attribute-breaking payloads', () => {
      expect(sanitizeHref('https://example.com" onclick="alert(1)')).toBeNull();
    });
  });

  describe('URL length enforcement', () => {
    it('should reject URLs exceeding default 2048 chars', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2100);
      expect(sanitizeHref(longUrl)).toBeNull();
    });

    it('should accept URLs at exactly 2048 chars', () => {
      const maxUrl = 'https://example.com/' + 'a'.repeat(2048 - 'https://example.com/'.length);
      const result = sanitizeHref(maxUrl);
      expect(result).not.toBeNull();
      expect(result?.href).toBe(maxUrl);
    });

    it('should respect custom maxLength config', () => {
      const url = 'https://example.com/' + 'a'.repeat(100);
      expect(sanitizeHref(url, { maxLength: 50 })).toBeNull();
      expect(sanitizeHref(url, { maxLength: 200 })).not.toBeNull();
    });

    it('should reject oversized URLs even with valid protocols', () => {
      const longHttps = 'https://example.com/' + 'a'.repeat(3000);
      const longMailto = 'mailto:' + 'test@example.com/' + 'a'.repeat(3000);
      expect(sanitizeHref(longHttps)).toBeNull();
      expect(sanitizeHref(longMailto)).toBeNull();
    });
  });

  describe('encodeTooltip', () => {
    it('trims whitespace and returns raw text (not HTML-encoded)', () => {
      const result = encodeTooltip('  "Test & <more>"  ');
      // Browser will handle escaping when setting as attribute value
      expect(result?.text).toBe('"Test & <more>"');
      expect(result?.wasTruncated).toBe(false);
    });

    it('truncates when text exceeds the max length', () => {
      const result = encodeTooltip('abcdef', 3);
      expect(result?.text).toBe('abc');
    });
  });

  describe('encodeTooltip truncation signaling', () => {
    it('should signal when tooltip is truncated', () => {
      const longText = 'a'.repeat(600);
      const result = encodeTooltip(longText, 500);
      expect(result?.text).toHaveLength(500);
      expect(result?.wasTruncated).toBe(true);
    });

    it('should not signal truncation for short text', () => {
      const shortText = 'This is short';
      const result = encodeTooltip(shortText, 500);
      expect(result?.text).toBe('This is short');
      expect(result?.wasTruncated).toBe(false);
    });

    it('should not signal truncation when exactly at limit', () => {
      const exactText = 'a'.repeat(500);
      const result = encodeTooltip(exactText, 500);
      expect(result?.text).toHaveLength(500);
      expect(result?.wasTruncated).toBe(false);
    });
  });

  describe('Homograph attack detection', () => {
    // Mock console.warn to verify warnings are logged
    let warnSpy;
    let originalEnv;

    beforeEach(() => {
      warnSpy = spyOn(console, 'warn').mockImplementation();
      originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
    });

    afterEach(() => {
      warnSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });

    it('should warn on Cyrillic homograph attack', () => {
      // раypal.com - Cyrillic 'а' instead of Latin 'a'
      const result = sanitizeHref('https://раypal.com');

      // Should still return the URL (we warn but don't block)
      expect(result).not.toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Potential homograph attack'));
    });

    it('should not warn on ASCII-only hostnames', () => {
      sanitizeHref('https://paypal.com');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should detect mixed-script domains', () => {
      // аpple.com - Cyrillic 'а' + Latin 'pple'
      sanitizeHref('https://аpple.com');
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('encodeTooltip edge cases', () => {
    it('should return null for null input', () => {
      expect(encodeTooltip(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(encodeTooltip(undefined)).toBeNull();
    });

    it('should return null for non-string input (number)', () => {
      expect(encodeTooltip(123)).toBeNull();
    });

    it('should return null for non-string input (object)', () => {
      expect(encodeTooltip({})).toBeNull();
    });

    it('should return null for non-string input (array)', () => {
      expect(encodeTooltip([])).toBeNull();
    });

    it('should handle zero maxLength gracefully', () => {
      const result = encodeTooltip('test', 0);
      expect(result?.text).toBe('test');
      expect(result?.wasTruncated).toBe(false);
    });

    it('should handle negative maxLength gracefully', () => {
      const result = encodeTooltip('test', -10);
      expect(result?.text).toBe('test');
      expect(result?.wasTruncated).toBe(false);
    });
  });

  describe('buildAllowedProtocols', () => {
    it('should return default protocols when no config provided', () => {
      const allowed = buildAllowedProtocols();
      expect(allowed.has('https')).toBe(true);
      expect(allowed.has('http')).toBe(true);
      expect(allowed.has('mailto')).toBe(true);
    });

    it('SECURITY: should only add whitelisted optional protocols', () => {
      const allowed = buildAllowedProtocols({
        optionalProtocols: ['ftp', 'javascript', 'data', 'vbscript', 'custom'],
      });
      // Should add whitelisted protocols
      expect(allowed.has('ftp')).toBe(true);
      // Should NOT add dangerous protocols
      expect(allowed.has('javascript')).toBe(false);
      expect(allowed.has('data')).toBe(false);
      expect(allowed.has('vbscript')).toBe(false);
      expect(allowed.has('custom')).toBe(false);
    });

    it('should handle case-insensitive protocol normalization', () => {
      const allowed = buildAllowedProtocols({
        optionalProtocols: ['FTP', 'SFTP'],
      });
      expect(allowed.has('ftp')).toBe(true);
      expect(allowed.has('sftp')).toBe(true);
    });

    it('should handle duplicate protocols', () => {
      const allowed = buildAllowedProtocols({
        optionalProtocols: ['ftp', 'FTP', 'ftp'],
      });
      expect(allowed.has('ftp')).toBe(true);
      expect(allowed.size).toBeGreaterThan(0);
    });

    it('should handle empty optionalProtocols array', () => {
      const allowed = buildAllowedProtocols({ optionalProtocols: [] });
      expect(allowed.has('https')).toBe(true);
      expect(allowed.has('http')).toBe(true);
    });

    it('CRITICAL: allowedProtocols should REPLACE defaults, not extend them', () => {
      // When allowedProtocols is provided, it completely overrides defaults
      const allowed = buildAllowedProtocols({
        allowedProtocols: ['https', 'mailto'],
      });

      // Should have only the specified protocols
      expect(allowed.has('https')).toBe(true);
      expect(allowed.has('mailto')).toBe(true);

      // Should NOT have default protocols that weren't specified
      expect(allowed.has('http')).toBe(false);
      expect(allowed.has('tel')).toBe(false);
      expect(allowed.has('sms')).toBe(false);
    });

    it('allowedProtocols override should respect case-insensitivity', () => {
      const allowed = buildAllowedProtocols({
        allowedProtocols: ['HTTPS', 'MailTo'],
      });

      expect(allowed.has('https')).toBe(true);
      expect(allowed.has('mailto')).toBe(true);
    });
  });

  describe('Custom allowedProtocols override in sanitizeHref', () => {
    it('should only allow protocols in custom allowedProtocols list', () => {
      const config = { allowedProtocols: ['https'] };

      // HTTPS should be allowed
      expect(sanitizeHref('https://example.com', config)).not.toBeNull();

      // HTTP should be blocked (not in custom list)
      expect(sanitizeHref('http://example.com', config)).toBeNull();

      // mailto should be blocked (not in custom list)
      expect(sanitizeHref('mailto:test@example.com', config)).toBeNull();
    });

    it('should allow combining allowedProtocols override with optionalProtocols', () => {
      const config = {
        allowedProtocols: ['https'],
        optionalProtocols: ['ftp'],
      };

      // HTTPS should be allowed (in allowedProtocols)
      expect(sanitizeHref('https://example.com', config)).not.toBeNull();

      // FTP should be allowed (in optionalProtocols)
      expect(sanitizeHref('ftp://example.com', config)).not.toBeNull();

      // HTTP should be blocked (not in custom allowedProtocols)
      expect(sanitizeHref('http://example.com', config)).toBeNull();
    });
  });

  describe('Blocklist with malformed entries', () => {
    it('should handle blocklist with null entries', () => {
      const config = { redirectBlocklist: ['evil.com', null, 'bad.com'] };
      expect(sanitizeHref('https://evil.com', config)).toBeNull();
      expect(sanitizeHref('https://bad.com', config)).toBeNull();
      expect(sanitizeHref('https://good.com', config)).not.toBeNull();
    });

    it('should handle blocklist with undefined entries', () => {
      const config = { redirectBlocklist: ['evil.com', undefined, 'bad.com'] };
      expect(sanitizeHref('https://evil.com', config)).toBeNull();
      expect(sanitizeHref('https://bad.com', config)).toBeNull();
      expect(sanitizeHref('https://good.com', config)).not.toBeNull();
    });

    it('should handle blocklist with non-string entries', () => {
      const config = { redirectBlocklist: ['evil.com', 123, true, {}, [], 'bad.com'] };
      expect(sanitizeHref('https://evil.com', config)).toBeNull();
      expect(sanitizeHref('https://bad.com', config)).toBeNull();
      expect(sanitizeHref('https://good.com', config)).not.toBeNull();
    });

    it('should handle blocklist with empty strings and whitespace', () => {
      const config = { redirectBlocklist: ['evil.com', '', '   ', 'bad.com'] };
      expect(sanitizeHref('https://evil.com', config)).toBeNull();
      expect(sanitizeHref('https://bad.com', config)).toBeNull();
      expect(sanitizeHref('https://good.com', config)).not.toBeNull();
    });

    it('should handle mixed valid and invalid blocklist entries', () => {
      const config = {
        redirectBlocklist: [null, 'tracker.com', undefined, '', '  ', 123, 'ads.example.com', true],
      };
      expect(sanitizeHref('https://tracker.com', config)).toBeNull();
      expect(sanitizeHref('https://ads.example.com', config)).toBeNull();
      expect(sanitizeHref('https://valid.com', config)).not.toBeNull();
    });
  });

  describe('Protocol-relative URLs', () => {
    it('should reject protocol-relative URLs (//example.com)', () => {
      expect(sanitizeHref('//example.com')).toBeNull();
      expect(sanitizeHref('//example.com/path')).toBeNull();
      expect(sanitizeHref('//example.com/path?query=value')).toBeNull();
    });

    it('should reject protocol-relative URLs with different hostnames', () => {
      expect(sanitizeHref('//cdn.example.com/script.js')).toBeNull();
      expect(sanitizeHref('//subdomain.example.org')).toBeNull();
    });
  });

  describe('Case-insensitive hostname blocking', () => {
    it('should block hostnames regardless of case in URL', () => {
      const config = { redirectBlocklist: ['evil.com'] };

      // Different case variations of the hostname
      expect(sanitizeHref('https://evil.com', config)).toBeNull();
      expect(sanitizeHref('https://Evil.com', config)).toBeNull();
      expect(sanitizeHref('https://EVIL.COM', config)).toBeNull();
      expect(sanitizeHref('https://eViL.CoM', config)).toBeNull();
    });

    it('should block hostnames regardless of case in blocklist', () => {
      const configLower = { redirectBlocklist: ['evil.com'] };
      const configUpper = { redirectBlocklist: ['EVIL.COM'] };
      const configMixed = { redirectBlocklist: ['EvIl.CoM'] };

      const testUrl = 'https://evil.com';
      expect(sanitizeHref(testUrl, configLower)).toBeNull();
      expect(sanitizeHref(testUrl, configUpper)).toBeNull();
      expect(sanitizeHref(testUrl, configMixed)).toBeNull();
    });

    it('should handle case-insensitive URL prefix blocking', () => {
      const config = { redirectBlocklist: ['https://ads.example.com/track'] };

      expect(sanitizeHref('https://ads.example.com/track', config)).toBeNull();
      expect(sanitizeHref('https://Ads.Example.com/track', config)).toBeNull();
      expect(sanitizeHref('https://ADS.EXAMPLE.COM/TRACK', config)).toBeNull();
    });
  });

  describe('Empty and whitespace-only anchors', () => {
    it('should reject standalone # (empty anchor)', () => {
      expect(sanitizeHref('#')).toBeNull();
    });

    it('should reject anchors with only whitespace after #', () => {
      expect(sanitizeHref('# ')).toBeNull();
      expect(sanitizeHref('#  ')).toBeNull();
      expect(sanitizeHref('#\t')).toBeNull();
      expect(sanitizeHref('#\n')).toBeNull();
    });

    it('should reject URLs that are only whitespace', () => {
      expect(sanitizeHref('   ')).toBeNull();
      expect(sanitizeHref('\t\t')).toBeNull();
      expect(sanitizeHref('\n\n')).toBeNull();
    });
  });

  describe('encodeTooltip NOT HTML-encoding', () => {
    it('should NOT encode ampersands (&)', () => {
      const result = encodeTooltip('Tom & Jerry');
      expect(result?.text).toBe('Tom & Jerry');
      expect(result?.text).not.toContain('&amp;');
    });

    it('should NOT encode quotes (")', () => {
      const result = encodeTooltip('Use "quotes" here');
      expect(result?.text).toBe('Use "quotes" here');
      expect(result?.text).not.toContain('&quot;');
    });

    it("should NOT encode single quotes (')", () => {
      const result = encodeTooltip("It's a test");
      expect(result?.text).toBe("It's a test");
      expect(result?.text).not.toContain('&#39;');
      expect(result?.text).not.toContain('&apos;');
    });

    it('should NOT encode angle brackets (< >)', () => {
      const result = encodeTooltip('Value < 10 and > 5');
      expect(result?.text).toBe('Value < 10 and > 5');
      expect(result?.text).not.toContain('&lt;');
      expect(result?.text).not.toContain('&gt;');
    });

    it('should NOT encode complex HTML-like content', () => {
      const result = encodeTooltip('<div class="test">Content & "more"</div>');
      expect(result?.text).toBe('<div class="test">Content & "more"</div>');
      // Verify no HTML entities are present
      expect(result?.text).not.toContain('&lt;');
      expect(result?.text).not.toContain('&gt;');
      expect(result?.text).not.toContain('&amp;');
      expect(result?.text).not.toContain('&quot;');
    });

    it('should preserve special characters exactly as provided', () => {
      const specialChars = '& < > " \' @ # $ % ^ * ( ) { } [ ] | \\ / ? + = ~ `';
      const result = encodeTooltip(specialChars);
      expect(result?.text).toBe(specialChars);
    });
  });
});
