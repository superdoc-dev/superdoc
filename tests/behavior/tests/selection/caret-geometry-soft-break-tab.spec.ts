import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

test.use({ config: { layout: true } });

type RectSnapshot = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

type SoftBreakMetrics = {
  caret: RectSnapshot;
  line: RectSnapshot;
  paddingLeft: number;
  paddingRight: number;
  textAlign: string;
  childElementCount: number;
  pmStart: string | null;
  pmEnd: string | null;
};

type TabCaretMetrics = {
  caret: RectSnapshot;
  line: RectSnapshot;
  tab: RectSnapshot;
};

async function runEditorCommand(superdoc: SuperDocFixture, name: string, arg?: unknown): Promise<void> {
  const selection = await superdoc.page.evaluate(
    ({ commandName, commandArg }) => {
      const editor = (window as any).editor;
      const command = editor?.commands?.[commandName];
      if (!command) throw new Error(`Command "${commandName}" not found`);
      if (commandArg === undefined) command();
      else command(commandArg);
      return { from: editor.state.selection.from, to: editor.state.selection.to };
    },
    { commandName: name, commandArg: arg },
  );
  await superdoc.setTextSelection(selection.from, selection.to);
  await superdoc.waitForStable();
}

async function getSoftBreakMetrics(superdoc: SuperDocFixture, pos: number): Promise<SoftBreakMetrics> {
  return superdoc.page.evaluate((targetPos) => {
    const toRectSnapshot = (rect: DOMRect): RectSnapshot => ({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
    const editor = (window as any).editor;
    const caret = editor?.coordsAtPos?.(targetPos);
    if (!caret) throw new Error(`coordsAtPos returned null for ${targetPos}`);

    const lines = Array.from(document.querySelectorAll<HTMLElement>('.superdoc-line'));
    const continuationLine =
      lines.find((line) => {
        const pmStart = Number(line.dataset.pmStart);
        const pmEnd = Number(line.dataset.pmEnd);
        return (
          line.childElementCount === 0 &&
          Number.isFinite(pmStart) &&
          Number.isFinite(pmEnd) &&
          pmStart <= targetPos &&
          targetPos <= pmEnd
        );
      }) ?? lines.at(-1);
    if (!continuationLine) throw new Error('No rendered continuation line found');

    const style = getComputedStyle(continuationLine);
    return {
      caret: toRectSnapshot(caret),
      line: toRectSnapshot(continuationLine.getBoundingClientRect()),
      paddingLeft: parseFloat(style.paddingLeft) || 0,
      paddingRight: parseFloat(style.paddingRight) || 0,
      textAlign: style.textAlign,
      childElementCount: continuationLine.childElementCount,
      pmStart: continuationLine.dataset.pmStart ?? null,
      pmEnd: continuationLine.dataset.pmEnd ?? null,
    };
  }, pos);
}

async function getTabCaretMetrics(superdoc: SuperDocFixture, pos: number): Promise<TabCaretMetrics> {
  return superdoc.page.evaluate((targetPos) => {
    const toRectSnapshot = (rect: DOMRect): RectSnapshot => ({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
    const editor = (window as any).editor;
    const caret = editor?.coordsAtPos?.(targetPos);
    if (!caret) throw new Error(`coordsAtPos returned null for ${targetPos}`);

    const tab = document.querySelector<HTMLElement>('.superdoc-tab');
    const line = tab?.closest<HTMLElement>('.superdoc-line');
    if (!tab || !line) throw new Error('Rendered tab line not found');

    return {
      caret: toRectSnapshot(caret),
      line: toRectSnapshot(line.getBoundingClientRect()),
      tab: toRectSnapshot(tab.getBoundingClientRect()),
    };
  }, pos);
}

for (const alignment of ['left', 'center', 'right'] as const) {
  test(`coordsAtPos uses the empty soft-break continuation line for ${alignment} alignment`, async ({ superdoc }) => {
    await superdoc.type('Hello');
    if (alignment !== 'left') {
      await runEditorCommand(superdoc, 'setTextAlign', alignment);
    }
    await superdoc.press('Shift+Enter');
    await superdoc.waitForStable();

    const { from } = await superdoc.getSelection();
    const metrics = await getSoftBreakMetrics(superdoc, from);
    const expectedX =
      alignment === 'center'
        ? (metrics.line.left + metrics.paddingLeft + metrics.line.right - metrics.paddingRight) / 2
        : alignment === 'right'
          ? metrics.line.right - metrics.paddingRight
          : metrics.line.left + metrics.paddingLeft;

    expect(metrics.childElementCount).toBe(0);
    expect(metrics.pmStart).not.toBeNull();
    expect(metrics.pmEnd).not.toBeNull();
    expect(metrics.textAlign).toBe(alignment);
    expect(Math.abs(metrics.caret.left - expectedX)).toBeLessThanOrEqual(1);
    expect(Math.abs(metrics.caret.top - metrics.line.top)).toBeLessThanOrEqual(1);
  });
}

test('coordsAtPos anchors trailing tab caret Y to the line top', async ({ superdoc }) => {
  await runEditorCommand(superdoc, 'setFontSize', '36pt');
  await superdoc.type('A');
  await runEditorCommand(superdoc, 'setFontSize', '12pt');
  await superdoc.press('Tab');
  await superdoc.waitForStable();

  const { from } = await superdoc.getSelection();
  const metrics = await getTabCaretMetrics(superdoc, from);

  expect(metrics.tab.top - metrics.line.top).toBeGreaterThan(2);
  expect(Math.abs(metrics.caret.top - metrics.line.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.caret.left - metrics.tab.right)).toBeLessThanOrEqual(1);
});
