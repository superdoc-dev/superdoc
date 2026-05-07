// @ts-check
/**
 * Verify that calling tables.setShading without a color does NOT surface as
 * an unhandled TypeError.
 *
 * Hypothesis: the merged superdoc_table tool schema only requires `action`,
 * with `color` carrying a description string but no schema-level enforcement.
 * A tool call like `{action:'set_shading', nodeId:'...'}` therefore passes
 * Anthropic / MCP tool-call validation. At runtime, `tablesSetShadingAdapter`
 * calls `normalizeColorInput(input.color)` BEFORE its try/catch (line 3515 in
 * the PR), and `normalizeColorInput` does `color.startsWith('#')`. With
 * `input.color === undefined` this throws `TypeError`.
 *
 * Expected fix shape: either move `normalizeColorInput` inside the try, or
 * reject `color === undefined` upfront with INVALID_INPUT.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

let docxData;

beforeAll(async () => {
  docxData = await loadTestDataForEditorTests('table-merged-cells.docx');
});

describe('tables.setShading without color', () => {
  it('returns a structured INVALID_INPUT failure rather than throwing TypeError', () => {
    const { editor } = initTestEditor({
      content: docxData.docx,
      media: docxData.media,
      mediaFiles: docxData.mediaFiles,
      fonts: docxData.fonts,
      element: null,
    });

    let tableId = null;
    editor.state.doc.descendants((node) => {
      if (tableId) return false;
      if (node.type.name !== 'table') return true;
      tableId = node.attrs?.sdBlockId;
      return false;
    });
    expect(tableId).toBeTruthy();

    let result;
    let thrown = null;
    try {
      // Cast through any to bypass TS — we are deliberately replicating an
      // LLM tool call that omitted the required color, which the merged
      // superdoc_table schema does not catch.
      result = editor.doc.tables.setShading(
        /** @type {any} */ ({
          target: { kind: 'block', nodeType: 'table', nodeId: tableId },
        }),
      );
    } catch (e) {
      thrown = e;
    }

    // eslint-disable-next-line no-console
    console.log('[setShading-undefined-color probe]', {
      thrown: thrown ? `${thrown.name}: ${thrown.message}` : null,
      result,
    });

    expect(thrown, `setShading must not throw on missing color; got: ${thrown?.stack}`).toBeNull();
    expect(result?.success, 'should be a failure result, not a thrown error').toBe(false);
    // TableMutationFailure carries the code under `failure.code`, not at the top level.
    expect(result?.failure?.code, 'should report INVALID_INPUT (or similar)').toBeDefined();
  });
});
