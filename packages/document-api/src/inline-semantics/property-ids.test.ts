import { describe, it, expect } from 'bun:test';
import {
  CORE_PROPERTY_IDS,
  CORE_PROPERTY_ID_SET,
  CORE_TOGGLE_PROPERTY_IDS,
  CORE_TOGGLE_PROPERTY_ID_SET,
} from './property-ids.js';

describe('CORE_PROPERTY_IDS', () => {
  it('contains exactly core-4 in spec order', () => {
    expect(CORE_PROPERTY_IDS).toEqual(['bold', 'italic', 'underline', 'strike']);
  });

  it('set matches array', () => {
    expect(CORE_PROPERTY_ID_SET.size).toBe(CORE_PROPERTY_IDS.length);
    for (const id of CORE_PROPERTY_IDS) {
      expect(CORE_PROPERTY_ID_SET.has(id)).toBe(true);
    }
  });
});

describe('CORE_TOGGLE_PROPERTY_IDS', () => {
  it('contains only pure-toggle properties (excludes underline)', () => {
    expect(CORE_TOGGLE_PROPERTY_IDS).toEqual(['bold', 'italic', 'strike']);
  });

  it('is a strict subset of CORE_PROPERTY_IDS', () => {
    for (const id of CORE_TOGGLE_PROPERTY_IDS) {
      expect(CORE_PROPERTY_ID_SET.has(id)).toBe(true);
    }
  });

  it('set matches array', () => {
    expect(CORE_TOGGLE_PROPERTY_ID_SET.size).toBe(CORE_TOGGLE_PROPERTY_IDS.length);
  });
});
