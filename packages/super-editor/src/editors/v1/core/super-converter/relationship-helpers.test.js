import { describe, it, expect } from 'vitest';
import { mergeRelationshipElements } from './relationship-helpers.js';
import { HYPERLINK_RELATIONSHIP_TYPE, HEADER_RELATIONSHIP_TYPE, FOOTER_RELATIONSHIP_TYPE } from './constants.js';

const rel = (Id, Type, Target) => ({
  type: 'element',
  name: 'Relationship',
  attributes: { Id, Type, Target },
});

describe('mergeRelationshipElements', () => {
  it('adds relationships even when Id collides by assigning a new Id', () => {
    const existing = [
      rel('rId1', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles', 'styles.xml'),
      rel('rId2', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings', 'settings.xml'),
      rel('rId4', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings', 'webSettings.xml'),
    ];

    // New relationship reuses rId4, but different Target; should not be skipped
    const toAdd = [
      rel('rId4', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments', 'comments.xml'),
    ];

    const merged = mergeRelationshipElements(existing, toAdd);
    const added = merged.find((r) => r.attributes.Target === 'comments.xml');
    expect(added).toBeTruthy();
    // Ensure an Id was assigned and it doesn't collide with rId4
    expect(added.attributes.Id).not.toBe('rId4');
  });

  it('skips adding when a relationship with the same Target already exists', () => {
    const existing = [rel('rId10', 'http://schemas.../comments', 'comments.xml')];
    const toAdd = [rel('rId4', 'http://schemas.../comments', 'comments.xml')];
    const merged = mergeRelationshipElements(existing, toAdd);
    const occurrences = merged.filter((r) => r.attributes.Target === 'comments.xml');
    expect(occurrences).toHaveLength(1);
  });

  it('assigns new ID when relationship has no ID', () => {
    const existing = [rel('rId1', 'http://schemas.../styles', 'styles.xml')];
    const toAdd = [rel('', 'http://schemas.../comments', 'comments.xml')];
    const merged = mergeRelationshipElements(existing, toAdd);
    const added = merged.find((r) => r.attributes.Target === 'comments.xml');
    expect(added).toBeTruthy();
    expect(added.attributes.Id).toBe('rId2');
  });

  it('preserves provided non-colliding Ids and increments for subsequent auto-assigned Ids within same merge call', () => {
    const existing = [];
    const toAdd = [
      rel('rId1', 'http://schemas.../styles', 'styles.xml'), // keep rId1
      rel('', 'http://schemas.../comments', 'comments.xml'), // should get rId2
    ];
    const merged = mergeRelationshipElements(existing, toAdd);
    const styles = merged.find((r) => r.attributes.Target === 'styles.xml');
    const comments = merged.find((r) => r.attributes.Target === 'comments.xml');
    expect(styles.attributes.Id).toBe('rId1');
    expect(comments.attributes.Id).toBe('rId2');
  });

  it('allows hyperlinks with long IDs to have duplicate Targets', () => {
    const existing = [rel('rId1234567', HYPERLINK_RELATIONSHIP_TYPE, 'http://example.com')];
    const toAdd = [rel('rId9999999', HYPERLINK_RELATIONSHIP_TYPE, 'http://example.com')];
    const merged = mergeRelationshipElements(existing, toAdd);
    const matches = merged.filter((r) => r.attributes.Target === 'http://example.com');
    expect(matches).toHaveLength(2);
    expect(matches[1].attributes.Id).toBe('rId9999999');
  });

  it('allows headers with long IDs to have duplicate Targets', () => {
    const existing = [rel('rId1234567', HEADER_RELATIONSHIP_TYPE, 'header1.xml')];
    const toAdd = [rel('rId9876543', HEADER_RELATIONSHIP_TYPE, 'header1.xml')];
    const merged = mergeRelationshipElements(existing, toAdd);
    const matches = merged.filter((r) => r.attributes.Target === 'header1.xml');
    expect(matches).toHaveLength(2);
    expect(matches[1].attributes.Id).toBe('rId9876543');
  });

  it('allows footers with long IDs to have duplicate Targets', () => {
    const existing = [rel('rId7654321', FOOTER_RELATIONSHIP_TYPE, 'footer1.xml')];
    const toAdd = [rel('rId1111111', FOOTER_RELATIONSHIP_TYPE, 'footer1.xml')];
    const merged = mergeRelationshipElements(existing, toAdd);
    const matches = merged.filter((r) => r.attributes.Target === 'footer1.xml');
    expect(matches).toHaveLength(2);
    expect(matches[1].attributes.Id).toBe('rId1111111');
  });

  it('blocks hyperlinks with short IDs from having duplicate Targets', () => {
    const existing = [rel('rId1', HYPERLINK_RELATIONSHIP_TYPE, 'http://example.com')];
    const toAdd = [rel('rId2', HYPERLINK_RELATIONSHIP_TYPE, 'http://example.com')];
    const merged = mergeRelationshipElements(existing, toAdd);
    const matches = merged.filter((r) => r.attributes.Target === 'http://example.com');
    expect(matches).toHaveLength(1);
  });

  it('deduplicates targets that contain ampersands', () => {
    const existing = [rel('rId1', 'http://schemas.../image', 'media/company&logo.png')];
    const toAdd = [rel('rId2', 'http://schemas.../image', 'media/company&logo.png')];
    const merged = mergeRelationshipElements(existing, toAdd);
    const matches = merged.filter((r) => r.attributes.Target.includes('company'));
    expect(matches).toHaveLength(1);
  });

  it('assigns sequential unique IDs when multiple relationships have colliding IDs', () => {
    const existing = [rel('rId5', 'http://schemas.../styles', 'styles.xml')];
    const toAdd = [
      rel('rId5', 'http://schemas.../comments', 'comments.xml'),
      rel('rId5', 'http://schemas.../footnotes', 'footnotes.xml'),
      rel('rId6', 'http://schemas.../endnotes', 'endnotes.xml'),
    ];
    const merged = mergeRelationshipElements(existing, toAdd);
    const ids = merged.map((r) => r.attributes.Id);

    // All IDs should be unique
    expect(new Set(ids).size).toBe(ids.length);

    // The three new items should have sequential IDs starting from rId6
    const newItems = merged.slice(1);
    expect(newItems[0].attributes.Id).toBe('rId6');
    expect(newItems[1].attributes.Id).toBe('rId7');
    expect(newItems[2].attributes.Id).toBe('rId8');
  });

  it('preserves non-colliding short IDs', () => {
    const existing = [
      rel('rId1', 'http://schemas.../styles', 'styles.xml'),
      rel('rId2', 'http://schemas.../settings', 'settings.xml'),
    ];
    const toAdd = [rel('rId5', 'http://schemas.../comments', 'comments.xml')];
    const merged = mergeRelationshipElements(existing, toAdd);
    const added = merged.find((r) => r.attributes.Target === 'comments.xml');

    // Non-colliding short ID should be preserved as-is
    expect(added.attributes.Id).toBe('rId5');
  });

  it('preserves media IDs when they do not collide', () => {
    const existing = [rel('rId1', 'http://schemas.../styles', 'styles.xml')];
    const toAdd = [rel('rId999', 'http://schemas.../image', 'media/image.png')];
    const merged = mergeRelationshipElements(existing, toAdd);
    const added = merged.find((r) => r.attributes.Target === 'media/image.png');

    // Media ID should be preserved
    expect(added.attributes.Id).toBe('rId999');
  });

  it('reassigns media IDs when they collide', () => {
    const existing = [rel('rId5', 'http://schemas.../styles', 'styles.xml')];
    const toAdd = [rel('rId5', 'http://schemas.../image', 'media/image.png')];
    const merged = mergeRelationshipElements(existing, toAdd);
    const added = merged.find((r) => r.attributes.Target === 'media/image.png');

    // Colliding media ID should be reassigned
    expect(added.attributes.Id).not.toBe('rId5');
    expect(added.attributes.Id).toBe('rId6');
  });

  it('handles relationships with malformed or missing attributes gracefully', () => {
    const existing = [rel('rId1', 'http://schemas.../styles', 'styles.xml')];
    const toAdd = [
      { type: 'element', name: 'Relationship' }, // Missing attributes
      { type: 'element', name: 'Relationship', attributes: null }, // Null attributes
      rel('rId2', 'http://schemas.../comments', 'comments.xml'), // Valid
    ];

    const merged = mergeRelationshipElements(existing, toAdd);

    // Only valid relationships should be added
    expect(merged).toHaveLength(2);
    expect(merged.find((r) => r.attributes?.Target === 'comments.xml')).toBeTruthy();
  });

  it('increments largestId correctly across multiple additions', () => {
    const existing = [
      rel('rId3', 'http://schemas.../styles', 'styles.xml'),
      rel('rId10', 'http://schemas.../settings', 'settings.xml'),
    ];
    const toAdd = [
      rel('', 'http://schemas.../comments', 'comments.xml'), // Should get rId11
      rel('', 'http://schemas.../footnotes', 'footnotes.xml'), // Should get rId12
    ];

    const merged = mergeRelationshipElements(existing, toAdd);

    expect(merged[2].attributes.Id).toBe('rId11');
    expect(merged[3].attributes.Id).toBe('rId12');
  });

  it('handles empty existing relationships array', () => {
    const toAdd = [
      rel('rId1', 'http://schemas.../styles', 'styles.xml'),
      rel('', 'http://schemas.../comments', 'comments.xml'),
    ];

    const merged = mergeRelationshipElements([], toAdd);

    expect(merged).toHaveLength(2);
    expect(merged[0].attributes.Id).toBe('rId1');
    // Since rId1 is preserved and updates largestId to 1, the next auto-assigned ID is rId2
    expect(merged[1].attributes.Id).toBe('rId2');
  });

  it('handles empty new relationships array', () => {
    const existing = [rel('rId1', 'http://schemas.../styles', 'styles.xml')];
    const merged = mergeRelationshipElements(existing, []);

    expect(merged).toBe(existing);
    expect(merged).toHaveLength(1);
  });
});
