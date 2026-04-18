import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanUpListsWithAnnotations } from './cleanUpListsWithAnnotations.js';
import * as fieldHelpers from '../fieldAnnotationHelpers/index.js';
import * as coreHelpers from '@core/helpers/index.js';

vi.mock('../fieldAnnotationHelpers/index.js', async () => {
  const actual = await vi.importActual('../fieldAnnotationHelpers/index.js');
  return {
    ...actual,
    getAllFieldAnnotations: vi.fn(),
  };
});

vi.mock('@core/helpers/index.js', async () => {
  const actual = await vi.importActual('@core/helpers/index.js');
  return {
    ...actual,
    findParentNodeClosestToPos: vi.fn(),
  };
});

const createListNode = ({
  fieldIds = ['field-1'],
  hasOtherContent = false,
  attrs = {
    numberingProperties: { numId: 1, ilvl: 0 },
    listRendering: { markerText: '•', path: [1], numberingType: 'bullet' },
  },
} = {}) => ({
  type: { name: 'paragraph' },
  attrs,
  nodeSize: 6,
  descendants(callback) {
    fieldIds.forEach((id) => {
      callback({ type: { name: 'fieldAnnotation' }, attrs: { fieldId: id } }, 0, this);
    });

    if (hasOtherContent) {
      callback({ isText: true, text: 'other content' }, 0, this);
    }
  },
});

const createAnnotation = (fieldId, pos = 10) => ({
  node: { attrs: { fieldId } },
  pos,
});

describe('cleanUpListsWithAnnotations', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('deletes paragraph-based list entries when only targeted fields remain', () => {
    fieldHelpers.getAllFieldAnnotations.mockReturnValue([createAnnotation('field-1')]);
    coreHelpers.findParentNodeClosestToPos.mockReturnValue({
      pos: 40,
      depth: 0,
      node: createListNode(),
    });

    const tr = { delete: vi.fn(), setMeta: vi.fn() };
    const state = { doc: { resolve: vi.fn(() => ({})) } };

    const result = cleanUpListsWithAnnotations(['field-1'])({ dispatch: vi.fn(), tr, state });

    expect(result).toBe(true);
    expect(tr.delete).toHaveBeenCalledWith(40, 46);
    expect(tr.setMeta).toHaveBeenCalledWith('updateListSync', true);
  });

  it('keeps paragraph-based list entries when other fields remain', () => {
    fieldHelpers.getAllFieldAnnotations.mockReturnValue([createAnnotation('field-1')]);
    coreHelpers.findParentNodeClosestToPos.mockReturnValue({
      pos: 50,
      depth: 0,
      node: createListNode({
        fieldIds: ['field-1', 'field-2'],
      }),
    });

    const tr = { delete: vi.fn(), setMeta: vi.fn() };
    const state = { doc: { resolve: vi.fn(() => ({})) } };

    const result = cleanUpListsWithAnnotations(['field-1'])({ dispatch: vi.fn(), tr, state });

    expect(result).toBe(true);
    expect(tr.delete).not.toHaveBeenCalled();
    expect(tr.setMeta).not.toHaveBeenCalled();
  });
});
