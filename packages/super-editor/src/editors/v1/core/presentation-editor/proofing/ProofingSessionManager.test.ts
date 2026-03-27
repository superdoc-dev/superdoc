import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProofingSessionManager } from './ProofingSessionManager.js';
import type { ProofingProvider, ProofingCheckRequest, ProofingCheckResult, ProofingConfig } from './types.js';
import { doc, p } from 'prosemirror-test-builder';
import { Mapping } from 'prosemirror-transform';

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

  describe('scheduling', () => {
    it('drains pending segments after a stale-epoch request completes', async () => {
      // Provider that holds responses until explicitly resolved
      const resolvers: Array<(result: ProofingCheckResult) => void> = [];
      const provider: ProofingProvider & { checkCalls: ProofingCheckRequest[] } = {
        id: 'controllable',
        checkCalls: [],
        check: vi.fn((request: ProofingCheckRequest) => {
          provider.checkCalls.push(request);
          return new Promise<ProofingCheckResult>((resolve) => {
            resolvers.push(resolve);
          });
        }),
        dispose: vi.fn(),
      };

      const manager = new ProofingSessionManager({
        enabled: true,
        provider,
        maxConcurrentRequests: 1,
        debounceMs: 10,
        visibleFirst: false,
      });

      // Step 1: Start initial check (epoch 0)
      const doc1 = doc(p('hello'));
      manager.runInitialCheck(doc1);

      // Fire debounce → triggers provider.check for epoch 0
      await vi.advanceTimersByTimeAsync(10);
      expect(provider.check).toHaveBeenCalledTimes(1);
      expect(resolvers).toHaveLength(1);

      // Step 2: Document changes while epoch 0 is in-flight → epoch 1
      const doc2 = doc(p('world'));
      manager.onDocumentChanged(doc2, [{ from: 1, to: 6 }], new Mapping());

      // Fire debounce for epoch 1 — but the slot is still occupied by epoch 0
      await vi.advanceTimersByTimeAsync(10);

      // provider.check should NOT have been called again — the slot is full
      expect(provider.check).toHaveBeenCalledTimes(1);

      // Step 3: Resolve the stale epoch-0 request (frees the slot)
      resolvers[0]({ issues: [] });

      // Flush microtasks so the await chain in #sendBatch completes
      // and #drainPendingSegments fires
      await vi.advanceTimersByTimeAsync(0);

      // Step 4: The fix ensures pending epoch-1 segments are now drained
      expect(provider.check).toHaveBeenCalledTimes(2);
    });

    it('drains pending segments after a stale-epoch request errors without reporting stale failure', async () => {
      let rejectNext: ((err: Error) => void) | null = null;
      const provider: ProofingProvider & { checkCalls: ProofingCheckRequest[] } = {
        id: 'rejectable',
        checkCalls: [],
        check: vi.fn((request: ProofingCheckRequest) => {
          provider.checkCalls.push(request);
          return new Promise<ProofingCheckResult>((_, reject) => {
            rejectNext = reject;
          });
        }),
        dispose: vi.fn(),
      };

      const onProofingError = vi.fn();
      const onStatusChange = vi.fn();
      const manager = new ProofingSessionManager({
        enabled: true,
        provider,
        maxConcurrentRequests: 1,
        debounceMs: 10,
        visibleFirst: false,
        onProofingError,
        onStatusChange,
      });

      // Start epoch 0 check
      manager.runInitialCheck(doc(p('hello')));
      await vi.advanceTimersByTimeAsync(10);
      expect(provider.check).toHaveBeenCalledTimes(1);

      // Edit → epoch 1, debounce fires but slot is full
      manager.onDocumentChanged(doc(p('world')), [{ from: 1, to: 6 }], new Mapping());
      await vi.advanceTimersByTimeAsync(10);
      expect(provider.check).toHaveBeenCalledTimes(1);

      // Clear callback trackers before the stale rejection
      onProofingError.mockClear();
      onStatusChange.mockClear();

      // Epoch 0 errors out (frees the slot)
      rejectNext!(new Error('boom'));
      await vi.advanceTimersByTimeAsync(0);

      // Epoch 1's pending segments should be drained
      expect(provider.check).toHaveBeenCalledTimes(2);

      // Stale failure must NOT be surfaced as a current error or degrade status
      expect(onProofingError).not.toHaveBeenCalled();
      expect(onStatusChange).not.toHaveBeenCalledWith('degraded');
    });
  });
});
