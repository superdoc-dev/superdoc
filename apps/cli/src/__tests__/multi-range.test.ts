import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { copyFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  openDocument,
  closeDocument,
  searchDocument,
  replaceInDocument,
  saveDocument,
  getDocumentText,
} from '../lib/editor';

const TEST_DIR = join(import.meta.dir, 'fixtures-multi-range');
const SAMPLE_DOC = join(TEST_DIR, 'sample.docx');

describe('Multi-range replacement', () => {
  beforeAll(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    const sourceDoc = join(import.meta.dir, '../../../../e2e-tests/test-data/basic-documents/advanced-text.docx');
    await copyFile(sourceDoc, SAMPLE_DOC);
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test('searchDocument returns matches with ranges property', async () => {
    const doc = await openDocument(SAMPLE_DOC);
    try {
      const matches = searchDocument(doc, 'Oscar');

      expect(matches.length).toBeGreaterThan(0);

      // All matches should have the ranges property
      for (const match of matches) {
        expect(match).toHaveProperty('ranges');
        expect(match.ranges).toBeArray();
        expect(match.ranges!.length).toBeGreaterThan(0);
      }
    } finally {
      closeDocument(doc);
    }
  });

  test('replacement with single-range matches works', async () => {
    const testCopy = join(TEST_DIR, 'single-range-replace.docx');
    await copyFile(SAMPLE_DOC, testCopy);

    const doc = await openDocument(testCopy);
    try {
      const beforeText = getDocumentText(doc);
      const oscarCount = (beforeText.match(/Oscar/g) || []).length;

      // Replace Oscar with OSCAR
      const replacements = replaceInDocument(doc, 'Oscar', 'OSCAR');
      expect(replacements).toBe(oscarCount);

      await saveDocument(doc);

      // Re-open to verify
      closeDocument(doc);
      const doc2 = await openDocument(testCopy);
      const afterText = getDocumentText(doc2);
      const oscarAfter = (afterText.match(/Oscar/g) || []).length;
      const OSCARAfter = (afterText.match(/OSCAR/g) || []).length;

      expect(oscarAfter).toBe(0);
      expect(OSCARAfter).toBe(oscarCount);

      closeDocument(doc2);
    } catch (e) {
      closeDocument(doc);
      throw e;
    }

    await rm(testCopy);
  });

  test('multi-range match handling preserves document structure', async () => {
    const testCopy = join(TEST_DIR, 'multi-range-logic.docx');
    await copyFile(SAMPLE_DOC, testCopy);

    const doc = await openDocument(testCopy);
    try {
      const beforeText = getDocumentText(doc);
      const wildeCount = (beforeText.match(/Wilde/g) || []).length;

      const replacements = replaceInDocument(doc, 'Wilde', 'WILDE');
      expect(replacements).toBe(wildeCount);

      await saveDocument(doc);
    } finally {
      closeDocument(doc);
    }

    // Verify the replacement
    const doc2 = await openDocument(testCopy);
    try {
      const afterText = getDocumentText(doc2);
      expect(afterText).not.toContain('Wilde');
      expect(afterText).toContain('WILDE');
    } finally {
      closeDocument(doc2);
    }

    await rm(testCopy);
  });
});
