import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  JAPANESE_CJK_LOGICAL_FAMILIES,
  japaneseCjkFontPackFamilies,
} from '../index.js';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(await readFile(join(packageRoot, 'font-assets.manifest.json'), 'utf8'));

assert.deepEqual(JAPANESE_CJK_LOGICAL_FAMILIES, ['Yu Mincho', 'MS Mincho', 'Yu Gothic', 'MS Gothic']);

const families = japaneseCjkFontPackFamilies({ assetBaseUrl: 'https://cdn.example.com/fonts' });
assert.equal(families.length, 2);
assert.deepEqual(
  families.map((family) => family.family),
  ['BIZ UDMincho', 'BIZ UDGothic'],
);
assert.equal(families.every((family) => family.faces.length === 2), true);
assert.equal(families[0].faces[0].source, 'https://cdn.example.com/fonts/BIZUDMincho-Regular.woff2');

for (const family of manifest.families) {
  for (const face of family.faces) {
    const bytes = await readFile(join(packageRoot, 'assets', face.file));
    const actual = createHash('sha256').update(bytes).digest('hex');
    assert.equal(actual, face.sha256, `${face.file} hash mismatch`);
  }
}
