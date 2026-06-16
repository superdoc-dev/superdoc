import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOCUMENT_V2_PATH = join(import.meta.dir, '../../lib/document-v2.ts');

describe('v2 runtime import boundaries', () => {
  test('document-v2 stays isolated from v1 runtime imports', () => {
    const source = readFileSync(DOCUMENT_V2_PATH, 'utf8');

    expect(source).not.toMatch(/from ['"]superdoc\/super-editor['"]/);
    expect(source).not.toMatch(/from ['"]@superdoc\/super-editor['"]/);
    expect(source).not.toMatch(/from ['"]superdoc\/super-editor\/blank-docx['"]/);
    expect(source).not.toMatch(/import\s+\{[^}]*\}\s+from ['"]\.\/document\.js['"]/);
  });
});
