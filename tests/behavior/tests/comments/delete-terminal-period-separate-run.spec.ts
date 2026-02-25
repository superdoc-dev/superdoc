import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'off', trackChanges: true } });

const BOOKMARK_ID = '5000';
const BOOKMARK_NAME = 'annotmark;id=69c65e86-20bc-42d1-83f1-37019fb7d173;data={};';

const seedBookmarkWrappedRunsWithTerminalPeriod = async (superdoc: any) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.page.evaluate(
    ({ bookmarkId, bookmarkName }) => {
      const editor = (window as any).editor;
      const schema = editor.state.schema;

      const bookmarkStart = (id: string, name: string) => schema.nodes.bookmarkStart.create({ id, name });
      const bookmarkEnd = (id: string) => schema.nodes.bookmarkEnd.create({ id });
      const runAttrs = { rsidR: '00551B40', rsidRPr: '0043097F' };

      // Mirrors the OOXML run structure:
      // <w:r><w:bookmarkStart/><w:t>...</w:t><w:bookmarkEnd/></w:r>
      // <w:r><w:bookmarkStart/><w:t xml:space="preserve"> ...</w:t><w:bookmarkEnd/></w:r>
      // <w:r><w:t>.</w:t></w:r>
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
      editor.setOptions({ user: { name: 'Guest Reviewer', email: 'track@example.com' } });
    },
    { bookmarkId: BOOKMARK_ID, bookmarkName: BOOKMARK_NAME },
  );
  await superdoc.waitForStable();
};

test('two backspaces track period and l for bookmark-wrapped runs', async ({ superdoc }) => {
  await seedBookmarkWrappedRunsWithTerminalPeriod(superdoc);
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  const periodPos = await superdoc.findTextPos('.');
  await superdoc.setTextSelection(periodPos + 1);
  await superdoc.press('Backspace');
  await superdoc.waitForStable();
  await superdoc.press('Backspace');
  await superdoc.waitForStable();

  const snapshot = await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const deletedText: string[] = [];
    let bookmarkStartCount = 0;
    let bookmarkEndCount = 0;

    editor.state.doc.descendants((node: any) => {
      if (node.type?.name === 'bookmarkStart') bookmarkStartCount += 1;
      if (node.type?.name === 'bookmarkEnd') bookmarkEndCount += 1;
      if (!node.isText || !node.text) return;
      for (const mark of node.marks ?? []) {
        if (mark.type?.name !== 'trackDelete') continue;
        deletedText.push(node.text);
      }
    });
    return {
      deletedCombined: deletedText.join(''),
      bookmarkStartCount,
      bookmarkEndCount,
    };
  });

  expect(snapshot.deletedCombined).toBe('l.');
  expect(snapshot.bookmarkStartCount).toBe(2);
  expect(snapshot.bookmarkEndCount).toBe(2);
});
