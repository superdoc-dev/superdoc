import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  scheduleReconcile,
  destroyReconcileState,
  markDirty,
  reconcileImmediately,
} from './part-reconcile-scheduler.js';
import { publishPartSections } from './part-sync-engine.js';
import { getOoxmlPartSpecs, invalidateDiscoveredSpecs } from './part-spec-registry.js';

vi.mock('./part-sync-engine.js', () => ({
  publishPartSections: vi.fn(),
}));

vi.mock('./part-spec-registry.js', () => ({
  getOoxmlPartSpecs: vi.fn(() => [
    { id: 'numbering', partPath: 'word/numbering.xml' },
    { id: 'settings', partPath: 'word/settings.xml' },
  ]),
  invalidateDiscoveredSpecs: vi.fn(),
}));

const DEBOUNCE_MS = 30_000;
const MAX_WAIT_MS = 60_000;

const createMockEditor = () => ({
  isDestroyed: false,
  options: { ydoc: { isDestroyed: false } },
  exportDocx: vi.fn().mockResolvedValue(undefined),
  converter: {
    convertedXml: {},
    parseXmlToJson: vi.fn(() => ({
      elements: [{ name: 'Types', elements: [] }],
    })),
  },
});

/**
 * Flush the microtask queue so async callbacks triggered by timer advancement
 * can complete. Does NOT advance timers further.
 */
async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

/**
 * Advance timers by the given amount and flush any resulting async work.
 */
async function advanceAndFlush(ms) {
  vi.advanceTimersByTime(ms);
  await flushMicrotasks();
}

