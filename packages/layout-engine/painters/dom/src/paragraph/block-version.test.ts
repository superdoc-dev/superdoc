import { describe, expect, it } from 'vite-plus/test';
import type { ParagraphBlock, TabRun, TextRun, TrackedChangeMeta } from '@superdoc/contracts';
import { deriveParagraphBlockVersion, hashParagraphBlockForTableVersion } from './block-version.js';

const makeParagraph = (color: string, trackedChange: Partial<TrackedChangeMeta> = {}): ParagraphBlock => ({
  kind: 'paragraph',
  id: 'tracked-color',
  attrs: {},
  runs: [
    {
      text: 'Tracked',
      fontFamily: 'Arial',
      fontSize: 16,
      trackedChange: {
        kind: 'insert',
        id: 'tc-1',
        author: 'Alice',
        color,
        ...trackedChange,
      },
    },
  ],
});

const derive = (block: ParagraphBlock) =>
  deriveParagraphBlockVersion(
    block,
    () => '',
    () => '',
  );

const hashFns = {
  hashString: (seed: number, value: string) =>
    Array.from(value).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0 || 1, seed),
  hashNumber: (seed: number, value: number | undefined | null) => (seed * 31 + (value ?? 0)) >>> 0 || 1,
};

describe('deriveParagraphBlockVersion - tracked-change colors', () => {
  it('changes when only the tracked-change author color changes', () => {
    const purple = derive(makeParagraph('#8250df'));
    const blue = derive(makeParagraph('#1f6feb'));

    expect(blue).not.toBe(purple);
  });

  it('is stable when the tracked-change author color is identical', () => {
    const a = derive(makeParagraph('#8250df'));
    const b = derive(makeParagraph('#8250df'));

    expect(a).toBe(b);
  });

  it('changes when only the tracked-change semantic color changes', () => {
    const gold = derive(
      makeParagraph('#8250df', {
        semanticColorKey: 'cell-merge',
        semanticColor: '#d4a72c',
        subtype: 'cell-merge',
        targetKind: 'cell',
        semanticAnchorScope: 'affected-range',
      }),
    );
    const amber = derive(
      makeParagraph('#8250df', {
        semanticColorKey: 'cell-merge',
        semanticColor: '#bf8700',
        subtype: 'cell-merge',
        targetKind: 'cell',
        semanticAnchorScope: 'affected-range',
      }),
    );

    expect(amber).not.toBe(gold);
  });

  it('changes when only the tracked-change semantic category metadata changes', () => {
    const merge = derive(
      makeParagraph('#8250df', {
        semanticColorKey: 'cell-merge',
        semanticColor: '#d4a72c',
        subtype: 'cell-merge',
        targetKind: 'cell',
        semanticAnchorScope: 'affected-range',
      }),
    );
    const split = derive(
      makeParagraph('#8250df', {
        semanticColorKey: 'cell-split',
        semanticColor: '#d4a72c',
        subtype: 'cell-split',
        targetKind: 'cell',
        semanticAnchorScope: 'direct',
      }),
    );

    expect(split).not.toBe(merge);
  });
});

describe('deriveParagraphBlockVersion - paragraph tracked-change anchors', () => {
  const makeParagraphPropertyTrackedChange = (id: string): ParagraphBlock => ({
    kind: 'paragraph',
    id: 'paragraph-property-anchor',
    attrs: {
      paragraphPropertyTrackedChange: {
        kind: 'format',
        id,
        author: 'Test Reviewer',
        type: 'formatting',
        subtype: 'paragraph-formatting',
        targetKind: 'paragraph',
        groupedIds: [id],
      },
    },
    runs: [{ text: 'Indented paragraph', fontFamily: 'Arial', fontSize: 16 }],
  });

  it('changes when only paragraph-property tracked-change metadata changes', () => {
    const first = derive(makeParagraphPropertyTrackedChange('tc-format-1'));
    const second = derive(makeParagraphPropertyTrackedChange('tc-format-2'));

    expect(second).not.toBe(first);
  });

  it('changes table paragraph hashes when only paragraph-property tracked-change metadata changes', () => {
    const first = hashParagraphBlockForTableVersion(17, makeParagraphPropertyTrackedChange('tc-format-1'), hashFns);
    const second = hashParagraphBlockForTableVersion(17, makeParagraphPropertyTrackedChange('tc-format-2'), hashFns);

    expect(second).not.toBe(first);
  });
});

