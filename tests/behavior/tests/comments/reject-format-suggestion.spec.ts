import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/superdoc.js';
import { rejectAllTrackChanges } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'panel', trackChanges: true } });

const TEXT = 'Agreement signed by both parties';

// ---------------------------------------------------------------------------
// Command helpers — [commandName, ...args] tuples executed via editor.commands
// ---------------------------------------------------------------------------

type EditorCommand = [name: string, ...args: unknown[]];

async function runCommands(page: Page, commands: EditorCommand[]): Promise<void> {
  for (const [name, ...args] of commands) {
    await page.evaluate(({ name, args }) => (window as any).editor.commands[name](...args), { name, args });
  }
}

// ---------------------------------------------------------------------------
// Test matrix — each entry describes one rejection scenario
// ---------------------------------------------------------------------------

type FormatCase = {
  name: string;
  setup?: EditorCommand[];
  suggest: EditorCommand[];
  lacksMarks?: string[];
  restoredStyle?: Record<string, string>;
  restoredFontFamily?: string;
  restoredFontSize?: string;
};

const SINGLE_MARK_CASES: FormatCase[] = [
  {
    name: 'bold',
    suggest: [['toggleBold']],
    lacksMarks: ['bold'],
  },
  {
    name: 'italic',
    suggest: [['toggleItalic']],
    lacksMarks: ['italic'],
  },
  {
    name: 'underline',
    suggest: [['toggleUnderline']],
    lacksMarks: ['underline'],
  },
  {
    name: 'strikethrough',
    suggest: [['toggleStrike']],
    lacksMarks: ['strike'],
  },
];

const STYLE_CASES: FormatCase[] = [
  {
    name: 'color',
    setup: [
      ['setFontFamily', 'Times New Roman, serif'],
      ['setColor', '#112233'],
    ],
    suggest: [['setColor', '#FF0000']],
    restoredStyle: { color: '#112233' },
  },
  {
    name: 'font family',
    setup: [
      ['setFontFamily', 'Times New Roman, serif'],
      ['setColor', '#112233'],
    ],
    suggest: [['setFontFamily', 'Arial, sans-serif']],
    restoredFontFamily: 'Times New Roman',
  },
  {
    name: 'font size',
    setup: [['setFontSize', '16pt']],
    suggest: [['setFontSize', '24pt']],
    restoredFontSize: '16',
  },
];

const COMBINATION_CASES: FormatCase[] = [
  {
    name: 'multiple marks',
    suggest: [['toggleBold'], ['toggleItalic'], ['toggleUnderline']],
    lacksMarks: ['bold', 'italic', 'underline'],
  },
  {
    name: 'multiple textStyle properties',
    setup: [
      ['setFontFamily', 'Arial, sans-serif'],
      ['setColor', '#112233'],
      ['setFontSize', '16pt'],
    ],
    suggest: [
      ['setColor', '#FF00AA'],
      ['setFontFamily', 'Courier New'],
      ['setFontSize', '18pt'],
    ],
    restoredStyle: { color: '#112233' },
    restoredFontFamily: 'Arial',
    restoredFontSize: '16',
  },
  {
    name: 'mixed marks and textStyle',
    setup: [
      ['setFontFamily', 'Arial, sans-serif'],
      ['setColor', '#112233'],
    ],
    suggest: [
      ['toggleBold'],
      ['toggleUnderline'],
      ['setColor', '#FF00AA'],
      ['setFontFamily', 'Times New Roman, serif'],
    ],
    lacksMarks: ['bold', 'underline'],
    restoredStyle: { color: '#112233' },
    restoredFontFamily: 'Arial',
  },
];

const ALL_CASES = [
  ...SINGLE_MARK_CASES.map((c) => ({ ...c, name: `reject tracked ${c.name} suggestion` })),
  ...STYLE_CASES.map((c) => ({ ...c, name: `reject tracked ${c.name} suggestion` })),
  ...COMBINATION_CASES.map((c) => ({ ...c, name: `reject ${c.name} suggestions restores original` })),
];

for (const tc of ALL_CASES) {
  test(tc.name, async ({ superdoc }) => {
    await superdoc.type(TEXT);
    await superdoc.waitForStable();

    // Optional: set initial styles in editing mode.
    if (tc.setup) {
      await superdoc.selectAll();
      await runCommands(superdoc.page, tc.setup);
      await superdoc.waitForStable();
    }

    // Switch to suggesting mode.
    await superdoc.setDocumentMode('suggesting');
    await superdoc.waitForStable();

    // Apply the suggested format change.
    await superdoc.selectAll();
    await runCommands(superdoc.page, tc.suggest);
    await superdoc.waitForStable();

    await superdoc.assertTrackedChangeExists('format');

    // Reject all tracked changes.
    await rejectAllTrackChanges(superdoc.page);
    await superdoc.waitForStable();

    // No tracked format decorations should remain.
    await expect(superdoc.page.locator('.track-format-dec')).toHaveCount(0);

    // Verify marks were removed.
    if (tc.lacksMarks) {
      await superdoc.assertTextLacksMarks('Agreement', tc.lacksMarks);
    }

    // Verify textStyle attrs were restored.
    if (tc.restoredStyle) {
      await superdoc.assertTextMarkAttrs('Agreement', 'textStyle', tc.restoredStyle);
    }

    // Verify toolbar shows restored font family.
    if (tc.restoredFontFamily) {
      await superdoc.selectAll();
      await superdoc.waitForStable();
      await expect(superdoc.page.locator('[data-item="btn-fontFamily"] .button-label')).toHaveText(
        tc.restoredFontFamily,
      );
    }

    // Verify toolbar shows restored font size.
    if (tc.restoredFontSize) {
      await superdoc.selectAll();
      await superdoc.waitForStable();
      await expect(superdoc.page.locator('#inlineTextInput-fontSize')).toHaveValue(tc.restoredFontSize);
    }

    // Document text should always be unchanged.
    await superdoc.assertTextContent(TEXT);
  });
}
