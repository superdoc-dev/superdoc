import { describe, expect, it } from 'vitest';
import type { Editor } from '../core/Editor.js';
import { getDocumentApiAdapters } from './index.js';

function makeEditor(): Editor {
  return {
    state: { doc: { content: { size: 0 } } },
    commands: {},
    schema: { marks: {} },
    options: {},
    on: () => {},
  } as unknown as Editor;
}

describe('getDocumentApiAdapters', () => {
  it('includes table read adapters on the public assembly path', () => {
    const adapters = getDocumentApiAdapters(makeEditor());

    expect(typeof adapters.tables.get).toBe('function');
    expect(typeof adapters.tables.getCells).toBe('function');
    expect(typeof adapters.tables.getProperties).toBe('function');
  });
});
