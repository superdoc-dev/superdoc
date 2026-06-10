import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';
import { listTrackChanges } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'off', trackChanges: true } });

const PINYIN_INPUT = 'nihao';
const COMMITTED_TEXT = '你好';

async function composeChineseImeCommit(superdoc: Pick<SuperDocFixture, 'page'>) {
  const result = await superdoc.page.evaluate(
    async ({ preeditText, committedText }) => {
      const superdocInstance = (window as any).superdoc;
      const editor = (window as any).editor;
      const visibleHost =
        superdocInstance?.activeEditor?.presentationEditor?.visibleHost ??
        superdocInstance?.activeEditor?.visibleHost ??
        document.querySelector('#editor');
      const hiddenEditor = editor?.view?.dom as HTMLElement | undefined;

      if (!visibleHost || !hiddenEditor) {
        throw new Error('Could not resolve visible host or hidden editor DOM for composition input.');
      }

      editor.view.focus();
      const beforeText = editor.state?.doc?.textContent ?? '';

      const dispatchComposition = (type: 'compositionstart' | 'compositionupdate' | 'compositionend', data: string) =>
        visibleHost.dispatchEvent(new CompositionEvent(type, { data, bubbles: true, cancelable: true }));

      dispatchComposition('compositionstart', '');
      dispatchComposition('compositionupdate', preeditText);

      hiddenEditor.focus();
      const insertedPreedit = document.execCommand('insertText', false, preeditText);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

      editor.commands.setTextSelection({
        from: Math.max(1, editor.state.selection.from - preeditText.length),
        to: editor.state.selection.from,
      });
      hiddenEditor.focus();
      const inserted = document.execCommand('insertText', false, committedText);

      dispatchComposition('compositionend', committedText);
      await new Promise((resolve) => setTimeout(resolve, 0));

      return {
        inserted,
        insertedPreedit,
        beforeText,
        afterText: editor.state?.doc?.textContent ?? '',
      };
    },
    { preeditText: PINYIN_INPUT, committedText: COMMITTED_TEXT },
  );

  if (!result.inserted && !result.insertedPreedit && result.beforeText === result.afterText) {
    throw new Error(
      `Composition simulation did not mutate document content (inserted=${String(result.inserted)}, beforeLength=${result.beforeText.length}, afterLength=${result.afterText.length}).`,
    );
  }
}

for (const mode of ['editing', 'suggesting'] as const) {
  test(`Chinese IME commit keeps composed characters in ${mode} mode`, async ({ superdoc }) => {
    await superdoc.setDocumentMode(mode);
    await superdoc.waitForStable();

    await composeChineseImeCommit(superdoc);
    await superdoc.waitForStable();

    await expect.poll(() => superdoc.getTextContent()).toBe(COMMITTED_TEXT);
    await expect(superdoc.page.locator('.superdoc-line').filter({ hasText: COMMITTED_TEXT }).first()).toBeVisible();

    const text = await superdoc.getTextContent();
    expect(text).not.toContain(PINYIN_INPUT);

    if (mode === 'suggesting') {
      const trackChanges = await listTrackChanges(superdoc.page);
      expect(trackChanges.total).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(trackChanges.items)).toContain(COMMITTED_TEXT);
    }
  });
}

test('Chinese IME composition does not repaint the visible layout before compositionend', async ({
  superdoc,
  browserName,
}) => {
  test.skip(browserName === 'webkit', 'synthetic composition plumbing differs on WebKit');

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  const visibleMutationCount = await superdoc.page.evaluate(
    async ({ preeditText }) => {
      const superdocInstance = (window as any).superdoc;
      const editor = (window as any).editor;
      const visibleHost =
        superdocInstance?.activeEditor?.presentationEditor?.visibleHost ??
        superdocInstance?.activeEditor?.visibleHost ??
        document.querySelector('#editor');
      const hiddenEditor = editor?.view?.dom as HTMLElement | undefined;

      if (!visibleHost || !hiddenEditor) {
        throw new Error('Could not resolve visible host or hidden editor DOM for composition input.');
      }

      let visibleMutations = 0;
      const observer = new MutationObserver((records) => {
        visibleMutations += records.filter((record) => !hiddenEditor.contains(record.target)).length;
      });
      observer.observe(visibleHost, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true,
      });

      const dispatchComposition = (type: 'compositionstart' | 'compositionupdate' | 'compositionend', data: string) =>
        visibleHost.dispatchEvent(new CompositionEvent(type, { data, bubbles: true, cancelable: true }));

      editor.view.focus();
      dispatchComposition('compositionstart', '');
      dispatchComposition('compositionupdate', preeditText);

      hiddenEditor.focus();
      document.execCommand('insertText', false, preeditText);

      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      observer.disconnect();
      dispatchComposition('compositionend', '');

      return visibleMutations;
    },
    { preeditText: PINYIN_INPUT },
  );

  expect(visibleMutationCount).toBe(0);
});

