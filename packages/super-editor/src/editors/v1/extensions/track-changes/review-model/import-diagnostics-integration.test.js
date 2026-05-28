// @ts-check
/**
 * Phase 005 — integration test for `scanImportDiagnostics` against real
 * DOCX fixtures.
 *
 * Plan: v1-3220 / phase0-005 "Repo-Local Critical Tests Only".
 *
 * The unit tests in `import-diagnostics.test.js` already cover every
 * diagnostic code with synthetic XML. This file runs the scanner against
 * existing real-world DOCX fixtures shipped with the repo to prove that:
 *
 *   1) the scanner does NOT false-positive on clean Word-tracked-change
 *      documents (gdocs / msword paired revisions);
 *   2) it does run end-to-end without throwing on a real OOXML body.
 */

import { describe, it, expect } from 'vitest';
import { loadTestDataForEditorTests, initTestEditor } from '../../../tests/helpers/helpers.js';
import { scanImportDiagnostics } from './import-diagnostics.js';

const realDocxAsParsedParts = async (filename) => {
  const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename);
  const { editor } = await initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });
  try {
    // SuperConverter parsed every XML file in the DOCX into convertedXml.
    return editor.converter.convertedXml;
  } finally {
    editor.destroy();
  }
};

describe('scanImportDiagnostics against real DOCX fixtures', () => {
  it('does not flag clean msword-tracked-changes.docx as missing replacement sides', async () => {
    const parts = await realDocxAsParsedParts('msword-tracked-changes.docx');
    const ctx = scanImportDiagnostics(parts, { replacements: 'paired' });
    const diagnostics = ctx.diagnostics();
    // The msword fixture has both insertions and deletions, so the strict
    // REPLACEMENT_MISSING_SIDE diagnostic (which requires a single side in
    // the part) must NOT fire. Heuristic-reconstruction diagnostics may
    // still fire for asymmetric author/date clusters — that signal is
    // expected and informational under overlap.
    const replacementMissing = diagnostics.filter((d) => d.code === 'IMPORT_REPLACEMENT_MISSING_SIDE');
    expect(replacementMissing).toEqual([]);
  });

  it('returns diagnostics as a stable array for a large DOCX', async () => {
    const parts = await realDocxAsParsedParts('features-redlines-comments-annotations-and-more.docx');
    const ctx = scanImportDiagnostics(parts, {});
    expect(Array.isArray(ctx.diagnostics())).toBe(true);
  });

  it('runs to completion without throwing on real DOCX with many tracked changes', async () => {
    const parts = await realDocxAsParsedParts('features-redlines-comments-annotations-and-more.docx');
    expect(() => {
      scanImportDiagnostics(parts, { replacements: 'paired' });
    }).not.toThrow();
  });
});
