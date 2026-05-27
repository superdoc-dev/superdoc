/**
 * Tests for Link/Hyperlink Utilities Module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  VALID_LINK_TARGETS,
  toTrimmedString,
  toOptionalBoolean,
  migrateLegacyLink,
  buildFlowRunLink,
} from './links.js';
import type { FlowRunLinkMetadata as FlowRunLink } from '../types.js';
import * as urlValidation from '@superdoc/url-validation';

// Mock the url-validation module
vi.mock('@superdoc/url-validation', () => ({
  sanitizeHref: vi.fn((href: string) => ({
    href,
    isValid: true,
  })),
}));

describe('links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== VALID_LINK_TARGETS Tests ====================
  describe('VALID_LINK_TARGETS', () => {
    it('should contain all valid HTML link target values', () => {
      expect(VALID_LINK_TARGETS.has('_blank')).toBe(true);
      expect(VALID_LINK_TARGETS.has('_self')).toBe(true);
      expect(VALID_LINK_TARGETS.has('_parent')).toBe(true);
      expect(VALID_LINK_TARGETS.has('_top')).toBe(true);
    });

    it('should be a Set', () => {
      expect(VALID_LINK_TARGETS).toBeInstanceOf(Set);
    });

    it('should have exactly 4 entries', () => {
      expect(VALID_LINK_TARGETS.size).toBe(4);
    });

    it('should not contain invalid targets', () => {
      expect(VALID_LINK_TARGETS.has('_invalid')).toBe(false);
      expect(VALID_LINK_TARGETS.has('blank')).toBe(false);
      expect(VALID_LINK_TARGETS.has('')).toBe(false);
    });
  });

  // ==================== toTrimmedString Tests ====================
  describe('toTrimmedString', () => {
    it('should return trimmed string for valid input', () => {
      expect(toTrimmedString('  hello  ')).toBe('hello');
      expect(toTrimmedString('world')).toBe('world');
    });

    it('should return undefined for empty string', () => {
      expect(toTrimmedString('')).toBeUndefined();
    });

    it('should return undefined for whitespace-only string', () => {
      expect(toTrimmedString('   ')).toBeUndefined();
      expect(toTrimmedString('\t')).toBeUndefined();
      expect(toTrimmedString('\n')).toBeUndefined();
    });

    it('should return undefined for non-string values', () => {
      expect(toTrimmedString(null)).toBeUndefined();
      expect(toTrimmedString(undefined)).toBeUndefined();
      expect(toTrimmedString(123)).toBeUndefined();
      expect(toTrimmedString(true)).toBeUndefined();
      expect(toTrimmedString([])).toBeUndefined();
      expect(toTrimmedString({})).toBeUndefined();
    });

    it('should trim from both ends', () => {
      expect(toTrimmedString('  test string  ')).toBe('test string');
      expect(toTrimmedString('\n\ttest\n\t')).toBe('test');
    });

    it('should preserve internal whitespace', () => {
      expect(toTrimmedString('  hello   world  ')).toBe('hello   world');
      expect(toTrimmedString('  a b c  ')).toBe('a b c');
    });
  });

  // ==================== toOptionalBoolean Tests ====================
  describe('toOptionalBoolean', () => {
    it('should return boolean values as-is', () => {
      expect(toOptionalBoolean(true)).toBe(true);
      expect(toOptionalBoolean(false)).toBe(false);
    });

    it('should convert truthy string values', () => {
      expect(toOptionalBoolean('true')).toBe(true);
      expect(toOptionalBoolean('True')).toBe(true);
      expect(toOptionalBoolean('TRUE')).toBe(true);
      expect(toOptionalBoolean('1')).toBe(true);
      expect(toOptionalBoolean('yes')).toBe(true);
      expect(toOptionalBoolean('YES')).toBe(true);
      expect(toOptionalBoolean('on')).toBe(true);
      expect(toOptionalBoolean('ON')).toBe(true);
    });

    it('should convert falsy string values', () => {
      expect(toOptionalBoolean('false')).toBe(false);
      expect(toOptionalBoolean('False')).toBe(false);
      expect(toOptionalBoolean('FALSE')).toBe(false);
      expect(toOptionalBoolean('0')).toBe(false);
      expect(toOptionalBoolean('no')).toBe(false);
      expect(toOptionalBoolean('NO')).toBe(false);
      expect(toOptionalBoolean('off')).toBe(false);
      expect(toOptionalBoolean('OFF')).toBe(false);
    });

    it('should handle string values with whitespace', () => {
      expect(toOptionalBoolean('  true  ')).toBe(true);
      expect(toOptionalBoolean('  false  ')).toBe(false);
      expect(toOptionalBoolean('  yes  ')).toBe(true);
      expect(toOptionalBoolean('  no  ')).toBe(false);
    });

    it('should return undefined for empty string', () => {
      expect(toOptionalBoolean('')).toBeUndefined();
      expect(toOptionalBoolean('   ')).toBeUndefined();
    });

    it('should return undefined for unrecognized string values', () => {
      expect(toOptionalBoolean('maybe')).toBeUndefined();
      expect(toOptionalBoolean('invalid')).toBeUndefined();
      expect(toOptionalBoolean('2')).toBeUndefined();
      expect(toOptionalBoolean('nope')).toBeUndefined();
    });

    it('should return undefined for non-string, non-boolean values', () => {
      expect(toOptionalBoolean(null)).toBeUndefined();
      expect(toOptionalBoolean(undefined)).toBeUndefined();
      expect(toOptionalBoolean(1)).toBeUndefined();
      expect(toOptionalBoolean(0)).toBeUndefined();
      expect(toOptionalBoolean([])).toBeUndefined();
      expect(toOptionalBoolean({})).toBeUndefined();
    });

    it('should be case-insensitive', () => {
      expect(toOptionalBoolean('TrUe')).toBe(true);
      expect(toOptionalBoolean('FaLsE')).toBe(false);
      expect(toOptionalBoolean('YeS')).toBe(true);
      expect(toOptionalBoolean('nO')).toBe(false);
    });
  });

  // ==================== migrateLegacyLink Tests ====================
  describe('migrateLegacyLink', () => {
    it('should return v2 link as-is', () => {
      const v2Link: FlowRunLink = {
        version: 2,
        href: 'https://example.com',
        title: 'Example',
      };

      const result = migrateLegacyLink(v2Link);

      expect(result).toBe(v2Link);
      expect(result.version).toBe(2);
    });

    it('should migrate v1 link with href and title', () => {
      const v1Link: FlowRunLink = {
        href: 'https://example.com',
        title: 'Example',
      };

      const result = migrateLegacyLink(v1Link);

      expect(result.version).toBe(2);
      expect(result.href).toBe('https://example.com');
      expect(result.title).toBe('Example');
    });

    it('should migrate v1 link with only href', () => {
      const v1Link: FlowRunLink = {
        href: 'https://example.com',
      };

      const result = migrateLegacyLink(v1Link);

      expect(result.version).toBe(2);
      expect(result.href).toBe('https://example.com');
      expect(result.title).toBeUndefined();
    });

    it('should migrate v1 link with no optional properties', () => {
      const v1Link: FlowRunLink = {};

      const result = migrateLegacyLink(v1Link);

      expect(result.version).toBe(2);
      expect(result.href).toBeUndefined();
      expect(result.title).toBeUndefined();
    });

    it('should create a new link object', () => {
      const v1Link: FlowRunLink = {
        href: 'https://example.com',
        title: 'Example',
      };

      const result = migrateLegacyLink(v1Link);

      expect(result).not.toBe(v1Link);
    });

    it('should preserve href when migrating', () => {
      const v1Link: FlowRunLink = {
        href: 'https://different.com/path',
        title: 'Different Title',
      };

      const result = migrateLegacyLink(v1Link);

      expect(result.href).toBe('https://different.com/path');
    });

    it('should preserve title when migrating', () => {
      const v1Link: FlowRunLink = {
        href: 'https://example.com',
        title: 'Custom Title Text',
      };

      const result = migrateLegacyLink(v1Link);

      expect(result.title).toBe('Custom Title Text');
    });
  });

  // ==================== buildFlowRunLink Tests ====================
  describe('buildFlowRunLink', () => {
    beforeEach(() => {
      vi.mocked(urlValidation.sanitizeHref).mockImplementation(
        (href: string) =>
          ({
            href,
            isValid: true,
          }) as never,
      );
    });

    it('should return null when no link properties are provided', () => {
      const result = buildFlowRunLink({});

      expect(result).toBeNull();
    });

    it('should return null when only empty/invalid properties are provided', () => {
      expect(buildFlowRunLink({ href: '', title: '   ' })).toBeNull();
      expect(buildFlowRunLink({ href: null, anchor: undefined })).toBeNull();
      expect(buildFlowRunLink({ name: '', docLocation: '   ' })).toBeNull();
    });

    it('should build link with href only', () => {
      const result = buildFlowRunLink({ href: 'https://example.com' });

      expect(result).not.toBeNull();
      expect(result!.version).toBe(2);
      expect(result!.href).toBe('https://example.com');
    });

    it('should build link with href and title', () => {
      const result = buildFlowRunLink({ href: 'https://example.com', title: 'Example Link' });

      expect(result).not.toBeNull();
      expect(result!.href).toBe('https://example.com');
      expect(result!.title).toBe('Example Link');
    });

    it('should sanitize href', () => {
      vi.mocked(urlValidation.sanitizeHref).mockReturnValue({ href: 'https://sanitized.com' } as never);

      const result = buildFlowRunLink({ href: 'https://example.com' });

      expect(urlValidation.sanitizeHref).toHaveBeenCalledWith('https://example.com');
      expect(result!.href).toBe('https://sanitized.com');
    });

    it('should handle empty href after trimming', () => {
      const result = buildFlowRunLink({ href: '   ', anchor: 'section1' });

      expect(result).not.toBeNull();
      expect(result!.href).toBeUndefined();
      expect(result!.anchor).toBe('section1');
    });

    it('should trim title', () => {
      const result = buildFlowRunLink({ href: 'https://example.com', title: '  Title Text  ' });

      expect(result!.title).toBe('Title Text');
    });

    it('should add tooltip', () => {
      const result = buildFlowRunLink({ href: 'https://example.com', tooltip: '  Hover Text  ' });

      expect(result!.tooltip).toBe('Hover Text');
    });

    it('should add valid target', () => {
      const result = buildFlowRunLink({ href: 'https://example.com', target: '_blank' });

      expect(result!.target).toBe('_blank');
    });

    it('should not add invalid target', () => {
      const result = buildFlowRunLink({ href: 'https://example.com', target: 'invalid' });

      expect(result!.target).toBeUndefined();
    });

    it('should handle all valid targets', () => {
      expect(buildFlowRunLink({ href: 'https://example.com', target: '_blank' })!.target).toBe('_blank');
      expect(buildFlowRunLink({ href: 'https://example.com', target: '_self' })!.target).toBe('_self');
      expect(buildFlowRunLink({ href: 'https://example.com', target: '_parent' })!.target).toBe('_parent');
      expect(buildFlowRunLink({ href: 'https://example.com', target: '_top' })!.target).toBe('_top');
    });

    it('should trim target before validation', () => {
      const result = buildFlowRunLink({ href: 'https://example.com', target: '  _blank  ' });

      expect(result!.target).toBe('_blank');
    });

    it('should add rel attribute', () => {
      const result = buildFlowRunLink({ href: 'https://example.com', rel: 'noopener noreferrer' });

      expect(result!.rel).toBe('noopener noreferrer');
    });

    it('should add anchor', () => {
      const result = buildFlowRunLink({ anchor: '  section1  ' });

      expect(result!.anchor).toBe('section1');
    });

    it('should add name (legacy)', () => {
      const result = buildFlowRunLink({ name: '  bookmark  ' });

      expect(result!.name).toBe('bookmark');
    });

    it('should add docLocation', () => {
      const result = buildFlowRunLink({ docLocation: '  /path/to/doc  ' });

      expect(result!.docLocation).toBe('/path/to/doc');
    });

    it('should add rId', () => {
      const result = buildFlowRunLink({ rId: '  rId123  ' });

      expect(result!.rId).toBe('rId123');
    });

    it('should handle history true', () => {
      const result = buildFlowRunLink({ href: 'https://example.com', history: true });

      expect(result!.history).toBe(true);
    });

    it('should handle history false', () => {
      const result = buildFlowRunLink({ href: 'https://example.com', history: false });

      expect(result!.history).toBe(false);
    });

    it('should handle history string values', () => {
      expect(buildFlowRunLink({ href: 'https://example.com', history: 'true' })!.history).toBe(true);
      expect(buildFlowRunLink({ href: 'https://example.com', history: 'false' })!.history).toBe(false);
    });

    it('should not add history if undefined', () => {
      const result = buildFlowRunLink({ href: 'https://example.com', history: 'invalid' });

      expect(result!.history).toBeUndefined();
    });

    it('should build complete link with all properties', () => {
      const result = buildFlowRunLink({
        href: 'https://example.com',
        title: 'Example',
        tooltip: 'Click here',
        target: '_blank',
        rel: 'noopener',
        anchor: 'section1',
        name: 'myBookmark',
        docLocation: '/path',
        rId: 'rId123',
        history: true,
      });

      expect(result).not.toBeNull();
      expect(result!.version).toBe(2);
      expect(result!.href).toBe('https://example.com');
      expect(result!.title).toBe('Example');
      expect(result!.tooltip).toBe('Click here');
      expect(result!.target).toBe('_blank');
      expect(result!.rel).toBe('noopener');
      expect(result!.anchor).toBe('section1');
      expect(result!.name).toBe('myBookmark');
      expect(result!.docLocation).toBe('/path');
      expect(result!.rId).toBe('rId123');
      expect(result!.history).toBe(true);
    });

    it('should require at least one link property', () => {
      expect(buildFlowRunLink({ href: 'https://example.com' })).not.toBeNull();
      expect(buildFlowRunLink({ anchor: 'section' })).not.toBeNull();
      expect(buildFlowRunLink({ name: 'bookmark' })).not.toBeNull();
      expect(buildFlowRunLink({ docLocation: '/path' })).not.toBeNull();
      expect(buildFlowRunLink({ rId: 'rId123' })).not.toBeNull();
    });

    it('should handle whitespace-only properties as missing', () => {
      const result = buildFlowRunLink({
        href: '   ',
        title: '   ',
        anchor: '   ',
        name: '   ',
      });

      expect(result).toBeNull();
    });

    it('should handle mixed valid and invalid properties', () => {
      const result = buildFlowRunLink({
        href: 'https://example.com',
        title: '   ',
        target: 'invalid',
        anchor: '   ',
        name: 'bookmark',
      });

      expect(result).not.toBeNull();
      expect(result!.href).toBe('https://example.com');
      expect(result!.title).toBeUndefined();
      expect(result!.target).toBeUndefined();
      expect(result!.anchor).toBeUndefined();
      expect(result!.name).toBe('bookmark');
    });

    it('should create version 2 link', () => {
      const result = buildFlowRunLink({ href: 'https://example.com' });

      expect(result!.version).toBe(2);
    });

    it('should not add properties with undefined values to result', () => {
      const result = buildFlowRunLink({ href: 'https://example.com' });

      expect('tooltip' in result!).toBe(false);
      expect('target' in result!).toBe(false);
      expect('rel' in result!).toBe(false);
      expect('anchor' in result!).toBe(false);
    });

    it('should handle null values in attrs', () => {
      const result = buildFlowRunLink({
        href: 'https://example.com',
        title: null,
        tooltip: null,
        target: null,
      });

      expect(result).not.toBeNull();
      expect(result!.href).toBe('https://example.com');
      expect(result!.title).toBeUndefined();
    });

    it('should handle empty string href without calling sanitizer', () => {
      const result = buildFlowRunLink({ href: '' });

      expect(urlValidation.sanitizeHref).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should handle whitespace-only href without calling sanitizer', () => {
      const result = buildFlowRunLink({ href: '   ' });

      expect(urlValidation.sanitizeHref).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return null if only sanitized href is null', () => {
      vi.mocked(urlValidation.sanitizeHref).mockReturnValue(null as never);

      const result = buildFlowRunLink({ href: 'https://example.com' });

      expect(result).toBeNull();
    });

    it('should preserve order of property additions', () => {
      const result = buildFlowRunLink({
        rId: 'rId123',
        docLocation: '/path',
        name: 'bookmark',
        anchor: 'section',
        rel: 'noopener',
        target: '_blank',
        tooltip: 'Hover text',
        title: 'Title',
        href: 'https://example.com',
        history: true,
      });

      expect(result).not.toBeNull();
      expect(Object.keys(result!)).toContain('version');
      expect(Object.keys(result!)).toContain('href');
    });
  });
});
