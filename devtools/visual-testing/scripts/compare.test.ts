import { describe, it, expect } from 'vitest';
import {
  extractVersionFromFolder,
  findLatestResultsFolder,
  findPngFiles,
  matchesFilterWithBrowserPrefix,
} from './compare.js';

describe('extractVersionFromFolder', () => {
  it('should extract version from standard folder name', () => {
    const result = extractVersionFromFolder('2026-01-09-14-52-06-v.1.4.0');
    expect(result).toBe('v.1.4.0');
  });

  it('should extract version with prerelease tag', () => {
    const result = extractVersionFromFolder('2026-01-09-14-52-06-v.1.3.5-next.1');
    expect(result).toBe('v.1.3.5-next.1');
  });

  it('should extract version with beta tag', () => {
    const result = extractVersionFromFolder('2026-03-15-09-00-00-v.2.0.0-beta.3');
    expect(result).toBe('v.2.0.0-beta.3');
  });

  it('should return null for invalid folder name', () => {
    const result = extractVersionFromFolder('some-random-folder');
    expect(result).toBeNull();
  });

  it('should return null for folder without version prefix', () => {
    const result = extractVersionFromFolder('2026-01-09-14-52-06');
    expect(result).toBeNull();
  });

  it('should handle version with local suffix', () => {
    const result = extractVersionFromFolder('2026-01-09-14-52-06-v.local');
    expect(result).toBe('v.local');
  });

  it('should handle version with unknown suffix', () => {
    const result = extractVersionFromFolder('2026-01-09-14-52-06-v.unknown');
    expect(result).toBe('v.unknown');
  });
});

describe('findLatestResultsFolder', () => {
  it('should return null for non-existent directory', () => {
    const result = findLatestResultsFolder('non-existent-dir');
    expect(result).toBeNull();
  });

  it('should find folders in screenshots directory', () => {
    // This test depends on actual screenshots existing
    // If screenshots exist, it should return the latest one
    const result = findLatestResultsFolder('screenshots');
    if (result) {
      expect(extractVersionFromFolder(result)).not.toBeNull();
    }
  });
});

describe('findPngFiles', () => {
  it('should return empty array for non-existent directory', () => {
    const result = findPngFiles('non-existent-dir');
    expect(result).toEqual([]);
  });

  it('should find PNG files in baselines directory', () => {
    const result = findPngFiles('baselines');
    // If baselines exist, should find PNG files
    if (result.length > 0) {
      expect(result.every((f) => f.endsWith('.png'))).toBe(true);
    }
  });

  it('should return sorted file paths', () => {
    const result = findPngFiles('baselines');
    if (result.length > 1) {
      const sorted = [...result].sort();
      expect(result).toEqual(sorted);
    }
  });

  it('should exclude hidden directories', () => {
    const result = findPngFiles('baselines');
    expect(result.every((f) => !f.includes('/.'))).toBe(true);
  });
});

describe('matchesFilterWithBrowserPrefix', () => {
  it('matches --filter against paths inside browser prefixes', () => {
    const value = 'chromium/tables/doc/p001.png';
    const result = matchesFilterWithBrowserPrefix(value, 'chromium/', ['tables'], [], []);
    expect(result).toBe(true);
  });

  it('matches --match against paths inside browser prefixes', () => {
    const value = 'chromium/tables/doc/p001.png';
    const result = matchesFilterWithBrowserPrefix(value, 'chromium/', [], ['tables'], []);
    expect(result).toBe(true);
  });

  it('respects --exclude inside browser prefixes', () => {
    const value = 'chromium/tables/doc/p001.png';
    const result = matchesFilterWithBrowserPrefix(value, 'chromium/', [], [], ['tables']);
    expect(result).toBe(false);
  });

  it('leaves paths unchanged when browser prefix is absent', () => {
    const value = 'tables/doc/p001.png';
    const result = matchesFilterWithBrowserPrefix(value, undefined, ['tables'], [], []);
    expect(result).toBe(true);
  });
});
