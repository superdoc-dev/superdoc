import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import { executeSpanTextRewrite, executeTextInsert, executeTextRewrite } from './executor.ts';

/**
 * SD-3278: multi-line text forwarded into text-mode mutations (e.g.
 * an agentic SDK workflow) must export Word-native line breaks, not a raw '\n'
 * inside one <w:t> that Word collapses.
 *
 * Two paths are covered:
 *  - Creation path: doc.replace / text.rewrite with a single '\n' must build a
 *    `lineBreak` PM node (not a literal '\n' in a text node).
 *  - Export safety net: a text node that already holds a raw '\n' (e.g. from an
 *    imported .docx that stored breaks as literal newlines) must still export a
 *    Word-native <w:br/>.
 */

function makeSchemaEditor(paragraphs: string[] = ['hello world']) {
  return initTestEditor({
    loadFromSchema: true,
    content: {
      type: 'doc',
      content: paragraphs.map((text) => ({
        type: 'paragraph',
        attrs: {},
        content: [{ type: 'run', attrs: {}, content: [{ type: 'text', text }] }],
      })),
    },
    user: { name: 'Integration User', email: 'integration@example.com' },
  }).editor;
}

function getFirstMatchRef(editor: any, pattern: string): string {
  const match = editor.doc.query.match({ select: { type: 'text', pattern }, require: 'first' });
  const ref = match?.items?.[0]?.handle?.ref;
  if (!ref) throw new Error(`Could not resolve ref for pattern "${pattern}"`);
  return ref;
}

