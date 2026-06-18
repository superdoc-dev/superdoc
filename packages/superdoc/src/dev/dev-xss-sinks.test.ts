import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..', '..');
const devFiles = [
  'src/dev/components/SuperdocDev.vue',
  'src/dev/components/sidebar/SidebarSearch.vue',
  'src/dev/components/sidebar/SidebarFieldAnnotations.vue',
  'src/dev/components/sidebar/SidebarLayout.vue',
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, '')).replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('dev UI XSS sink guard', () => {
  test.each(devFiles)('%s has no active HTML parsing sink', (relativePath) => {
    // SuperdocDev.vue was reviewed for issue #2: HTML upload/import flows through
    // the editor import sanitizer rather than a dev-shell DOM HTML sink.
    const source = stripComments(readFileSync(resolve(packageRoot, relativePath), 'utf8'));

    expect(source).not.toMatch(/\bv-html\b/);
    expect(source).not.toMatch(/\.innerHTML\s*=/);
    expect(source).not.toMatch(/\.outerHTML\s*=/);
    expect(source).not.toMatch(/\.insertAdjacentHTML\s*\(/);
    expect(source).not.toMatch(/\.createContextualFragment\s*\(/);
  });
});
