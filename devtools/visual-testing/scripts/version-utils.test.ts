import { describe, it, expect } from 'vitest';
import {
  isPathLikeVersion,
  versionLabelFromPath,
  normalizeVersionLabel,
  normalizeVersionSpecifier,
  parseVersionInput,
} from './version-utils.js';

describe('isPathLikeVersion', () => {
  it('should return false for empty string', () => {
    expect(isPathLikeVersion('')).toBe(false);
    expect(isPathLikeVersion('   ')).toBe(false);
  });

  it('should return true for file: prefix', () => {
    expect(isPathLikeVersion('file:../superdoc')).toBe(true);
    expect(isPathLikeVersion('file:/home/user/superdoc')).toBe(true);
  });

  it('should return true for tilde paths', () => {
    expect(isPathLikeVersion('~/dev/superdoc')).toBe(true);
    expect(isPathLikeVersion('~')).toBe(true);
  });

  it('should return true for relative paths', () => {
    expect(isPathLikeVersion('./superdoc')).toBe(true);
    expect(isPathLikeVersion('../superdoc')).toBe(true);
    expect(isPathLikeVersion('path/to/superdoc')).toBe(true);
  });

  it('should return true for absolute paths', () => {
    expect(isPathLikeVersion('/home/user/superdoc')).toBe(true);
  });

  it('should return false for version strings', () => {
    expect(isPathLikeVersion('1.4.0')).toBe(false);
    expect(isPathLikeVersion('1.4.0-next.3')).toBe(false);
    expect(isPathLikeVersion('v.1.4.0')).toBe(false);
    expect(isPathLikeVersion('^1.4.0')).toBe(false);
  });
});

describe('versionLabelFromPath', () => {
  it('should extract basename from path', () => {
    expect(versionLabelFromPath('/home/user/superdoc')).toBe('superdoc');
    expect(versionLabelFromPath('./superdoc')).toBe('superdoc');
  });

  it('should handle file: prefix', () => {
    expect(versionLabelFromPath('file:../superdoc')).toBe('superdoc');
    expect(versionLabelFromPath('file:/home/user/superdoc')).toBe('superdoc');
  });

  it('should strip tarball extensions', () => {
    expect(versionLabelFromPath('/path/to/superdoc-1.4.0.tgz')).toBe('superdoc-1.4.0');
    expect(versionLabelFromPath('/path/to/superdoc-1.4.0.tar.gz')).toBe('superdoc-1.4.0');
  });

  it('should handle trailing slashes', () => {
    expect(versionLabelFromPath('/home/user/superdoc/')).toBe('superdoc');
    expect(versionLabelFromPath('/home/user/superdoc//')).toBe('superdoc');
  });

  it('should return default for empty basename', () => {
    expect(versionLabelFromPath('')).toBe('local-superdoc');
  });
});

describe('normalizeVersionLabel', () => {
  it('should add v. prefix to version strings', () => {
    expect(normalizeVersionLabel('1.4.0')).toBe('v.1.4.0');
    expect(normalizeVersionLabel('1.4.0-next.3')).toBe('v.1.4.0-next.3');
  });

  it('should not double-prefix', () => {
    expect(normalizeVersionLabel('v.1.4.0')).toBe('v.1.4.0');
  });

  it('should extract label from path', () => {
    expect(normalizeVersionLabel('/home/user/superdoc')).toBe('superdoc');
    expect(normalizeVersionLabel('file:../superdoc')).toBe('superdoc');
  });
});

describe('normalizeVersionSpecifier', () => {
  it('should return version without v. prefix', () => {
    expect(normalizeVersionSpecifier('v.1.4.0')).toBe('1.4.0');
    expect(normalizeVersionSpecifier('1.4.0')).toBe('1.4.0');
  });

  it('should return path as-is', () => {
    expect(normalizeVersionSpecifier('/home/user/superdoc')).toBe('/home/user/superdoc');
    expect(normalizeVersionSpecifier('file:../superdoc')).toBe('file:../superdoc');
  });
});

describe('parseVersionInput', () => {
  it('should parse version strings', () => {
    const result = parseVersionInput('1.4.0');
    expect(result.label).toBe('v.1.4.0');
    expect(result.spec).toBe('1.4.0');
  });

  it('should handle v. prefixed versions', () => {
    const result = parseVersionInput('v.1.4.0');
    expect(result.label).toBe('v.1.4.0');
    expect(result.spec).toBe('1.4.0');
  });

  it('should parse paths', () => {
    const result = parseVersionInput('/home/user/superdoc');
    expect(result.label).toBe('superdoc');
    expect(result.spec).toBe('/home/user/superdoc');
  });

  it('should parse file: prefixed paths', () => {
    const result = parseVersionInput('file:../superdoc');
    expect(result.label).toBe('superdoc');
    expect(result.spec).toBe('file:../superdoc');
  });

  it('should parse tarball paths', () => {
    const result = parseVersionInput('/path/to/superdoc-1.4.0.tgz');
    expect(result.label).toBe('superdoc-1.4.0');
    expect(result.spec).toBe('/path/to/superdoc-1.4.0.tgz');
  });
});
