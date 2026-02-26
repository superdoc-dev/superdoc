import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../test-data/basic/sd-site-doc-2026.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');

/**
 * SD-1951: Highlighting text right-to-left (backward selection) and typing a
 * replacement should preserve the original text's styling. On main this was
 * broken because the backward selection caused ProseMirror to misinterpret the
 * insertText input as deleteContentBackward.
 */
test('backward-selected text replacement preserves original style (SD-1951)', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const titleText = 'Mutual Agreement for Document Excellence';
  await superdoc.assertTextContains(titleText);

  // Capture the title's marks before replacement
  const titleStart = await superdoc.findTextPos(titleText);
  const titleEnd = titleStart + titleText.length;
  const originalMarks = await superdoc.getMarkAttrsAtPos(titleStart);

  // Create a BACKWARD selection (right-to-left) and dispatch a beforeinput
  // event to simulate typing. This exercises the exact code path from the
  // SD-1951 fix: the editable extension's beforeinput handler intercepts
  // backward selection + insertText and replaces text with correct marks.
  //
  // We dispatch via view.dom so ProseMirror's event pipeline processes it
  // naturally through runCustomHandler → handleDOMEvents → our handler.
  const result = await superdoc.page.evaluate(
    ({ from, to }) => {
      const { state, view } = (window as any).editor;
      const TextSelectionClass = state.selection.constructor;
      const backward = TextSelectionClass.create(state.doc, to, from);
      view.dispatch(state.tr.setSelection(backward));

      // Dispatch a native beforeinput event on view.dom
      const event = new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: 'Z',
        bubbles: true,
        cancelable: true,
      });
      view.dom.dispatchEvent(event);

      return {
        prevented: event.defaultPrevented,
        docText: (window as any).editor.state.doc.textContent.substring(0, 80),
      };
    },
    { from: titleStart, to: titleEnd },
  );
  await superdoc.waitForStable();

  // On the fix branch, the handler intercepts and replaces text (preventDefault).
  // On main, the handler doesn't intercept backward selection + insertText.
  expect(result.prevented).toBe(true);
  expect(result.docText).toContain('Z');
  expect(result.docText).not.toContain(titleText);

  // The replacement character must appear in the document
  await superdoc.assertTextContains('Z');
  await superdoc.assertTextNotContains(titleText);

  // The replacement must retain the original title's marks (font family, size),
  // not inherit from the previous paragraph or document defaults.
  const zPos = await superdoc.findTextPos('Z');
  const replacementMarks = await superdoc.getMarkAttrsAtPos(zPos);

  const getTextStyleAttrs = (marks: Array<{ name: string; attrs: Record<string, unknown> }>) =>
    marks.find((m) => m.name === 'textStyle')?.attrs;

  const originalStyle = getTextStyleAttrs(originalMarks);
  const replacementStyle = getTextStyleAttrs(replacementMarks);

  expect(originalStyle).toBeDefined();
  expect(replacementStyle).toBeDefined();
  expect(replacementStyle!.fontFamily).toBe(originalStyle!.fontFamily);
  expect(replacementStyle!.fontSize).toBe(originalStyle!.fontSize);
});
