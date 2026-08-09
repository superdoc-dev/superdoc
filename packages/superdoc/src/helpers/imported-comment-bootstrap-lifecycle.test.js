import { describe, expect, it } from 'vite-plus/test';
import SuperDocSource from '../SuperDoc.vue?raw';

describe('SuperDoc imported-comment bootstrap lifecycle wiring', () => {
  it('cancels the cleared document before v2 adapters are released', () => {
    const hookStart = SuperDocSource.indexOf('const onV2RenderCleared = (payload) =>');
    const cancel = SuperDocSource.indexOf(
      'commentsStore.cancelImportedTrackedChangeBootstrap?.(clearedDocumentId ?? undefined);',
      hookStart,
    );
    const releaseAdapter = SuperDocSource.indexOf('commentsStore.setV2CommentsAdapter?.(null);', hookStart);

    expect(hookStart).toBeGreaterThanOrEqual(0);
    expect(cancel).toBeGreaterThan(hookStart);
    expect(releaseAdapter).toBeGreaterThan(cancel);
  });

  it('cancels every pending store task when the component unmounts', () => {
    const hookStart = SuperDocSource.indexOf('onBeforeUnmount(() => {');
    const cancel = SuperDocSource.indexOf('commentsStore.cancelImportedTrackedChangeBootstrap?.();', hookStart);
    const hookEnd = SuperDocSource.indexOf('\n});', hookStart);

    expect(hookStart).toBeGreaterThanOrEqual(0);
    expect(cancel).toBeGreaterThan(hookStart);
    expect(cancel).toBeLessThan(hookEnd);
  });
});
