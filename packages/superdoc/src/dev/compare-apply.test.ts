import { describe, expect, it, vi } from 'vite-plus/test';
import {
  applyCompareWithWs09Fallback,
  captureCompareApplyDebugSnapshot,
  compareApplyDeferredMessage,
  isWs09TrackedCompareDeferred,
  settleCompareApplyPaint,
} from './compare-apply';

describe('dev compare apply fallback', () => {
  it('keeps tracked compare apply when it succeeds', () => {
    const apply = vi.fn(() => ({ appliedOperations: 3, diagnostics: [] }));
    const outcome = applyCompareWithWs09Fallback({ diff: { apply } }, { id: 'diff' });

    expect(outcome.changeMode).toBe('tracked');
    expect(outcome.fallbackFromTracked).toBe(false);
    expect(outcome.applyResult.appliedOperations).toBe(3);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenNthCalledWith(1, { diff: { id: 'diff' } }, { changeMode: 'tracked' });
  });

  it('falls back to direct compare apply for ws09 tracked deferral', () => {
    const deferredError = Object.assign(
      new Error('compare-apply-deferred (ws09): table topology changes are detected'),
      { code: 'CAPABILITY_UNSUPPORTED' },
    );
    const apply = vi
      .fn()
      .mockImplementationOnce(() => {
        throw deferredError;
      })
      .mockImplementationOnce(() => ({ appliedOperations: 5, diagnostics: ['body: applied 2 safe operation(s)'] }));

    const outcome = applyCompareWithWs09Fallback({ diff: { apply } }, { id: 'diff' });

    expect(outcome.changeMode).toBe('direct');
    expect(outcome.fallbackFromTracked).toBe(true);
    expect(outcome.applyResult.appliedOperations).toBe(5);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenNthCalledWith(1, { diff: { id: 'diff' } }, { changeMode: 'tracked' });
    expect(apply).toHaveBeenNthCalledWith(2, { diff: { id: 'diff' } }, { changeMode: 'direct' });
  });

  it('prefers direct compare apply for ws09 deferred table topology diffs before tracked apply can partially succeed', () => {
    const apply = vi.fn(() => ({ appliedOperations: 6, diagnostics: [] }));
    const diff = {
      payload: {
        familyPolicy: [
          { family: 'body', disposition: 'deferred', changed: true, applyRequired: true },
          { family: 'tables', disposition: 'deferred', changed: true, applyRequired: true },
        ],
        mainDocument: {
          target: { xml: '<w:document><w:body><w:tbl/></w:body></w:document>' },
        },
      },
    };

    const outcome = applyCompareWithWs09Fallback({ diff: { apply } }, diff);

    expect(outcome.changeMode).toBe('direct');
    expect(outcome.fallbackFromTracked).toBe(true);
    expect(outcome.applyResult.appliedOperations).toBe(6);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith({ diff }, { changeMode: 'direct' });
  });

  it('retries direct compare apply with ws07 visual-only families stripped when they are the only remaining blocker', () => {
    const ws07Error = Object.assign(
      new Error(
        'diff.apply: full diff apply cannot safely replay changed families ' +
          '[sections (deferred: compare-apply-deferred (ws07)); ' +
          'settings (deferred: compare-apply-deferred (ws07)); ' +
          'theme (deferred: compare-apply-deferred (ws07))] in this build.',
      ),
      { code: 'CAPABILITY_UNSUPPORTED' },
    );
    const diff = {
      payload: {
        analysis: {
          families: [
            { family: 'body', state: 'changed-supported' },
            { family: 'tables', state: 'changed-supported' },
            { family: 'sections', state: 'changed-supported' },
            { family: 'settings', state: 'changed-supported' },
            { family: 'theme', state: 'changed-supported' },
          ],
        },
        semanticAnalysis: {
          familyDeltas: [
            { family: 'body', detectedChange: true },
            { family: 'tables', detectedChange: true },
            { family: 'sections', detectedChange: true },
            { family: 'settings', detectedChange: true },
            { family: 'theme', detectedChange: true },
          ],
        },
        familyPolicy: [
          { family: 'body', disposition: 'deferred', changed: true, applyRequired: true },
          { family: 'tables', disposition: 'deferred', changed: true, applyRequired: true },
        ],
        mainDocument: {
          target: { xml: '<w:document><w:body><w:tbl/></w:body></w:document>' },
        },
      },
    };
    const apply = vi
      .fn()
      .mockImplementationOnce(() => {
        throw ws07Error;
      })
      .mockImplementationOnce(() => ({ appliedOperations: 2, diagnostics: [] }));

    const outcome = applyCompareWithWs09Fallback({ diff: { apply } }, diff);

    expect(outcome.changeMode).toBe('direct');
    expect(outcome.fallbackFromTracked).toBe(true);
    expect(outcome.applyResult.appliedOperations).toBe(2);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply.mock.calls[0]).toEqual([{ diff }, { changeMode: 'direct' }]);
    const retriedDiff = apply.mock.calls[1]?.[0]?.diff as typeof diff;
    expect(apply.mock.calls[1]).toEqual([{ diff: retriedDiff }, { changeMode: 'direct' }]);
    expect(retriedDiff.payload.analysis.families.find((family) => family.family === 'sections')?.state).toBe(
      'unchanged',
    );
    expect(retriedDiff.payload.analysis.families.find((family) => family.family === 'settings')?.state).toBe(
      'unchanged',
    );
    expect(retriedDiff.payload.analysis.families.find((family) => family.family === 'theme')?.state).toBe('unchanged');
    expect(
      retriedDiff.payload.semanticAnalysis.familyDeltas.find((family) => family.family === 'sections')?.detectedChange,
    ).toBe(false);
    expect(
      retriedDiff.payload.semanticAnalysis.familyDeltas.find((family) => family.family === 'settings')?.detectedChange,
    ).toBe(false);
    expect(
      retriedDiff.payload.semanticAnalysis.familyDeltas.find((family) => family.family === 'theme')?.detectedChange,
    ).toBe(false);
  });

  it('retries direct compare apply when only a subset of ws07 visual families blocks apply', () => {
    const ws07Error = Object.assign(
      new Error(
        'diff.apply: full diff apply cannot safely replay changed families ' +
          '[sections (deferred: compare-apply-deferred (ws07))] in this build.',
      ),
      { code: 'CAPABILITY_UNSUPPORTED' },
    );
    const diff = {
      payload: {
        analysis: {
          families: [
            { family: 'body', state: 'changed-supported' },
            { family: 'sections', state: 'changed-supported' },
          ],
        },
        semanticAnalysis: {
          familyDeltas: [
            { family: 'body', detectedChange: true },
            { family: 'sections', detectedChange: true },
          ],
        },
        familyPolicy: [
          { family: 'body', disposition: 'deferred', changed: true, applyRequired: true },
          { family: 'tables', disposition: 'deferred', changed: true, applyRequired: true },
        ],
        mainDocument: {
          target: { xml: '<w:document><w:body><w:tbl/></w:body></w:document>' },
        },
      },
    };
    const apply = vi
      .fn()
      .mockImplementationOnce(() => {
        throw ws07Error;
      })
      .mockImplementationOnce(() => ({ appliedOperations: 1, diagnostics: [] }));

    const outcome = applyCompareWithWs09Fallback({ diff: { apply } }, diff);

    expect(outcome.changeMode).toBe('direct');
    expect(outcome.fallbackFromTracked).toBe(true);
    expect(apply).toHaveBeenCalledTimes(2);
    const retriedDiff = apply.mock.calls[1]?.[0]?.diff as typeof diff;
    expect(retriedDiff.payload.analysis.families.find((family) => family.family === 'sections')?.state).toBe(
      'unchanged',
    );
    expect(
      retriedDiff.payload.semanticAnalysis.familyDeltas.find((family) => family.family === 'sections')?.detectedChange,
    ).toBe(false);
  });

  it('rethrows non-ws09 compare apply failures', () => {
    const error = Object.assign(new Error('boom'), { code: 'PRECONDITION_FAILED' });
    const apply = vi.fn(() => {
      throw error;
    });

    expect(() => applyCompareWithWs09Fallback({ diff: { apply } }, { id: 'diff' })).toThrow(error);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('recognizes the ws09 tracked deferral message', () => {
    const error = Object.assign(
      new Error('diff.apply: compare-apply-deferred (ws09): table topology changes are detected'),
      { code: 'CAPABILITY_UNSUPPORTED' },
    );

    expect(isWs09TrackedCompareDeferred(error)).toBe(true);
    expect(compareApplyDeferredMessage(error)).toContain('retried the same diff in direct mode');
  });

  it('awaits mutation readiness paint when the active editor exposes it', async () => {
    const whenPainted = vi.fn(async () => undefined);

    await settleCompareApplyPaint({
      diff: { apply: vi.fn() },
      documentMutationReadiness: { whenPainted },
    });

    expect(whenPainted).toHaveBeenCalledTimes(1);
    expect(whenPainted).toHaveBeenCalledWith();
  });

  it('noops when mutation readiness is unavailable', async () => {
    await expect(settleCompareApplyPaint({ diff: { apply: vi.fn() } })).resolves.toBeUndefined();
  });

  it('captures debug snapshot from doc text, mounted projection, and render readiness', () => {
    const hostDoc = { getText: vi.fn(() => 'alpha beta') };
    const snapshot = captureCompareApplyDebugSnapshot({
      diff: {
        apply: vi.fn(),
      },
      doc: hostDoc,
      host: {
        readMountedProjectionBlocks: vi.fn(() => [{ kind: 'paragraph' }, { kind: 'table' }, { kind: 'table' }]),
        getRenderReadinessSnapshot: vi.fn(() => ({ renderStage: 'render-complete' })),
        getDocumentFacade: vi.fn(() => ({ available: true as const, doc: hostDoc })),
      },
    });

    expect(snapshot).toEqual({
      textLength: 'alpha beta'.length,
      hostFacadeTextLength: 'alpha beta'.length,
      projectionBlockCount: 3,
      projectionTableCount: 2,
      renderStage: 'render-complete',
      hostFacadeMatchesEditorDoc: true,
    });
  });
});
