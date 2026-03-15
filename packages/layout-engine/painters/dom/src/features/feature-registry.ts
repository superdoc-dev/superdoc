/**
 * Rendering Feature Registry
 *
 * Maps OOXML elements to their rendering feature modules.
 * This is the primary lookup table for agents and developers.
 *
 * To find where an OOXML element renders: search this file.
 * To add a new rendering feature: add an entry here first.
 *
 * Each entry specifies:
 * - feature: human-readable feature name (matches folder name)
 * - module: import path relative to this file
 * - handles: list of OOXML element paths this feature renders
 * - spec: ECMA-376 section reference
 */
export const RENDERING_FEATURES = {
  // ─── Paragraph Borders ───────────────────────────────────────────
  // @spec ECMA-376 §17.3.1.24 (pBdr)
  'w:pBdr': {
    feature: 'paragraph-borders',
    module: './paragraph-borders',
    handles: ['w:pBdr/w:top', 'w:pBdr/w:bottom', 'w:pBdr/w:left', 'w:pBdr/w:right', 'w:pBdr/w:between', 'w:pBdr/w:bar'],
    spec: '§17.3.1.24',
  },

  // ─── Paragraph Shading ───────────────────────────────────────────
  // @spec ECMA-376 §17.3.1.31 (shd)
  'w:shd': {
    feature: 'paragraph-borders', // shading shares the border layer module
    module: './paragraph-borders',
    handles: ['w:shd/@w:fill', 'w:shd/@w:val', 'w:shd/@w:color'],
    spec: '§17.3.1.31',
  },
} as const;
