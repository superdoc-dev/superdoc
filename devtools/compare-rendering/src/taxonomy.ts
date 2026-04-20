import type { FindingCategory } from './types.ts';

/**
 * Seed taxonomy: maps a finding category to a SuperDoc code area the reader
 * should inspect. The agent consuming these findings can use the hint to
 * route investigation without re-deriving it from prose.
 *
 * Keep hints coarse on purpose — file trees move, packages do not.
 */
const CODE_AREAS: Partial<Record<FindingCategory, string>> = {
  text: 'super-editor/src/editors/v1/core/super-converter',
  pagination: 'layout-engine/layout-engine/src/pagination',
  structure: 'super-editor/src/editors/v1/core/super-converter',
  style: 'layout-engine/style-engine',
  indent: 'layout-engine/style-engine',
  numbering: 'layout-engine/style-engine (numbering resolution)',
  font: 'layout-engine/style-engine (font resolution)',
  color: 'layout-engine/style-engine (color resolution)',
  alignment: 'layout-engine/style-engine',
  spacing: 'layout-engine/style-engine',
};

const SPEC_REFS: Partial<Record<FindingCategory, string>> = {
  text: 'ECMA-376 §17.3.1 (run content)',
  pagination: 'ECMA-376 §17.3.1.16 (keepNext/keepLines/pageBreakBefore)',
  style: 'ECMA-376 §17.7 (style definitions)',
  indent: 'ECMA-376 §17.3.1.12 (w:ind)',
  numbering: 'ECMA-376 §17.9 (numbering definitions)',
  font: 'ECMA-376 §17.3.2 (run properties)',
  color: 'ECMA-376 §17.3.2.6 (w:color)',
  alignment: 'ECMA-376 §17.3.1.13 (w:jc)',
  spacing: 'ECMA-376 §17.3.1.33 (w:spacing)',
};

export function codeAreaFor(category: FindingCategory): string | undefined {
  return CODE_AREAS[category];
}

export function specRefFor(category: FindingCategory): string | undefined {
  return SPEC_REFS[category];
}
