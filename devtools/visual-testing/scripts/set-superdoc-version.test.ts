import { describe, it, expect, vi } from 'vitest';
import path from 'path';
import { toPosixPath, isSuperdocPackage, resolveSpecifier, type FsLike } from './set-superdoc-version.js';

describe('toPosixPath', () => {
  it('should convert path separators to forward slashes', () => {
    // On Unix, path.sep is '/', on Windows it's '\'
    // This test uses the actual path.sep to build a test case
    const input = ['foo', 'bar', 'baz'].join(path.sep);
    expect(toPosixPath(input)).toBe('foo/bar/baz');
  });

  it('should leave forward slashes unchanged', () => {
    expect(toPosixPath('foo/bar/baz')).toBe('foo/bar/baz');
  });

  it('should handle empty string', () => {
    expect(toPosixPath('')).toBe('');
  });

  it('should handle single segment', () => {
    expect(toPosixPath('foo')).toBe('foo');
  });
});

describe('isSuperdocPackage', () => {
  it('should return true for directory with superdoc package.json', () => {
    const mockFs: FsLike = {
      existsSync: vi.fn().mockReturnValue(true),
      readFileSync: vi.fn().mockReturnValue(JSON.stringify({ name: 'superdoc' })),
    };

    expect(isSuperdocPackage('/some/path', { fs: mockFs })).toBe(true);
    expect(mockFs.existsSync).toHaveBeenCalledWith(path.join('/some/path', 'package.json'));
  });

  it('should return false for directory without package.json', () => {
    const mockFs: FsLike = {
      existsSync: vi.fn().mockReturnValue(false),
      readFileSync: vi.fn(),
    };

    expect(isSuperdocPackage('/some/path', { fs: mockFs })).toBe(false);
  });

  it('should return false for directory with different package name', () => {
    const mockFs: FsLike = {
      existsSync: vi.fn().mockReturnValue(true),
      readFileSync: vi.fn().mockReturnValue(JSON.stringify({ name: 'other-package' })),
    };

    expect(isSuperdocPackage('/some/path', { fs: mockFs })).toBe(false);
  });

  it('should return false for invalid JSON', () => {
    const mockFs: FsLike = {
      existsSync: vi.fn().mockReturnValue(true),
      readFileSync: vi.fn().mockReturnValue('not valid json'),
    };

    expect(isSuperdocPackage('/some/path', { fs: mockFs })).toBe(false);
  });
});

