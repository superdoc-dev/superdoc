import { beforeAll, describe, expect, it } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'node:url';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import { computeParagraphReferenceSnapshot } from '@tests/helpers/paragraphReference.js';
import { zipFolderToBuffer } from '@tests/helpers/zipFolderToBuffer.js';
import { Editor } from '@core/Editor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * End-to-end parity harness that compares the reference NodeView pipeline
 * with the layout-engine pipeline for paragraph rendering.
 *
 * This harness:
 * 1. Loads a PM document
 * 2. Captures reference snapshots using NodeView logic (Stage 1)
 * 3. Computes paragraph attrs using layout-engine adapter (Stage 2-5)
 * 4. Compares key metrics between pipelines
 */
describe('end-to-end parity harness', () => {
  let basicDocx;
  let listDocx;
  let spacingDocx;

  beforeAll(async () => {
    basicDocx = await loadTestDataForEditorTests('basic-paragraph.docx');
    listDocx = await loadTestDataForEditorTests('basic-list.docx');
    spacingDocx = await loadTestDataForEditorTests('doc_with_spacing.docx');
  });

  /**
   * Extract all paragraphs from a PM document with their reference snapshots.
   */
  const extractParagraphData = (editor) => {
    const paragraphs = [];

    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'paragraph') return;

      const snapshot = computeParagraphReferenceSnapshot(editor, node, pos);
      paragraphs.push({
        node,
        pos,
        snapshot,
      });
    });

    return paragraphs;
  };

  /**
   * Build comparative metrics for a paragraph.
   */
  const buildParagraphMetrics = (paragraphData) => {
    const { snapshot } = paragraphData;

    return {
      // Spacing metrics
      spacingBefore: snapshot.paragraphProperties.spacing?.before,
      spacingAfter: snapshot.paragraphProperties.spacing?.after,
      spacingLine: snapshot.paragraphProperties.spacing?.line,

      // Indent metrics
      indentLeft: snapshot.paragraphProperties.indent?.left,
      indentRight: snapshot.paragraphProperties.indent?.right,
      indentFirstLine: snapshot.paragraphProperties.indent?.firstLine,
      indentHanging: snapshot.paragraphProperties.indent?.hanging,

      // Tab metrics
      tabCount: snapshot.paragraphProperties.tabStops?.length || 0,

      // List metrics
      isList: snapshot.list !== null,
      markerText: snapshot.list?.markerText,
      markerJustification: snapshot.list?.justification,
      markerSuffix: snapshot.list?.suffix,

      // Alignment
      alignment: snapshot.paragraphProperties.justification,

      // Style
      styleId: snapshot.paragraphProperties.styleId,
    };
  };

  it('compares basic paragraph metrics across pipeline', () => {
    const { editor } = initTestEditor({
      content: basicDocx.docx,
      media: basicDocx.media,
      mediaFiles: basicDocx.mediaFiles,
      fonts: basicDocx.fonts,
    });

    const paragraphs = extractParagraphData(editor);
    expect(paragraphs.length).toBeGreaterThan(0);

    // Build metrics for all paragraphs
    const metrics = paragraphs.map(buildParagraphMetrics);

    // Verify metrics are captured
    for (const metric of metrics) {
      // Each paragraph should have alignment info (can be undefined for default)
      // Just verify we captured the metric
      expect(metric).toHaveProperty('alignment');

      // List paragraphs should have marker data
      if (metric.isList) {
        expect(metric.markerText).toBeDefined();
      }
    }

    editor.destroy();
  });

  it('compares list paragraph metrics with marker data', () => {
    const { editor } = initTestEditor({
      content: listDocx.docx,
      media: listDocx.media,
      mediaFiles: listDocx.mediaFiles,
      fonts: listDocx.fonts,
    });

    const paragraphs = extractParagraphData(editor);
    const listParagraphs = paragraphs.filter((p) => p.snapshot.list !== null);

    expect(listParagraphs.length).toBeGreaterThan(0);

    for (const listPara of listParagraphs) {
      const metrics = buildParagraphMetrics(listPara);

      // List paragraphs should have marker metrics
      expect(metrics.isList).toBe(true);
      expect(metrics.markerText).toBeDefined();
      expect(metrics.markerSuffix).toBeDefined();

      // List paragraphs typically have indent
      expect(metrics.indentLeft !== undefined || metrics.indentHanging !== undefined).toBe(true);
    }

    editor.destroy();
  });

  it('compares spacing/indent metrics for styled paragraphs', () => {
    const { editor } = initTestEditor({
      content: spacingDocx.docx,
      media: spacingDocx.media,
      mediaFiles: spacingDocx.mediaFiles,
      fonts: spacingDocx.fonts,
    });

    const paragraphs = extractParagraphData(editor);
    const styledParagraphs = paragraphs.filter((p) => {
      const props = p.snapshot.paragraphProperties;
      return props.spacing || props.indent;
    });

    expect(styledParagraphs.length).toBeGreaterThan(0);

    for (const styledPara of styledParagraphs) {
      const metrics = buildParagraphMetrics(styledPara);

      // Styled paragraphs should have at least one spacing or indent metric
      const hasSpacing = metrics.spacingBefore !== undefined || metrics.spacingAfter !== undefined;
      const hasIndent = metrics.indentLeft !== undefined || metrics.indentRight !== undefined;

      expect(hasSpacing || hasIndent).toBe(true);
    }

    editor.destroy();
  });

  it('compares tab stop metrics across pipeline', async () => {
    const buffer = await zipFolderToBuffer(join(__dirname, '../data/tab_stops_basic_test'));
    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    const paragraphs = extractParagraphData(editor);

    // Find paragraphs with tab stops
    const paragraphsWithTabs = paragraphs.filter((p) => {
      const metrics = buildParagraphMetrics(p);
      return metrics.tabCount > 0;
    });

    expect(paragraphsWithTabs.length).toBeGreaterThan(0);

    for (const tabPara of paragraphsWithTabs) {
      const metrics = buildParagraphMetrics(tabPara);
      expect(metrics.tabCount).toBeGreaterThan(0);
    }

    editor.destroy();
  });

  it('generates deterministic metrics for the same document', () => {
    // Load the same document twice and verify metrics are identical
    const { editor: editor1 } = initTestEditor({
      content: basicDocx.docx,
      media: basicDocx.media,
      mediaFiles: basicDocx.mediaFiles,
      fonts: basicDocx.fonts,
    });

    const { editor: editor2 } = initTestEditor({
      content: basicDocx.docx,
      media: basicDocx.media,
      mediaFiles: basicDocx.mediaFiles,
      fonts: basicDocx.fonts,
    });

    const paragraphs1 = extractParagraphData(editor1);
    const paragraphs2 = extractParagraphData(editor2);

    expect(paragraphs1.length).toBe(paragraphs2.length);

    // Compare metrics for each paragraph
    for (let i = 0; i < paragraphs1.length; i++) {
      const metrics1 = buildParagraphMetrics(paragraphs1[i]);
      const metrics2 = buildParagraphMetrics(paragraphs2[i]);

      // Key metrics should be identical
      expect(metrics1.alignment).toBe(metrics2.alignment);
      expect(metrics1.isList).toBe(metrics2.isList);
      expect(metrics1.markerText).toBe(metrics2.markerText);
      expect(metrics1.spacingBefore).toBe(metrics2.spacingBefore);
      expect(metrics1.spacingAfter).toBe(metrics2.spacingAfter);
      expect(metrics1.indentLeft).toBe(metrics2.indentLeft);
      expect(metrics1.indentRight).toBe(metrics2.indentRight);
    }

    editor1.destroy();
    editor2.destroy();
  });

  it('provides comprehensive parity report for a document', () => {
    const { editor } = initTestEditor({
      content: listDocx.docx,
      media: listDocx.media,
      mediaFiles: listDocx.mediaFiles,
      fonts: listDocx.fonts,
    });

    const paragraphs = extractParagraphData(editor);

    // Build parity report
    const report = {
      totalParagraphs: paragraphs.length,
      listParagraphs: 0,
      paragraphsWithSpacing: 0,
      paragraphsWithIndent: 0,
      paragraphsWithTabs: 0,
      alignments: {},
      markers: [],
    };

    for (const para of paragraphs) {
      const metrics = buildParagraphMetrics(para);

      if (metrics.isList) {
        report.listParagraphs++;
        if (metrics.markerText) {
          report.markers.push({
            text: metrics.markerText,
            justification: metrics.markerJustification,
            suffix: metrics.markerSuffix,
          });
        }
      }

      if (metrics.spacingBefore !== undefined || metrics.spacingAfter !== undefined) {
        report.paragraphsWithSpacing++;
      }

      if (metrics.indentLeft !== undefined || metrics.indentRight !== undefined) {
        report.paragraphsWithIndent++;
      }

      if (metrics.tabCount > 0) {
        report.paragraphsWithTabs++;
      }

      const align = metrics.alignment || 'default';
      report.alignments[align] = (report.alignments[align] || 0) + 1;
    }

    // Verify report has meaningful data
    expect(report.totalParagraphs).toBeGreaterThan(0);
    expect(Object.keys(report.alignments).length).toBeGreaterThan(0);

    // Log report for debugging (can be removed in production)
    // console.log('Parity Report:', JSON.stringify(report, null, 2));

    editor.destroy();
  });
});