describe('part-reconcile-scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('scheduleReconcile', () => {
    it('schedules a debounce timer that fires at 30s', async () => {
      const editor = createMockEditor();

      markDirty(editor);
      scheduleReconcile(editor, 'test');

      expect(editor.exportDocx).not.toHaveBeenCalled();

      await advanceAndFlush(DEBOUNCE_MS);

      expect(editor.exportDocx).toHaveBeenCalledWith({ getUpdatedDocs: true });
    });

    it('resets debounce timer on subsequent calls', async () => {
      const editor = createMockEditor();

      markDirty(editor);
      scheduleReconcile(editor, 'first');
      vi.advanceTimersByTime(20_000);
      scheduleReconcile(editor, 'second');
      vi.advanceTimersByTime(20_000);

      expect(editor.exportDocx).not.toHaveBeenCalled();

      await advanceAndFlush(10_000);

      expect(editor.exportDocx).toHaveBeenCalledTimes(1);
    });

    it('sets maxWait timer on first call only', async () => {
      const editor = createMockEditor();

      markDirty(editor);
      scheduleReconcile(editor, 'first');
      vi.advanceTimersByTime(10_000);
      scheduleReconcile(editor, 'second');
      vi.advanceTimersByTime(10_000);
      scheduleReconcile(editor, 'third');

      expect(editor.exportDocx).not.toHaveBeenCalled();

      await advanceAndFlush(MAX_WAIT_MS - 20_000);

      expect(editor.exportDocx).toHaveBeenCalledTimes(1);
    });

    it('does not call exportDocx or publishPartSections until a timer fires', () => {
      const editor = createMockEditor();

      markDirty(editor);
      scheduleReconcile(editor, 'test');

      vi.advanceTimersByTime(DEBOUNCE_MS - 1);

      expect(editor.exportDocx).not.toHaveBeenCalled();
      expect(publishPartSections).not.toHaveBeenCalled();
    });

    it('calls exportDocx then publishPartSections for each spec after debounce fires', async () => {
      const editor = createMockEditor();

      markDirty(editor);
      scheduleReconcile(editor, 'test');

      await advanceAndFlush(DEBOUNCE_MS);

      expect(editor.exportDocx).toHaveBeenCalledOnce();
      expect(editor.exportDocx).toHaveBeenCalledWith({ getUpdatedDocs: true });

      expect(getOoxmlPartSpecs).toHaveBeenCalled();
      expect(publishPartSections).toHaveBeenCalledTimes(2);
      expect(publishPartSections).toHaveBeenCalledWith(editor, { id: 'numbering', partPath: 'word/numbering.xml' });
      expect(publishPartSections).toHaveBeenCalledWith(editor, { id: 'settings', partPath: 'word/settings.xml' });
    });

    it('invalidates discovered specs before re-discovery after export', async () => {
      const editor = createMockEditor();

      markDirty(editor);
      scheduleReconcile(editor, 'test');

      await advanceAndFlush(DEBOUNCE_MS);

      expect(invalidateDiscoveredSpecs).toHaveBeenCalledWith(editor.converter);
      // invalidation must happen before getOoxmlPartSpecs
      const invalidateOrder = invalidateDiscoveredSpecs.mock.invocationCallOrder[0];
      const getSpecsOrder = getOoxmlPartSpecs.mock.invocationCallOrder[0];
      expect(invalidateOrder).toBeLessThan(getSpecsOrder);
    });

    it('parses [Content_Types].xml from export output into converter.convertedXml', async () => {
      const editor = createMockEditor();
      editor.exportDocx.mockResolvedValue({
        '[Content_Types].xml': '<Types><Default Extension="xml" ContentType="application/xml" /></Types>',
      });

      markDirty(editor);
      scheduleReconcile(editor, 'test');

      await advanceAndFlush(DEBOUNCE_MS);

      expect(editor.converter.parseXmlToJson).toHaveBeenCalledWith(
        '<Types><Default Extension="xml" ContentType="application/xml" /></Types>',
      );
      expect(editor.converter.convertedXml['[Content_Types].xml']).toEqual({
        elements: [{ name: 'Types', elements: [] }],
      });
    });

    it('skips [Content_Types].xml parsing when export output does not include it', async () => {
      const editor = createMockEditor();
      editor.exportDocx.mockResolvedValue({
        'word/document.xml': '<w:document />',
      });

      markDirty(editor);
      scheduleReconcile(editor, 'test');

      await advanceAndFlush(DEBOUNCE_MS);

      expect(editor.converter.parseXmlToJson).not.toHaveBeenCalled();
      expect(editor.converter.convertedXml['[Content_Types].xml']).toBeUndefined();
    });

    it('warns and continues when [Content_Types].xml parsing fails', async () => {
      const editor = createMockEditor();
      const parseError = new Error('bad xml');
      editor.exportDocx.mockResolvedValue({
        '[Content_Types].xml': '<Types>not valid</Types>',
      });
      editor.converter.parseXmlToJson.mockImplementation(() => {
        throw parseError;
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      markDirty(editor);
      scheduleReconcile(editor, 'test');

      await advanceAndFlush(DEBOUNCE_MS);

      expect(warnSpy).toHaveBeenCalledWith('[part-reconcile] Failed to parse [Content_Types].xml', parseError);
      expect(publishPartSections).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('skips if editor is destroyed', async () => {
      const editor = createMockEditor();
      editor.isDestroyed = true;

      scheduleReconcile(editor, 'test');

      await advanceAndFlush(DEBOUNCE_MS);

      expect(editor.exportDocx).not.toHaveBeenCalled();
    });

    it('skips if editor is null', async () => {
      scheduleReconcile(null, 'test');

      await advanceAndFlush(DEBOUNCE_MS);

      expect(publishPartSections).not.toHaveBeenCalled();
    });

    it('skips if no ydoc', async () => {
      const editor = createMockEditor();
      editor.options.ydoc = null;

      scheduleReconcile(editor, 'test');

      await advanceAndFlush(DEBOUNCE_MS);

      expect(editor.exportDocx).not.toHaveBeenCalled();
    });

    it('skips if ydoc is destroyed', async () => {
      const editor = createMockEditor();
      editor.options.ydoc.isDestroyed = true;

      scheduleReconcile(editor, 'test');

      await advanceAndFlush(DEBOUNCE_MS);

      expect(editor.exportDocx).not.toHaveBeenCalled();
    });

    it('skips publishPartSections if editor becomes destroyed after exportDocx', async () => {
      const editor = createMockEditor();
      editor.exportDocx.mockImplementation(async () => {
        editor.isDestroyed = true;
      });

      markDirty(editor);
      scheduleReconcile(editor, 'test');

      await advanceAndFlush(DEBOUNCE_MS);

      expect(editor.exportDocx).toHaveBeenCalled();
      expect(publishPartSections).not.toHaveBeenCalled();
    });

    it('skips publishPartSections if ydoc becomes destroyed after exportDocx', async () => {
      const editor = createMockEditor();
      editor.exportDocx.mockImplementation(async () => {
        editor.options.ydoc.isDestroyed = true;
      });

      markDirty(editor);
      scheduleReconcile(editor, 'test');

      await advanceAndFlush(DEBOUNCE_MS);

      expect(editor.exportDocx).toHaveBeenCalled();
      expect(publishPartSections).not.toHaveBeenCalled();
    });

    it('warns on exportDocx failure instead of throwing', async () => {
      const editor = createMockEditor();
      const error = new Error('export failed');
      editor.exportDocx.mockRejectedValue(error);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      markDirty(editor);
      scheduleReconcile(editor, 'test');

      await advanceAndFlush(DEBOUNCE_MS);

      expect(warnSpy).toHaveBeenCalledWith('[part-reconcile] Reconcile failed', error);
      expect(publishPartSections).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('destroyReconcileState', () => {
    it('clears debounce and maxWait timers', async () => {
      const editor = createMockEditor();

      markDirty(editor);
      scheduleReconcile(editor, 'test');
      destroyReconcileState(editor);

      await advanceAndFlush(MAX_WAIT_MS);

      expect(editor.exportDocx).not.toHaveBeenCalled();
    });

    it('is safe to call when no state exists', () => {
      const editor = createMockEditor();
      expect(() => destroyReconcileState(editor)).not.toThrow();
    });

    it('prevents pending reconcile from firing', async () => {
      const editor = createMockEditor();

      markDirty(editor);
      scheduleReconcile(editor, 'test');
      vi.advanceTimersByTime(15_000);

      destroyReconcileState(editor);

      await advanceAndFlush(MAX_WAIT_MS);

      expect(editor.exportDocx).not.toHaveBeenCalled();
      expect(publishPartSections).not.toHaveBeenCalled();
    });
  });

  describe('timer behavior', () => {
    it('reconcile fires after 30s of no activity', async () => {
      const editor = createMockEditor();

      markDirty(editor);
      scheduleReconcile(editor, 'test');

      vi.advanceTimersByTime(DEBOUNCE_MS - 1);
      expect(editor.exportDocx).not.toHaveBeenCalled();

      await advanceAndFlush(1);
      expect(editor.exportDocx).toHaveBeenCalledOnce();
    });

    it('activity at 25s resets debounce to 30s from that point', async () => {
      const editor = createMockEditor();

      markDirty(editor);
      scheduleReconcile(editor, 'first');
      vi.advanceTimersByTime(25_000);

      expect(editor.exportDocx).not.toHaveBeenCalled();

      scheduleReconcile(editor, 'second');

      vi.advanceTimersByTime(25_000);
      expect(editor.exportDocx).not.toHaveBeenCalled();

      await advanceAndFlush(5_000);
      expect(editor.exportDocx).toHaveBeenCalledOnce();
    });

    it('maxWait fires at 60s even with constant resets', async () => {
      const editor = createMockEditor();

      markDirty(editor);
      scheduleReconcile(editor, 'initial');

      // Keep resetting debounce every 10s so it never fires on its own.
      // The maxWait (60s from first call) should still force a reconcile.
      vi.advanceTimersByTime(10_000);
      scheduleReconcile(editor, 'reset-10');
      vi.advanceTimersByTime(10_000);
      scheduleReconcile(editor, 'reset-20');
      vi.advanceTimersByTime(10_000);
      scheduleReconcile(editor, 'reset-30');
      vi.advanceTimersByTime(10_000);
      scheduleReconcile(editor, 'reset-40');
      vi.advanceTimersByTime(10_000);
      scheduleReconcile(editor, 'reset-50');

      // At t=50s, debounce would fire at t=80s.
      // maxWait was set at t=0 to fire at t=60s.
      expect(editor.exportDocx).not.toHaveBeenCalled();

      await advanceAndFlush(10_000);

      expect(editor.exportDocx).toHaveBeenCalledOnce();
    });

    it('clears both timers after reconcile executes via debounce', async () => {
      const editor = createMockEditor();

      markDirty(editor);
      scheduleReconcile(editor, 'test');
      await advanceAndFlush(DEBOUNCE_MS);

      expect(editor.exportDocx).toHaveBeenCalledOnce();

      await advanceAndFlush(MAX_WAIT_MS);

      expect(editor.exportDocx).toHaveBeenCalledOnce();
    });

    it('clears both timers after reconcile executes via maxWait', async () => {
      const editor = createMockEditor();

      markDirty(editor);
      scheduleReconcile(editor, 'initial');

      for (let elapsed = 20_000; elapsed <= MAX_WAIT_MS; elapsed += 20_000) {
        vi.advanceTimersByTime(20_000);
        if (elapsed < MAX_WAIT_MS) {
          scheduleReconcile(editor, `reset-${elapsed}`);
        }
      }
      await flushMicrotasks();

      expect(editor.exportDocx).toHaveBeenCalledOnce();

      editor.exportDocx.mockClear();
      publishPartSections.mockClear();

      await advanceAndFlush(DEBOUNCE_MS);

      expect(editor.exportDocx).not.toHaveBeenCalled();
    });

    it('allows scheduling a new reconcile after a previous one completes', async () => {
      const editor = createMockEditor();

      markDirty(editor);
      scheduleReconcile(editor, 'first');
      await advanceAndFlush(DEBOUNCE_MS);

      expect(editor.exportDocx).toHaveBeenCalledOnce();

      markDirty(editor);
      scheduleReconcile(editor, 'second');
      await advanceAndFlush(DEBOUNCE_MS);

      expect(editor.exportDocx).toHaveBeenCalledTimes(2);
    });
  });

  describe('markDirty', () => {
    it('skips exportDocx when no markDirty since last reconcile', async () => {
      const editor = createMockEditor();

      // First reconcile with dirty flag
      markDirty(editor);
      scheduleReconcile(editor, 'first');
      await advanceAndFlush(DEBOUNCE_MS);

      expect(editor.exportDocx).toHaveBeenCalledOnce();
      editor.exportDocx.mockClear();

      // Second reconcile without marking dirty — should skip
      scheduleReconcile(editor, 'second');
      await advanceAndFlush(DEBOUNCE_MS);

      expect(editor.exportDocx).not.toHaveBeenCalled();
    });

    it('calls exportDocx when markDirty is called between reconciles', async () => {
      const editor = createMockEditor();

      // First reconcile
      markDirty(editor);
      scheduleReconcile(editor, 'first');
      await advanceAndFlush(DEBOUNCE_MS);

      expect(editor.exportDocx).toHaveBeenCalledOnce();
      editor.exportDocx.mockClear();

      // Mark dirty again and schedule
      markDirty(editor);
      scheduleReconcile(editor, 'second');
      await advanceAndFlush(DEBOUNCE_MS);

      expect(editor.exportDocx).toHaveBeenCalledOnce();
    });

    it('is safe to call with null editor', () => {
      expect(() => markDirty(null)).not.toThrow();
    });
  });

  describe('reconcileImmediately', () => {
    it('runs exportDocx and publishPartSections synchronously (no timer)', async () => {
      const editor = createMockEditor();

      await reconcileImmediately(editor);

      expect(editor.exportDocx).toHaveBeenCalledOnce();
      expect(editor.exportDocx).toHaveBeenCalledWith({ getUpdatedDocs: true });
      expect(publishPartSections).toHaveBeenCalledTimes(2);
    });

    it('does not require a prior markDirty call', async () => {
      const editor = createMockEditor();

      // reconcileImmediately marks dirty internally
      await reconcileImmediately(editor);

      expect(editor.exportDocx).toHaveBeenCalledOnce();
    });

    it('cancels any pending debounced reconcile timers', async () => {
      const editor = createMockEditor();

      markDirty(editor);
      scheduleReconcile(editor, 'pending');

      // Immediate reconcile runs and clears timers
      await reconcileImmediately(editor);
      expect(editor.exportDocx).toHaveBeenCalledOnce();

      editor.exportDocx.mockClear();
      publishPartSections.mockClear();

      // Advancing past debounce should NOT fire again (no new dirty)
      await advanceAndFlush(DEBOUNCE_MS + MAX_WAIT_MS);
      expect(editor.exportDocx).not.toHaveBeenCalled();
    });

    it('skips if editor is destroyed', async () => {
      const editor = createMockEditor();
      editor.isDestroyed = true;

      await reconcileImmediately(editor);

      expect(editor.exportDocx).not.toHaveBeenCalled();
    });

    it('skips if ydoc is missing', async () => {
      const editor = createMockEditor();
      editor.options.ydoc = null;

      await reconcileImmediately(editor);

      expect(editor.exportDocx).not.toHaveBeenCalled();
    });
  });
});
