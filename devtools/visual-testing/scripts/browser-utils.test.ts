import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import {
  resolveBrowserNames,
  resolveBrowserName,
  getBrowserType,
  resolveBaselineFolderForBrowser,
  BROWSER_NAMES,
  type BrowserName,
} from './browser-utils.js';
import { chromium, firefox, webkit } from '@playwright/test';

describe('BROWSER_NAMES', () => {
  it('should contain all supported browsers', () => {
    expect(BROWSER_NAMES).toEqual(['chromium', 'firefox', 'webkit']);
  });
});

describe('resolveBrowserNames', () => {
  const originalEnv = process.env.SUPERDOC_TEST_BROWSER;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SUPERDOC_TEST_BROWSER;
    } else {
      process.env.SUPERDOC_TEST_BROWSER = originalEnv;
    }
  });

  it('should return all browsers when no value provided', () => {
    delete process.env.SUPERDOC_TEST_BROWSER;
    const result = resolveBrowserNames();
    expect(result).toEqual(['chromium', 'firefox', 'webkit']);
  });

  it('should return all browsers for empty string', () => {
    delete process.env.SUPERDOC_TEST_BROWSER;
    const result = resolveBrowserNames('');
    expect(result).toEqual(['chromium', 'firefox', 'webkit']);
  });

  it('should parse single browser', () => {
    const result = resolveBrowserNames('chromium');
    expect(result).toEqual(['chromium']);
  });

  it('should parse multiple browsers', () => {
    const result = resolveBrowserNames('chromium,firefox');
    expect(result).toEqual(['chromium', 'firefox']);
  });

  it('should deduplicate browsers', () => {
    const result = resolveBrowserNames('chromium,chromium,firefox');
    expect(result).toEqual(['chromium', 'firefox']);
  });

  it('should trim whitespace', () => {
    const result = resolveBrowserNames('  chromium  ,  firefox  ');
    expect(result).toEqual(['chromium', 'firefox']);
  });

  it('should be case-insensitive', () => {
    const result = resolveBrowserNames('CHROMIUM,Firefox');
    expect(result).toEqual(['chromium', 'firefox']);
  });

  it('should throw for invalid browser', () => {
    expect(() => resolveBrowserNames('invalid')).toThrow(
      'Invalid browser "invalid". Use one of: chromium, firefox, webkit',
    );
  });

  it('should throw for partially invalid list', () => {
    expect(() => resolveBrowserNames('chromium,invalid')).toThrow('Invalid browser "invalid"');
  });

  it('should use SUPERDOC_TEST_BROWSER env var when no value provided', () => {
    process.env.SUPERDOC_TEST_BROWSER = 'firefox';
    const result = resolveBrowserNames();
    expect(result).toEqual(['firefox']);
  });

  it('should prefer explicit value over env var', () => {
    process.env.SUPERDOC_TEST_BROWSER = 'firefox';
    const result = resolveBrowserNames('webkit');
    expect(result).toEqual(['webkit']);
  });
});

describe('resolveBrowserName', () => {
  const originalEnv = process.env.SUPERDOC_TEST_BROWSER;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SUPERDOC_TEST_BROWSER;
    } else {
      process.env.SUPERDOC_TEST_BROWSER = originalEnv;
    }
  });

  it('should return single browser', () => {
    const result = resolveBrowserName('chromium');
    expect(result).toBe('chromium');
  });

  it('should throw for multiple browsers', () => {
    expect(() => resolveBrowserName('chromium,firefox')).toThrow('Expected a single browser');
  });

  it('should throw when no value and env not set (defaults to all)', () => {
    delete process.env.SUPERDOC_TEST_BROWSER;
    expect(() => resolveBrowserName()).toThrow('Expected a single browser');
  });

  it('should use env var when set to single browser', () => {
    process.env.SUPERDOC_TEST_BROWSER = 'webkit';
    const result = resolveBrowserName();
    expect(result).toBe('webkit');
  });
});

describe('getBrowserType', () => {
  it('should return chromium BrowserType', () => {
    const result = getBrowserType('chromium');
    expect(result).toBe(chromium);
  });

  it('should return firefox BrowserType', () => {
    const result = getBrowserType('firefox');
    expect(result).toBe(firefox);
  });

  it('should return webkit BrowserType', () => {
    const result = getBrowserType('webkit');
    expect(result).toBe(webkit);
  });
});

describe('resolveBaselineFolderForBrowser', () => {
  const originalExistsSync = fs.existsSync;
  const originalReaddirSync = fs.readdirSync;

  afterEach(() => {
    fs.existsSync = originalExistsSync;
    fs.readdirSync = originalReaddirSync;
  });

  it('should return browser subdirectory when it exists', () => {
    fs.existsSync = vi.fn((p: string) => p.includes('chromium')) as typeof fs.existsSync;

    const result = resolveBaselineFolderForBrowser('/baselines/v.1.0.0', 'chromium');
    expect(result).toBe('/baselines/v.1.0.0/chromium');
  });

  it('should return browser subdirectory when base does not exist', () => {
    fs.existsSync = vi.fn().mockReturnValue(false) as typeof fs.existsSync;

    const result = resolveBaselineFolderForBrowser('/baselines/v.1.0.0', 'firefox');
    expect(result).toBe('/baselines/v.1.0.0/firefox');
  });

  it('should fall back to base dir for chromium with legacy layout', () => {
    fs.existsSync = vi.fn((p: string) => {
      // Browser dir doesn't exist, but base dir does
      if (p.includes('chromium')) return false;
      return p === '/baselines/v.1.0.0';
    }) as typeof fs.existsSync;

    fs.readdirSync = vi.fn().mockReturnValue([
      { name: 'sdt', isDirectory: () => true },
      { name: 'basic', isDirectory: () => true },
    ]) as unknown as typeof fs.readdirSync;

    const result = resolveBaselineFolderForBrowser('/baselines/v.1.0.0', 'chromium');
    expect(result).toBe('/baselines/v.1.0.0');
  });

  it('should not fall back for firefox with legacy layout', () => {
    fs.existsSync = vi.fn((p: string) => {
      if (p.includes('firefox')) return false;
      return p === '/baselines/v.1.0.0';
    }) as typeof fs.existsSync;

    fs.readdirSync = vi
      .fn()
      .mockReturnValue([{ name: 'sdt', isDirectory: () => true }]) as unknown as typeof fs.readdirSync;

    const result = resolveBaselineFolderForBrowser('/baselines/v.1.0.0', 'firefox');
    expect(result).toBe('/baselines/v.1.0.0/firefox');
  });

  it('should return browser dir when browser folders exist', () => {
    fs.existsSync = vi.fn((p: string) => {
      if (p.includes('firefox')) return false;
      return true;
    }) as typeof fs.existsSync;

    fs.readdirSync = vi.fn().mockReturnValue([
      { name: 'chromium', isDirectory: () => true },
      { name: 'webkit', isDirectory: () => true },
    ]) as unknown as typeof fs.readdirSync;

    const result = resolveBaselineFolderForBrowser('/baselines/v.1.0.0', 'firefox');
    expect(result).toBe('/baselines/v.1.0.0/firefox');
  });
});