test.describe('suggesting-mode composition internals', () => {
  test.use({ config: { toolbar: 'full', comments: 'panel', trackChanges: true } });

  /**
   * SD-2368: track-changes rewriting must be deferred while a composition is
   * in flight. Wrapping the composing text in track-insert mark spans and
   * decoration elements restructures the hidden editor's composing DOM node,
   * which makes Chrome abort the native composition on every keystroke. The
   * native abort itself cannot be reproduced synthetically, but the
   * restructuring that causes it can: no tracked marks or track-* elements
   * may exist mid-composition, and the tracked insert must appear only after
   * compositionend.
   */
  test('suggesting mode keeps the composing text untracked until compositionend', async ({ superdoc, browserName }) => {
    // WebKit routes the synthetic execCommand preedit through a
    // non-composition transaction (no `composition` meta / composing flag), so
    // the deferral legitimately does not engage there — and WebKit never
    // exhibited the native composition breakage either. The mid-composition
    // lock is exercised on Chromium and Firefox.
    test.skip(browserName === 'webkit', 'synthetic composition plumbing differs on WebKit');

    await superdoc.setDocumentMode('suggesting');
    await superdoc.waitForStable();

    const midComposition = await superdoc.page.evaluate(
      async ({ preeditText }) => {
        const superdocInstance = (window as any).superdoc;
        const editor = (window as any).editor;
        const visibleHost =
          superdocInstance?.activeEditor?.presentationEditor?.visibleHost ??
          superdocInstance?.activeEditor?.visibleHost ??
          document.querySelector('#editor');
        const hiddenEditor = editor?.view?.dom as HTMLElement | undefined;
        if (!visibleHost || !hiddenEditor) {
          throw new Error('Could not resolve visible host or hidden editor DOM for composition input.');
        }

        editor.view.focus();
        const dispatchComposition = (type: string, data: string) =>
          visibleHost.dispatchEvent(new CompositionEvent(type, { data, bubbles: true, cancelable: true }));

        dispatchComposition('compositionstart', '');
        dispatchComposition('compositionupdate', preeditText);

        hiddenEditor.focus();
        document.execCommand('insertText', false, preeditText);
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

        let trackedMarks = 0;
        editor.state.doc.descendants((node: any) => {
          if (node.marks?.some((mark: any) => mark.type.name === 'trackInsert' || mark.type.name === 'trackDelete')) {
            trackedMarks += 1;
          }
        });

        return {
          preeditApplied: (editor.state?.doc?.textContent ?? '').includes(preeditText),
          trackedMarks,
          trackedElements: hiddenEditor.querySelectorAll(
            '.track-insert, .track-delete, .track-insert-dec, .track-delete-dec',
          ).length,
        };
      },
      { preeditText: PINYIN_INPUT },
    );

    expect(midComposition.preeditApplied).toBe(true);
    expect(midComposition.trackedMarks).toBe(0);
    expect(midComposition.trackedElements).toBe(0);

    // Complete the commit; the post-composition flush must produce the
    // tracked insertion.
    await superdoc.page.evaluate(
      async ({ preeditText, committedText }) => {
        const superdocInstance = (window as any).superdoc;
        const editor = (window as any).editor;
        const visibleHost =
          superdocInstance?.activeEditor?.presentationEditor?.visibleHost ??
          superdocInstance?.activeEditor?.visibleHost ??
          document.querySelector('#editor');
        const hiddenEditor = editor.view.dom as HTMLElement;

        editor.commands.setTextSelection({
          from: Math.max(1, editor.state.selection.from - preeditText.length),
          to: editor.state.selection.from,
        });
        hiddenEditor.focus();
        document.execCommand('insertText', false, committedText);
        visibleHost.dispatchEvent(
          new CompositionEvent('compositionend', { data: committedText, bubbles: true, cancelable: true }),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
      },
      { preeditText: PINYIN_INPUT, committedText: COMMITTED_TEXT },
    );
    await superdoc.waitForStable();

    await expect.poll(() => superdoc.getTextContent()).toBe(COMMITTED_TEXT);
    await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBeGreaterThanOrEqual(1);
    await expect
      .poll(() => superdoc.page.evaluate(() => JSON.stringify((window as any).editor.state.doc.toJSON())))
      .toContain('trackInsert');
  });

  /**
   * SD-2368: the post-composition tracking flush is a mark-only transaction
   * whose step maps carry no ranges, so the sidebar's id collector can only
   * learn the new change from transaction meta. This locks the bubble
   * pipeline end to end.
   */
  test('suggesting mode composition creates a tracked-change sidebar bubble', async ({ superdoc }) => {
    await superdoc.setDocumentMode('suggesting');
    await superdoc.waitForStable();

    await composeChineseImeCommit(superdoc);
    await superdoc.waitForStable();

    await expect.poll(() => superdoc.getTextContent()).toBe(COMMITTED_TEXT);
    await expect(superdoc.page.locator('#comments-panel')).toBeVisible();
    await expect
      .poll(() =>
        superdoc.page.locator('#comments-panel .tracked-change-text').filter({ hasText: COMMITTED_TEXT }).count(),
      )
      .toBeGreaterThan(0);
  });
});