function hasNodeOfType(editor: any, name: string): boolean {
  let found = false;
  editor.state.doc.descendants((node: any) => {
    if (found) return false;
    if (node.type.name === name) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

function paragraphCount(editor: any): number {
  let count = 0;
  editor.state.doc.forEach((node: any) => {
    if (node.type.name === 'paragraph') count += 1;
  });
  return count;
}

function countNodeType(editor: any, name: string): number {
  let count = 0;
  editor.state.doc.descendants((node: any) => {
    if (node.type.name === name) count += 1;
  });
  return count;
}

describe('text-mode mutations: single newline handling (SD-3278)', () => {
  let editor: any | undefined;

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  it('direct doc.replace with a single newline builds a lineBreak node inside one paragraph', () => {
    editor = makeSchemaEditor(['hello world']);

    const receipt = editor.doc.replace(
      { ref: getFirstMatchRef(editor, 'hello world'), text: 'Alpha\nBeta' },
      { changeMode: 'direct' },
    );

    expect(receipt.success).toBe(true);
    // A single '\n' stays within the paragraph (only '\n\n+' splits paragraphs).
    expect(paragraphCount(editor)).toBe(1);
    expect(hasNodeOfType(editor, 'lineBreak')).toBe(true);
    // It must NOT become a page break.
    expect(hasNodeOfType(editor, 'hardBreak')).toBe(false);
  });

  it('tracked doc.replace with a single newline builds a lineBreak node', () => {
    editor = makeSchemaEditor(['hello world']);

    const receipt = editor.doc.replace(
      { ref: getFirstMatchRef(editor, 'hello world'), text: 'Alpha\nBeta' },
      { changeMode: 'tracked' },
    );

    expect(receipt.success).toBe(true);
    expect(hasNodeOfType(editor, 'lineBreak')).toBe(true);
    expect(hasNodeOfType(editor, 'hardBreak')).toBe(false);
  });

  // Read-model consistency (SD-3278): a lineBreak created on the write side must
  // read back as '\n' on the diff/search paths, or query.match cannot find
  // break-bearing content and an identical rewrite duplicates the break.
  it('finds break-bearing content by \\n and is idempotent under an identical rewrite (no duplicate break)', () => {
    editor = makeSchemaEditor(['hello world']);
    editor.doc.replace({ ref: getFirstMatchRef(editor, 'hello world'), text: 'Alpha\nBeta' }, { changeMode: 'direct' });
    expect(countNodeType(editor, 'lineBreak')).toBe(1);

    // query.match must see the break as '\n' to resolve a ref to the content.
    const ref = getFirstMatchRef(editor, 'Alpha\nBeta');
    editor.doc.replace({ ref, text: 'Alpha\nBeta' }, { changeMode: 'direct' });
    // The identical rewrite is a no-op: still exactly one break, not two.
    expect(countNodeType(editor, 'lineBreak')).toBe(1);
  });

  it('rewriting break-bearing content to single-line text removes the break', () => {
    editor = makeSchemaEditor(['hello world']);
    editor.doc.replace({ ref: getFirstMatchRef(editor, 'hello world'), text: 'Alpha\nBeta' }, { changeMode: 'direct' });
    expect(countNodeType(editor, 'lineBreak')).toBe(1);

    const ref = getFirstMatchRef(editor, 'Alpha\nBeta');
    editor.doc.replace({ ref, text: 'AlphaBeta' }, { changeMode: 'direct' });
    expect(countNodeType(editor, 'lineBreak')).toBe(0);
    expect(editor.state.doc.firstChild?.textContent).toBe('AlphaBeta');
  });

  // Proves the bot P1 (rewrite char-diff counts the break) DIRECTLY, without
  // query.match: rewriting `Alpha<lineBreak/>Beta` to the same visible text must
  // be a no-op (the diff reads the break as '\n' via leafText), so it neither
  // duplicates nor strands the break.
  it('an identical rewrite over an existing lineBreak node is a no-op (direct target)', () => {
    // paragraph > run > [ text 'Alpha', lineBreak, text 'Beta' ]
    editor = initTestEditor({
      loadFromSchema: true,
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {},
            content: [
              {
                type: 'run',
                attrs: {},
                content: [{ type: 'text', text: 'Alpha' }, { type: 'lineBreak' }, { type: 'text', text: 'Beta' }],
              },
            ],
          },
        ],
      },
      user: { name: 'Integration User', email: 'integration@example.com' },
    }).editor;
    expect(countNodeType(editor, 'lineBreak')).toBe(1);

    // Span the inline content: first text/lineBreak start .. last node end.
    let absFrom = -1;
    let absTo = -1;
    editor.state.doc.descendants((node: any, pos: number) => {
      if (node.isText || node.type.name === 'lineBreak') {
        if (absFrom === -1) absFrom = pos;
        absTo = pos + node.nodeSize;
      }
    });

    const tr = editor.state.tr;
    const target = {
      kind: 'range',
      stepId: 'idem',
      op: 'text.rewrite',
      blockId: '__selection__',
      from: 0,
      to: 0,
      absFrom,
      absTo,
      text: 'Alpha\nBeta',
      capturedStyle: undefined,
    } as any;
    const step = {
      id: 'idem-rewrite',
      op: 'text.rewrite',
      where: { by: 'ref', ref: 'ignored' },
      args: { replacement: { text: 'Alpha\nBeta' }, style: { inline: { mode: 'preserve' } } },
    } as any;

    executeTextRewrite(editor, tr, target, step, { map: (pos: number) => pos } as any);
    editor.dispatch(tr);

    // Still exactly one break: not duplicated (the bot P1 regression) and not removed.
    expect(countNodeType(editor, 'lineBreak')).toBe(1);
    expect(editor.state.doc.firstChild?.textContent).toBe('Alpha\nBeta');
  });
});

