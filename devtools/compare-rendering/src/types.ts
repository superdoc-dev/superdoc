export type TriState = boolean | 'mixed';

export type ResolvedStyle = {
  fontName: string;
  fontSize: number;
  bold: TriState;
  italic: TriState;
  color: string;
  leftIndent: number;
  firstLineIndent: number;
  alignment: 'left' | 'right' | 'center' | 'justify' | 'unknown';
  listString: string;
  listLevel: number;
};

export type NormalizedParagraph = {
  ordinal: number;
  text: string;
  style: string;
  resolved?: ResolvedStyle;
  page: number;
  y: number;
};

export type Severity = 'blocking' | 'visible' | 'cosmetic';

export type FindingCategory =
  | 'text'
  | 'pagination'
  | 'structure'
  | 'style'
  | 'indent'
  | 'numbering'
  | 'font'
  | 'color'
  | 'alignment'
  | 'spacing'
  | 'unsupported'
  | 'unknown';

export type Finding = {
  category: FindingCategory;
  severity: Severity;
  paragraphOrdinal: number;
  word: unknown;
  superdoc: unknown;
  message: string;
  specRef?: string;
  codeAreaHint?: string;
};

export type WordExtraction = {
  supported: boolean;
  unsupportedReason?: string;
  pageCount: number;
  paragraphs: WordParagraph[];
};

export type WordParagraph = {
  idx: number;
  text: string;
  style: string;
  fontName: string;
  fontSize: number;
  bold: number;
  italic: number;
  colorRgb: number;
  alignment: number;
  leftIndent: number;
  firstLineIndent: number;
  listString: string;
  listLevel: number;
  page: number;
  y: number;
};

export type CompareReport = {
  docxPath: string;
  docxSha: string;
  wordSupported: boolean;
  unsupportedReason?: string;
  counts: {
    wordParagraphs: number;
    superdocParagraphs: number;
    wordPages: number;
    superdocPages: number;
  };
  findings: Finding[];
};
