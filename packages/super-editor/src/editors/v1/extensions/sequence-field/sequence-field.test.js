import { describe, expect, it } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';

describe('SequenceField extension', () => {
  it('keeps the legacy ARABIC schema default for format', () => {
    const { editor } = initTestEditor({ mode: 'text', content: '<p></p>', isHeadless: true });
    const node = editor.schema.nodes.sequenceField.create({ instruction: 'SEQ Figure' });

    expect(node.attrs.format).toBe('ARABIC');

    editor.destroy();
  });
});
