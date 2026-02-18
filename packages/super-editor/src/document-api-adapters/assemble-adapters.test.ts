import { describe, expect, it } from 'vitest';
import { assembleDocumentApiAdapters } from './assemble-adapters.js';
import type { Editor } from '../core/Editor.js';

function makeEditor(): Editor {
  return {
    state: { doc: { content: { size: 0 } } },
    commands: {},
    schema: { marks: {} },
    options: {},
  } as unknown as Editor;
}

describe('assembleDocumentApiAdapters', () => {
  it('returns an object with all expected adapter namespaces', () => {
    const adapters = assembleDocumentApiAdapters(makeEditor());

    expect(adapters).toHaveProperty('find.find');
    expect(adapters).toHaveProperty('getNode.getNode');
    expect(adapters).toHaveProperty('getNode.getNodeById');
    expect(adapters).toHaveProperty('getText.getText');
    expect(adapters).toHaveProperty('info.info');
    expect(adapters).toHaveProperty('comments');
    expect(adapters).toHaveProperty('write.write');
    expect(adapters).toHaveProperty('format.bold');
    expect(adapters).toHaveProperty('trackChanges.list');
    expect(adapters).toHaveProperty('trackChanges.get');
    expect(adapters).toHaveProperty('trackChanges.accept');
    expect(adapters).toHaveProperty('trackChanges.reject');
    expect(adapters).toHaveProperty('trackChanges.acceptAll');
    expect(adapters).toHaveProperty('trackChanges.rejectAll');
    expect(adapters).toHaveProperty('create.paragraph');
    expect(adapters).toHaveProperty('create.heading');
    expect(adapters).toHaveProperty('lists.list');
    expect(adapters).toHaveProperty('lists.get');
    expect(adapters).toHaveProperty('lists.insert');
    expect(adapters).toHaveProperty('lists.setType');
    expect(adapters).toHaveProperty('lists.indent');
    expect(adapters).toHaveProperty('lists.outdent');
    expect(adapters).toHaveProperty('lists.restart');
    expect(adapters).toHaveProperty('lists.exit');
  });

  it('returns functions for all adapter methods', () => {
    const adapters = assembleDocumentApiAdapters(makeEditor());

    expect(typeof adapters.find.find).toBe('function');
    expect(typeof adapters.write.write).toBe('function');
    expect(typeof adapters.format.bold).toBe('function');
    expect(typeof adapters.create.paragraph).toBe('function');
    expect(typeof adapters.create.heading).toBe('function');
    expect(typeof adapters.lists.insert).toBe('function');
  });
});
