import { describe, expect, it } from 'vitest';
import { createRelationshipsPart, getRelationshipsRoot } from './rels-part-helpers.js';

describe('rels-part-helpers', () => {
  it('createRelationshipsPart uses Relationships as the root element', () => {
    const part = createRelationshipsPart();
    expect(part.name).toBe('Relationships');
    expect(part.attributes?.xmlns).toBe('http://schemas.openxmlformats.org/package/2006/relationships');
    expect(part.elements).toEqual([]);
  });

  it('getRelationshipsRoot resolves imported, root, and legacy wrapper shapes', () => {
    const relationships = { name: 'Relationships', elements: [{ name: 'Relationship' }] };

    expect(getRelationshipsRoot(relationships)).toBe(relationships);
    expect(getRelationshipsRoot({ elements: [relationships] })).toBe(relationships);
    expect(getRelationshipsRoot({ name: 'document', elements: [relationships] })).toBe(relationships);
  });
});
