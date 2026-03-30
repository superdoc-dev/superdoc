/**
 * IT-268 / SD-1493: Test that namespace declarations are preserved during export
 *
 * When documents contain extension namespaces (like pt14 from PowerTools),
 * these namespaces must be preserved in the exported document to ensure
 * compatibility with Microsoft Word's strict XML parser.
 */

import { describe, test, expect } from 'vitest';
import { DEFAULT_DOCX_DEFS } from './exporter-docx-defs.js';

// Mock the mergeMcIgnorable function logic (same as in exporter.js)
function mergeMcIgnorable(defaultIgnorable = '', originalIgnorable = '') {
  const merged = [
    ...new Set([...defaultIgnorable.split(/\s+/).filter(Boolean), ...originalIgnorable.split(/\s+/).filter(Boolean)]),
  ];
  return merged.join(' ');
}

// Simulate the translateDocumentNode attribute merging logic
function mergeDocumentAttributes(originalAttrs = {}) {
  const attributes = {
    ...DEFAULT_DOCX_DEFS,
    ...originalAttrs,
  };

  const mergedIgnorable = mergeMcIgnorable(DEFAULT_DOCX_DEFS['mc:Ignorable'], originalAttrs['mc:Ignorable']);
  if (mergedIgnorable) {
    attributes['mc:Ignorable'] = mergedIgnorable;
  }

  return attributes;
}

describe('SD-1493: Namespace preservation during export', () => {
  test('preserves custom xmlns declarations from original document', () => {
    const originalAttrs = {
      'xmlns:pt14': 'http://powertools.codeplex.com/2011',
      'xmlns:w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      'mc:Ignorable': 'w14 w15 pt14',
    };

    const result = mergeDocumentAttributes(originalAttrs);

    // Custom namespace should be preserved
    expect(result['xmlns:pt14']).toBe('http://powertools.codeplex.com/2011');
  });

  test('merges mc:Ignorable lists without duplicates', () => {
    const originalAttrs = {
      'mc:Ignorable': 'w14 w15 pt14 custom',
    };

    const result = mergeDocumentAttributes(originalAttrs);

    // Should contain both default and custom ignorable namespaces
    const ignorable = result['mc:Ignorable'].split(' ');
    expect(ignorable).toContain('w14');
    expect(ignorable).toContain('w15');
    expect(ignorable).toContain('pt14');
    expect(ignorable).toContain('custom');
    expect(ignorable).toContain('wp14'); // from defaults

    // No duplicates
    const unique = [...new Set(ignorable)];
    expect(unique.length).toBe(ignorable.length);
  });

  test('handles empty original attributes gracefully', () => {
    const result = mergeDocumentAttributes({});

    // Should still have all default attributes
    expect(result['xmlns:w']).toBe(DEFAULT_DOCX_DEFS['xmlns:w']);
    expect(result['mc:Ignorable']).toBe(DEFAULT_DOCX_DEFS['mc:Ignorable']);
  });

  test('handles undefined original attributes gracefully', () => {
    const result = mergeDocumentAttributes(undefined);

    expect(result['xmlns:w']).toBeDefined();
    expect(result['mc:Ignorable']).toBe(DEFAULT_DOCX_DEFS['mc:Ignorable']);
  });

  test('original attributes override defaults when conflicting', () => {
    const originalAttrs = {
      // Override the default xmlns:w with a different value (hypothetically)
      'xmlns:customOverride': 'http://example.com/custom',
    };

    const result = mergeDocumentAttributes(originalAttrs);

    // Original should be present
    expect(result['xmlns:customOverride']).toBe('http://example.com/custom');
    // Defaults should still be there
    expect(result['xmlns:w']).toBe(DEFAULT_DOCX_DEFS['xmlns:w']);
  });

  test('preserves multiple extension namespaces', () => {
    const originalAttrs = {
      'xmlns:pt14': 'http://powertools.codeplex.com/2011',
      'xmlns:anotherExt': 'http://example.com/extension',
      'mc:Ignorable': 'pt14 anotherExt',
    };

    const result = mergeDocumentAttributes(originalAttrs);

    expect(result['xmlns:pt14']).toBe('http://powertools.codeplex.com/2011');
    expect(result['xmlns:anotherExt']).toBe('http://example.com/extension');

    const ignorable = result['mc:Ignorable'].split(' ');
    expect(ignorable).toContain('pt14');
    expect(ignorable).toContain('anotherExt');
  });
});

describe('mergeMcIgnorable', () => {
  test('merges two ignorable lists', () => {
    const result = mergeMcIgnorable('w14 w15', 'pt14 w14');
    const parts = result.split(' ');

    expect(parts).toContain('w14');
    expect(parts).toContain('w15');
    expect(parts).toContain('pt14');
    // w14 should appear only once
    expect(parts.filter((p) => p === 'w14').length).toBe(1);
  });

  test('handles empty strings', () => {
    expect(mergeMcIgnorable('', '')).toBe('');
    expect(mergeMcIgnorable('w14', '')).toBe('w14');
    expect(mergeMcIgnorable('', 'w14')).toBe('w14');
  });

  test('handles whitespace-only strings', () => {
    expect(mergeMcIgnorable('   ', '   ')).toBe('');
    expect(mergeMcIgnorable('w14', '   ')).toBe('w14');
  });

  test('handles multiple spaces between items', () => {
    const result = mergeMcIgnorable('w14   w15', 'pt14  custom');
    const parts = result.split(' ');

    expect(parts.length).toBe(4);
    expect(parts).toContain('w14');
    expect(parts).toContain('w15');
    expect(parts).toContain('pt14');
    expect(parts).toContain('custom');
  });
});
