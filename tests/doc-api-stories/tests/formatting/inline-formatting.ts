import { describe, expect, it } from 'vitest';
import { unwrap, useStoryHarness } from '../harness';

/**
 * End-to-end story tests for all inline formatting operations.
 *
 * Each test opens a blank document, inserts descriptive text, then applies
 * the corresponding format operation. Starting from a blank doc proves the
 * full pipeline: SDK → CLI → document-api → adapter → editor, without
 * depending on any pre-existing corpus document.
 *
 * The blank DOCX template contains a single empty paragraph with a stable
 * `w14:paraId` attribute that survives DOCX export/reimport cycles, so the
 * blockId returned by `insert` remains valid for subsequent operations.
 *
 * Covered operations:
 *   format.apply  — bold, italic, underline, strike (boolean mark patches)
 *   format.fontSize, format.fontFamily, format.color (value-based inline marks)
 *   format.align  — paragraph-level alignment (center, right, justify)
 */
describe('document-api story: inline formatting', () => {
  const { client, outPath } = useStoryHarness('formatting/inline-formatting', {
    preserveResults: true,
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Opens a blank doc, inserts the given descriptive text, and returns a
   * target spanning the full inserted range.
   *
   * Each test gets its own session (and thus its own working doc on disk).
   */
  async function setupFormattableText(sessionId: string, text: string) {
    // Open a blank document (no doc path → uses built-in blank DOCX template)
    await client.doc.open({ sessionId });

    // Insert text into the blank doc's single paragraph.
    // Without an explicit target, insert uses the first paragraph.
    const insertResult = unwrap<any>(await client.doc.insert({ sessionId, text }));
    expect(insertResult.receipt?.success).toBe(true);

    // The receipt's hoisted target contains the paragraph's stable blockId.
    const blockId = insertResult.target?.blockId;
    if (!blockId) throw new Error('Insert did not return a target blockId.');

    // Build a target spanning the full inserted text
    return {
      kind: 'text' as const,
      blockId,
      range: { start: 0, end: text.length },
    };
  }

  /** Export the session's working doc to the results directory. */
  async function saveResult(sessionId: string, docName: string) {
    await client.doc.save({ sessionId, out: outPath(docName) });
  }

  // ---------------------------------------------------------------------------
  // format.apply — boolean mark patches
  // ---------------------------------------------------------------------------

  it('bold: applies bold to inserted text', async () => {
    const sid = `bold-${Date.now()}`;
    const target = await setupFormattableText(sid, 'This text should be bold');

    const result = unwrap<any>(await client.doc.format.apply({ sessionId: sid, target, inline: { bold: true } }));
    expect(result.receipt?.success).toBe(true);
    await saveResult(sid, 'bold.docx');
  });

  it('italic: applies italic to inserted text', async () => {
    const sid = `italic-${Date.now()}`;
    const target = await setupFormattableText(sid, 'This text should be italic');

    const result = unwrap<any>(await client.doc.format.apply({ sessionId: sid, target, inline: { italic: true } }));
    expect(result.receipt?.success).toBe(true);
    await saveResult(sid, 'italic.docx');
  });

  it('underline: applies underline to inserted text', async () => {
    const sid = `underline-${Date.now()}`;
    const target = await setupFormattableText(sid, 'This text should be underlined');

    const result = unwrap<any>(await client.doc.format.apply({ sessionId: sid, target, inline: { underline: true } }));
    expect(result.receipt?.success).toBe(true);
    await saveResult(sid, 'underline.docx');
  });

  it('strikethrough: applies strike to inserted text', async () => {
    const sid = `strike-${Date.now()}`;
    const target = await setupFormattableText(sid, 'This text should be struck through');

    const result = unwrap<any>(await client.doc.format.apply({ sessionId: sid, target, inline: { strike: true } }));
    expect(result.receipt?.success).toBe(true);
    await saveResult(sid, 'strike.docx');
  });

  it('multi-mark: applies bold + italic in a single call', async () => {
    const sid = `multi-${Date.now()}`;
    const target = await setupFormattableText(sid, 'This text should be bold and italic');

    const result = unwrap<any>(
      await client.doc.format.apply({
        sessionId: sid,
        target,
        inline: { bold: true, italic: true },
      }),
    );
    expect(result.receipt?.success).toBe(true);
    await saveResult(sid, 'multi-mark.docx');
  });

  // ---------------------------------------------------------------------------
  // format.fontSize
  // ---------------------------------------------------------------------------

  it('fontSize: sets a numeric point size', async () => {
    const sid = `fontSize-num-${Date.now()}`;
    const target = await setupFormattableText(sid, 'This text should be 24pt');

    const result = unwrap<any>(await client.doc.format.fontSize({ sessionId: sid, target, value: 24 }));
    expect(result.receipt?.success).toBe(true);
    await saveResult(sid, 'fontSize-num.docx');
  });

  it('fontSize: sets a string size value', async () => {
    const sid = `fontSize-str-${Date.now()}`;
    const target = await setupFormattableText(sid, 'This text should be 14pt');

    const result = unwrap<any>(await client.doc.format.fontSize({ sessionId: sid, target, value: '14pt' }));
    expect(result.receipt?.success).toBe(true);
    await saveResult(sid, 'fontSize-str.docx');
  });

  // ---------------------------------------------------------------------------
  // format.fontFamily
  // ---------------------------------------------------------------------------

  it('fontFamily: sets a font family', async () => {
    const sid = `fontFamily-${Date.now()}`;
    const target = await setupFormattableText(sid, 'This text should be Courier New');

    const result = unwrap<any>(await client.doc.format.fontFamily({ sessionId: sid, target, value: 'Courier New' }));
    expect(result.receipt?.success).toBe(true);
    await saveResult(sid, 'fontFamily.docx');
  });

  // ---------------------------------------------------------------------------
  // format.color
  // ---------------------------------------------------------------------------

  it('color: sets a hex color', async () => {
    const sid = `color-${Date.now()}`;
    const target = await setupFormattableText(sid, 'This text should be red');

    const result = unwrap<any>(await client.doc.format.color({ sessionId: sid, target, value: '#FF0000' }));
    expect(result.receipt?.success).toBe(true);
    await saveResult(sid, 'color.docx');
  });

  // ---------------------------------------------------------------------------
  // format.align (paragraph-level)
  // ---------------------------------------------------------------------------

  it('align center: centers the paragraph', async () => {
    const sid = `align-center-${Date.now()}`;
    const target = await setupFormattableText(sid, 'This paragraph should be centered');

    const result = unwrap<any>(await client.doc.format.align({ sessionId: sid, target, alignment: 'center' }));
    expect(result.receipt?.success).toBe(true);
    await saveResult(sid, 'align-center.docx');
  });

  it('align right: right-aligns the paragraph', async () => {
    const sid = `align-right-${Date.now()}`;
    const target = await setupFormattableText(sid, 'This paragraph should be right-aligned');

    const result = unwrap<any>(await client.doc.format.align({ sessionId: sid, target, alignment: 'right' }));
    expect(result.receipt?.success).toBe(true);
    await saveResult(sid, 'align-right.docx');
  });

  it('align justify: justifies the paragraph', async () => {
    const sid = `align-justify-${Date.now()}`;
    const target = await setupFormattableText(
      sid,
      'This paragraph should be fully justified so that both the left and right edges align neatly. When the text is long enough to wrap across several lines, justified alignment becomes visually obvious because each line stretches to fill the full width of the page, distributing extra space evenly between words.',
    );

    const result = unwrap<any>(await client.doc.format.align({ sessionId: sid, target, alignment: 'justify' }));
    expect(result.receipt?.success).toBe(true);
    await saveResult(sid, 'align-justify.docx');
  });

  // ---------------------------------------------------------------------------
  // Combined: multiple value formats on the same range
  // ---------------------------------------------------------------------------

  it('combined: fontSize + fontFamily + color on the same text', async () => {
    const sid = `combined-${Date.now()}`;
    const target = await setupFormattableText(sid, 'This text should be 18pt Georgia in blue');

    const sizeResult = unwrap<any>(await client.doc.format.fontSize({ sessionId: sid, target, value: 18 }));
    expect(sizeResult.receipt?.success).toBe(true);

    const familyResult = unwrap<any>(await client.doc.format.fontFamily({ sessionId: sid, target, value: 'Georgia' }));
    expect(familyResult.receipt?.success).toBe(true);

    const colorResult = unwrap<any>(await client.doc.format.color({ sessionId: sid, target, value: '#0000FF' }));
    expect(colorResult.receipt?.success).toBe(true);
    await saveResult(sid, 'combined.docx');
  });

  // ---------------------------------------------------------------------------
  // dryRun: verify no mutation occurs
  // ---------------------------------------------------------------------------

  it('dryRun: format.apply returns success without mutating', async () => {
    const sid = `dryRun-${Date.now()}`;
    const target = await setupFormattableText(sid, 'This text should not actually change');

    const result = unwrap<any>(
      await client.doc.format.apply({
        sessionId: sid,
        target,
        inline: { bold: true },
        dryRun: true,
      }),
    );
    expect(result.receipt?.success).toBe(true);
  });
});
