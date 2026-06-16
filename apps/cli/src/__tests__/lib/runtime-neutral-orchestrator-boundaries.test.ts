import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const READ_ORCHESTRATOR_PATH = join(import.meta.dir, '../../lib/read-orchestrator.ts');
const MUTATION_ORCHESTRATOR_PATH = join(import.meta.dir, '../../lib/mutation-orchestrator.ts');

describe('runtime-neutral orchestrator boundaries', () => {
  test('generic read and mutation orchestrators do not reach into opened.editor', () => {
    const sources = [
      readFileSync(READ_ORCHESTRATOR_PATH, 'utf8'),
      readFileSync(MUTATION_ORCHESTRATOR_PATH, 'utf8'),
    ];

    for (const source of sources) {
      expect(source).not.toMatch(/\bopened\.editor\b/);
      expect(source).not.toMatch(/\bEditorWithDoc\b/);
    }
  });
});
