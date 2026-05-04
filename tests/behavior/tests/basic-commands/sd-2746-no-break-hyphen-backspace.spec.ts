import { test, expect } from '../../fixtures/superdoc.js';

/**
 * Repro for SD-2746 follow-up:
 * Placing the caret right after a noBreakHyphen atom and pressing Backspace
 * should delete the atom — same as backspacing any other atomic glyph.
 *
 * The atom is wrapped in its own `run` node by the run translator. So three
 * distinct PM caret positions all correspond visually to "right after the
 * hyphen", and all three must work:
 *   1. Inside the atom's run, after the atom        → nodeBefore = atom
 *   2. At paragraph level, between runs             → nodeBefore = atom-wrapper run
 *   3. At the start of the run after the atom-run   → nodeBefore = null
 *
 * The first version of the fix only handled (1) because the synthetic test set
 * the cursor via `pos + atom.nodeSize`, which lands inside the atom's run.
 * Real-world clicks after the rendered glyph typically resolve to (2) or (3),
 * which is what the customer hit.
 */

const setupDocWithAtom = async (superdoc: any) => {
  await superdoc.type('abc');
  await superdoc.waitForStable();
  await superdoc.executeCommand('insertContent', { type: 'noBreakHyphen' });
  await superdoc.waitForStable();
  await superdoc.type('def');
  await superdoc.waitForStable();
};

const countAtoms = async (superdoc: any): Promise<number> =>
  superdoc.page.evaluate(() => {
    const { state } = (window as any).editor;
    let count = 0;
    state.doc.descendants((node: any) => {
      if (node.type.name === 'noBreakHyphen') count++;
    });
    return count;
  });

const collectText = async (superdoc: any): Promise<string> =>
  superdoc.page.evaluate(() => {
    const { state } = (window as any).editor;
    const parts: string[] = [];
    state.doc.descendants((n: any) => {
      if (n.isText) parts.push(n.text ?? '');
    });
    return parts.join('');
  });

const findAtomPos = async (superdoc: any): Promise<number> =>
  superdoc.page.evaluate(() => {
    const { state } = (window as any).editor;
    let atomPos = -1;
    state.doc.descendants((node: any, pos: number) => {
      if (atomPos !== -1) return false;
      if (node.type.name === 'noBreakHyphen') {
        atomPos = pos;
        return false;
      }
    });
    if (atomPos === -1) throw new Error('noBreakHyphen atom not found in doc');
    return atomPos;
  });

const describeCaret = async (superdoc: any, pos: number) =>
  superdoc.page.evaluate((p: number) => {
    const { state } = (window as any).editor;
    const $pos = state.doc.resolve(p);
    return {
      parent: $pos.parent.type.name,
      depth: $pos.depth,
      parentOffset: $pos.parentOffset,
      nodeBefore: $pos.nodeBefore?.type.name ?? null,
      nodeAfter: $pos.nodeAfter?.type.name ?? null,
    };
  }, pos);

const collectFirstParagraphChildTypes = async (superdoc: any): Promise<string[]> =>
  superdoc.page.evaluate(() => {
    const { state } = (window as any).editor;
    const types: string[] = [];
    let firstParagraph: any = null;
    state.doc.descendants((node: any) => {
      if (firstParagraph) return false;
      if (node.type.name === 'paragraph') {
        firstParagraph = node;
        return false;
      }
    });
    if (!firstParagraph) return types;
    firstParagraph.content.forEach((child: any) => {
      types.push(child.type.name);
    });
    return types;
  });

test.describe('Backspace after a noBreakHyphen atom (SD-2746)', () => {
  test('caret inside the atom-run, immediately after the atom (pos = atom + nodeSize)', async ({ superdoc }) => {
    await setupDocWithAtom(superdoc);
    expect(await countAtoms(superdoc)).toBe(1);

    const atomPos = await findAtomPos(superdoc);
    const caret = atomPos + 1; // inside atom's run, after atom
    await superdoc.setTextSelection(caret, caret);
    await superdoc.waitForStable();

    const ctx = await describeCaret(superdoc, caret);
    expect(ctx.parent).toBe('run');
    expect(ctx.nodeBefore).toBe('noBreakHyphen');

    await superdoc.press('Backspace');
    await superdoc.waitForStable();

    expect(await countAtoms(superdoc)).toBe(0);
    expect(await collectText(superdoc)).toBe('abcdef');
    // The wrapper run that held the atom must also be removed — leaving an
    // empty run behind would be a structural leak that the text/atom counts
    // alone wouldn't catch.
    expect(await collectFirstParagraphChildTypes(superdoc)).toEqual(['run', 'run']);
  });

  test('caret at paragraph level between runs (pos = atom + nodeSize + 1)', async ({ superdoc }) => {
    await setupDocWithAtom(superdoc);
    expect(await countAtoms(superdoc)).toBe(1);

    const atomPos = await findAtomPos(superdoc);
    const caret = atomPos + 2; // step out of atom's run; paragraph-level boundary
    await superdoc.setTextSelection(caret, caret);
    await superdoc.waitForStable();

    const ctx = await describeCaret(superdoc, caret);
    expect(ctx.parent).toBe('paragraph');
    expect(ctx.nodeBefore).toBe('run');

    await superdoc.press('Backspace');
    await superdoc.waitForStable();

    expect(await countAtoms(superdoc)).toBe(0);
    expect(await collectText(superdoc)).toBe('abcdef');
    expect(await collectFirstParagraphChildTypes(superdoc)).toEqual(['run', 'run']);
  });

  test('caret at start of the run that follows the atom-run (pos = atom + nodeSize + 2)', async ({ superdoc }) => {
    await setupDocWithAtom(superdoc);
    expect(await countAtoms(superdoc)).toBe(1);

    const atomPos = await findAtomPos(superdoc);
    const caret = atomPos + 3; // inside the next run, at its content start
    await superdoc.setTextSelection(caret, caret);
    await superdoc.waitForStable();

    const ctx = await describeCaret(superdoc, caret);
    expect(ctx.parent).toBe('run');
    expect(ctx.parentOffset).toBe(0);
    expect(ctx.nodeBefore).toBeNull();

    await superdoc.press('Backspace');
    await superdoc.waitForStable();

    expect(await countAtoms(superdoc)).toBe(0);
    expect(await collectText(superdoc)).toBe('abcdef');
    expect(await collectFirstParagraphChildTypes(superdoc)).toEqual(['run', 'run']);
  });
});
