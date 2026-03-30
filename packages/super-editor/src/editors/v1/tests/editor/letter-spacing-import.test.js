/* @vitest-environment node */

import { describe, it, expect } from 'vitest';
import { Editor } from '@core/Editor.js';
import { getStarterExtensions } from '@extensions/index.js';
import { getTestDataAsFileBuffer } from '@tests/helpers/helpers.js';

const findFirstTextStyleMark = (doc, predicate) => {
  let match = null;

  doc.descendants((node) => {
    if (!node.isText || !node.marks?.length) {
      return true;
    }

    const textStyleMark = node.marks.find((mark) => mark.type.name === 'textStyle');
    if (textStyleMark && predicate(textStyleMark)) {
      match = textStyleMark;
      return false;
    }

    return true;
  });

  return match;
};

describe('letter spacing import', () => {
  it('preserves imported textStyle letterSpacing marks in the starter schema', async () => {
    const buffer = await getTestDataAsFileBuffer('hyperlink_node_internal.docx');

    const editor = await Editor.open(buffer, {
      extensions: getStarterExtensions(),
      suppressDefaultDocxStyles: true,
    });

    try {
      const textStyleMark = findFirstTextStyleMark(
        editor.state.doc,
        (mark) => mark.attrs.styleId === 'SubtitleChar' && mark.attrs.color === '#595959',
      );

      expect(textStyleMark).toBeDefined();
      expect(textStyleMark?.attrs.letterSpacing).toBe('0.75pt');
    } finally {
      editor.destroy();
    }
  });
});
