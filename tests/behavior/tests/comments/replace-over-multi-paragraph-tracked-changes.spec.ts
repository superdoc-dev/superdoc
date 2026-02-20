import { test, expect } from '../../fixtures/superdoc.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test.use({ config: { toolbar: 'full', comments: 'on', trackChanges: true } });

test('markDeletion plain delete preserves existing deletion ids', async ({ superdoc }) => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, '../../../../');
  const modulePath = `${repoRoot}/packages/super-editor/src/extensions/track-changes/trackChangesHelpers/markDeletion.js`;
  const moduleUrl = `/@fs${modulePath}`;

  const result = await superdoc.page.evaluate(
    async ({ url }) => {
      const { markDeletion } = await import(url);

      const editor = (window as any).editor;
      const schema = editor.state.schema;

      const user = { name: 'Track Tester', email: 'track@example.com' };
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

      const findTextPos = (needle: string): number => {
        let found: number | null = null;
        editor.state.doc.descendants((node: any, pos: number) => {
          if (found !== null) return false;
          if (!node.isText || !node.text) return;
          const idx = node.text.indexOf(needle);
          if (idx === -1) return;
          found = pos + idx;
        });
        if (found === null) {
          throw new Error(`Text not found: ${needle}`);
        }
        return found;
      };

      const beforeById: Record<string, string> = {};
      editor.state.doc.descendants((node: any) => {
        if (!node.isText || !node.text) return;
        for (const mark of node.marks ?? []) {
          if (mark.type?.name !== 'trackDelete') continue;
          const id = mark.attrs?.id;
          if (!id) continue;
          beforeById[id] = (beforeById[id] ?? '') + node.text;
        }
      });

      const from = findTextPos('OldDelete');
      const plainPos = findTextPos(' Plain');
      const to = plainPos + ' Plain'.length;

      const tr = editor.state.tr;
      markDeletion({ tr, from, to, user, date });
      editor.view.dispatch(tr);

      const afterById: Record<string, string> = {};
      editor.state.doc.descendants((node: any) => {
        if (!node.isText || !node.text) return;
        for (const mark of node.marks ?? []) {
          if (mark.type?.name !== 'trackDelete') continue;
          const id = mark.attrs?.id;
          if (!id) continue;
          afterById[id] = (afterById[id] ?? '') + node.text;
        }
      });

      const beforeOldId = Object.keys(beforeById).find((id) => beforeById[id].includes('OldDelete')) ?? null;
      const afterOldId = Object.keys(afterById).find((id) => afterById[id].includes('OldDelete')) ?? null;
      const afterPlainId = Object.keys(afterById).find((id) => afterById[id].includes('Plain')) ?? null;

      return { beforeById, afterById, beforeOldId, afterOldId, afterPlainId };
    },
    { url: moduleUrl },
  );

  expect(result.beforeOldId).not.toBeNull();
  expect(result.afterOldId).not.toBeNull();
  expect(result.afterPlainId).not.toBeNull();
  expect(result.afterOldId).toBe(result.beforeOldId);
  expect(result.afterOldId).not.toBe(result.afterPlainId);
});
