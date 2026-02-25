import { describe, expect, it } from 'vitest';
import { corpusDoc, unwrap, useStoryHarness } from './harness';

/**
 * Story tests for the canonical `format.apply` operation and format helpers.
 *
 * These tests require a built CLI (`apps/cli/dist/index.js`) that includes
 * the `format.apply` operation. If the CLI dist is stale, rebuild with:
 *   pnpm run --filter cli build
 *
 * Note: `client.doc.format.bold()` is NOT available on the generated SDK
 * client — format helpers are standalone functions in `helpers/format.ts`.
 * Story tests use the canonical `client.doc.format.apply()` directly.
 */
describe('document-api story: ex2 format.apply', () => {
  const { client, copyDoc, outPath } = useStoryHarness('ex2-style-apply');

  it('canonical format.apply: bold a matched range', async () => {
    const sourceDocPath = await copyDoc(corpusDoc('basic/longer-header.docx'));
    const sessionId = `ex2-seed-${Date.now()}`;

    await client.doc.open({ doc: sourceDocPath, sessionId });

    // 1. Find a text range to format
    const matchResult = unwrap<any>(
      await client.doc.query.match({
        sessionId,
        select: { type: 'text', pattern: 'Term and Termination', caseSensitive: true },
        require: 'first',
      }),
    );

    expect(matchResult.items).toBeDefined();
    expect(matchResult.items.length).toBeGreaterThan(0);
    expect(matchResult.total).toBeGreaterThanOrEqual(1);
    expect(matchResult.page).toBeDefined();

    const match = matchResult.items[0];
    expect(match.handle.ref).toBeDefined();

    // 2. Apply bold using canonical format.apply with the matched ref
    const boldResult = unwrap<any>(
      await client.doc.format.apply({
        sessionId,
        target: match.handle.ref,
        marks: { bold: true },
      }),
    );

    expect(boldResult).toBeDefined();
    expect(boldResult.success).toBe(true);
  });

  it('multi-mark atomic: apply bold + italic in one call', async () => {
    const sourceDocPath = await copyDoc(corpusDoc('basic/longer-header.docx'), 'source-multi.docx');
    const sessionId = `ex2-multi-${Date.now()}`;

    await client.doc.open({ doc: sourceDocPath, sessionId });

    // 1. Find a text range
    const matchResult = unwrap<any>(
      await client.doc.query.match({
        sessionId,
        select: { type: 'text', pattern: 'Term and Termination', caseSensitive: true },
        require: 'first',
      }),
    );

    expect(matchResult.items).toBeDefined();
    expect(matchResult.items.length).toBeGreaterThan(0);
    const match = matchResult.items[0];

    // 2. Apply bold + italic in a single atomic call
    const result = unwrap<any>(
      await client.doc.format.apply({
        sessionId,
        target: match.handle.ref,
        marks: { bold: true, italic: true },
      }),
    );

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it('mark removal: set bold false on a range', async () => {
    const sourceDocPath = await copyDoc(corpusDoc('basic/longer-header.docx'), 'source-remove.docx');
    const sessionId = `ex2-remove-${Date.now()}`;

    await client.doc.open({ doc: sourceDocPath, sessionId });

    // 1. Find a text range
    const matchResult = unwrap<any>(
      await client.doc.query.match({
        sessionId,
        select: { type: 'text', pattern: 'Term and Termination', caseSensitive: true },
        require: 'first',
      }),
    );

    expect(matchResult.items).toBeDefined();
    expect(matchResult.items.length).toBeGreaterThan(0);
    const match = matchResult.items[0];

    // 2. Remove bold (false = unset)
    const result = unwrap<any>(
      await client.doc.format.apply({
        sessionId,
        target: match.handle.ref,
        marks: { bold: false },
      }),
    );

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it('mixed patch: set bold true + remove italic false in one call', async () => {
    const sourceDocPath = await copyDoc(corpusDoc('basic/longer-header.docx'), 'source-mixed.docx');
    const sessionId = `ex2-mixed-${Date.now()}`;

    await client.doc.open({ doc: sourceDocPath, sessionId });

    const matchResult = unwrap<any>(
      await client.doc.query.match({
        sessionId,
        select: { type: 'text', pattern: 'Term and Termination', caseSensitive: true },
        require: 'first',
      }),
    );

    expect(matchResult.items).toBeDefined();
    expect(matchResult.items.length).toBeGreaterThan(0);
    const match = matchResult.items[0];

    // Mixed patch: bold on, italic off
    const result = unwrap<any>(
      await client.doc.format.apply({
        sessionId,
        target: match.handle.ref,
        marks: { bold: true, italic: false },
      }),
    );

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });
});
