import { describe, it, expect } from 'vitest';
import SuperDoc from './cdn-entry.js';
import * as namespace from './index.js';

describe('cdn-entry', () => {
  it('exposes the SuperDoc class as the default export', () => {
    expect(typeof SuperDoc).toBe('function');
    expect(SuperDoc.name).toBe('SuperDoc');
  });

  it('attaches every named export as a static property on SuperDoc with identity preserved', () => {
    const mismatched = [];
    for (const key of Object.keys(namespace)) {
      if (key === 'SuperDoc' || key === 'default') continue;
      if (SuperDoc[key] !== namespace[key]) mismatched.push(key);
    }
    expect(mismatched).toEqual([]);
  });

  it('does not leak wrapper aliases like SuperDoc.SuperDoc or SuperDoc.default', () => {
    expect(SuperDoc).not.toHaveProperty('SuperDoc');
    expect(SuperDoc).not.toHaveProperty('default');
  });

  it('preserves Function intrinsics (name, prototype) — no clobbering', () => {
    expect(SuperDoc.name).toBe('SuperDoc');
    expect(typeof SuperDoc.prototype).toBe('object');
    expect(SuperDoc.prototype.constructor).toBe(SuperDoc);
  });
});