// lineBreak must not be forced into a parent that rejects it. The
// total-page-number node is `content: 'text*'`, so a newline insert there must
// fall back to literal text rather than throwing (mirrors the tab guard).
describe('newline insert into a restrictive (text*) parent', () => {
  let editor: any | undefined;

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  function makeEditorWithTotalPageCount() {
    return initTestEditor({
      loadFromSchema: true,
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {},
            content: [
              {
                type: 'run',
                attrs: {},
                content: [{ type: 'total-page-number', attrs: {}, content: [{ type: 'text', text: '7' }] }],
              },
            ],
          },
        ],
      },
      user: { name: 'Integration User', email: 'integration@example.com' },
    }).editor;
  }

  function findTotalPageNumberPos(ed: any): number {
    let pos: number | undefined;
    ed.state.doc.descendants((node: any, nodePos: number) => {
      if (pos !== undefined) return false;
      if (node.type.name === 'total-page-number') {
        pos = nodePos;
        return false;
      }
      return true;
    });
    if (pos === undefined) throw new Error('total-page-number node not found');
    return pos;
  }

  it('inserts a\\nb into total-page-number without throwing and without creating a lineBreak node', () => {
    editor = makeEditorWithTotalPageCount();
    const nodePos = findTotalPageNumberPos(editor);
    const innerPos = nodePos + 1; // inside the total-page-number, before its '7'

    const tr = editor.state.tr;
    const target = {
      kind: 'range',
      stepId: 'step-1',
      op: 'text.insert',
      blockId: 'total-page-number-1',
      from: 0,
      to: 0,
      absFrom: innerPos,
      absTo: innerPos,
      text: '',
      marks: [],
    } as any;
    const step = {
      id: 'insert-newline-into-total-page-number',
      op: 'text.insert',
      where: { by: 'ref', ref: 'ignored' },
      args: { position: 'before', content: { text: 'a\nb' } },
    } as any;

    expect(() => executeTextInsert(editor, tr, target, step, { map: (pos: number) => pos } as any)).not.toThrow();
    editor.dispatch(tr);

    const totalPageNumber = editor.state.doc.nodeAt(nodePos);
    expect(totalPageNumber?.type.name).toBe('total-page-number');
    expect(totalPageNumber?.textContent).toBe('a\nb7');
    expect(hasNodeOfType(editor, 'lineBreak')).toBe(false);
  });

  // The fix also threads the parent-admission probe into the rewrite path
  // (executeTextRewrite / executeSpanTextRewrite), not just text.insert. Rewriting
  // text INSIDE a text*-only parent with a newline must not throw or inject a
  // lineBreak; it falls back to literal text because the field is `text*` only.
  it('rewrites text inside total-page-number with a\\nb without throwing or creating a lineBreak node', () => {
    editor = makeEditorWithTotalPageCount();
    const nodePos = findTotalPageNumberPos(editor);
    const innerPos = nodePos + 1; // the '7' text node sits at [innerPos, innerPos + 1]

    const tr = editor.state.tr;
    const target = {
      kind: 'range',
      stepId: 'rewrite-step',
      op: 'text.rewrite',
      // '__selection__' makes resolveMarksForRange skip style capture (no block).
      blockId: '__selection__',
      from: 0,
      to: 1,
      absFrom: innerPos,
      absTo: innerPos + 1,
      text: '7',
      capturedStyle: undefined,
    } as any;
    const step = {
      id: 'rewrite-newline-into-total-page-number',
      op: 'text.rewrite',
      where: { by: 'ref', ref: 'ignored' },
      args: { replacement: { text: 'a\nb' }, style: { inline: { mode: 'preserve' } } },
    } as any;

    expect(() => executeTextRewrite(editor, tr, target, step, { map: (pos: number) => pos } as any)).not.toThrow();
    editor.dispatch(tr);

    const totalPageNumber = editor.state.doc.nodeAt(nodePos);
    expect(totalPageNumber?.type.name).toBe('total-page-number');
    // No lineBreak node was forced into the text*-only parent.
    expect(hasNodeOfType(editor, 'lineBreak')).toBe(false);
  });

  // The probe must be taken at the actual edit position, not once at the range
  // start: a rewrite can start in a normal run (which allows lineBreak) and the
  // newline edit can land inside a total-page-number (text*-only). A single
  // probe at the start would mint a lineBreak that the field parent rejects.
  it('does not force a lineBreak into total-page-number when a spanning rewrite lands the newline inside the field', () => {
    // paragraph > run > [ text 'AB', total-page-number > text '7' ]
    editor = initTestEditor({
      loadFromSchema: true,
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {},
            content: [
              {
                type: 'run',
                attrs: {},
                content: [
                  { type: 'text', text: 'AB' },
                  { type: 'total-page-number', attrs: {}, content: [{ type: 'text', text: '7' }] },
                ],
              },
            ],
          },
        ],
      },
      user: { name: 'Integration User', email: 'integration@example.com' },
    }).editor;

    const nodePos = findTotalPageNumberPos(editor); // total-page-number opens here; 'B' is at nodePos-1
    const tr = editor.state.tr;
    // Range 'B7' starts in the run ('B') and spans into the field's text ('7').
    // The replacement appends '\n', whose edit lands at the end of the field's
    // text (a text*-only parent).
    const target = {
      kind: 'range',
      stepId: 'span-rewrite',
      op: 'text.rewrite',
      blockId: '__selection__',
      from: 0,
      to: 0,
      absFrom: nodePos - 1, // 'B' in the run
      absTo: nodePos + 2, // just after '7' inside the field
      text: 'B7',
      capturedStyle: undefined,
    } as any;
    const step = {
      id: 'span-rewrite-into-field',
      op: 'text.rewrite',
      where: { by: 'ref', ref: 'ignored' },
      args: { replacement: { text: 'B7\n' }, style: { inline: { mode: 'preserve' } } },
    } as any;

    expect(() => executeTextRewrite(editor, tr, target, step, { map: (pos: number) => pos } as any)).not.toThrow();
    editor.dispatch(tr);

    expect(editor.state.doc.nodeAt(nodePos)?.type.name).toBe('total-page-number');
    // The newline landed in the text*-only field, so it falls back to literal
    // text rather than forcing a (schema-invalid) lineBreak there.
    expect(hasNodeOfType(editor, 'lineBreak')).toBe(false);
  });

  // executeSpanTextRewrite has its own single-block replacement path with a
  // separate parentAllowsLineBreak probe. The rewrite/insert paths above cover
  // their probes, but the span path's was unexercised even though its source
  // comment claims it is covered. A single inline '\n' stays in one replacement
  // block (split is on \n{2,}), so it reaches this single-block path.
  it('span rewrite with a single newline builds one lineBreak in a normal parent', () => {
    editor = makeSchemaEditor(['hello world']); // paragraph > run > text 'hello world'
    const tr = editor.state.tr;

    // A real two-segment span over the run text ('hello' + ' world'). The run
    // admits a lineBreak, so the single '\n' must mint exactly one.
    const target = {
      kind: 'span',
      stepId: 'span-newline-normal',
      op: 'text.rewrite',
      matchId: 'm:span-normal',
      segments: [
        { blockId: 'p1', from: 0, to: 5, absFrom: 2, absTo: 7 },
        { blockId: 'p1', from: 5, to: 11, absFrom: 7, absTo: 13 },
      ],
      text: 'hello world',
      marks: [],
      capturedStyleBySegment: [],
    } as any;
    const step = {
      id: 'span-newline-normal',
      op: 'text.rewrite',
      where: { by: 'ref', ref: 'ignored' },
      args: { replacement: { text: 'Alpha\nBeta' }, style: { inline: { mode: 'preserve' } } },
    } as any;

    expect(() => executeSpanTextRewrite(editor, tr, target, step, { map: (pos: number) => pos } as any)).not.toThrow();
    editor.dispatch(tr);

    expect(countNodeType(editor, 'lineBreak')).toBe(1);
    expect(hasNodeOfType(editor, 'hardBreak')).toBe(false);

    // The break is a real node, never a raw '\n' baked into a text node.
    let rawNewlineText = false;
    editor.state.doc.descendants((node: any) => {
      if (node.isText && typeof node.text === 'string' && node.text.includes('\n')) rawNewlineText = true;
    });
    expect(rawNewlineText).toBe(false);
  });

  it('span rewrite with a newline into total-page-number falls back to literal text, no lineBreak', () => {
    editor = makeEditorWithTotalPageCount(); // paragraph > run > total-page-number > text '7'
    const nodePos = findTotalPageNumberPos(editor);
    const tr = editor.state.tr;

    // The span sits entirely inside the field's text ('7' at [nodePos+1, nodePos+2]).
    // total-page-number is text*-only, so the probe at the edit position rejects a
    // lineBreak and the replacement falls back to literal text (the export safety
    // net turns it into a <w:br/> later).
    const target = {
      kind: 'span',
      stepId: 'span-newline-field',
      op: 'text.rewrite',
      matchId: 'm:span-field',
      segments: [{ blockId: 'p1', from: 0, to: 1, absFrom: nodePos + 1, absTo: nodePos + 2 }],
      text: '7',
      marks: [],
      capturedStyleBySegment: [],
    } as any;
    const step = {
      id: 'span-newline-field',
      op: 'text.rewrite',
      where: { by: 'ref', ref: 'ignored' },
      args: { replacement: { text: 'Alpha\nBeta' }, style: { inline: { mode: 'preserve' } } },
    } as any;

    expect(() => executeSpanTextRewrite(editor, tr, target, step, { map: (pos: number) => pos } as any)).not.toThrow();
    editor.dispatch(tr);

    expect(editor.state.doc.nodeAt(nodePos)?.type.name).toBe('total-page-number');
    expect(hasNodeOfType(editor, 'lineBreak')).toBe(false);
  });
});

