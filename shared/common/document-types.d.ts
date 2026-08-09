export declare const DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export declare const PDF: 'application/pdf';
export declare const HTML: 'text/html';
export declare const documentTypes: {
  readonly docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  readonly pdf: 'application/pdf';
  readonly html: 'text/html';
};
export type DocumentType = typeof DOCX | typeof PDF | typeof HTML;