describe('deriveParagraphBlockVersion - vanished text runs', () => {
  const makeVanishParagraph = (vanish?: boolean): ParagraphBlock => ({
    kind: 'paragraph',
    id: 'vanish-version',
    attrs: {},
    runs: [
      {
        text: 'Hidden',
        fontFamily: 'Arial',
        fontSize: 16,
        ...(vanish ? { vanish } : {}),
      },
    ],
  });

  it('changes when only vanish changes', () => {
    expect(derive(makeVanishParagraph(true))).not.toBe(derive(makeVanishParagraph()));
  });

  it('changes when only a tab run vanish flag changes', () => {
    const tab: TabRun = { kind: 'tab', text: '\t', fontFamily: 'Arial', fontSize: 16 };
    const plain: ParagraphBlock = {
      kind: 'paragraph',
      id: 'vanish-tab-version',
      attrs: {},
      runs: [tab],
    };
    const hidden: ParagraphBlock = {
      ...plain,
      runs: [{ ...tab, vanish: true }],
    };

    expect(derive(hidden)).not.toBe(derive(plain));
  });
});

describe('deriveParagraphBlockVersion - text transform', () => {
  const makeTextTransformParagraph = (textTransform?: TextRun['textTransform']): ParagraphBlock => ({
    kind: 'paragraph',
    id: 'text-transform-version',
    attrs: {},
    runs: [
      {
        text: 'Caps',
        fontFamily: 'Arial',
        fontSize: 16,
        ...(textTransform ? { textTransform } : {}),
      },
    ],
  });

  it('changes when only textTransform changes', () => {
    expect(derive(makeTextTransformParagraph('uppercase'))).not.toBe(derive(makeTextTransformParagraph()));
  });

  it('changes table paragraph hashes when only textTransform changes', () => {
    const plain = hashParagraphBlockForTableVersion(17, makeTextTransformParagraph(), hashFns);
    const caps = hashParagraphBlockForTableVersion(17, makeTextTransformParagraph('uppercase'), hashFns);

    expect(caps).not.toBe(plain);
  });
});

describe('deriveParagraphBlockVersion - inline image vertical alignment', () => {
  const makeImageParagraph = (verticalAlign?: 'top' | 'bottom' | 'baseline'): ParagraphBlock => ({
    kind: 'paragraph',
    id: 'inline-image',
    attrs: {},
    runs: [
      { text: '1.', fontFamily: 'Arial', fontSize: 16 },
      {
        kind: 'image',
        src: 'data:image/png;base64,AAAA',
        width: 11,
        height: 10,
        ...(verticalAlign ? { verticalAlign } : {}),
      },
    ],
  });

  it('changes when only the inline image verticalAlign changes', () => {
    const top = derive(makeImageParagraph('top'));
    const baseline = derive(makeImageParagraph('baseline'));
    expect(baseline).not.toBe(top);
  });

  it('changes when verticalAlign is added to an otherwise identical image run', () => {
    const none = derive(makeImageParagraph(undefined));
    const baseline = derive(makeImageParagraph('baseline'));
    expect(baseline).not.toBe(none);
  });

  it('is stable when the inline image verticalAlign is identical', () => {
    expect(derive(makeImageParagraph('baseline'))).toBe(derive(makeImageParagraph('baseline')));
  });
});

describe('deriveParagraphBlockVersion - inline boxes', () => {
  const makeInlineBoxParagraph = (paddingInlineStart = 4, backgroundColor = '#eef2ff'): ParagraphBlock => ({
    kind: 'paragraph',
    id: 'inline-box',
    runs: [{ text: 'Citation', fontFamily: 'Arial', fontSize: 16 }],
    inlineBoxes: [
      {
        id: 'citation',
        from: 0,
        to: 8,
        layout: {
          paddingInlineStart,
          paddingInlineEnd: 4,
          paddingBlockStart: 1,
          paddingBlockEnd: 1,
          gapBefore: 1,
          gapAfter: 1,
          borderWidth: 1,
        },
        appearance: { backgroundColor, borderStyle: 'solid' },
      },
    ],
  });

  it('changes block and table paragraph versions for metric and appearance changes', () => {
    const base = makeInlineBoxParagraph();
    const metric = makeInlineBoxParagraph(8);
    const appearance = makeInlineBoxParagraph(4, '#ffffff');

    expect(derive(metric)).not.toBe(derive(base));
    expect(derive(appearance)).not.toBe(derive(base));
    expect(hashParagraphBlockForTableVersion(17, metric, hashFns)).not.toBe(
      hashParagraphBlockForTableVersion(17, base, hashFns),
    );
  });

  it('is stable for identical inline boxes', () => {
    expect(derive(makeInlineBoxParagraph())).toBe(derive(makeInlineBoxParagraph()));
  });
});
