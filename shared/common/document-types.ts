export const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' as const;
export const PDF = 'application/pdf' as const;
export const HTML = 'text/html' as const;

export const documentTypes = {
  docx: DOCX,
  pdf: PDF,
  html: HTML,
} as const;

export type DocumentType = typeof DOCX | typeof PDF | typeof HTML;
