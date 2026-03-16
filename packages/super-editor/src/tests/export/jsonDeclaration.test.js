import { describe, expect, it } from 'vitest';
import { Editor } from '@core/Editor.js';

const SAMPLE_JSON = {
  type: 'doc',
  attrs: {
    attrs: null,
  },
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'JSON-only export reproducible content',
        },
      ],
    },
  ],
};

describe('Json override export', () => {
  it('exports a DOCX when editor is initialized from sample JSON', async () => {
    const editor = await Editor.open(undefined, { json: SAMPLE_JSON });

    try {
      const exported = await editor.exportDocx();
      expect(Buffer.isBuffer(exported)).toBe(true);
      expect(exported.length).toBeGreaterThan(0);
    } finally {
      editor.destroy();
    }
  });

  it('preserves caller-supplied media files and fonts when initialized from JSON', async () => {
    const mediaFiles = {
      'word/media/image1.png': 'data:image/png;base64,ZmFrZQ==',
    };
    const fonts = {
      'word/fonts/custom-font.odttf': 'data:font/otf;base64,ZmFrZQ==',
    };

    const editor = await Editor.open(undefined, {
      json: SAMPLE_JSON,
      mediaFiles,
      fonts,
    });

    try {
      expect(editor.options.mediaFiles).toMatchObject(mediaFiles);
      expect(editor.options.fonts).toMatchObject(fonts);
    } finally {
      editor.destroy();
    }
  });
});
