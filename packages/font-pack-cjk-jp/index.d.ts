export interface JapaneseCjkFontPackAssetUrlContext {
  file: string;
  family: 'BIZ UDMincho' | 'BIZ UDGothic';
  weight: '400' | '700';
  style: 'normal';
  source: 'font-pack-cjk-jp';
}

export interface JapaneseCjkFontPackOptions {
  assetBaseUrl?: string;
  resolveAssetUrl?: (context: JapaneseCjkFontPackAssetUrlContext) => string;
}

export interface JapaneseCjkFontFaceConfig {
  source: string;
  weight: 'normal' | 'bold';
  style: 'normal';
}

export interface JapaneseCjkFontFamilyConfig {
  family: 'BIZ UDMincho' | 'BIZ UDGothic';
  faces: JapaneseCjkFontFaceConfig[];
}

export interface JapaneseCjkFontPackFamily {
  family: 'BIZ UDMincho' | 'BIZ UDGothic';
  replaces: readonly string[];
  faces: readonly {
    file: string;
    weight: 'normal' | 'bold';
    style: 'normal';
  }[];
}

export interface SuperDocJapaneseCjkFontPackTarget {
  fonts: {
    add(families: JapaneseCjkFontFamilyConfig[]): void;
  };
}

export const JAPANESE_CJK_FONT_PACK_FAMILIES: readonly JapaneseCjkFontPackFamily[];
export const JAPANESE_CJK_LOGICAL_FAMILIES: readonly string[];

export function japaneseCjkFontPackFamilies(options?: JapaneseCjkFontPackOptions): JapaneseCjkFontFamilyConfig[];

export function registerJapaneseCjkFontPack(
  superdoc: SuperDocJapaneseCjkFontPackTarget,
  options?: JapaneseCjkFontPackOptions,
): JapaneseCjkFontFamilyConfig[];
