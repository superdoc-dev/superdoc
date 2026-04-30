import type { Transaction } from 'prosemirror-state';
import type { Editor } from '../Editor.js';
import type { DefaultEventMap } from '../EventEmitter.js';
import type { PartChangedEvent } from '../parts/types.js';
import type { DocumentProtectionState, StoryLocator } from '@superdoc/document-api';

/** Source of a protection state change. */
export type ProtectionChangeSource = 'init' | 'local-mutation' | 'remote-part-sync';

/**
 * Payload for fonts-resolved events
 */
export interface FontsResolvedPayload {
  documentFonts: string[];
  unsupportedFonts: string[];
}

/**
 * A structured element within a comment body.
 *
 * Comment bodies are stored as an array of elements, each representing
 * a paragraph or nested content node. This mirrors ProseMirror-style
 * node structure used throughout SuperDoc.
 */
export interface CommentElement {
  /** Node type (e.g. 'paragraph', 'text') */
  type: string;
  /** Text content for leaf nodes */
  text?: string;
  /** Nested child elements */
  content?: CommentElement[];
  /** Additional element properties */
  [key: string]: unknown;
}

/**
 * A comment object as emitted through editor events and accepted by `exportDocx()`.
 *
 * This is the canonical comment shape used across SuperDoc:
 * - Emitted via `commentsLoaded` and `commentsUpdate` events
 * - Accepted by `exportDocx({ comments })` for saving
 * - Produced by DOCX import in SuperConverter
 */
export interface Comment {
  /** Unique identifier for this comment */
  commentId: string;
  /** Timestamp when the comment was created (ms since epoch) */
  createdTime: number | null;
  /** Display name of the comment author */
  creatorName: string | null;
  /** Email address of the comment author */
  creatorEmail: string | null;
  /** Avatar URL of the comment author */
  creatorImage?: string | null;
  /** Structured body content of the comment */
  elements: CommentElement[];
  /** Whether the comment thread is resolved/done */
  isDone: boolean;
  /** Parent comment ID for threaded replies */
  parentCommentId?: string | null;
  /** Original ID from the imported DOCX (used for round-trip fidelity) */
  importedId?: string | null;
  /** ProseMirror JSON representation of the comment body */
  commentJSON?: unknown;
  /** Plain text content of the comment */
  commentText?: string | null;
  /** Whether this is an internal/private comment */
  isInternal?: boolean;
  /** Whether this comment is associated with a tracked change */
  trackedChange?: boolean;
  /** The document/file ID this comment belongs to */
  fileId?: string | null;
  /** The document ID this comment belongs to */
  documentId?: string | null;
  /** Additional fields from the host application */
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
 * Payload for document mode change events
 */
export interface DocumentModeChangePayload {
  editor: Editor;
  documentMode: 'editing' | 'viewing' | 'suggesting';
}

/**
 * Payload for list definitions change
 */
export interface ListDefinitionsPayload {
  change?: unknown;
  numbering?: unknown;
  editor?: unknown;
}

/** Payload emitted with the `tracked-changes-changed` event. */
export interface TrackedChangesChangedPayload {
  editor: Editor;
  /** Stories whose tracked-change snapshot has changed. `undefined` means full rebuild. */
  stories?: StoryLocator[];
  /** Optional origin hint. */
  source?: string;
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

  /** Called when document mode changes */
  documentModeChange: [DocumentModeChangePayload];

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

  /** Called when non-document.xml parts are mutated via the parts system. */
  partChanged: [PartChangedEvent];

  /** Called when document protection state changes (init, local mutation, or remote sync). */
  protectionChanged: [{ editor: Editor; state: DocumentProtectionState; source: ProtectionChangeSource }];

  /**
   * Story-aware tracked-change invalidation signal.
   *
   * Emitted by the host-level `TrackedChangeIndex` service whenever one or
   * more story caches are invalidated.
   */
  'tracked-changes-changed': [TrackedChangesChangedPayload];

  /** Called on pointer down (local only, not broadcast via collaboration) */
  pointerDown: [{ editor: Editor; event: PointerEvent }];

  /** Called on pointer up (local only, not broadcast via collaboration) */
  pointerUp: [{ editor: Editor; event: PointerEvent }];

  /** Called on right-click (local only, not broadcast via collaboration) */
  rightClick: [{ editor: Editor; event: PointerEvent }];
}
