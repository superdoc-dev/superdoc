/**
 * Debug script for comparing NodeView reference pipeline vs layout-engine adapter.
 *
 * Usage:
 *   node packages/super-editor/src/tests/parity/debug-parity.js <docx-file-path>
 *
 * This script loads a DOCX file and dumps side-by-side comparison of:
 * - Reference snapshot (NodeView logic)
 * - Adapter attributes (layout-engine)
 *
 * Useful for debugging parity issues and understanding differences between pipelines.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Editor } from '../../../core/Editor.js';
import { initTestEditor } from '../helpers/helpers.js';
import { computeParagraphReferenceSnapshot } from '../helpers/paragraphReference.js';
import { computeParagraphAttrs } from '@superdoc/pm-adapter/attributes/paragraph.js';
import {
  buildStyleContextFromEditor,
  buildConverterContextFromEditor,
  createListCounterContext,
} from '../helpers/adapterTestHelpers.js';

/**
 * Main debug function.
 */
async function debugParity(docxPath) {
  console.log(`\n=== Parity Debug Report ===`);
  console.log(`Document: ${docxPath}\n`);

  // Load DOCX file
  const buffer = readFileSync(docxPath);
  const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

  const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

  const styleContext = buildStyleContextFromEditor(editor);
  const converterContext = buildConverterContextFromEditor(editor);
  const listCounterContext = createListCounterContext();

  let paraIndex = 0;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return;

    console.log(`\n--- Paragraph ${paraIndex} (pos: ${pos}) ---`);

    // Get reference snapshot
    const reference = computeParagraphReferenceSnapshot(editor, node, pos);

    // Get adapter attrs
    const adapterAttrs = computeParagraphAttrs(node, styleContext, listCounterContext, converterContext);

    // Compare key properties
    console.log('\nReference (NodeView):');
    console.log('  Spacing:', JSON.stringify(reference.paragraphProperties.spacing, null, 2));
    console.log('  Indent:', JSON.stringify(reference.paragraphProperties.indent, null, 2));
    console.log('  Alignment:', reference.paragraphProperties.justification);
    console.log('  Tabs:', reference.paragraphProperties.tabStops?.length || 0);
    console.log('  List:', reference.list !== null);
    if (reference.list) {
      console.log('    Marker Text:', reference.list.markerText);
      console.log('    Justification:', reference.list.justification);
      console.log('    Suffix:', reference.list.suffix);
    }

    console.log('\nAdapter (Layout Engine):');
    console.log('  Spacing:', JSON.stringify(adapterAttrs?.spacing, null, 2));
    console.log('  Indent:', JSON.stringify(adapterAttrs?.indent, null, 2));
    console.log('  Alignment:', adapterAttrs?.alignment);
    console.log('  Tabs:', adapterAttrs?.tabs?.length || 0);
    console.log('  List:', Boolean(adapterAttrs?.numberingProperties));
    if (adapterAttrs?.wordLayout?.marker) {
      console.log('    Marker Text:', adapterAttrs.wordLayout.marker.markerText);
      console.log('    Justification:', adapterAttrs.wordLayout.marker.justification);
      console.log('    Suffix:', adapterAttrs.wordLayout.marker.suffix);
    }

    // Highlight differences
    const differences = [];
    if (reference.paragraphProperties.justification !== adapterAttrs?.alignment) {
      differences.push(
        `Alignment mismatch: ${reference.paragraphProperties.justification} vs ${adapterAttrs?.alignment}`,
      );
    }
    if (reference.list !== null && !adapterAttrs?.numberingProperties) {
      differences.push('List flag mismatch: reference is list, adapter is not');
    }
    if (reference.list?.markerText !== adapterAttrs?.wordLayout?.marker?.markerText) {
      differences.push(
        `Marker text mismatch: ${reference.list?.markerText} vs ${adapterAttrs?.wordLayout?.marker?.markerText}`,
      );
    }

    if (differences.length > 0) {
      console.log('\n  ⚠️  Differences:');
      differences.forEach((diff) => console.log(`    - ${diff}`));
    } else {
      console.log('\n  ✓ No differences detected');
    }

    paraIndex++;
  });

  editor.destroy();

  console.log(`\n=== End of Report ===\n`);
}

// Run if called as script
if (import.meta.url === `file://${process.argv[1]}`) {
  const docxPath = process.argv[2];

  if (!docxPath) {
    console.error('Usage: node debug-parity.js <docx-file-path>');
    process.exit(1);
  }

  const absolutePath = resolve(process.cwd(), docxPath);

  debugParity(absolutePath).catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
}

export { debugParity };
