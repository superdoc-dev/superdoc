import type { StyleDefinition } from './styles-types.ts';

/**
 * Immutable O(1) lookup index over style definitions.
 *
 * Built from ordered arrays (the persisted model). Internal maps are derived
 * in the constructor — when the model changes, construct a new `StylesIndex`.
 *
 * Duplicate policy: **first wins** (matches Word's observed behavior for
 * malformed documents with repeated `styleId` or `name` values).
 */
export class StylesIndex {
  private readonly byId = new Map<string, StyleDefinition>();
  private readonly byName = new Map<string, StyleDefinition>();

  constructor(private readonly styles: readonly StyleDefinition[]) {
    for (const style of styles) {
      if (style.styleId && !this.byId.has(style.styleId)) {
        this.byId.set(style.styleId, style);
      }
      if (style.name && !this.byName.has(style.name)) {
        this.byName.set(style.name, style);
      }
    }
  }

  getStyleById(styleId: string): StyleDefinition | undefined {
    return this.byId.get(styleId);
  }

  getStyleByName(name: string): StyleDefinition | undefined {
    return this.byName.get(name);
  }

  getAllStyles(): readonly StyleDefinition[] {
    return this.styles;
  }
}
