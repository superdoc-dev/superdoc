import { describe, expect, it, vi } from 'vitest';
import { replayPartsDiff } from './replay-parts';

describe('replayPartsDiff', () => {
  it('marks the converter dirty and emits when parts are changed', () => {
    const converter = {
      convertedXml: {},
      documentModified: false,
    };
    const emit = vi.fn();

    const result = replayPartsDiff({
      partsDiff: {
        upserts: {
          'word/media/header-logo.png': {
            kind: 'binary',
            content: 'data:image/png;base64,aGVhZGVy',
          },
        },
        deletes: [],
      },
      editor: {
        converter,
        emit,
        options: {
          mediaFiles: {},
        },
        storage: {
          image: {
            media: {},
          },
        },
      },
    });

    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.warnings).toEqual([]);
    expect(converter.documentModified).toBe(true);
    expect(emit).toHaveBeenCalledWith(
      'partChanged',
      expect.objectContaining({
        source: 'diff-replay',
        parts: expect.arrayContaining([
          expect.objectContaining({
            partId: 'word/media/header-logo.png',
            operation: 'create',
          }),
        ]),
      }),
    );
  });

  it('does not mark the converter dirty when replay is skipped', () => {
    const converter = {
      documentModified: false,
    };
    const emit = vi.fn();

    const result = replayPartsDiff({
      partsDiff: {
        upserts: {
          'word/header1.xml': {
            kind: 'xml',
            content: { elements: [] },
          },
        },
        deletes: [],
      },
      editor: {
        converter,
        emit,
      },
    });

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.warnings).toEqual(['Parts replay skipped: editor converter is unavailable.']);
    expect(converter.documentModified).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });
});
