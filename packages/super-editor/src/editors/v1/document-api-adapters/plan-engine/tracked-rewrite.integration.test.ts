import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { Editor } from '../../core/Editor.js';
import { TrackDeleteMarkName, TrackInsertMarkName } from '../../extensions/track-changes/constants.js';
import { compilePlan } from './compiler.ts';
import { executeTextRewrite } from './executor.ts';
import { previewPlan } from './preview.ts';
import { getWordChanges } from './word-diff.ts';

function makeEditor(paragraphs: string[] = ['hello world']) {
  return initTestEditor({
    loadFromSchema: true,
    content: {
      type: 'doc',
      content: paragraphs.map((text) => ({
        type: 'paragraph',
        attrs: {},
        content: [
          {
            type: 'run',
            attrs: {},
            content: [{ type: 'text', text }],
          },
        ],
      })),
    },
    user: { name: 'Integration User', email: 'integration@example.com' },
  }).editor;
}

function run(text: string) {
  return {
    type: 'run',
    attrs: {},
    content: [{ type: 'text', text }],
  };
}

function runsFromText(text: string) {
  const parts = text.match(/\S+\s*/g) ?? [text];
  return parts.map(run);
}

function paragraph(nodeId: string, text: string, listIndex?: number) {
  const listAttrs =
    listIndex == null
      ? {}
      : {
          listRendering: {
            markerText: `${listIndex}.`,
            justification: 'left',
            path: [listIndex],
            numberingType: 'decimal',
          },
        };

  return {
    type: 'paragraph',
    attrs: {
      paraId: nodeId,
      ...listAttrs,
    },
    content: runsFromText(text),
  };
}

const SD3478_EXECUTOR_SOURCE =
  'I appoint Pat Example of 20 Oak Avenue, Sampletown and Example Trust Company of [address] as my executors and trustees. If either of my executors is unable or unwilling to act, then I appoint Example Trust Company as executor and trustee in their place.';
const SD3478_GIFT_SOURCE =
  'I give my freehold property known as 42 Example Cottage, Sample Bay to my partner and my children in equal shares absolutely. If any of my children dies before me, their share shall pass to their own children in equal shares.';

function makeSd3478Editor() {
  return initTestEditor({
    loadFromSchema: true,
    content: {
      type: 'doc',
      content: [
        paragraph(
          'OPENING1',
          'I, Jordan Example of 10 Market Road, Sampletown revoke all earlier wills and declare this to be my will.',
        ),
        paragraph('EXECUTOR', SD3478_EXECUTOR_SOURCE, 1),
        paragraph('GIFTITEM', SD3478_GIFT_SOURCE, 2),
        paragraph('RESIDUE', 'I give the residue of my estate to the same beneficiaries in the same shares.', 3),
      ],
    },
    user: { name: 'Integration User', email: 'integration@example.com' },
    useImmediateSetTimeout: false,
  }).editor;
}

const SD3478_EXECUTOR_REPLACEMENT =
  'I appoint my wife Rachel Louise Whitfield of 14 Beech Grove, Godalming, Surrey and [name of professional executor — e.g. Executor Services Limited] of [address] as my executors and trustees. I further appoint my son Thomas Andrew Whitfield to act as an additional executor and trustee upon his attaining the age of 25 years. If either of my executors or trustees is unable or unwilling to act or dies before proving my will, then I appoint [name of professional executor / substitute] of [city], [occupation] as executor and trustee in their place.';
const SD3478_GIFT_REPLACEMENT =
  'I give my freehold property known as 7 Sea View Cottage, Whitstable, Kent (which I own solely and which is free of mortgage) to my wife Rachel Louise Whitfield and my children Emily Grace Whitfield, Thomas Andrew Whitfield and Jessica Ann Whitfield in equal shares absolutely. If any of my children dies before me, their share shall pass to their own children in equal shares, or if none, to the survivors of the named beneficiaries in equal shares.';
const SD3478_CORPUS_RELATIVE_PATH = 'behavior/document-api/sd-3478-will-life-interest.docx';
const PRIVATE_SUPERDOC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../../../..');

function resolveCorpusFixturePath(relativePath: string): string | null {
  const corpusRoots = [
    process.env.SUPERDOC_LAYOUT_CORPUS_ROOT,
    process.env.SUPERDOC_CORPUS_ROOT,
    resolve(PRIVATE_SUPERDOC_ROOT, 'tests/corpus'),
  ].filter(Boolean) as string[];

  for (const corpusRoot of corpusRoots) {
    const fixturePath = resolve(corpusRoot, relativePath);
    if (existsSync(fixturePath)) return fixturePath;
  }

  return null;
}

const sd3478CorpusFixturePath = resolveCorpusFixturePath(SD3478_CORPUS_RELATIVE_PATH);
const itWithSd3478CorpusFixture = sd3478CorpusFixturePath ? it : it.skip;

