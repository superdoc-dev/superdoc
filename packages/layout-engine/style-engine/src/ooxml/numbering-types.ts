import type { ParagraphProperties, RunProperties } from './types';

/**
 * Encoded properties for the w:numbering document.
 */
export interface NumberingProperties {
  /** Numbering namespace identifier. */
  nsid?: number;
  /** Numbering template identifier. */
  tmpl?: number;
  /** Numbering name. */
  name?: string;
  /** Style link identifier. */
  styleLink?: string;
  /** Numbering style link identifier. */
  numStyleLink?: string;
  /** Multi-level type value. */
  multiLevelType?: string;
  /** Mac at cleanup numbering identifier. */
  numIdMacAtCleanup?: number;
  /** Abstract numbering definitions keyed by abstractNumId. */
  abstracts?: Record<string, AbstractNumberingDefinition>;
  /** Concrete numbering definitions keyed by numId. */
  definitions?: Record<string, NumberingDefinition>;
}

/**
 * Abstract numbering definition encoded from w:abstractNum.
 */
export interface AbstractNumberingDefinition {
  /** Abstract numbering identifier. */
  abstractNumId?: number;
  /** Numbering namespace identifier. */
  nsid?: number;
  /** Numbering template identifier. */
  tmpl?: number;
  /** Abstract numbering name. */
  name?: string;
  /** Style link identifier. */
  styleLink?: string;
  /** Numbering style link identifier. */
  numStyleLink?: string;
  /** Multi-level type value. */
  multiLevelType?: string;
  /** Level definitions keyed by ilvl. */
  levels?: Record<string, NumberingLevel>;
}

/**
 * Concrete numbering definition encoded from w:num.
 */
export interface NumberingDefinition {
  /** Numbering identifier. */
  numId?: number;
  /** Abstract numbering identifier reference. */
  abstractNumId?: number;
  /** Level overrides keyed by ilvl. */
  lvlOverrides?: Record<string, NumberingLevelOverride>;
}

/**
 * Numbering level definition encoded from w:lvl.
 */
export interface NumberingLevel {
  /** Level index. */
  ilvl?: number;
  /** Template code. */
  tplc?: number;
  /** Tentative level flag. */
  tentative?: boolean;
  /** Level start value. */
  start?: number;
  /** Picture bullet identifier. */
  lvlPicBulletId?: number;
  /** Use legal numbering style. */
  isLgl?: boolean;
  /** Paragraph style identifier. */
  styleId?: string;
  /** Suffix setting. */
  suff?: string;
  /** Level text pattern. */
  lvlText?: string;
  /** Level justification. */
  lvlJc?: string;
  /** Numbering format properties. */
  numFmt?: NumberingFormat;
  /** Legacy numbering properties. */
  legacy?: NumberingLegacyProperties;
  /** Paragraph properties applied at this level. */
  paragraphProperties?: ParagraphProperties;
  /** Run properties applied at this level. */
  runProperties?: RunProperties;
}

/**
 * Numbering level override definition encoded from w:lvlOverride.
 */
export interface NumberingLevelOverride {
  /** Level index. */
  ilvl?: number;
  /** Start override value. */
  startOverride?: number;
  /** Level definition override. */
  lvl?: NumberingLevel;
}

/**
 * Numbering format properties encoded from w:numFmt.
 */
export interface NumberingFormat {
  /** Numbering format value. */
  val?: string;
  /** Numbering format string. */
  format?: string;
}

/**
 * Legacy numbering properties encoded from w:legacy.
 */
export interface NumberingLegacyProperties {
  /** Legacy numbering flag. */
  legacy?: boolean;
  /** Legacy spacing value. */
  legacySpace?: number;
  /** Legacy indentation value. */
  legacyIndent?: number;
}
