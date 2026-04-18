import type { AttributeValue } from '../Attribute.js';

export type SchemaSummaryAttribute = {
  default: AttributeValue;
  required: boolean;
};

export type SchemaSummaryNode = {
  name: string;
  attrs: Record<string, SchemaSummaryAttribute>;
  group?: string;
  content?: string;
  marks?: string;
  inline?: boolean;
  atom?: boolean;
  defining?: boolean;
  code?: boolean;
  tableRole?: string;
  summary?: string;
};

export type SchemaSummaryMark = {
  name: string;
  attrs: Record<string, SchemaSummaryAttribute>;
  group?: string;
  inclusive?: boolean;
  excludes?: string;
  spanning?: boolean;
  code?: boolean;
};

export type SchemaSummaryJSON = {
  version: string;
  schemaVersion: string;
  topNode?: string;
  nodes: SchemaSummaryNode[];
  marks: SchemaSummaryMark[];
};
