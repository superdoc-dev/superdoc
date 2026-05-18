import { describe, it, expect, vi } from 'vitest';
import { calculateResolvedParagraphProperties } from '../paragraph/resolvedPropertiesCache.js';
import { TextAlign } from './text-align.js';

vi.mock('../paragraph/resolvedPropertiesCache.js', () => ({
  calculateResolvedParagraphProperties: vi.fn((_editor, node) => node?.attrs?.paragraphProperties ?? {}),
}));

describe('TextAlign extension', () => {
  const extensionContext = {
    options: TextAlign.config.addOptions(),
    editor: { converter: { translatedNumbering: {}, translatedLinkedStyles: {} } },
  };
  const commands = TextAlign.config.addCommands.call({
    ...extensionContext,
  });

  const makeState = (paragraphProperties = {}) => ({
    doc: {
      resolve: vi.fn((pos) => ({ pos })),
    },
    selection: {
      $from: {
        depth: 1,
        before: vi.fn(() => 0),
        node: vi.fn((depth) =>
          depth === 1
            ? {
                type: { name: 'paragraph' },
                attrs: { paragraphProperties },
              }
            : { type: { name: 'doc' }, attrs: {} },
        ),
        parent: {
          type: { name: 'paragraph' },
          attrs: { paragraphProperties },
        },
      },
    },
  });

  it('writes alignment as-is for LTR paragraphs', () => {
    const updateAttributes = vi.fn(() => true);

    const result = commands.setTextAlign('left')({
      commands: { updateAttributes },
      state: makeState({ rightToLeft: false }),
    });

    expect(result).toBe(true);
    expect(updateAttributes).toHaveBeenCalledWith('paragraph', {
      'paragraphProperties.justification': 'left',
    });
  });

  it('mirrors left/right for RTL paragraphs', () => {
    const updateAttributes = vi.fn(() => true);

    const leftResult = commands.setTextAlign('left')({
      commands: { updateAttributes },
      state: makeState({ rightToLeft: true }),
    });

    const rightResult = commands.setTextAlign('right')({
      commands: { updateAttributes },
      state: makeState({ rightToLeft: true }),
    });

    expect(leftResult).toBe(true);
    expect(rightResult).toBe(true);
    expect(updateAttributes).toHaveBeenNthCalledWith(1, 'paragraph', {
      'paragraphProperties.justification': 'right',
    });
    expect(updateAttributes).toHaveBeenNthCalledWith(2, 'paragraph', {
      'paragraphProperties.justification': 'left',
    });
  });

  it('uses resolved RTL from style cascade when raw paragraph attrs are LTR/empty', () => {
    vi.mocked(calculateResolvedParagraphProperties).mockReturnValueOnce({ rightToLeft: true });
    const updateAttributes = vi.fn(() => true);

    const result = commands.setTextAlign('left')({
      commands: { updateAttributes },
      state: makeState({}),
    });

    expect(result).toBe(true);
    expect(updateAttributes).toHaveBeenCalledWith('paragraph', {
      'paragraphProperties.justification': 'right',
    });
  });

  it('resolves paragraph ancestor when selection parent is run', () => {
    vi.mocked(calculateResolvedParagraphProperties).mockReturnValueOnce({ rightToLeft: true });
    const updateAttributes = vi.fn(() => true);
    const state = {
      doc: {
        resolve: vi.fn((pos) => ({ pos })),
      },
      selection: {
        $from: {
          depth: 2,
          before: vi.fn((depth) => (depth === 1 ? 5 : 0)),
          node: vi.fn((depth) => {
            if (depth === 2) return { type: { name: 'run' }, attrs: {} };
            if (depth === 1)
              return { type: { name: 'paragraph' }, attrs: { paragraphProperties: { rightToLeft: false } } };
            return { type: { name: 'doc' }, attrs: {} };
          }),
          parent: { type: { name: 'run' }, attrs: {} },
        },
      },
    };

    commands.setTextAlign('left')({
      commands: { updateAttributes },
      state,
    });

    expect(calculateResolvedParagraphProperties).toHaveBeenCalled();
    expect(updateAttributes).toHaveBeenCalledWith('paragraph', {
      'paragraphProperties.justification': 'right',
    });
  });

  it('keeps center and justify unchanged for RTL paragraphs', () => {
    const updateAttributes = vi.fn(() => true);

    commands.setTextAlign('center')({
      commands: { updateAttributes },
      state: makeState({ rightToLeft: true }),
    });
    commands.setTextAlign('justify')({
      commands: { updateAttributes },
      state: makeState({ rightToLeft: true }),
    });

    expect(updateAttributes).toHaveBeenNthCalledWith(1, 'paragraph', {
      'paragraphProperties.justification': 'center',
    });
    expect(updateAttributes).toHaveBeenNthCalledWith(2, 'paragraph', {
      'paragraphProperties.justification': 'both',
    });
  });

  it('maps alignment per paragraph for mixed LTR/RTL selections', () => {
    const ltrParagraph = {
      type: { name: 'paragraph' },
      attrs: { paragraphProperties: { rightToLeft: false, justification: 'center' } },
    };
    const rtlParagraph = {
      type: { name: 'paragraph' },
      attrs: { paragraphProperties: { rightToLeft: true, justification: 'center' } },
    };
    const state = {
      doc: {
        resolve: vi.fn((pos) => ({ pos })),
        nodesBetween: vi.fn((_from, _to, callback) => {
          callback(ltrParagraph, 1);
          callback(rtlParagraph, 10);
        }),
      },
      selection: {
        ranges: [
          {
            $from: { pos: 1 },
            $to: { pos: 20 },
          },
        ],
      },
    };
    const tr = { setNodeMarkup: vi.fn() };
    const dispatch = vi.fn();

    const result = commands.setTextAlign('left')({
      commands: { updateAttributes: vi.fn(() => true) },
      state,
      tr,
      dispatch,
    });

    expect(result).toBe(true);
    expect(tr.setNodeMarkup).toHaveBeenNthCalledWith(1, 1, undefined, {
      paragraphProperties: { rightToLeft: false, justification: 'left' },
    });
    expect(tr.setNodeMarkup).toHaveBeenNthCalledWith(2, 10, undefined, {
      paragraphProperties: { rightToLeft: true, justification: 'right' },
    });
    expect(dispatch).toHaveBeenCalledWith(tr);
  });

  it('returns false for unsupported alignment values', () => {
    const updateAttributes = vi.fn(() => true);

    const result = commands.setTextAlign('start')({
      commands: { updateAttributes },
      state: makeState(),
    });

    expect(result).toBe(false);
    expect(updateAttributes).not.toHaveBeenCalled();
  });
});
