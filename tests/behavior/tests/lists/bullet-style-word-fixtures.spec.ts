import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '../../fixtures/data/bullet-styles');

test.use({ config: { toolbar: 'full' } });

async function getBulletPickerSelectedValue(superdoc: SuperDocFixture): Promise<string | null> {
  return superdoc.page.evaluate(() => {
    const sd = (window as any).superdoc;
    const items = sd?.toolbar?.toolbarItems;
    const arr = Array.isArray(items) ? items : Object.values(items ?? {});
    const bullet = arr.find((i: any) => (i?.name?.value ?? i?.name) === 'list');
    const v = bullet?.selectedValue?.value;
    return v == null ? null : String(v);
  });
}

async function getFirstParagraphMarker(superdoc: SuperDocFixture): Promise<string | null> {
  return superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    let marker: string | null = null;
    editor.state.doc.descendants((node: any) => {
      if (marker !== null) return false;
      if (node.type.name !== 'paragraph') return true;
      marker = node.attrs?.listRendering?.markerText ?? null;
      return marker !== null ? false : true;
    });
    return marker;
  });
}

async function placeCaretInFirstListParagraph(superdoc: SuperDocFixture) {
  // ArrowDown after focus places the caret in the first non-empty line of the doc.
  // Using selectAll then ArrowRight collapses the selection to the end of the first
  // selected range without leaving editor focus.
  await superdoc.selectAll();
  await superdoc.waitForStable();
  await superdoc.press('ArrowRight');
  await superdoc.press('Home');
  await superdoc.waitForStable();
}

const cases: Array<[name: string, file: string, expectedMarker: string, expectedStyle: string]> = [
  ['Word-native disc', 'word-native-bullet-disc.docx', '•', 'disc'],
  ['Word-native circle', 'word-native-bullet-circle.docx', '◦', 'circle'],
  ['Word-native square', 'word-native-bullet-square.docx', '▪', 'square'],
];

test.describe('Word-native bullet round-trip (SD-2526)', () => {
  for (const [name, file, expectedMarker, expectedStyle] of cases) {
    test(`${name} imports as ${expectedMarker} and picker reflects ${expectedStyle}`, async ({ superdoc }) => {
      await superdoc.loadDocument(path.join(FIXTURES, file));

      // Import normalizes Word's font+codepoint conventions into standard Unicode.
      expect(await getFirstParagraphMarker(superdoc)).toBe(expectedMarker);

      await placeCaretInFirstListParagraph(superdoc);
      // Picker activation handler maps marker char to style key.
      expect(await getBulletPickerSelectedValue(superdoc)).toBe(expectedStyle);
    });
  }
});