describe('resolveSpecifier', () => {
  const rootDir = '/test/root';
  const harnessDir = '/test/root/packages/harness';

  describe('npm version strings', () => {
    it('should treat non-existent paths as npm versions', () => {
      const mockFs = {
        existsSync: vi.fn().mockReturnValue(false),
        readFileSync: vi.fn(),
        statSync: vi.fn(),
      };

      const result = resolveSpecifier('1.4.0', {
        rootDir,
        harnessDir,
        deps: { fs: mockFs },
      });

      expect(result).toEqual({
        specifier: '1.4.0',
        isFile: false,
        installPath: null,
      });
    });

    it('should handle prerelease versions', () => {
      const mockFs = {
        existsSync: vi.fn().mockReturnValue(false),
        readFileSync: vi.fn(),
        statSync: vi.fn(),
      };

      const result = resolveSpecifier('1.4.0-next.3', {
        rootDir,
        harnessDir,
        deps: { fs: mockFs },
      });

      expect(result).toEqual({
        specifier: '1.4.0-next.3',
        isFile: false,
        installPath: null,
      });
    });

    it('should handle caret ranges', () => {
      const mockFs = {
        existsSync: vi.fn().mockReturnValue(false),
        readFileSync: vi.fn(),
        statSync: vi.fn(),
      };

      const result = resolveSpecifier('^1.4.0', {
        rootDir,
        harnessDir,
        deps: { fs: mockFs },
      });

      expect(result).toEqual({
        specifier: '^1.4.0',
        isFile: false,
        installPath: null,
      });
    });
  });

  describe('workspace specifiers', () => {
    it('should resolve local to workspace', () => {
      const mockFs = {
        existsSync: vi.fn(),
        readFileSync: vi.fn(),
        statSync: vi.fn(),
      };

      const result = resolveSpecifier('local', {
        rootDir,
        harnessDir,
        deps: { fs: mockFs },
      });

      expect(result).toEqual({
        specifier: 'workspace:*',
        isFile: false,
        installPath: null,
      });
      expect(mockFs.existsSync).not.toHaveBeenCalled();
    });
  });

  describe('file: prefix', () => {
    it('should handle explicit file: prefix with existing path', () => {
      const mockFs = {
        existsSync: vi.fn().mockReturnValue(true),
        readFileSync: vi.fn(),
        statSync: vi.fn(),
      };

      const result = resolveSpecifier('file:../superdoc', {
        rootDir,
        harnessDir,
        deps: { fs: mockFs },
      });

      expect(result.specifier).toBe('file:../superdoc');
      expect(result.isFile).toBe(true);
      expect(result.installPath).toBeTruthy();
    });

    it('should handle explicit file: prefix with non-existent path', () => {
      const mockFs = {
        existsSync: vi.fn().mockReturnValue(false),
        readFileSync: vi.fn(),
        statSync: vi.fn(),
      };

      const result = resolveSpecifier('file:../nonexistent', {
        rootDir,
        harnessDir,
        deps: { fs: mockFs },
      });

      expect(result.specifier).toBe('file:../nonexistent');
      expect(result.isFile).toBe(true);
      expect(result.installPath).toBe(null);
    });
  });

  describe('local paths', () => {
    it('should detect superdoc package directory', () => {
      const superdocDir = path.join(rootDir, 'superdoc');

      const mockFs = {
        existsSync: vi.fn((p: string) => {
          if (p === superdocDir) return true;
          if (p === path.join(superdocDir, 'package.json')) return true;
          return false;
        }),
        statSync: vi.fn().mockReturnValue({ isDirectory: () => true }),
        readFileSync: vi.fn().mockReturnValue(JSON.stringify({ name: 'superdoc' })),
      };

      const result = resolveSpecifier('superdoc', {
        rootDir,
        harnessDir,
        deps: { fs: mockFs },
      });

      expect(result.isFile).toBe(true);
      expect(result.installPath).toBe(superdocDir);
      expect(result.specifier).toMatch(/^file:/);
    });

    it('should detect monorepo structure (packages/superdoc)', () => {
      const monorepoDir = path.join(rootDir, 'superdoc-monorepo');
      const packagesSuperdocDir = path.join(monorepoDir, 'packages', 'superdoc');

      const mockFs = {
        existsSync: vi.fn((p: string) => {
          if (p === monorepoDir) return true;
          if (p === path.join(monorepoDir, 'package.json')) return true;
          if (p === packagesSuperdocDir) return true;
          if (p === path.join(packagesSuperdocDir, 'package.json')) return true;
          return false;
        }),
        statSync: vi.fn().mockReturnValue({ isDirectory: () => true }),
        readFileSync: vi.fn((p: string) => {
          if (p === path.join(monorepoDir, 'package.json')) {
            return JSON.stringify({ name: 'superdoc-monorepo' });
          }
          if (p === path.join(packagesSuperdocDir, 'package.json')) {
            return JSON.stringify({ name: 'superdoc' });
          }
          return '{}';
        }),
      };

      const result = resolveSpecifier('superdoc-monorepo', {
        rootDir,
        harnessDir,
        deps: { fs: mockFs },
      });

      expect(result.isFile).toBe(true);
      expect(result.installPath).toBe(packagesSuperdocDir);
      expect(result.specifier).toMatch(/^file:/);
    });

    it('should return error for directory without superdoc', () => {
      const someDir = path.join(rootDir, 'some-dir');

      const mockFs = {
        existsSync: vi.fn((p: string) => {
          if (p === someDir) return true;
          return false;
        }),
        statSync: vi.fn().mockReturnValue({ isDirectory: () => true }),
        readFileSync: vi.fn(),
      };

      const result = resolveSpecifier('some-dir', {
        rootDir,
        harnessDir,
        deps: { fs: mockFs },
      });

      expect(result.error).toBeTruthy();
      expect(result.error).toContain('No superdoc package found');
    });

    it('should handle tarball files', () => {
      const tarballPath = path.join(rootDir, 'superdoc-1.4.0.tgz');

      const mockFs = {
        existsSync: vi.fn().mockReturnValue(true),
        statSync: vi.fn().mockReturnValue({ isDirectory: () => false }),
        readFileSync: vi.fn(),
      };

      const result = resolveSpecifier('superdoc-1.4.0.tgz', {
        rootDir,
        harnessDir,
        deps: { fs: mockFs },
      });

      expect(result.isFile).toBe(true);
      expect(result.installPath).toBe(tarballPath);
      expect(result.specifier).toMatch(/^file:/);
    });
  });
});
