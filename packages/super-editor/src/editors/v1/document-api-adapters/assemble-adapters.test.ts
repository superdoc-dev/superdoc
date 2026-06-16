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
    expect(adapters).toHaveProperty('selectionMutation.execute');
    expect(adapters).toHaveProperty('paragraphs.setStyle');
    expect(adapters).toHaveProperty('paragraphs.clearStyle');
    expect(adapters).toHaveProperty('paragraphs.resetDirectFormatting');
    expect(adapters).toHaveProperty('paragraphs.setAlignment');
    expect(adapters).toHaveProperty('paragraphs.clearAlignment');
    expect(adapters).toHaveProperty('paragraphs.setIndentation');
    expect(adapters).toHaveProperty('paragraphs.clearIndentation');
    expect(adapters).toHaveProperty('paragraphs.setSpacing');
    expect(adapters).toHaveProperty('paragraphs.clearSpacing');
    expect(adapters).toHaveProperty('paragraphs.setKeepOptions');
    expect(adapters).toHaveProperty('paragraphs.setOutlineLevel');
    expect(adapters).toHaveProperty('paragraphs.setFlowOptions');
    expect(adapters).toHaveProperty('paragraphs.setTabStop');
    expect(adapters).toHaveProperty('paragraphs.clearTabStop');
    expect(adapters).toHaveProperty('paragraphs.clearAllTabStops');
    expect(adapters).toHaveProperty('paragraphs.setBorder');
    expect(adapters).toHaveProperty('paragraphs.clearBorder');
    expect(adapters).toHaveProperty('paragraphs.setShading');
    expect(adapters).toHaveProperty('paragraphs.clearShading');
    expect(adapters).toHaveProperty('paragraphs.setMarkRunProps');
    expect(adapters).toHaveProperty('paragraphs.setDirection');
    expect(adapters).toHaveProperty('paragraphs.clearDirection');
    expect(adapters).toHaveProperty('trackChanges.list');
    expect(adapters).toHaveProperty('trackChanges.get');
    expect(adapters).toHaveProperty('trackChanges.accept');
    expect(adapters).toHaveProperty('trackChanges.reject');
    expect(adapters).toHaveProperty('trackChanges.acceptAll');
    expect(adapters).toHaveProperty('trackChanges.rejectAll');
    expect(adapters).toHaveProperty('create.paragraph');
    expect(adapters).toHaveProperty('create.heading');
    expect(adapters).toHaveProperty('create.sectionBreak');
    expect(adapters).toHaveProperty('blocks.split');
    expect(adapters).toHaveProperty('blocks.merge');
    expect(adapters).toHaveProperty('blocks.move');
    expect(adapters).toHaveProperty('lists.list');
    expect(adapters).toHaveProperty('lists.get');
    expect(adapters).toHaveProperty('lists.getState');
    expect(adapters).toHaveProperty('lists.apply');
    expect(adapters).toHaveProperty('lists.continue');
    expect(adapters).toHaveProperty('lists.restart');
    expect(adapters).toHaveProperty('lists.remove');
    expect(adapters).toHaveProperty('lists.insert');
    expect(adapters).toHaveProperty('lists.indent');
    expect(adapters).toHaveProperty('lists.outdent');
    expect(adapters).toHaveProperty('lists.create');
    expect(adapters).toHaveProperty('lists.attach');
    expect(adapters).toHaveProperty('lists.detach');
    expect(adapters).toHaveProperty('lists.join');
    expect(adapters).toHaveProperty('lists.canJoin');
    expect(adapters).toHaveProperty('lists.separate');
    expect(adapters).toHaveProperty('lists.setLevel');
    expect(adapters).toHaveProperty('lists.setValue');
    expect(adapters).toHaveProperty('lists.continuePrevious');
    expect(adapters).toHaveProperty('lists.canContinuePrevious');
    expect(adapters).toHaveProperty('lists.setLevelRestart');
    expect(adapters).toHaveProperty('lists.convertToText');
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
    expect(adapters).toHaveProperty('tables.moveRow');
    expect(adapters).toHaveProperty('create.tableOfContents');
    expect(adapters).toHaveProperty('toc.list');
    expect(adapters).toHaveProperty('toc.get');
    expect(adapters).toHaveProperty('toc.configure');
    expect(adapters).toHaveProperty('toc.update');
    expect(adapters).toHaveProperty('toc.remove');
    expect(adapters).toHaveProperty('ranges.resolve');
    expect(adapters).toHaveProperty('selection.current');
  });

  it('returns functions for all adapter methods', () => {
    const adapters = assembleDocumentApiAdapters(makeEditor());

    expect(typeof adapters.find.find).toBe('function');
    expect(typeof adapters.write.write).toBe('function');
    expect(typeof adapters.selectionMutation.execute).toBe('function');
    expect(typeof adapters.paragraphs.setStyle).toBe('function');
    expect(typeof adapters.paragraphs.setAlignment).toBe('function');
    expect(typeof adapters.paragraphs.setBorder).toBe('function');
    expect(typeof adapters.paragraphs.setMarkRunProps).toBe('function');
    expect(typeof adapters.paragraphs.setDirection).toBe('function');
    expect(typeof adapters.paragraphs.clearDirection).toBe('function');
    expect(typeof adapters.create.paragraph).toBe('function');
    expect(typeof adapters.create.heading).toBe('function');
    expect(typeof adapters.create.sectionBreak).toBe('function');
    expect(typeof adapters.blocks.split).toBe('function');
    expect(typeof adapters.blocks.merge).toBe('function');
    expect(typeof adapters.blocks.move).toBe('function');
    expect(typeof adapters.create.tableOfContents).toBe('function');
    expect(typeof adapters.lists.insert).toBe('function');
    expect(typeof adapters.lists.getState).toBe('function');
    expect(typeof adapters.lists.apply).toBe('function');
    expect(typeof adapters.lists.continue).toBe('function');
    expect(typeof adapters.lists.restart).toBe('function');
    expect(typeof adapters.lists.remove).toBe('function');
    expect(typeof adapters.sections.list).toBe('function');
    expect(typeof adapters.sections.setBreakType).toBe('function');
    expect(typeof adapters.sections.setOddEvenHeadersFooters).toBe('function');
    expect(typeof adapters.tables.get).toBe('function');
    expect(typeof adapters.tables.getCells).toBe('function');
    expect(typeof adapters.tables.getProperties).toBe('function');
    expect(typeof adapters.tables.moveRow).toBe('function');
    expect(typeof adapters.toc.list).toBe('function');
    expect(typeof adapters.toc.get).toBe('function');
    expect(typeof adapters.toc.configure).toBe('function');
    expect(typeof adapters.toc.update).toBe('function');
    expect(typeof adapters.toc.remove).toBe('function');
    expect(typeof adapters.ranges.resolve).toBe('function');
    expect(typeof adapters.selection!.current).toBe('function');
  });

  it('returns CAPABILITY_UNAVAILABLE receipts for v2-only compatibility stubs', () => {
    const adapters = assembleDocumentApiAdapters(makeEditor());

    expect(adapters.blocks.split({ target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' }, offset: 1 })).toEqual({
      success: false,
      failure: {
        code: 'CAPABILITY_UNAVAILABLE',
        message: 'blocks.split is only available on v2-backed sessions.',
      },
    });
    expect(
      adapters.paragraphs.setMarkRunProps({
        target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
        markRunProps: {},
      }),
    ).toEqual({
      success: false,
      failure: {
        code: 'CAPABILITY_UNAVAILABLE',
        message: 'format.paragraph.setMarkRunProps is only available on v2-backed sessions.',
      },
    });
    expect(adapters.lists.getState({ target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' } })).toEqual({
      success: false,
      failure: {
        code: 'CAPABILITY_UNAVAILABLE',
        message: 'lists.getState is only available on v2-backed sessions.',
      },
    });
    expect(
      adapters.tables.moveRow({
        target: { kind: 'block', nodeType: 'tableRow', nodeId: 'row1' },
        destination: { kind: 'last' },
      }),
    ).toEqual({
      success: false,
      failure: {
        code: 'CAPABILITY_UNAVAILABLE',
        message: 'tables.moveRow is only available on v2-backed sessions.',
      },
    });
  });
});
