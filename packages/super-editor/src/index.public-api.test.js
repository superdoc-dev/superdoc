import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('public root exports', () => {
  it('does not expose document-api adapter assembly from the package root', () => {
    const indexPath = resolve(import.meta.dirname, 'index.js');
    const source = readFileSync(indexPath, 'utf8');

    expect(source).not.toMatch(/export\s*\{\s*assembleDocumentApiAdapters\s*\}/);
  });
});
