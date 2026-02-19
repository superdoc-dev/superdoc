import type { Transaction } from 'prosemirror-state';
import type { Editor } from '../Editor.js';
import type { DefaultEventMap } from '../EventEmitter.js';

/**
 * Payload for fonts-resolved events
 */
export interface FontsResolvedPayload {
  documentFonts: string[];
  unsupportedFonts: string[];
}

/**
 * Comment data structure
 */
export interface Comment {
  id: string;
  [key: string]: unknown;
}

/**
 * Payload for comment-related events
 */
export interface CommentsPayload {
  comments?: Comment[];
  [key: string]: unknown;
}

/**
 * Payload for comment locations/positions
 */
export interface CommentLocationsPayload {
  locations: Array<{
    commentId: string;
    position: { top: number; left: number; height: number; width: number };
    [key: string]: unknown;
  }>;
}

/**
 * Payload for pagination events
 */
export interface PaginationPayload {
  pages?: number;
  currentPage?: number;
  [key: string]: unknown;
}

/**
 * Payload for list definitions change
 */
export interface ListDefinitionsPayload {
  change: unknown;
  numbering?: unknown;
  editor?: unknown;
}

/**
 * Event map for the Editor class
 */
export interface EditorEventMap extends DefaultEventMap {
  /** Called before editor creation */
  beforeCreate: [{ editor: Editor }];

  /** Called after editor creation */
  create: [{ editor: Editor }];

  /** Called when editor content updates */
  update: [{ editor: Editor; transaction: Transaction }];

  /** Called when selection updates */
  selectionUpdate: [{ editor: Editor; transaction: Transaction }];

  /** Called when a transaction is processed */
  transaction: [{ editor: Editor; transaction: Transaction; duration?: number }];

  /** Called when editor gets focus */
  focus: [{ editor: Editor; event: FocusEvent; transaction: Transaction }];

  /** Called when editor loses focus */
  blur: [{ editor: Editor; event: FocusEvent; transaction: Transaction }];

  /** Called when editor is destroyed */
  destroy: [];

  /** Called when there's a content error */
  contentError: [{ editor: Editor; error: Error }];

  /** Called when tracked changes update */
  trackedChangesUpdate: [{ changes: unknown }];

  /** Called when comments update */
  commentsUpdate: [CommentsPayload];

  /** Called when comments are loaded */
  commentsLoaded: [{ editor: Editor; replacedFile?: boolean; comments: Comment[] }];

  /** Called when a comment is clicked */
  commentClick: [{ commentId: string; event?: MouseEvent }];

  /** Called when comment locations update */
  'comment-positions': [CommentLocationsPayload];

  /** Called when document is locked */
  locked: [{ locked: boolean; lockedBy?: string }];

  /** Called when collaboration is ready */
  collaborationReady: [{ editor: Editor; ydoc: unknown }];

  /** Called when pagination updates */
  paginationUpdate: [PaginationPayload];

  /** Called when an exception occurs */
  exception: [{ error: Error; editor: Editor }];

  /** Called when list definitions change */
  'list-definitions-change': [ListDefinitionsPayload];

  /** Called when all fonts used in the document are determined */
  'fonts-resolved': [FontsResolvedPayload];

  // Document Lifecycle Events

  /** Called when a document is opened via editor.open() */
  documentOpen: [{ editor: Editor; sourcePath: string | null }];

  /** Called when a document is closed via editor.close() */
  documentClose: [{ editor: Editor }];

  /** Called when page styles are updated */
  pageStyleUpdate: [{ pageMargins?: Record<string, unknown>; pageStyles: Record<string, unknown> }];
}
