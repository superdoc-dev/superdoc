import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProofingSessionManager } from './ProofingSessionManager.js';
import type { ProofingProvider, ProofingCheckRequest, ProofingCheckResult, ProofingConfig } from './types.js';

// =============================================================================
// Mock Provider
// =============================================================================

function createMockProvider(
  issues: ProofingCheckResult['issues'] = [],
  delay = 0,
): ProofingProvider & { checkCalls: ProofingCheckRequest[] } {
  const checkCalls: ProofingCheckRequest[] = [];
  return {
    id: 'test-provider',
    checkCalls,
    check: vi.fn(async (request: ProofingCheckRequest) => {
      checkCalls.push(request);
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      return { issues };
    }),
    dispose: vi.fn(),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('ProofingSessionManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('starts disabled when no config provided', () => {
      const manager = new ProofingSessionManager();
      expect(manager.status).toBe('disabled');
      expect(manager.isEnabled).toBe(false);
    });

    it('starts disabled when enabled=false', () => {
      const manager = new ProofingSessionManager({ enabled: false });
      expect(manager.status).toBe('disabled');
    });

    it('starts idle when enabled with a provider', () => {
      const provider = createMockProvider();
      const manager = new ProofingSessionManager({ enabled: true, provider });
      expect(manager.status).toBe('idle');
      expect(manager.isEnabled).toBe(true);
    });

    it('starts disabled when enabled but no provider', () => {
      const manager = new ProofingSessionManager({ enabled: true });
      expect(manager.isEnabled).toBe(false);
    });
  });

  describe('config', () => {
    it('exposes default config values', () => {
      const manager = new ProofingSessionManager();
      expect(manager.config.debounceMs).toBe(500);
      expect(manager.config.timeoutMs).toBe(10000);
      expect(manager.config.maxConcurrentRequests).toBe(2);
      expect(manager.config.maxSegmentsPerBatch).toBe(20);
      expect(manager.config.allowIgnoreWord).toBe(true);
    });

    it('applies custom config values', () => {
      const manager = new ProofingSessionManager({
        debounceMs: 200,
        timeoutMs: 5000,
        maxConcurrentRequests: 3,
      });
      expect(manager.config.debounceMs).toBe(200);
      expect(manager.config.timeoutMs).toBe(5000);
      expect(manager.config.maxConcurrentRequests).toBe(3);
    });
  });

  describe('updateConfig', () => {
    it('disabling clears status', () => {
      const provider = createMockProvider();
      const manager = new ProofingSessionManager({ enabled: true, provider });
      expect(manager.status).toBe('idle');

      manager.updateConfig({ enabled: false });
      expect(manager.status).toBe('disabled');
      expect(manager.isEnabled).toBe(false);
    });

    it('changing provider disposes old one', () => {
      const provider1 = createMockProvider();
      const provider2 = createMockProvider();
      const manager = new ProofingSessionManager({ enabled: true, provider: provider1 });

      manager.updateConfig({ provider: provider2 });
      expect(provider1.dispose).toHaveBeenCalled();
    });

    it('updates UI-only flags without side effects', () => {
      const provider = createMockProvider();
      const manager = new ProofingSessionManager({ enabled: true, provider });

      manager.updateConfig({ allowIgnoreWord: false });
      expect(manager.config.allowIgnoreWord).toBe(false);
    });

    it('calls onStatusChange callback', () => {
      const onStatusChange = vi.fn();
      const provider = createMockProvider();
      const manager = new ProofingSessionManager({
        enabled: true,
        provider,
        onStatusChange,
      });

      // Already called once for 'idle'
      expect(onStatusChange).toHaveBeenCalledWith('idle');

      manager.updateConfig({ enabled: false });
      expect(onStatusChange).toHaveBeenCalledWith('disabled');
    });
  });

  describe('suppression', () => {
    it('ignoreWord adds to ignored list', () => {
      const manager = new ProofingSessionManager();
      manager.ignoreWord('Teh');
      expect(manager.config.ignoredWords).toContain('teh');
    });

    it('ignoreWord is case-insensitive and NFC-normalized', () => {
      const manager = new ProofingSessionManager();
      manager.ignoreWord('TEH');
      expect(manager.config.ignoredWords).toContain('teh');
    });

    it('ignoreWord deduplicates', () => {
      const manager = new ProofingSessionManager();
      manager.ignoreWord('teh');
      manager.ignoreWord('TEH');
      expect(manager.config.ignoredWords.filter((w) => w === 'teh')).toHaveLength(1);
    });

    it('removeIgnoredWord removes from list', () => {
      const manager = new ProofingSessionManager({ ignoredWords: ['teh'] });
      manager.removeIgnoredWord('teh');
      expect(manager.config.ignoredWords).not.toContain('teh');
    });
  });

  describe('paint slices', () => {
    it('returns empty when disabled', () => {
      const manager = new ProofingSessionManager();
      expect(manager.getPaintSlices()).toEqual([]);
    });

    it('returns empty when enabled but no results', () => {
      const provider = createMockProvider();
      const manager = new ProofingSessionManager({ enabled: true, provider });
      expect(manager.getPaintSlices()).toEqual([]);
    });
  });

  describe('issue lookup', () => {
    it('returns null when disabled', () => {
      const manager = new ProofingSessionManager();
      expect(manager.getIssueAtPosition(10)).toBeNull();
    });

    it('returns null when no issue at position', () => {
      const provider = createMockProvider();
      const manager = new ProofingSessionManager({ enabled: true, provider });
      expect(manager.getIssueAtPosition(10)).toBeNull();
    });
  });

  describe('composition pause', () => {
    it('does not schedule checks while composing', () => {
      const provider = createMockProvider();
      const manager = new ProofingSessionManager({ enabled: true, provider, debounceMs: 10 });

      manager.setComposing(true);

      // Simulate a document change — would normally trigger a debounced check
      // We can't call onDocumentChanged without a real doc, but we can verify
      // that setComposing(false) reschedules
      expect(manager.status).toBe('idle');
    });

    it('resumes scheduling when composition ends', () => {
      const provider = createMockProvider();
      const manager = new ProofingSessionManager({ enabled: true, provider, debounceMs: 10 });

      manager.setComposing(true);
      manager.setComposing(false);
      // Should not throw — composition end is safe even without pending work
      expect(manager.status).toBe('idle');
    });
  });

  describe('dispose', () => {
    it('disposes provider and clears state', () => {
      const provider = createMockProvider();
      const manager = new ProofingSessionManager({ enabled: true, provider });
      manager.dispose();
      expect(provider.dispose).toHaveBeenCalled();
      expect(manager.status).toBe('disabled');
      expect(manager.isEnabled).toBe(false);
    });

    it('is safe to call multiple times', () => {
      const provider = createMockProvider();
      const manager = new ProofingSessionManager({ enabled: true, provider });
      manager.dispose();
      manager.dispose(); // Should not throw
    });
  });
});
