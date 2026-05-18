export class SuperConverter {
  constructor(...args: any[]);
  static getStoredSuperdocVersion(...args: any[]): any;
  static setStoredSuperdocVersion(...args: any[]): void;
  static extractDocumentGuid(...args: any[]): string | null;
  [key: string]: any;
}

export function hasBodyNumberingReferences(
  documentXml: { name?: string; elements?: readonly unknown[] } | null | undefined,
): boolean;
