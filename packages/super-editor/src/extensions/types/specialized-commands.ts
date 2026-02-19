import type { ProseMirrorJSON } from '../../core/types/EditorTypes.js';
import type { Node as ProseMirrorNode } from 'prosemirror-model';

type BookmarkConfig = {
  name: string;
  id?: string | null;
};

type SearchMatch = {
  id: string;
  from: number;
  to: number;
  text: string;
};

export type SearchCommandOptions = {
  highlight?: boolean;
  maxMatches?: number;
  caseSensitive?: boolean;
};

type DocumentSectionCreateOptions = {
  id?: number;
  title?: string;
  description?: string;
  sectionType?: string;
  isLocked?: boolean;
  html?: string;
  json?: ProseMirrorJSON;
};

type DocumentSectionUpdateOptions = {
  id: number;
  html?: string;
  json?: ProseMirrorJSON;
  attrs?: Record<string, unknown>;
};

type StructuredContentInlineInsert = {
  text?: string;
  json?: ProseMirrorJSON;
  attrs?: Record<string, unknown>;
};

type StructuredContentBlockInsert = {
  html?: string;
  json?: ProseMirrorJSON;
  attrs?: Record<string, unknown>;
};

type StructuredContentUpdateOptions = {
  text?: string;
  html?: string;
  json?: ProseMirrorJSON;
  attrs?: Record<string, unknown>;
};

type StructuredContentTableAppendOptions = {
  id: string;
  tableIndex?: number;
  rows?: Array<string[] | string>;
  copyRowStyle?: boolean;
};

export interface SpecializedCommandAugmentations {
  // Bookmarks
  insertBookmark: (config: BookmarkConfig) => boolean;
  goToBookmark: (name: string) => boolean;
  insertBookmarkEnd: (id: string) => boolean;

  // Search
  goToFirstMatch: () => boolean;
  search: (pattern: string | RegExp, options?: SearchCommandOptions) => SearchMatch[];
  goToSearchResult: (match: SearchMatch) => boolean;

  // Custom selection
  restorePreservedSelection: () => boolean;

  // Document sections
  createDocumentSection: (options?: DocumentSectionCreateOptions) => boolean;
  removeSectionAtSelection: () => boolean;
  removeSectionById: (id: number) => boolean;
  lockSectionById: (id: number) => boolean;
  updateSectionById: (options: DocumentSectionUpdateOptions) => boolean;

  // Structured content fields/blocks
  insertStructuredContentInline: (options?: StructuredContentInlineInsert) => boolean;
  insertStructuredContentBlock: (options?: StructuredContentBlockInsert) => boolean;
  updateStructuredContentById: (id: string, options?: StructuredContentUpdateOptions) => boolean;
  deleteStructuredContent: (entries: Array<{ node: ProseMirrorNode; pos: number }>) => boolean;
  deleteStructuredContentById: (idOrIds: string | string[]) => boolean;
  deleteStructuredContentAtSelection: () => boolean;
  appendRowsToStructuredContentTable: (options: StructuredContentTableAppendOptions) => boolean;
}

declare module '../../core/types/ChainedCommands.js' {
  interface ExtensionCommandMap extends SpecializedCommandAugmentations {}
}
