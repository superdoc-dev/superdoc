import { describe, expect, it } from 'vitest';
import { applyDirectiveToMarks, deriveToggleState } from './mark-directives.js';

function mockMark(name: string, attrs: Record<string, unknown> = {}) {
  return {
    type: {
      name,
      create(nextAttrs?: Record<string, unknown> | null) {
        return mockMark(name, nextAttrs ?? {});
      },
    },
    attrs,
    eq(other: any) {
      if (!other || other.type?.name !== name) return false;
      const keys = new Set([...Object.keys(attrs), ...Object.keys(other.attrs || {})]);
      for (const key of keys) {
        if (attrs[key] !== other.attrs?.[key]) return false;
      }
      return true;
    },
  };
}

function mockMarkType(name: string) {
  return {
    create(attrs?: Record<string, unknown> | null) {
      return mockMark(name, attrs ?? {});
    },
  };
}

describe('deriveToggleState', () => {
  it.each(['bold', 'italic', 'strike'] as const)('treats boolean false as OFF for %s', (markKey) => {
    const state = deriveToggleState([mockMark(markKey, { value: false })] as any, markKey);
    expect(state).toBe('off');
  });

  it.each(['bold', 'italic', 'strike'] as const)('treats numeric 0 as OFF for %s', (markKey) => {
    const state = deriveToggleState([mockMark(markKey, { value: 0 })] as any, markKey);
    expect(state).toBe('off');
  });
});

describe('applyDirectiveToMarks', () => {
  it('does not no-op when existing mark stores OFF as boolean false', () => {
    const boldOffBoolean = mockMark('bold', { value: false });
    const markType = mockMarkType('bold');

    const result = applyDirectiveToMarks([boldOffBoolean] as any, 'bold', 'on', markType as any);

    expect(result).toHaveLength(1);
    expect(result[0].type.name).toBe('bold');
    expect(result[0].attrs.value).toBeUndefined();
  });

  it('does not no-op when existing mark stores OFF as numeric 0', () => {
    const boldOffNumeric = mockMark('bold', { value: 0 });
    const markType = mockMarkType('bold');

    const result = applyDirectiveToMarks([boldOffNumeric] as any, 'bold', 'on', markType as any);

    expect(result).toHaveLength(1);
    expect(result[0].type.name).toBe('bold');
    expect(result[0].attrs.value).toBeUndefined();
  });
});
