import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@core/Editor.js';

const SAMPLE_JSON = {
  type: 'doc',
  attrs: { attrs: null },
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Export errors should reach the caller' }],
    },
  ],
};

describe('Editor.exportDocx() error handling', () => {
  it('emits an exception event and rejects when export fails', async () => {
    const editor = await Editor.open(undefined, { json: SAMPLE_JSON });
    const exportError = new Error('export failed');
    const exceptionListener = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    editor.on('exception', exceptionListener);
    vi.spyOn(editor.converter, 'exportToDocx').mockRejectedValue(exportError);

    try {
      await expect(editor.exportDocx({ exportXmlOnly: true })).rejects.toBe(exportError);

      expect(exceptionListener).toHaveBeenCalledTimes(1);
      expect(exceptionListener).toHaveBeenCalledWith({ error: exportError, editor });
      expect(consoleErrorSpy).toHaveBeenCalledWith(exportError);
    } finally {
      consoleErrorSpy.mockRestore();
      editor.destroy();
    }
  });
});
