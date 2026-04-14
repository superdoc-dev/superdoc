import { afterEach, describe, expect, it } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { TrackDeleteMarkName, TrackInsertMarkName } from '../../extensions/track-changes/constants.js';
import { compilePlan } from './compiler.ts';
import { executeTextRewrite } from './executor.ts';

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
});
