import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const variablesCss = readFileSync(resolve(__dirname, 'variables.css'), 'utf-8');
const compatCss = readFileSync(resolve(__dirname, 'compat.css'), 'utf-8');

/** Extract all --sd-* variable declarations from a CSS string. */
const extractDeclaredVars = (css: string): Set<string> => {
  const vars = new Set<string>();
  for (const match of css.matchAll(/(--sd-[\w-]+)\s*:/g)) {
    vars.add(match[1]);
  }
  return vars;
};

/** Extract all var(--sd-*) references from a CSS string. */
const extractReferencedVars = (css: string): Set<string> => {
  const vars = new Set<string>();
  for (const match of css.matchAll(/var\((--sd-[\w-]+)/g)) {
    vars.add(match[1]);
  }
  return vars;
};

describe('compat.css backward-compatibility aliases', () => {
  const declaredInVariables = extractDeclaredVars(variablesCss);
  const declaredInCompat = extractDeclaredVars(compatCss);
  const referencedByCompat = extractReferencedVars(compatCss);

  it('every compat alias points to a variable defined in variables.css', () => {
    const broken: string[] = [];
    for (const ref of referencedByCompat) {
      if (!declaredInVariables.has(ref)) {
        broken.push(ref);
      }
    }
    expect(broken, `Compat aliases reference undefined variables: ${broken.join(', ')}`).toEqual([]);
  });

  it('compat does not re-declare any variable from variables.css', () => {
    const collisions: string[] = [];
    for (const name of declaredInCompat) {
      if (declaredInVariables.has(name)) {
        collisions.push(name);
      }
    }
    expect(collisions, `Compat re-declares variables from variables.css: ${collisions.join(', ')}`).toEqual([]);
  });

  it('maps key old names to the expected new names', () => {
    const expected: Record<string, string> = {
      '--sd-comment-bg': '--sd-ui-comments-card-bg',
      '--sd-surface-card': '--sd-ui-bg',
      '--sd-action-primary': '--sd-ui-action',
      '--sd-border-default': '--sd-ui-border',
      '--sd-track-insert-border': '--sd-tracked-changes-insert-border',
      '--sd-track-delete-bg': '--sd-tracked-changes-delete-background',
      '--sd-comment-highlight-internal': '--sd-comments-highlight-internal',
      '--sd-text-primary': '--sd-ui-text',
      '--sd-radius-sm': '--sd-radius-50',
    };

    for (const [oldName, newName] of Object.entries(expected)) {
      const pattern = new RegExp(
        `${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*var\\(${newName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      );
      expect(compatCss, `Expected ${oldName} → ${newName}`).toMatch(pattern);
    }
  });
});