async function makeSd3478FixtureEditor() {
  if (!sd3478CorpusFixturePath) {
    throw new Error(
      `Missing SD-3478 corpus fixture. Pull ${SD3478_CORPUS_RELATIVE_PATH} with pnpm --dir superdoc run corpus:pull.`,
    );
  }

  const fileSource = await readFile(sd3478CorpusFixturePath);
  const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(fileSource, true);

  return initTestEditor({
    content: docx,
    media,
    mediaFiles,
    fonts,
    isHeadless: true,
    user: { name: 'Integration User', email: 'integration@example.com' },
    useImmediateSetTimeout: false,
  }).editor;
}

function getFirstMatchRef(editor: any, pattern: string): string {
  const match = editor.doc.query.match({
    select: { type: 'text', pattern },
    require: 'first',
  });

  const ref = match?.items?.[0]?.handle?.ref;
  if (!ref) {
    throw new Error(`Could not resolve ref for pattern "${pattern}"`);
  }
  return ref;
}

function paragraphTexts(editor: any): string[] {
  const paragraphs: string[] = [];
  editor.state.doc.forEach((node: any) => {
    if (node.type.name === 'paragraph') {
      paragraphs.push(node.textContent);
    }
  });
  return paragraphs;
}

function findTextRange(editor: any, text: string): { from: number; to: number } {
  let range: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node: any, pos: number) => {
    if (!node.isText || !node.text) return true;
    const index = node.text.indexOf(text);
    if (index === -1) return true;
    range = { from: pos + index, to: pos + index + text.length };
    return false;
  });
  if (!range) throw new Error(`Could not find text "${text}"`);
  return range;
}

function markTextAsOtherUserDeletion(editor: any, text: string): void {
  const range = findTextRange(editor, text);
  const mark = editor.schema.marks[TrackDeleteMarkName].create({
    id: 'alice-delete',
    author: 'Alice Reviewer',
    authorEmail: 'alice@example.com',
    date: '2024-01-01T00:00:00.000Z',
  });
  editor.dispatch(editor.state.tr.addMark(range.from, range.to, mark));
}

function markedTextByAuthor(editor: any, markName: string, authorEmail: string): string {
  const parts: string[] = [];
  editor.state.doc.descendants((node: any) => {
    if (!node.isText || !node.text) return;
    if (node.marks.some((mark: any) => mark.type.name === markName && mark.attrs.authorEmail === authorEmail)) {
      parts.push(node.text);
    }
  });
  return parts.join('');
}

function markedTextForBlockByAuthor(editor: any, nodeId: string, markName: string, authorEmail: string): string {
  const parts: string[] = [];

  editor.state.doc.descendants((node: any) => {
    const attrs = node.attrs ?? {};
    if (attrs.paraId !== nodeId && attrs.sdBlockId !== nodeId) return true;

    node.descendants((child: any) => {
      if (!child.isText || !child.text) return;
      if (child.marks.some((mark: any) => mark.type.name === markName && mark.attrs.authorEmail === authorEmail)) {
        parts.push(child.text);
      }
    });
    return false;
  });

  return parts.join('');
}

function acceptedTextForBlock(editor: any, nodeId: string): string {
  let text = '';

  editor.state.doc.descendants((node: any) => {
    const attrs = node.attrs ?? {};
    if (attrs.paraId !== nodeId && attrs.sdBlockId !== nodeId) return true;

    node.descendants((child: any) => {
      if (!child.isText || !child.text) return;
      const isDeleted = child.marks.some((mark: any) => mark.type.name === TrackDeleteMarkName);
      if (!isDeleted) text += child.text;
    });
    return false;
  });

  return text;
}

function compileSingleRewrite(editor: any, pattern: string, text: string) {
  const step = {
    id: 'rewrite-step',
    op: 'text.rewrite',
    where: { by: 'ref', ref: getFirstMatchRef(editor, pattern) },
    args: {
      replacement: { text },
      style: { inline: { mode: 'preserve' } },
    },
  } as const;

  const compiled = compilePlan(editor, [step as any]);
  const compiledStep = compiled.mutationSteps[0];
  return { step, target: compiledStep.targets[0] };
}

