import { test } from '../fixtures/superdoc.js';

test.use({
  config: {
    toolbar: 'full',
    comments: 'off',
    trackChanges: true,
    hideCaret: true,
    hideSelection: true,
  },
});

const BOOKMARK_ID = '5000';
const BOOKMARK_NAME = 'annotmark;id=69c65e86-20bc-42d1-83f1-37019fb7d173;data={};';

test('suggesting double backspace with bookmark-wrapped runs tracks period and preceding character', async ({
  superdoc,
}) => {
  await superdoc.page.evaluate(
    ({ bookmarkId, bookmarkName }) => {
      const editor = (window as any).editor;
      const schema = editor.state.schema;

      const bookmarkStart = (id: string, name: string) => schema.nodes.bookmarkStart.create({ id, name });
      const bookmarkEnd = (id: string) => schema.nodes.bookmarkEnd.create({ id });
      const runAttrs = { rsidR: '00551B40', rsidRPr: '0043097F' };

      const paragraph = schema.nodes.paragraph.create({}, [
        schema.nodes.run.create(runAttrs, [
          bookmarkStart(bookmarkId, bookmarkName),
          schema.text('any and all'),
          bookmarkEnd(bookmarkId),
        ]),
        schema.nodes.run.create(runAttrs, [
          bookmarkStart(bookmarkId, bookmarkName),
          schema.text(' such Confidential Material'),
          bookmarkEnd(bookmarkId),
        ]),
        schema.nodes.run.create(runAttrs, [schema.text('.')]),
      ]);

      const doc = schema.nodes.doc.create({}, [paragraph]);
      editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content));
      editor.setOptions({ user: { name: 'Guest Reviewer', email: null } });
    },
    { bookmarkId: BOOKMARK_ID, bookmarkName: BOOKMARK_NAME },
  );
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  const periodRange = await superdoc.findTextRange('.');
  await superdoc.setTextSelection(periodRange.to);
  await superdoc.press('Backspace');
  await superdoc.waitForStable();
  await superdoc.press('Backspace');
  await superdoc.waitForStable();

  await superdoc.screenshot('behavior/tracked-delete-terminal-period-bookmark-runs-double-backspace');
});
