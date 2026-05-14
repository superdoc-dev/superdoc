export class SuperConverter {
  constructor(...args: any[]);
  static getStoredSuperdocVersion(...args: any[]): any;
  static setStoredSuperdocVersion(...args: any[]): void;
  static extractDocumentGuid(...args: any[]): string | null;
  /**
   * Set of package paths tombstoned by `customXml.parts.remove`. The
   * exporter emits `updatedDocs[path] = null` for each entry so original
   * imported parts don't survive into the exported zip. Mutated by
   * `removeCustomXmlPart` (writer) and `createCustomXmlPart` (clears
   * entries on index recycle); read by `Editor.exportDocx`.
   */
  removedCustomXmlPaths?: Set<string>;
  [key: string]: any;
}
