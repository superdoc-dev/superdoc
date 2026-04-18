import { describe, it, expect } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';

const hasTabPlugin = (state) => {
  return state.plugins.some((plugin) => {
    const keyObj = plugin.key || plugin.spec?.key;
    return keyObj?.key === 'tabPlugin';
  });
};

describe('Tab extension - headless mode behavior', () => {
  it('does not register the tab plugin in headless mode', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'run', content: [{ type: 'text', text: 'A' }] },
            { type: 'run', content: [{ type: 'tab' }] },
            { type: 'run', content: [{ type: 'text', text: 'B' }] },
          ],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: doc, isHeadless: true });

    expect(hasTabPlugin(editor.state)).toBe(false);
    editor.destroy();
  });

  it('keeps the tab node in the schema in headless mode', () => {
    const minimalDoc = {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    };
    const { editor } = initTestEditor({ loadFromSchema: true, content: minimalDoc, isHeadless: true });
    expect(editor.schema.nodes.tab).toBeDefined();
    editor.destroy();
  });

  it('supports inserting a tab node command in headless mode', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'run', content: [{ type: 'text', text: 'Start' }] }],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: doc, isHeadless: true });

    // Execute the command to insert a tab node
    const inserted = editor.commands.insertTabNode?.();
    expect(inserted).toBe(true);

    // Verify a tab node exists in the updated document
    let foundTab = false;
    editor.state.doc.descendants((node) => {
      if (node.type?.name === 'tab') {
        foundTab = true;
        return false;
      }
      return undefined;
    });
    expect(foundTab).toBe(true);

    editor.destroy();
  });

  // @TEMPORARY - skipping - perf test for local stats gathering. OK to remove later.
  it.skip('performance: load 100 pages with tabs (headless vs non-headless)', () => {
    const buildDocWithTabsAndPageBreaks = (pages = 100, tabsPerPage = 8) => {
      const content = [];
      for (let i = 1; i <= pages; i++) {
        // Page content with several tabs
        const tabRun = { type: 'run', content: [] };
        for (let t = 0; t < tabsPerPage; t++) {
          tabRun.content.push({ type: 'tab' });
          tabRun.content.push({ type: 'text', text: `T${t + 1}` });
        }

        content.push({
          type: 'paragraph',
          content: [
            { type: 'run', content: [{ type: 'text', text: `Page ${i} — start ` }] },
            tabRun,
            { type: 'run', content: [{ type: 'text', text: ` end` }] },
          ],
        });

        if (i < pages) {
          content.push({
            type: 'paragraph',
            content: [{ type: 'run', content: [{ type: 'hardBreak', attrs: { pageBreakType: 'page' } }] }],
          });
        }
      }

      return { type: 'doc', content };
    };

    const perfNow = () => (typeof performance !== 'undefined' && performance?.now ? performance.now() : Date.now());
    const doc = buildDocWithTabsAndPageBreaks(100, 8);

    // Headless timing
    const startHeadless = perfNow();
    const { editor: headlessEditor } = initTestEditor({ loadFromSchema: true, content: doc, isHeadless: true });
    const endHeadless = perfNow();
    const headlessMs = endHeadless - startHeadless;

    // Clean up headless instance before starting non-headless
    headlessEditor.destroy();

    const startUi = perfNow();
    const { editor: uiEditor } = initTestEditor({ loadFromSchema: true, content: doc, isHeadless: false });
    const endUi = perfNow();
    const uiMs = endUi - startUi;

    uiEditor.destroy();

    // eslint-disable-next-line no-console
    console.log(
      '[Perf][Tab] 100 pages with tabs -> headless:',
      headlessMs.toFixed(2),
      'ms, non-headless:',
      uiMs.toFixed(2),
      'ms',
    );

    expect(true).toBe(true);
  }, 120000);
});
