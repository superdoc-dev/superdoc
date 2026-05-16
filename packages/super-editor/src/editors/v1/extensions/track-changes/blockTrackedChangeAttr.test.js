import { describe, it, expect } from 'vitest';
import { blockTrackedChangeAttrSpec } from './blockTrackedChangeAttr.js';

describe('blockTrackedChangeAttrSpec', () => {
  it('declares a trackChange attribute with null default', () => {
    expect(blockTrackedChangeAttrSpec.trackChange).toBeDefined();
    expect(blockTrackedChangeAttrSpec.trackChange.default).toBeNull();
  });

  it('parseDOM reads data-track-change* into an attribute value', () => {
    const el = document.createElement('tr');
    el.setAttribute('data-track-change', 'delete');
    el.setAttribute('data-track-change-id', 'row-abc');
    el.setAttribute('data-track-change-operation', 'op-xyz');
    const parsed = blockTrackedChangeAttrSpec.trackChange.parseDOM(el);
    expect(parsed).toMatchObject({ kind: 'delete', id: 'row-abc', operationId: 'op-xyz' });
  });

  it('parseDOM returns null when data-track-change is missing', () => {
    expect(blockTrackedChangeAttrSpec.trackChange.parseDOM(document.createElement('tr'))).toBeNull();
  });

  it('parseDOM rejects unknown kinds', () => {
    const el = document.createElement('tr');
    el.setAttribute('data-track-change', 'foo');
    expect(blockTrackedChangeAttrSpec.trackChange.parseDOM(el)).toBeNull();
  });

  it('renderDOM emits data-track-change when set; nothing when null', () => {
    expect(
      blockTrackedChangeAttrSpec.trackChange.renderDOM({
        trackChange: { kind: 'insert', id: 'r1', operationId: 'op1' },
      }),
    ).toEqual({ 'data-track-change': 'insert' });
    expect(blockTrackedChangeAttrSpec.trackChange.renderDOM({ trackChange: null })).toEqual({});
    expect(blockTrackedChangeAttrSpec.trackChange.renderDOM({})).toEqual({});
  });
});