describe('docx export: newline becomes <w:br/> (SD-3278)', () => {
  let docData: Awaited<ReturnType<typeof loadTestDataForEditorTests>>;
  let editor: any | undefined;

  beforeAll(async () => {
    docData = await loadTestDataForEditorTests('blank-doc.docx');
  });

  const makeBlankDocEditor = () =>
    initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      // Tracked mutations require an author/user on the editor instance.
      user: { name: 'Integration User', email: 'integration@example.com' },
    }).editor;

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  it('exports a Word-native <w:br/> for a text node that already holds a raw newline', async () => {
    editor = makeBlankDocEditor();

    // Seed a raw '\n' directly via the core command (tr.insertText keeps the
    // literal newline) to reproduce an imported .docx whose <w:t> held a raw
    // newline (this exercises the export safety net, not the creation path).
    editor.dispatch(editor.state.tr.insertText('Alpha\nBeta', 1));
    expect(editor.state.doc.textContent).toContain('Alpha\nBeta');
    expect(hasNodeOfType(editor, 'lineBreak')).toBe(false);

    const xml = await editor.exportDocx({ exportXmlOnly: true });
    expect(xml).toContain('<w:br');
  });

  it('exports a deleted run that holds a raw newline as <w:delText> around <w:br/> (no leftover <w:t>)', async () => {
    editor = makeBlankDocEditor();

    // Seed "Alpha\nBeta" as one text node, then mark the whole range as a tracked
    // deletion. On export the run is split around <w:br/>; every segment must
    // become <w:delText> inside <w:del>, never a stray <w:t>.
    editor.dispatch(editor.state.tr.insertText('Alpha\nBeta', 1));
    const delMark = editor.schema.marks.trackDelete.create({
      id: 'del-1',
      author: 'Reviewer',
      authorEmail: 'reviewer@example.com',
      date: '2026-01-01T00:00:00.000Z',
    });
    editor.dispatch(editor.state.tr.addMark(1, 1 + 'Alpha\nBeta'.length, delMark));

    const xml = await editor.exportDocx({ exportXmlOnly: true });
    expect(xml).toContain('<w:del');
    expect(xml).toContain('<w:delText');
    expect(xml).toContain('<w:br');
    // No <w:t> survives inside the deletion (it would be ignored by Word).
    expect(/<w:del\b[\s\S]*?<w:t\b[^>]*>[\s\S]*?<\/w:del>/.test(xml)).toBe(false);
  });

  it('tracked doc.replace with a newline exports valid tracked OOXML (inserted text in <w:ins>, break preserved as <w:br/>)', async () => {
    editor = makeBlankDocEditor();

    // Seed text to target, then tracked-replace it with multi-line content.
    editor.dispatch(editor.state.tr.insertText('hello world', 1));
    const match = editor.doc.query.match({ select: { type: 'text', pattern: 'hello world' }, require: 'first' });
    const ref = match?.items?.[0]?.handle?.ref;
    expect(ref).toBeTruthy();

    editor.doc.replace({ ref, text: 'Alpha\nBeta' }, { changeMode: 'tracked' });

    const xml = await editor.exportDocx({ exportXmlOnly: true });
    // Inserted text is tracked and the newline survives as a Word-native break.
    expect(xml).toContain('<w:ins');
    expect(xml).toContain('<w:br');
    expect(xml).toContain('Alpha');
    expect(xml).toContain('Beta');
    // Known limitation (SD-3371): in the creation path the break is a separate
    // `lineBreak` node created bare, and br-translator does not route node.marks
    // to <w:ins>/<w:del> the way noBreakHyphen's translator does, so the break
    // exports as its own run rather than inside <w:ins>. The output is valid
    // OOXML; on reject the orphan break remains. This is an export-routing gap,
    // not a schema limit (a leaf atom can carry marks). Tracked deletes of an
    // existing raw-newline node keep the break inside <w:del> via the single-run
    // path above.
  });
});
