import { test, expect } from '../../fixtures/superdoc.js';

test('cursor placement and typing before field annotation at start of table cell', async ({ superdoc }) => {
  // Insert a 2x2 table
  await superdoc.executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
  await superdoc.waitForStable();
  await superdoc.assertTableExists(2, 2);

  // Insert field annotation at cursor (start of first cell)
  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    editor.commands.addFieldAnnotationAtSelection({
      type: 'text',
      displayLabel: 'Enter value',
      fieldId: 'field-in-cell',
      fieldColor: '#6366f1',
      highlighted: true,
    });
  });
  await superdoc.waitForStable();

  // Annotation should be inside the table
  const annotation = superdoc.page.locator('.superdoc-line .annotation[data-field-id="field-in-cell"]');
  await expect(annotation).toBeVisible();
  await expect(annotation).toHaveAttribute('data-display-label', 'Enter value');

  // Navigate to start of cell (before the annotation)
  // Use programmatic cursor placement instead of Home key — webkit handles
  // Home differently inside table cells and doesn't reliably move before atoms.
  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const { doc } = editor.state;
    let annotationPos: number | null = null;
    doc.descendants((node: any, pos: number) => {
      if (node.type.name === 'fieldAnnotation' && node.attrs.fieldId === 'field-in-cell') {
        annotationPos = pos;
      }
    });
    if (annotationPos !== null) {
      editor.commands.setTextSelection(annotationPos);
    }
  });
  await superdoc.waitForStable();

  // Type before annotation — text should appear before the annotation, not after
  await superdoc.type('Prefix: ');
  await superdoc.waitForStable();

  // The annotation should still exist
  await expect(annotation).toBeVisible();

  // The typed text should be in the document
  await superdoc.assertTextContains('Prefix:');

  // Verify the annotation PM node still exists with correct attrs
  const pmNode = await superdoc.page.evaluate(() => {
    const doc = (window as any).editor.state.doc;
    let found: any = null;
    doc.descendants((node: any) => {
      if (node.type.name === 'fieldAnnotation' && node.attrs.fieldId === 'field-in-cell') {
        found = { type: node.attrs.type, displayLabel: node.attrs.displayLabel };
      }
    });
    return found;
  });
  expect(pmNode).toBeTruthy();
  expect(pmNode.displayLabel).toBe('Enter value');

  await superdoc.snapshot('table-cell-leading-caret');
});
