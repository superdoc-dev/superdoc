import { expect, test, type Page } from '../../fixtures/superdoc.js';
import { FOOTER_FOOTNOTE_TRANSITION_DOC_PATH, TWO_SECTION_FOOTER_DOC_PATH } from '../../helpers/story-fixtures.js';
import {
  activateFooter,
  clickTextBoundary,
  expectActiveStoryText,
  expectActiveStoryTextToContain,
  getActiveStorySession,
  getNoteSurfaceLocator,
  getTextBoundaryPoint,
  waitForActiveStory,
} from '../../helpers/story-surfaces.js';

test.use({
  config: {
    documentMode: 'editing',
    showCaret: true,
    showSelection: true,
  },
});

function trackPageErrors(page: Page) {
  const errors: string[] = [];

  const handlePageError = (error: Error) => {
    errors.push(`pageerror:${error.message}`);
  };

  const handleConsole = (message: { type(): string; text(): string }) => {
    if (message.type() === 'error') {
      errors.push(`console:${message.text()}`);
    }
  };

  page.on('pageerror', handlePageError);
  page.on('console', handleConsole);

  return {
    errors,
    stop() {
      page.off('pageerror', handlePageError);
      page.off('console', handleConsole);
    },
  };
}

test('page-2 footer clicks keep mapping to the second-section footer text', async ({ superdoc }) => {
  await superdoc.loadDocument(TWO_SECTION_FOOTER_DOC_PATH);
  await superdoc.waitForStable();

  await superdoc.assertPageCount(2);

  const footer = await activateFooter(superdoc, 1);
  await waitForActiveStory(superdoc.page, {
    kind: 'story',
    storyType: 'headerFooterPart',
    refId: 'rId9',
  });
  await expectActiveStoryText(superdoc.page, 'Appendix footer');

  let footerText = 'Appendix footer';

  await clickTextBoundary(superdoc.page, footer, footerText, 0);
  await superdoc.page.keyboard.type('S');
  await superdoc.waitForStable();
  footerText = 'SAppendix footer';
  await expectActiveStoryText(superdoc.page, footerText);

  await clickTextBoundary(superdoc.page, footer, footerText, 'SAppendix fo'.length);
  await superdoc.page.keyboard.type('M');
  await superdoc.waitForStable();
  footerText = 'SAppendix foMoter';
  await expectActiveStoryText(superdoc.page, footerText);

  await clickTextBoundary(superdoc.page, footer, footerText, footerText.length);
  await superdoc.page.keyboard.type('E');
  await superdoc.waitForStable();
  footerText = 'SAppendix foMoterE';
  await expectActiveStoryText(superdoc.page, footerText);
});

test('clicking from a footer into a footnote exits footer mode cleanly and keeps note clicks mapped', async ({
  superdoc,
  browserName,
}) => {
  test.fixme(
    browserName === 'firefox',
    'Headless Firefox does not yet persist hidden-host footnote edits through the behavior harness.',
  );

  await superdoc.loadDocument(FOOTER_FOOTNOTE_TRANSITION_DOC_PATH);
  await superdoc.waitForStable();

  await activateFooter(superdoc);
  await waitForActiveStory(superdoc.page, {
    kind: 'story',
    storyType: 'headerFooterPart',
    refId: 'rId10',
  });
  await expectActiveStoryText(superdoc.page, 'Transition footer');

  const tracker = trackPageErrors(superdoc.page);
  try {
    const footnote = getNoteSurfaceLocator(superdoc.page, {
      storyType: 'footnote',
      noteId: '1',
    });
    await footnote.scrollIntoViewIfNeeded();
    await expect(footnote).toContainText('This is a simple footnote');

    await clickTextBoundary(superdoc.page, footnote, 'footnote', 1);
    await superdoc.waitForStable();
    await waitForActiveStory(superdoc.page, {
      kind: 'story',
      storyType: 'footnote',
      noteId: '1',
    });
    await expectActiveStoryTextToContain(superdoc.page, 'This is a simple footnote');

    const inNotePoint = await getTextBoundaryPoint(footnote, 'simple', 3);
    await superdoc.page.mouse.click(inNotePoint.x, inNotePoint.y);
    await superdoc.waitForStable();

    const clickState = await superdoc.page.evaluate(({ x, y }) => {
      const presentation = (window as any).editor?.presentationEditor;
      const activeEditor = presentation?.getActiveEditor?.();
      const session = presentation?.getStorySessionManager?.()?.getActiveSession?.();
      const selection = activeEditor?.state?.selection;

      return {
        session: session?.locator ?? null,
        selection: selection ? { from: selection.from, to: selection.to } : null,
        hit: presentation?.hitTest?.(x, y)?.pos ?? null,
      };
    }, inNotePoint);

    expect(clickState.session).toEqual({
      kind: 'story',
      storyType: 'footnote',
      noteId: '1',
    });
    expect(clickState.selection).toEqual({
      from: clickState.hit,
      to: clickState.hit,
    });

    await superdoc.page.keyboard.type('Z');
    await superdoc.waitForStable();

    await expectActiveStoryTextToContain(superdoc.page, 'simZple');
    await expect(footnote).toContainText('simZple footnote');
    await expect
      .poll(() => getActiveStorySession(superdoc.page))
      .toEqual({
        kind: 'story',
        storyType: 'footnote',
        noteId: '1',
      });
    expect(tracker.errors).toEqual([]);
  } finally {
    tracker.stop();
  }
});
