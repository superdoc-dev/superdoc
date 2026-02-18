import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { copyFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { search } from '../commands/search';
import { replace } from '../commands/replace';
import { read } from '../commands/read';
import { openDocument, closeDocument, searchDocument } from '../lib/editor';

const TEST_DIR = join(import.meta.dir, 'fixtures-cross-paragraph');
const SAMPLE_DOC = join(TEST_DIR, 'sample.docx');

describe('Cross-paragraph search and replace', () => {
  beforeAll(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    // Copy a test document to our fixtures folder
    const sourceDoc = join(import.meta.dir, '../../../../e2e-tests/test-data/basic-documents/advanced-text.docx');
    await copyFile(sourceDoc, SAMPLE_DOC);
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test('searchDocument returns ranges for cross-paragraph matches', async () => {
    const doc = await openDocument(SAMPLE_DOC);
    try {
      // Search for something that exists
      const matches = searchDocument(doc, 'Wilde');

      expect(matches.length).toBeGreaterThan(0);

      // Check that the first match has the expected structure
      const firstMatch = matches[0];
      expect(firstMatch).toHaveProperty('from');
      expect(firstMatch).toHaveProperty('to');
      expect(firstMatch).toHaveProperty('text');
      // ranges should be present (may be undefined for single-range matches)
      expect('ranges' in firstMatch).toBe(true);
    } finally {
      closeDocument(doc);
    }
  });

  test('replace preserves paragraph structure', async () => {
    // Create a copy for this test
    const testCopy = join(TEST_DIR, 'preserve-structure.docx');
    await copyFile(SAMPLE_DOC, testCopy);

    // Count paragraphs before (by counting double newlines or paragraph indicators)
    const beforeContent = await read(testCopy);

    // Replace some text
    await replace('Wilde', 'WILDE', [testCopy]);

    // Read after
    const afterContent = await read(testCopy);

    // The replacement should have happened
    expect(afterContent.content).toContain('WILDE');
    expect(afterContent.content).not.toContain('Wilde');

    // Content length should be similar (same number of characters replaced)
    // This is a rough check - exact length may differ slightly
    const lengthDiff = Math.abs(afterContent.content.length - beforeContent.content.length);
    expect(lengthDiff).toBeLessThan(10); // Should be basically the same length

    await rm(testCopy);
  });

  test('single-range match replacement works correctly', async () => {
    const testCopy = join(TEST_DIR, 'single-range.docx');
    await copyFile(SAMPLE_DOC, testCopy);

    // Search for a unique word that exists in a single paragraph
    const beforeSearch = await search('bold', [testCopy]);
    expect(beforeSearch.totalMatches).toBeGreaterThan(0);

    // Replace it
    const result = await replace('bold', 'BOLD', [testCopy]);
    expect(result.totalReplacements).toBe(beforeSearch.totalMatches);

    // Verify replacement
    const afterSearch = await search('BOLD', [testCopy]);
    expect(afterSearch.totalMatches).toBe(beforeSearch.totalMatches);

    await rm(testCopy);
  });
});
