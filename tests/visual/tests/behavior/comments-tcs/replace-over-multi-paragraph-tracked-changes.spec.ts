import { test } from '../../fixtures/superdoc.js';

test.use({ config: { comments: 'on', trackChanges: true, hideSelection: false } });

test('replace over multi-paragraph tracked changes stays coherent', async ({ superdoc }) => {
  await superdoc.type('Line one stays');
  await superdoc.newLine();
  await superdoc.type('Line two keeps tailword2');
  await superdoc.newLine();
  await superdoc.type('Line three keeps tailword3');
  await superdoc.waitForStable();
  await superdoc.screenshot('it-67-step-1-initial-lines');

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  const tail2 = await superdoc.findTextRange('tailword2');
  await superdoc.setTextSelection(tail2.from, tail2.to);
  await superdoc.press('Backspace');

  const tail3 = await superdoc.findTextRange('tailword3');
  await superdoc.setTextSelection(tail3.from, tail3.to);
  await superdoc.press('Backspace');

  await superdoc.waitForStable();
  await superdoc.screenshot('it-67-step-2-lines-2-3-last-word-deleted');

  const line2Start = await superdoc.findTextRange('Line two keeps');
  const line3Tail = await superdoc.findTextRange('tailword3');
  await superdoc.setTextSelection(line2Start.from, line3Tail.to);
  await superdoc.type('Merged suggestion');

  await superdoc.waitForStable();
  await superdoc.screenshot('it-67-step-3-replaced-lines-2-3-with-single-change');
});
