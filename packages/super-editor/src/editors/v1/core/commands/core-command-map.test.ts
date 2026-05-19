import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

describe('core command map types', () => {
  it('lists inline SDT Backspace selection in CoreCommandNames', () => {
    const declarationPath = join(dirname(fileURLToPath(import.meta.url)), 'core-command-map.d.ts');
    const declaration = readFileSync(declarationPath, 'utf8');

    expect(declaration).toContain("| 'selectInlineSdtBeforeRunStart'");
  });
});
