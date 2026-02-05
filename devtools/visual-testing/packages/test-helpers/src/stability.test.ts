import { describe, it, expect, vi } from 'vitest';
import { sleep, ptToPx } from './stability.js';

describe('sleep', () => {
  it('should resolve after the specified time', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    // Allow some tolerance for timing
    expect(elapsed).toBeGreaterThanOrEqual(45);
    expect(elapsed).toBeLessThan(150);
  });

  it('should resolve immediately for 0ms', async () => {
    const start = Date.now();
    await sleep(0);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});

describe('ptToPx', () => {
  it('should convert points to pixels (1pt = 1.333px)', () => {
    expect(ptToPx(12)).toBe('16px');
    expect(ptToPx(0)).toBe('0px');
  });

  it('should handle decimal points', () => {
    const result = ptToPx(10.5);
    expect(result).toMatch(/^14(\.\d+)?px$/);
  });

  it('should handle large values', () => {
    const result = ptToPx(72);
    expect(result).toBe('96px');
  });
});

// Note: waitForFontsReady, waitForLayoutStable, and waitForEditorIdle
// require a Playwright Page and are tested via integration tests
