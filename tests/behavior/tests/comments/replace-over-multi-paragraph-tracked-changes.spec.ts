import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', comments: 'on', trackChanges: true } });

test('markDeletion plain delete preserves existing deletion ids', async ({ superdoc }) => {
  // Seed document with a pre-existing foreign trackDelete mark before enabling suggesting mode.
  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const schema = editor.state.schema;
    const date = new Date().toISOString();

    const oldDeleteMark = schema.marks.trackDelete.create({
      id: 'del-old',
      author: 'Other User',
      authorEmail: 'other@example.com',
      date,
    });

    const run = schema.nodes.run.create({}, [
      schema.text('Keep '),
      schema.text('OldDelete', [oldDeleteMark]),
      schema.text(' Plain'),
    ]);
    const doc = schema.nodes.doc.create({}, schema.nodes.paragraph.create({}, run));
    editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content));
  });
  await superdoc.waitForStable();

  // Record mark IDs before the delete.
  const beforeById = await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const result: Record<string, string> = {};
    editor.state.doc.descendants((node: any) => {
      if (!node.isText || !node.text) return;
      for (const mark of node.marks ?? []) {
        if (mark.type?.name !== 'trackDelete') continue;
        const id = mark.attrs?.id;
        if (!id) continue;
        result[id] = (result[id] ?? '') + node.text;
      }
    });
    return result;
  });

  // Configure user for tracked transactions and switch to suggesting mode.
  await superdoc.page.evaluate(() => {
    (window as any).editor.setOptions({
      user: { name: 'Track Tester', email: 'track@example.com' },
    });
  });
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  // Select the range covering "OldDelete" through " Plain" and delete it.
  const { from, to } = await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const findTextPos = (needle: string): number => {
      let found: number | null = null;
      editor.state.doc.descendants((node: any, pos: number) => {
        if (found !== null) return false;
        if (!node.isText || !node.text) return;
        const idx = node.text.indexOf(needle);
        if (idx === -1) return;
        found = pos + idx;
      });
      if (found === null) throw new Error(`Text not found: ${needle}`);
      return found;
    };
    const from = findTextPos('OldDelete');
    const plainPos = findTextPos(' Plain');
    const to = plainPos + ' Plain'.length;
    return { from, to };
  });

  await superdoc.setTextSelection(from, to);
  await superdoc.page.keyboard.press('Delete');
  await superdoc.waitForStable();

  // Read resulting marks.
  const afterById = await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const result: Record<string, string> = {};
    editor.state.doc.descendants((node: any) => {
      if (!node.isText || !node.text) return;
      for (const mark of node.marks ?? []) {
        if (mark.type?.name !== 'trackDelete') continue;
        const id = mark.attrs?.id;
        if (!id) continue;
        result[id] = (result[id] ?? '') + node.text;
      }
    });
    return result;
  });

  const beforeOldId = Object.keys(beforeById).find((id) => beforeById[id].includes('OldDelete')) ?? null;
  const afterOldId = Object.keys(afterById).find((id) => afterById[id].includes('OldDelete')) ?? null;
  const afterPlainId = Object.keys(afterById).find((id) => afterById[id].includes('Plain')) ?? null;

  expect(beforeOldId).not.toBeNull();
  expect(afterOldId).not.toBeNull();
  expect(afterPlainId).not.toBeNull();
  expect(afterOldId).toBe(beforeOldId);
  expect(afterOldId).not.toBe(afterPlainId);
});
