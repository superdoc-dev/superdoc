import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const V2_RUNTIME_PATH = join(import.meta.dir, '../../lib/collaboration/v2-runtime.ts');

describe('v2 collaboration runtime boundaries', () => {
  test('stays as a public stub without V2 implementation or v1 collaboration runtime imports', () => {
    const source = readFileSync(V2_RUNTIME_PATH, 'utf8');

    expect(source).not.toMatch(/@superdoc\/collaboration-v2/);
    expect(source).not.toMatch(/@superdoc\/headless/);
    expect(source).not.toMatch(/from ['"]\.\/runtime['"]/);
    expect(source).not.toMatch(/from ['"]superdoc\/super-editor['"]/);
    expect(source).not.toMatch(/from ['"]@superdoc\/super-editor['"]/);
    expect(source).not.toMatch(/y-prosemirror/);
    expect(source).not.toMatch(/editors\/v1\/extensions\/collaboration/);
    expect(source).not.toMatch(/document-api-adapters\//);
  });
});
