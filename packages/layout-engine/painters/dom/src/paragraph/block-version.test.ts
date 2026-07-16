import { describe, expect, it } from 'vitest';
import type { ParagraphBlock } from '@superdoc/contracts';
import { deriveParagraphBlockVersion } from './block-version.js';

const makeParagraph = (color: string): ParagraphBlock => ({
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
});
