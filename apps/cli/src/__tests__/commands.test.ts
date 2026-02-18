import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { copyFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { read } from '../commands/read';
import { search } from '../commands/search';
import { replace } from '../commands/replace';

const TEST_DIR = join(import.meta.dir, 'fixtures');
const SAMPLE_DOC = join(TEST_DIR, 'sample.docx');

describe('CLI Commands', () => {
  beforeAll(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    // Copy a test document to our fixtures folder
    const sourceDoc = join(import.meta.dir, '../../../../e2e-tests/test-data/basic-documents/advanced-text.docx');
    await copyFile(sourceDoc, SAMPLE_DOC);
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('read', () => {
    test('reads document content', async () => {
      const result = await read(SAMPLE_DOC);

      expect(result).toHaveProperty('path', SAMPLE_DOC);
      expect(result).toHaveProperty('content');
      expect(typeof result.content).toBe('string');
      expect(result.content.length).toBeGreaterThan(0);
    });
  });

  describe('search', () => {
    test('finds text in document', async () => {
      const result = await search('the', [SAMPLE_DOC]);

      expect(result).toHaveProperty('totalMatches');
      expect(result).toHaveProperty('files');
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe(SAMPLE_DOC);
    });

    test('returns empty for non-matching pattern', async () => {
      const result = await search('xyz123nonexistent', [SAMPLE_DOC]);

      expect(result.totalMatches).toBe(0);
      expect(result.files).toHaveLength(0);
    });
  });

  describe('replace', () => {
    test('replaces text in document', async () => {
      // Create a copy for replace test
      const replaceCopy = join(TEST_DIR, 'replace-test.docx');
      await copyFile(SAMPLE_DOC, replaceCopy);

      // First verify the text exists
      const beforeSearch = await search('the', [replaceCopy]);
      const beforeCount = beforeSearch.totalMatches;

      if (beforeCount > 0) {
        // Replace and verify
        const result = await replace('the', 'THE', [replaceCopy]);

        expect(result).toHaveProperty('totalReplacements');
        expect(result.totalReplacements).toBe(beforeCount);
        expect(result.files).toHaveLength(1);
        expect(result.files[0].replacements).toBe(beforeCount);

        // Verify the replacement happened
        const afterSearch = await search('THE', [replaceCopy]);
        expect(afterSearch.totalMatches).toBe(beforeCount);
      }

      await rm(replaceCopy);
    });
  });
});
