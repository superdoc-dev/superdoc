/**
 * SDM/1 style dictionaries, theme model, document defaults, and provenance.
 */

import type { SDRunProps, SDParagraphProps, SDTableProps, SDThemeColorName } from './sd-props.js';

// ---------------------------------------------------------------------------
// Style dictionaries
// ---------------------------------------------------------------------------

export interface SDStyleBase<TProps> {
  name?: string;
  basedOn?: string;
  next?: string;
  linked?: string;
  props?: TProps;
}

export type SDParagraphStyleDef = SDStyleBase<SDParagraphProps>;
export type SDCharacterStyleDef = SDStyleBase<SDRunProps>;
export type SDTableStyleDef = SDStyleBase<SDTableProps>;

export interface SDStyles {
  paragraph?: Record<string, SDParagraphStyleDef>;
  character?: Record<string, SDCharacterStyleDef>;
  table?: Record<string, SDTableStyleDef>;
}

// ---------------------------------------------------------------------------
// Theme model
// ---------------------------------------------------------------------------

export interface SDTheme {
  colorScheme: Record<SDThemeColorName, string>;
  fontScheme?: {
    major?: { latin?: string; eastAsia?: string; complexScript?: string };
    minor?: { latin?: string; eastAsia?: string; complexScript?: string };
  };
}

// ---------------------------------------------------------------------------
// Document defaults
// ---------------------------------------------------------------------------

export interface SDDocDefaults {
  run?: SDRunProps;
  paragraph?: SDParagraphProps;
  table?: SDTableProps;
}
