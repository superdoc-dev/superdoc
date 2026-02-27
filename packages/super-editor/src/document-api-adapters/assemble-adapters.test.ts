import { describe, expect, it } from 'vitest';
import { assembleDocumentApiAdapters } from './assemble-adapters.js';
import type { Editor } from '../core/Editor.js';

function makeEditor(): Editor {
  return {
    state: { doc: { content: { size: 0 } } },
    commands: {},
    schema: { marks: {} },
    options: {},
    on: () => {},
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
    expect(adapters).toHaveProperty('format.apply');
    expect(adapters).toHaveProperty('format.fontSize');
    expect(adapters).toHaveProperty('format.fontFamily');
    expect(adapters).toHaveProperty('format.color');
    expect(adapters).toHaveProperty('format.align');
    expect(adapters).toHaveProperty('trackChanges.list');
    expect(adapters).toHaveProperty('trackChanges.get');
    expect(adapters).toHaveProperty('trackChanges.accept');
    expect(adapters).toHaveProperty('trackChanges.reject');
    expect(adapters).toHaveProperty('trackChanges.acceptAll');
    expect(adapters).toHaveProperty('trackChanges.rejectAll');
    expect(adapters).toHaveProperty('create.paragraph');
    expect(adapters).toHaveProperty('create.heading');
    expect(adapters).toHaveProperty('create.sectionBreak');
    expect(adapters).toHaveProperty('lists.list');
    expect(adapters).toHaveProperty('lists.get');
    expect(adapters).toHaveProperty('lists.insert');
    expect(adapters).toHaveProperty('lists.setType');
    expect(adapters).toHaveProperty('lists.indent');
    expect(adapters).toHaveProperty('lists.outdent');
    expect(adapters).toHaveProperty('lists.restart');
    expect(adapters).toHaveProperty('lists.exit');
    expect(adapters).toHaveProperty('sections.list');
    expect(adapters).toHaveProperty('sections.get');
    expect(adapters).toHaveProperty('sections.setBreakType');
    expect(adapters).toHaveProperty('sections.setPageMargins');
    expect(adapters).toHaveProperty('sections.setHeaderFooterMargins');
    expect(adapters).toHaveProperty('sections.setPageSetup');
    expect(adapters).toHaveProperty('sections.setColumns');
    expect(adapters).toHaveProperty('sections.setLineNumbering');
    expect(adapters).toHaveProperty('sections.setPageNumbering');
    expect(adapters).toHaveProperty('sections.setTitlePage');
    expect(adapters).toHaveProperty('sections.setOddEvenHeadersFooters');
    expect(adapters).toHaveProperty('sections.setVerticalAlign');
    expect(adapters).toHaveProperty('sections.setSectionDirection');
    expect(adapters).toHaveProperty('sections.setHeaderFooterRef');
    expect(adapters).toHaveProperty('sections.clearHeaderFooterRef');
    expect(adapters).toHaveProperty('sections.setLinkToPrevious');
    expect(adapters).toHaveProperty('sections.setPageBorders');
    expect(adapters).toHaveProperty('sections.clearPageBorders');
    expect(adapters).toHaveProperty('tables.get');
    expect(adapters).toHaveProperty('tables.getCells');
    expect(adapters).toHaveProperty('tables.getProperties');
  });

  it('returns functions for all adapter methods', () => {
    const adapters = assembleDocumentApiAdapters(makeEditor());

    expect(typeof adapters.find.find).toBe('function');
    expect(typeof adapters.write.write).toBe('function');
    expect(typeof adapters.format.apply).toBe('function');
    expect(typeof adapters.format.fontSize).toBe('function');
    expect(typeof adapters.format.fontFamily).toBe('function');
    expect(typeof adapters.format.color).toBe('function');
    expect(typeof adapters.format.align).toBe('function');
    expect(typeof adapters.create.paragraph).toBe('function');
    expect(typeof adapters.create.heading).toBe('function');
    expect(typeof adapters.create.sectionBreak).toBe('function');
    expect(typeof adapters.lists.insert).toBe('function');
    expect(typeof adapters.sections.list).toBe('function');
    expect(typeof adapters.sections.setBreakType).toBe('function');
    expect(typeof adapters.sections.setOddEvenHeadersFooters).toBe('function');
    expect(typeof adapters.tables.get).toBe('function');
    expect(typeof adapters.tables.getCells).toBe('function');
    expect(typeof adapters.tables.getProperties).toBe('function');
  });
});