describe('doc.replace multi-paragraph integration', () => {
  let editor: any | undefined;

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  it('creates sibling paragraphs in direct mode for a full-paragraph text replacement', () => {
    editor = makeEditor();
    const receipt = editor.doc.replace(
      {
        ref: getFirstMatchRef(editor, 'hello world'),
        text: 'Alpha\n\nBeta',
      },
      { changeMode: 'direct' },
    );

    expect(receipt.success).toBe(true);
    expect(paragraphTexts(editor)).toEqual(['Alpha', 'Beta']);
  });

  it('preserves sibling paragraphs in tracked mode for a full-paragraph text replacement', () => {
    editor = makeEditor();
    const receipt = editor.doc.replace(
      {
        ref: getFirstMatchRef(editor, 'hello world'),
        text: 'Alpha\n\nBeta',
      },
      { changeMode: 'tracked' },
    );

    expect(receipt.success).toBe(true);
    expect(paragraphTexts(editor)).toEqual(['hello world', 'Alpha', 'Beta']);

    const insertedTexts: string[] = [];
    const deletedTexts: string[] = [];
    editor.state.doc.descendants((node: any) => {
      if (!node.isText || !node.text) return;
      if (node.marks.some((mark: any) => mark.type.name === TrackInsertMarkName)) {
        insertedTexts.push(node.text);
      }
      if (node.marks.some((mark: any) => mark.type.name === TrackDeleteMarkName)) {
        deletedTexts.push(node.text);
      }
    });

    expect(insertedTexts).toEqual(expect.arrayContaining(['Alpha', 'Beta']));
    expect(deletedTexts.join('')).toContain('hello world');
  });

  it('splits a middle-of-paragraph direct replacement into sibling paragraphs', () => {
    editor = makeEditor(['hey guys, hello world and this stuff is great']);
    const receipt = editor.doc.replace(
      {
        ref: getFirstMatchRef(editor, 'hello world'),
        text: 'Alpha\n\nBeta',
      },
      { changeMode: 'direct' },
    );

    expect(receipt.success).toBe(true);
    expect(paragraphTexts(editor)).toEqual(['hey guys, Alpha', 'Beta and this stuff is great']);
  });

  it('keeps middle-of-paragraph structural rewrites intact through applyTransaction', () => {
    editor = makeEditor(['hey guys, hello world and this stuff is great']);
    const { step, target } = compileSingleRewrite(editor, 'hello world', 'Alpha\n\nBeta');
    const tr = editor.state.tr;

    const outcome = executeTextRewrite(editor, tr, target as any, step as any, tr.mapping as any);

    expect(outcome).toEqual({ changed: true });
    expect(tr.doc.childCount).toBe(2);
    expect(tr.doc.child(0).textContent).toBe('hey guys, Alpha');
    expect(tr.doc.child(1).textContent).toBe('Beta and this stuff is great');

    const applied = editor.state.applyTransaction(tr);
    const appliedParagraphs: string[] = [];
    applied.state.doc.forEach((node: any) => {
      if (node.type.name === 'paragraph') {
        appliedParagraphs.push(node.textContent);
      }
    });

    expect(appliedParagraphs).toEqual(['hey guys, Alpha', 'Beta and this stuff is great']);
  });

  it('preserves paragraph structure in tracked mode for a middle-of-paragraph replacement', () => {
    editor = makeEditor(['hey guys, hello world and this stuff is great']);
    const receipt = editor.doc.replace(
      {
        ref: getFirstMatchRef(editor, 'hello world'),
        text: 'Alpha\n\nBeta',
      },
      { changeMode: 'tracked' },
    );

    expect(receipt.success).toBe(true);
    expect(paragraphTexts(editor)).toHaveLength(2);
    expect(paragraphTexts(editor)[0]).toContain('hey guys,');
    expect(paragraphTexts(editor)[0]).toContain('hello world');
    expect(paragraphTexts(editor)[0]).toContain('Alpha');
    expect(paragraphTexts(editor)[1]).toBe('Beta and this stuff is great');

    const insertedTexts: string[] = [];
    const deletedTexts: string[] = [];
    editor.state.doc.descendants((node: any) => {
      if (!node.isText || !node.text) return;
      if (node.marks.some((mark: any) => mark.type.name === TrackInsertMarkName)) {
        insertedTexts.push(node.text);
      }
      if (node.marks.some((mark: any) => mark.type.name === TrackDeleteMarkName)) {
        deletedTexts.push(node.text);
      }
    });

    expect(insertedTexts).toEqual(expect.arrayContaining(['Alpha', 'Beta']));
    expect(deletedTexts.join('')).toContain('hello world');
  });

  it('preserves paragraph structure for tracked text.insert plans inside a paragraph', () => {
    editor = makeEditor(['hey guys, and this stuff is great']);
    const receipt = editor.doc.mutations.apply({
      atomic: true,
      changeMode: 'tracked',
      steps: [
        {
          id: 'insert-after-prefix',
          op: 'text.insert',
          where: {
            by: 'select',
            select: { type: 'text', pattern: 'hey guys,' },
            require: 'first',
          },
          args: {
            position: 'after',
            content: { text: '\nAlpha\n\nBeta' },
          },
        },
      ],
    });

    expect(receipt.success).toBe(true);
    expect(paragraphTexts(editor)).toEqual(['hey guys,', 'Alpha', 'Beta and this stuff is great']);

    const insertedTexts: string[] = [];
    editor.state.doc.descendants((node: any) => {
      if (!node.isText || !node.text) return;
      if (node.marks.some((mark: any) => mark.type.name === TrackInsertMarkName)) {
        insertedTexts.push(node.text);
      }
    });

    expect(insertedTexts).toEqual(expect.arrayContaining(['Alpha', 'Beta']));
  });

  it('resolves tracked rewrite selectors against unresolved deletion text without changing public query refs', () => {
    editor = makeEditor(['The quick brown fox jumps over the lazy dog.']);
    markTextAsOtherUserDeletion(editor, 'lazy ');

    const receipt = editor.doc.mutations.apply({
      atomic: true,
      changeMode: 'tracked',
      steps: [
        {
          id: 'replace-inside-delete',
          op: 'text.rewrite',
          where: {
            by: 'select',
            select: { type: 'text', pattern: 'lazy' },
            require: 'first',
          },
          args: {
            replacement: { text: 'OO' },
            style: { inline: { mode: 'preserve' } },
          },
        },
      ],
    });

    expect(receipt.success).toBe(true);
    expect(markedTextByAuthor(editor, TrackInsertMarkName, 'integration@example.com')).toContain('OO');
    expect(markedTextByAuthor(editor, TrackDeleteMarkName, 'integration@example.com')).toContain('lazy');
    expect(markedTextByAuthor(editor, TrackDeleteMarkName, 'alice@example.com')).toBe(' ');
  });

  it('previews tracked rewrite selectors against unresolved deletion text', () => {
    editor = makeEditor(['The quick brown fox jumps over the lazy dog.']);
    markTextAsOtherUserDeletion(editor, 'lazy ');

    const result = previewPlan(editor, {
      changeMode: 'tracked',
      steps: [
        {
          id: 'preview-inside-delete',
          op: 'text.rewrite',
          where: {
            by: 'select',
            select: { type: 'text', pattern: 'lazy' },
            require: 'first',
          },
          args: {
            replacement: { text: 'OO' },
            style: { inline: { mode: 'preserve' } },
          },
        },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.failures).toBeUndefined();
    expect(result.steps[0]).toMatchObject({ stepId: 'preview-inside-delete', op: 'text.rewrite' });
  });

  it('resolves tracked delete selectors against unresolved deletion text as a child deletion', () => {
    editor = makeEditor(['The quick brown fox jumps over the lazy dog.']);
    markTextAsOtherUserDeletion(editor, 'lazy ');

    const receipt = editor.doc.mutations.apply({
      atomic: true,
      changeMode: 'tracked',
      steps: [
        {
          id: 'delete-inside-delete',
          op: 'text.delete',
          where: {
            by: 'select',
            select: { type: 'text', pattern: 'lazy' },
            require: 'first',
          },
          args: { behavior: 'exact' },
        },
      ],
    });

    expect(receipt.success).toBe(true);
    expect(markedTextByAuthor(editor, TrackDeleteMarkName, 'integration@example.com')).toContain('lazy');
    expect(markedTextByAuthor(editor, TrackDeleteMarkName, 'alice@example.com')).toBe(' ');
  });

  it('creates an empty paragraph before the replacement when text has a leading newline (direct)', () => {
    editor = makeEditor();
    const receipt = editor.doc.replace(
      {
        ref: getFirstMatchRef(editor, 'hello world'),
        text: '\nAlpha',
      },
      { changeMode: 'direct' },
    );

    expect(receipt.success).toBe(true);
    expect(paragraphTexts(editor)).toEqual(['', 'Alpha']);
  });

  it('creates an empty paragraph after the replacement when text has a trailing newline (direct)', () => {
    editor = makeEditor();
    const receipt = editor.doc.replace(
      {
        ref: getFirstMatchRef(editor, 'hello world'),
        text: 'Alpha\n',
      },
      { changeMode: 'direct' },
    );

    expect(receipt.success).toBe(true);
    expect(paragraphTexts(editor)).toEqual(['Alpha', '']);
  });

  it('preserves paragraph structure with leading newline in tracked mode', () => {
    editor = makeEditor();
    const receipt = editor.doc.replace(
      {
        ref: getFirstMatchRef(editor, 'hello world'),
        text: '\nAlpha',
      },
      { changeMode: 'tracked' },
    );

    expect(receipt.success).toBe(true);

    const texts = paragraphTexts(editor);
    expect(texts.length).toBeGreaterThanOrEqual(2);

    const insertedTexts: string[] = [];
    const deletedTexts: string[] = [];
    editor.state.doc.descendants((node: any) => {
      if (!node.isText || !node.text) return;
      if (node.marks.some((mark: any) => mark.type.name === TrackInsertMarkName)) {
        insertedTexts.push(node.text);
      }
      if (node.marks.some((mark: any) => mark.type.name === TrackDeleteMarkName)) {
        deletedTexts.push(node.text);
      }
    });

    expect(insertedTexts).toEqual(expect.arrayContaining(['Alpha']));
    expect(deletedTexts.join('')).toContain('hello world');
  });

  it('preserves paragraph structure with trailing newline in tracked mode', () => {
    editor = makeEditor();
    const receipt = editor.doc.replace(
      {
        ref: getFirstMatchRef(editor, 'hello world'),
        text: 'Alpha\n',
      },
      { changeMode: 'tracked' },
    );

    expect(receipt.success).toBe(true);

    const texts = paragraphTexts(editor);
    expect(texts.length).toBeGreaterThanOrEqual(2);

    const insertedTexts: string[] = [];
    const deletedTexts: string[] = [];
    editor.state.doc.descendants((node: any) => {
      if (!node.isText || !node.text) return;
      if (node.marks.some((mark: any) => mark.type.name === TrackInsertMarkName)) {
        insertedTexts.push(node.text);
      }
      if (node.marks.some((mark: any) => mark.type.name === TrackDeleteMarkName)) {
        deletedTexts.push(node.text);
      }
    });

    expect(insertedTexts).toEqual(expect.arrayContaining(['Alpha']));
    expect(deletedTexts.join('')).toContain('hello world');
  });

  // SD-3044: when the word-diff produces multiple groups with EQUAL tokens
  // between them, inserted text used to anchor on the previous result op's
  // end instead of the EQUAL token's end, piling all granular insertions on
  // the first deletion site.
  it('SD-3044: tracked rewrite with shared suffix anchors inserts correctly', () => {
    editor = makeEditor(['[insert] of [insert], [insert] ("Investor")']);
    const receipt = editor.doc.replace(
      {
        ref: getFirstMatchRef(editor, '[insert] of [insert], [insert] ("Investor")'),
        text: 'John James Smith of [insert address], [insert] ("Investor")',
      },
      { changeMode: 'tracked' },
    );

    expect(receipt.success).toBe(true);

    // Accepted view: drop trackDelete marks, keep everything else.
    const acceptedParts: string[] = [];
    editor.state.doc.descendants((node: any) => {
      if (!node.isText || !node.text) return;
      const isDeleted = node.marks.some((mark: any) => mark.type.name === TrackDeleteMarkName);
      if (!isDeleted) acceptedParts.push(node.text);
    });

    expect(acceptedParts.join('')).toBe('John James Smith of [insert address], [insert] ("Investor")');

    // Specifically guard against the buggy strings reported in the ticket.
    const accepted = acceptedParts.join('');
    expect(accepted).not.toContain('JohnJames');
    expect(accepted).not.toContain('Smith  address');
  });

  // Customer-reported crash ("Empty text nodes are not allowed"): a non-empty
  // replacement whose new text is fully contained in the old text's prefix +
  // suffix trims to an EMPTY delta. The single-change branch must delete the
  // removed text rather than build schema.text('') (which ProseMirror rejects).
  it('rewrites a replacement that trims to an empty delta as a deletion (executor)', () => {
    editor = makeEditor(['the Company refers to: the following terms']);
    const { step, target } = compileSingleRewrite(editor, 'refers to:', 'to:');
    const tr = editor.state.tr;

    const outcome = executeTextRewrite(editor, tr, target as any, step as any, tr.mapping as any);

    expect(outcome).toEqual({ changed: true });
    expect(tr.doc.textContent).toBe('the Company to: the following terms');
  });

  it('handles a tracked replace that trims to an empty delta (deletion only)', () => {
    editor = makeEditor(['We will use our best endeavours to: deliver']);
    const receipt = editor.doc.replace(
      {
        ref: getFirstMatchRef(editor, 'best endeavours to:'),
        text: 'endeavours to:',
      },
      { changeMode: 'tracked' },
    );

    expect(receipt.success).toBe(true);

    // Accepted view: drop trackDelete marks, keep everything else.
    const acceptedParts: string[] = [];
    editor.state.doc.descendants((node: any) => {
      if (!node.isText || !node.text) return;
      const isDeleted = node.marks.some((mark: any) => mark.type.name === TrackDeleteMarkName);
      if (!isDeleted) acceptedParts.push(node.text);
    });

    expect(acceptedParts.join('')).toBe('We will use our endeavours to: deliver');

    // The trimmed-away prefix "best " must be represented as a tracked deletion.
    const deletedTexts: string[] = [];
    editor.state.doc.descendants((node: any) => {
      if (!node.isText || !node.text) return;
      if (node.marks.some((mark: any) => mark.type.name === TrackDeleteMarkName)) {
        deletedTexts.push(node.text);
      }
    });
    expect(deletedTexts.join('')).toContain('best');
  });

  it('SD-3044: tracked rewrite of long block preserves spacing across multiple equal anchors', () => {
    editor = makeEditor([
      '[insert] Pty Limited a company incorporated in Australia having its registered office at [insert] (ACN [insert])("Company")',
    ]);
    const target =
      'Working Title Group Limited a company incorporated in New Zealand having its registered office at 29 Park Hill Road, Birkenhead, Auckland, 0626, NZ (NZBN 9429050880331)("Company")';

    const receipt = editor.doc.replace(
      {
        ref: getFirstMatchRef(
          editor,
          '[insert] Pty Limited a company incorporated in Australia having its registered office at [insert] (ACN [insert])("Company")',
        ),
        text: target,
      },
      { changeMode: 'tracked' },
    );

    expect(receipt.success).toBe(true);

    const acceptedParts: string[] = [];
    editor.state.doc.descendants((node: any) => {
      if (!node.isText || !node.text) return;
      const isDeleted = node.marks.some((mark: any) => mark.type.name === TrackDeleteMarkName);
      if (!isDeleted) acceptedParts.push(node.text);
    });

    const accepted = acceptedParts.join('');
    expect(accepted).toBe(target);
    expect(accepted).not.toContain('PtyTitle');
    expect(accepted).not.toContain('AustraliaNew');
    expect(accepted).not.toContain('(ACNPark');
  });

  it('keeps unchanged anchors live for single tracked rewrites', () => {
    editor = makeEditor(['foo bar baz']);
    const receipt = editor.doc.replace(
      {
        ref: getFirstMatchRef(editor, 'foo bar baz'),
        text: 'foo qux baz zap',
      },
      { changeMode: 'tracked' },
    );

    expect(receipt.success).toBe(true);
    expect(markedTextByAuthor(editor, TrackDeleteMarkName, 'integration@example.com')).toBe('bar');
    expect(markedTextByAuthor(editor, TrackInsertMarkName, 'integration@example.com')).toBe('qux zap');
  });

  it('keeps unchanged anchors live for large single tracked rewrites', () => {
    const source = 'A x1 B x2 C x3 D x4 E x5 F x6 G x7 H x8 I x9 J';
    const target = 'A y1 B y2 C y3 D y4 E y5 F y6 G y7 H y8 I y9 J';
    expect(getWordChanges(source, target)).toHaveLength(9);
    editor = makeEditor([source]);
    const receipt = editor.doc.replace(
      {
        ref: getFirstMatchRef(editor, source),
        text: target,
      },
      { changeMode: 'tracked' },
    );

    expect(receipt.success).toBe(true);

    const acceptedParts: string[] = [];
    editor.state.doc.descendants((node: any) => {
      if (!node.isText || !node.text) return;
      const isDeleted = node.marks.some((mark: any) => mark.type.name === TrackDeleteMarkName);
      if (!isDeleted) acceptedParts.push(node.text);
    });

    const deleted = markedTextByAuthor(editor, TrackDeleteMarkName, 'integration@example.com');
    const inserted = markedTextByAuthor(editor, TrackInsertMarkName, 'integration@example.com');
    expect(acceptedParts.join('')).toBe(target);
    expect(deleted).toContain('x1');
    expect(deleted).not.toContain('A');
    expect(deleted).not.toContain('B');
    expect(deleted).not.toContain('J');
    expect(inserted).toContain('y1');
    expect(inserted).not.toContain('A');
    expect(inserted).not.toContain('B');
    expect(inserted).not.toContain('J');
  });

  it('uses coarse fallback for single tracked rewrites above the granular threshold', () => {
    expect(getWordChanges(SD3478_EXECUTOR_SOURCE, SD3478_EXECUTOR_REPLACEMENT).length).toBeGreaterThan(9);

    editor = makeSd3478Editor();
    const receipt = editor.doc.mutations.apply({
      atomic: true,
      changeMode: 'tracked',
      steps: [
        {
          id: 'rewrite-executor',
          op: 'text.rewrite',
          where: { by: 'block', nodeType: 'listItem', nodeId: 'EXECUTOR' },
          args: {
            replacement: { text: SD3478_EXECUTOR_REPLACEMENT },
            style: { inline: { mode: 'preserve' } },
          },
        },
      ],
    });

    expect(receipt.success).toBe(true);
    expect(acceptedTextForBlock(editor, 'EXECUTOR')).toBe(SD3478_EXECUTOR_REPLACEMENT);
    expect(markedTextForBlockByAuthor(editor, 'EXECUTOR', TrackDeleteMarkName, 'integration@example.com')).toBe(
      SD3478_EXECUTOR_SOURCE,
    );
    expect(markedTextForBlockByAuthor(editor, 'EXECUTOR', TrackInsertMarkName, 'integration@example.com')).toBe(
      SD3478_EXECUTOR_REPLACEMENT,
    );
  });

  it('keeps single tracked rewrite granularity inside mixed mutation plans', () => {
    editor = makeEditor(['foo bar baz', 'tail']);
    const receipt = editor.doc.mutations.apply({
      atomic: true,
      changeMode: 'tracked',
      steps: [
        {
          id: 'rewrite-one',
          op: 'text.rewrite',
          where: { by: 'select', select: { type: 'text', pattern: 'foo bar baz' }, require: 'first' },
          args: { replacement: { text: 'foo qux baz zap' } },
        },
        {
          id: 'insert-unrelated',
          op: 'text.insert',
          where: { by: 'select', select: { type: 'text', pattern: 'tail' }, require: 'first' },
          args: { position: 'after', content: { text: ' end' } },
        },
      ],
    });

    expect(receipt.success).toBe(true);
    expect(markedTextByAuthor(editor, TrackDeleteMarkName, 'integration@example.com')).toBe('bar');
  });

  it('ignores no-op rewrites when preserving single tracked rewrite granularity', () => {
    editor = makeEditor(['Hello', 'foo bar baz']);
    const receipt = editor.doc.mutations.apply({
      atomic: true,
      changeMode: 'tracked',
      steps: [
        {
          id: 'rewrite-noop',
          op: 'text.rewrite',
          where: { by: 'select', select: { type: 'text', pattern: 'Hello' }, require: 'first' },
          args: { replacement: { text: 'Hello' } },
        },
        {
          id: 'rewrite-one',
          op: 'text.rewrite',
          where: { by: 'select', select: { type: 'text', pattern: 'foo bar baz' }, require: 'first' },
          args: { replacement: { text: 'foo qux baz zap' } },
        },
      ],
    });

    expect(receipt.success).toBe(true);
    expect(markedTextByAuthor(editor, TrackDeleteMarkName, 'integration@example.com')).toBe('bar');
    expect(markedTextByAuthor(editor, TrackInsertMarkName, 'integration@example.com')).toBe('qux zap');
  });

  it('uses tracked rewrite batch fallback for later targets in a single multi-target step', () => {
    editor = makeEditor(['foo bar baz', 'foo bar baz']);
    const receipt = editor.doc.mutations.apply({
      atomic: true,
      changeMode: 'tracked',
      steps: [
        {
          id: 'rewrite-all',
          op: 'text.rewrite',
          where: { by: 'select', select: { type: 'text', pattern: 'foo bar baz' }, require: 'all' },
          args: { replacement: { text: 'foo qux baz zap' } },
        },
      ],
    });

    expect(receipt.success).toBe(true);
    expect(markedTextByAuthor(editor, TrackDeleteMarkName, 'integration@example.com')).toBe('barfoo bar baz');
    expect(markedTextByAuthor(editor, TrackInsertMarkName, 'integration@example.com')).toBe('qux zapfoo qux baz zap');
  });

  it('SD-3478: synthetic tracked batch keeps later list rewrite clean after earlier rewrites', () => {
    editor = makeSd3478Editor();

    const openingReplacement =
      'I, Jordan Example of 30 Cedar Street, Fakeshire revoke all earlier wills and declare this to be my Last Will and Testament.';
    const executorReplacement =
      'I appoint my partner Riley Example of 30 Cedar Street, Fakeshire and [name of professional executor - e.g. Sample Executor Services Limited] of [address] as my executors and trustees. I further appoint my adult child Morgan Example to act as an additional executor and trustee upon attaining the age of 25 years. If either of my executors or trustees is unable or unwilling to act or dies before proving my will, then I appoint [name of professional executor / substitute] of [city], [occupation] as executor and trustee in their place.';
    const giftReplacement =
      'I give my freehold property known as 99 Fictional View Cottage, Exampleton, Test County (which I own solely and which is free of mortgage) to my partner Riley Example and my children Morgan Example, Casey Example and Taylor Example in equal shares absolutely. If any of my children dies before me, their share shall pass to their own children in equal shares, or if none, to the survivors of the named beneficiaries in equal shares.';

    const receipt = editor.doc.mutations.apply({
      atomic: true,
      changeMode: 'tracked',
      steps: [
        {
          id: 'rewrite-testator',
          op: 'text.rewrite',
          where: { by: 'block', nodeType: 'paragraph', nodeId: 'OPENING1' },
          args: {
            replacement: { text: openingReplacement },
            style: { inline: { mode: 'preserve' } },
          },
        },
        {
          id: 'rewrite-executor',
          op: 'text.rewrite',
          where: { by: 'block', nodeType: 'listItem', nodeId: 'EXECUTOR' },
          args: {
            replacement: { text: executorReplacement },
            style: { inline: { mode: 'preserve' } },
          },
        },
        {
          id: 'rewrite-gift',
          op: 'text.rewrite',
          where: { by: 'block', nodeType: 'listItem', nodeId: 'GIFTITEM' },
          args: {
            replacement: { text: giftReplacement },
            style: { inline: { mode: 'preserve' } },
          },
        },
      ],
    });

    expect(receipt.success).toBe(true);
    expect(acceptedTextForBlock(editor, 'OPENING1')).toBe(openingReplacement);
    expect(acceptedTextForBlock(editor, 'EXECUTOR')).toBe(executorReplacement);
    expect(acceptedTextForBlock(editor, 'GIFTITEM')).toBe(giftReplacement);
  });

  // Same corruption as the by:block case above, but reached through `by: select`
  // text matching — the path a consumer (and the SuperdocDev "Reproduce SD-3478"
  // button) actually uses to apply a batch. Multi-run paragraphs are load-bearing:
  // the bug is in cross-run offset math, so single-run blocks never reproduce it
  // (makeSd3478Editor seeds one run per word via `paragraph` → `runsFromText`).
  it('SD-3478: tracked batch via text-pattern selectors keeps later multi-run rewrites clean', () => {
    editor = makeSd3478Editor();

    const openingReplacement =
      'I, Jordan Example of 30 Cedar Street, Fakeshire revoke all earlier wills and declare this to be my Last Will and Testament.';
    const executorReplacement =
      'I appoint my partner Riley Example of 30 Cedar Street, Fakeshire and [name of professional executor - e.g. Sample Executor Services Limited] of [address] as my executors and trustees. I further appoint my adult child Morgan Example to act as an additional executor and trustee upon attaining the age of 25 years. If either of my executors or trustees is unable or unwilling to act or dies before proving my will, then I appoint [name of professional executor / substitute] of [city], [occupation] as executor and trustee in their place.';
    const giftReplacement =
      'I give my freehold property known as 99 Fictional View Cottage, Exampleton, Test County (which I own solely and which is free of mortgage) to my partner Riley Example and my children Morgan Example, Casey Example and Taylor Example in equal shares absolutely. If any of my children dies before me, their share shall pass to their own children in equal shares, or if none, to the survivors of the named beneficiaries in equal shares.';

    const receipt = editor.doc.mutations.apply({
      atomic: true,
      changeMode: 'tracked',
      steps: [
        {
          id: 'rewrite-testator',
          op: 'text.rewrite',
          where: {
            by: 'select',
            select: {
              type: 'text',
              pattern:
                'I, Jordan Example of 10 Market Road, Sampletown revoke all earlier wills and declare this to be my will.',
            },
            require: 'first',
          },
          args: { replacement: { text: openingReplacement }, style: { inline: { mode: 'preserve' } } },
        },
        {
          id: 'rewrite-executor',
          op: 'text.rewrite',
          where: {
            by: 'select',
            select: {
              type: 'text',
              pattern:
                'I appoint Pat Example of 20 Oak Avenue, Sampletown and Example Trust Company of [address] as my executors and trustees. If either of my executors is unable or unwilling to act, then I appoint Example Trust Company as executor and trustee in their place.',
            },
            require: 'first',
          },
          args: { replacement: { text: executorReplacement }, style: { inline: { mode: 'preserve' } } },
        },
        {
          id: 'rewrite-gift',
          op: 'text.rewrite',
          where: {
            by: 'select',
            select: {
              type: 'text',
              pattern:
                'I give my freehold property known as 42 Example Cottage, Sample Bay to my partner and my children in equal shares absolutely. If any of my children dies before me, their share shall pass to their own children in equal shares.',
            },
            require: 'first',
          },
          args: { replacement: { text: giftReplacement }, style: { inline: { mode: 'preserve' } } },
        },
      ],
    });

    expect(receipt.success).toBe(true);
    expect(acceptedTextForBlock(editor, 'OPENING1')).toBe(openingReplacement);
    expect(acceptedTextForBlock(editor, 'EXECUTOR')).toBe(executorReplacement);
    expect(acceptedTextForBlock(editor, 'GIFTITEM')).toBe(giftReplacement);
  });

  itWithSd3478CorpusFixture('SD-3478: fixture single executor rewrite projection stays clean', async () => {
    editor = await makeSd3478FixtureEditor();

    const receipt = editor.doc.mutations.apply({
      atomic: true,
      changeMode: 'tracked',
      steps: [
        {
          id: 'rewrite-executor',
          op: 'text.rewrite',
          where: { by: 'block', nodeType: 'listItem', nodeId: '6489CE71' },
          args: {
            replacement: { text: SD3478_EXECUTOR_REPLACEMENT },
            style: { inline: { mode: 'preserve' } },
          },
        },
      ],
    });

    expect(receipt.success).toBe(true);

    const executorAccepted = acceptedTextForBlock(editor, '6489CE71');
    const executorInserted = markedTextForBlockByAuthor(
      editor,
      '6489CE71',
      TrackInsertMarkName,
      'integration@example.com',
    );

    expect(executorAccepted).toBe(SD3478_EXECUTOR_REPLACEMENT);
    expect(executorInserted).not.toContain('oprofessional executor / substitute');
    expect(executorInserted).not.toContain('of f [city]');
    expect(executorInserted).not.toContain('executo and trusteer');
  });

  itWithSd3478CorpusFixture(
    'SD-3478: fixture tracked batch keeps executor and gift rewrite projections clean',
    async () => {
      editor = await makeSd3478FixtureEditor();

      const receipt = editor.doc.mutations.apply({
        atomic: true,
        changeMode: 'tracked',
        steps: [
          {
            id: 'rewrite-executor',
            op: 'text.rewrite',
            where: { by: 'block', nodeType: 'listItem', nodeId: '6489CE71' },
            args: {
              replacement: { text: SD3478_EXECUTOR_REPLACEMENT },
              style: { inline: { mode: 'preserve' } },
            },
          },
          {
            id: 'rewrite-gift',
            op: 'text.rewrite',
            where: { by: 'block', nodeType: 'listItem', nodeId: '35102C49' },
            args: {
              replacement: { text: SD3478_GIFT_REPLACEMENT },
              style: { inline: { mode: 'preserve' } },
            },
          },
        ],
      });

      expect(receipt.success).toBe(true);

      const executorAccepted = acceptedTextForBlock(editor, '6489CE71');
      const giftAccepted = acceptedTextForBlock(editor, '35102C49');
      const executorInserted = markedTextForBlockByAuthor(
        editor,
        '6489CE71',
        TrackInsertMarkName,
        'integration@example.com',
      );
      const giftInserted = markedTextForBlockByAuthor(
        editor,
        '35102C49',
        TrackInsertMarkName,
        'integration@example.com',
      );

      expect.soft(executorAccepted).toBe(SD3478_EXECUTOR_REPLACEMENT);
      expect.soft(giftAccepted).toBe(SD3478_GIFT_REPLACEMENT);
      expect.soft(giftAccepted.startsWith('I give my')).toBe(true);
      expect.soft(giftAccepted).not.toContain('give To');
      expect.soft(giftAccepted.endsWith('s]')).toBe(false);
      expect.soft(executorInserted).not.toContain('oprofessional executor / substitute');
      expect.soft(executorInserted).not.toContain('of f [city]');
      expect.soft(executorInserted).not.toContain('executo and trusteer');
      expect.soft(giftInserted.startsWith('I give my')).toBe(true);
      expect.soft(giftInserted).not.toContain('give To');
    },
  );
});
