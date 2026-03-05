import { test, expect } from '../../fixtures/superdoc.js';
import type { Locator, Page } from '@playwright/test';

test.use({ config: { toolbar: 'full', showSelection: true } });

const SINGLE_HTML_TABLE = `
  <table>
    <tbody>
      <tr><th>Name</th><th>Role</th><th>Department</th><th>Start Date</th></tr>
      <tr><td>Alice Kim</td><td>Manager</td><td>Operations</td><td>2022-03-14</td></tr>
      <tr><td>Brian Lee</td><td>Developer</td><td>Engineering</td><td>2023-01-09</td></tr>
      <tr><td>Carla Gomez</td><td>Designer</td><td>Product</td><td>2021-11-22</td></tr>
      <tr><td>David Chen</td><td>Analyst</td><td>Finance</td><td>2024-06-03</td></tr>
    </tbody>
  </table>
`;

async function hoverColumnBoundary(page: Page, target: number | 'right-edge') {
  const pos = await page.evaluate((t) => {
    const frag = document.querySelector('.superdoc-table-fragment[data-table-boundaries]');
    if (!frag) throw new Error('No table fragment with boundaries found');
    const { columns } = JSON.parse(frag.getAttribute('data-table-boundaries')!);
    const col = t === 'right-edge' ? columns[columns.length - 1] : columns[t];
    if (!col) throw new Error(`Column ${t} not found`);
    const rect = frag.getBoundingClientRect();
    const offset = t === 'right-edge' ? -2 : 0;
    return { x: rect.left + col.x + col.w + offset, y: rect.top + rect.height / 2 };
  }, target);

  await page.mouse.move(pos.x, pos.y);
}

async function dragHandle(page: Page, handle: Locator, deltaX: number) {
  const box = await handle.boundingBox();
  if (!box) throw new Error('Resize handle not visible');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(x + (deltaX * i) / 10, y);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
}

async function getTableGrid(page: Page) {
  return page.evaluate(() => {
    const doc = (window as any).editor.state.doc;
    let grid: any = null;
    doc.descendants((node: any) => {
      if (grid === null && node.type.name === 'table') {
        grid = node.attrs.grid;
      }
    });
    return grid;
  });
}

test('pasted HTML table can be column-resized', async ({ superdoc }) => {
  await superdoc.page.evaluate((html) => {
    const editor = (window as any).editor;
    const event = new Event('paste', { bubbles: true, cancelable: true });
    (event as any).clipboardData = {
      getData: (type: string) => {
        if (type === 'text/html') return html;
        if (type === 'text/plain') return '';
        return '';
      },
    };
    editor.view.dom.dispatchEvent(event);
  }, SINGLE_HTML_TABLE);
  await superdoc.waitForStable();

  const initialState = await superdoc.page.evaluate(() => {
    const tableFragment = document.querySelector('.superdoc-table-fragment');
    const hasPmStartMarker = Boolean(tableFragment?.querySelector('[data-pm-start]'));
    const boundariesAttr = tableFragment?.getAttribute('data-table-boundaries') ?? null;
    const boundaries = boundariesAttr ? JSON.parse(boundariesAttr) : null;

    const doc = (window as any).editor.state.doc;
    let tableCount = 0;
    let grid = null as unknown;
    doc.descendants((node: any) => {
      if (node.type.name === 'table') {
        tableCount += 1;
        if (grid === null) grid = node.attrs.grid;
      }
    });

    return { hasPmStartMarker, tableCount, grid, boundaries };
  });

  expect(initialState.tableCount).toBe(1);
  expect(initialState.hasPmStartMarker).toBe(true);
  expect(initialState.boundaries?.columns?.length).toBe(4);

  // Retry once to reduce flake from hover/drag timing in headless browsers.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await hoverColumnBoundary(superdoc.page, 0);
    await superdoc.waitForStable();

    const handle = superdoc.page.locator('.resize-handle[data-boundary-type="inner"]').first();
    await expect(handle).toBeAttached({ timeout: 5000 });

    await dragHandle(superdoc.page, handle, 120);
    await superdoc.waitForStable();

    const grid = await getTableGrid(superdoc.page);
    if (Array.isArray(grid) && grid.length === 4) {
      return;
    }
  }

  const grid = await getTableGrid(superdoc.page);
  expect(grid).toHaveLength(4);
});
