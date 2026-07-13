import { describe, expect, it } from 'vitest';
import { Schema } from 'prosemirror-model';
import { convertMdastToBlocks } from './mdastToProseMirror.js';
import { MARKDOWN_MONOSPACE_FONT } from './constants.js';
import type { MdastConversionContext } from './types.js';
import type { Root, Code, Paragraph, InlineCode } from 'mdast';

// ---------------------------------------------------------------------------
// Minimal schema mirroring SuperEditor's node/mark types (enough for
// mdastToProseMirror's JSON output to round-trip through nodeFromJSON if
// a test wants to materialize it — most assertions here work directly on
// the raw JSON returned by convertMdastToBlocks).
// ---------------------------------------------------------------------------

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: {
        paragraphProperties: { default: null },
        numberingProperties: { default: null },
      },
    },
    run: {
      inline: true,
      group: 'inline',
      content: 'inline*',
      attrs: { runProperties: { default: null } },
    },
    text: { group: 'inline' },
    lineBreak: { inline: true, group: 'inline' },
  },
  marks: {
    bold: {},
    italic: {},
    strike: {},
    textStyle: { attrs: { fontFamily: { default: null } } },
  },
});

function createMockEditor(): any {
  return {
    converter: { numbering: { definitions: {}, abstracts: {} } },
    state: { doc: { descendants: () => {} } },
  };
}

function makeCtx(): MdastConversionContext {
  return {
    editor: createMockEditor(),
    schema,
    diagnostics: [],
    options: { dryRun: true },
  };
}

/** Build a minimal mdast Root wrapping a single `code` node. */
function codeRoot(value: string, lang: string | null = null): Root {
  const code: Code = { type: 'code', lang, value };
  return { type: 'root', children: [code] };
}

/** Build a minimal mdast Root wrapping a paragraph containing an inlineCode span. */
function inlineCodeRoot(value: string): Root {
  const inlineCode: InlineCode = { type: 'inlineCode', value };
  const paragraph: Paragraph = { type: 'paragraph', children: [inlineCode] };
  return { type: 'root', children: [paragraph] };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('convertMdastToBlocks — code block (fenced)', () => {
  it('wraps a single-line code block in a paragraph of one run', () => {
    const blocks = convertMdastToBlocks(codeRoot('const x = 1;'), makeCtx());

    expect(blocks).toHaveLength(1);
    const [paragraph] = blocks;
    expect(paragraph.type).toBe('paragraph');
    expect(paragraph.content).toHaveLength(1);

    const [run] = paragraph.content!;
    expect(run.type).toBe('run');
    expect(run.content).toHaveLength(1);
    expect(run.content![0]).toMatchObject({ type: 'text', text: 'const x = 1;' });
  });

  it('sets both the textStyle mark and the direct runProperties.fontFamily attr', () => {
    const blocks = convertMdastToBlocks(codeRoot('code'), makeCtx());
    const run = blocks[0].content![0];

    // Mark (consumed by calculateInlineRunPropertiesPlugin's mark-based recalculation)
    expect(run.content![0].marks).toEqual([{ type: 'textStyle', attrs: { fontFamily: MARKDOWN_MONOSPACE_FONT } }]);

    // Direct attrs (consumed by callers that never dispatch through a live Editor)
    expect(run.attrs).toEqual({
      runProperties: {
        fontFamily: {
          ascii: MARKDOWN_MONOSPACE_FONT,
          eastAsia: MARKDOWN_MONOSPACE_FONT,
          hAnsi: MARKDOWN_MONOSPACE_FONT,
          cs: MARKDOWN_MONOSPACE_FONT,
        },
      },
    });
  });

  it('uses the OOXML rFonts key ("fontFamily"), never a bare "rFonts" key', () => {
    const blocks = convertMdastToBlocks(codeRoot('code'), makeCtx());
    const run = blocks[0].content![0];

    expect(run.attrs!.runProperties).toHaveProperty('fontFamily');
    expect(run.attrs!.runProperties).not.toHaveProperty('rFonts');
  });

  it('joins multiple lines with lineBreak nodes, one run per non-empty line', () => {
    const blocks = convertMdastToBlocks(codeRoot('line one\nline two\nline three'), makeCtx());
    const content = blocks[0].content!;

    // run, lineBreak, run, lineBreak, run
    expect(content.map((n) => n.type)).toEqual(['run', 'lineBreak', 'run', 'lineBreak', 'run']);
    expect(content[0].content![0].text).toBe('line one');
    expect(content[2].content![0].text).toBe('line two');
    expect(content[4].content![0].text).toBe('line three');
  });

  it('emits a lineBreak but no run for a blank line within the code block', () => {
    const blocks = convertMdastToBlocks(codeRoot('line one\n\nline three'), makeCtx());
    const content = blocks[0].content!;

    // run, lineBreak, lineBreak, run — no run is emitted for the empty middle line
    expect(content.map((n) => n.type)).toEqual(['run', 'lineBreak', 'lineBreak', 'run']);
  });

  it('produces an empty paragraph for an empty code block', () => {
    const blocks = convertMdastToBlocks(codeRoot(''), makeCtx());

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('paragraph');
    expect(blocks[0].content).toBeUndefined();
  });
});

describe('convertMdastToBlocks — inline code', () => {
  it('wraps inline code in a run with only the textStyle mark (no direct runProperties)', () => {
    const blocks = convertMdastToBlocks(inlineCodeRoot('inline'), makeCtx());
    const run = blocks[0].content![0];

    expect(run.type).toBe('run');
    expect(run.content![0]).toMatchObject({
      type: 'text',
      text: 'inline',
      marks: [{ type: 'textStyle', attrs: { fontFamily: MARKDOWN_MONOSPACE_FONT } }],
    });

    // Unlike the fenced code-block case, inlineCode relies solely on the mark —
    // see the comment on convertCodeBlock for why these two paths differ.
    expect(run.attrs).toBeUndefined();
  });
});
