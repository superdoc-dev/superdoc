/**
 * Error classes for Editor lifecycle operations.
 *
 * These errors provide precise error handling for the document lifecycle API.
 */

/**
 * Base class for all Editor errors
 */
export class EditorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditorError';
  }
}

/**
 * Thrown when an operation is attempted in an invalid editor state.
 *
 * @example
 * ```typescript
 * // Throws InvalidStateError - can't open when document already loaded
 * await editor.open('/doc1.docx');
 * await editor.open('/doc2.docx'); // Error: close() first
 * ```
 */
export class InvalidStateError extends EditorError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStateError';
  }
}

/**
 * Thrown when save() is called but no source path is available.
 *
 * This happens when the document was opened from a Blob/Buffer or
 * created as a blank document. Use saveTo(path) or export() instead.
 *
 * @example
 * ```typescript
 * const editor = await Editor.open(blobData); // No path
 * await editor.save(); // Error: no source path
 * await editor.saveTo('/path/to/save.docx'); // Works
 * ```
 */
export class NoSourcePathError extends EditorError {
  constructor(message: string) {
    super(message);
    this.name = 'NoSourcePathError';
  }
}

/**
 * Thrown when file system operations are not available.
 *
 * In browsers without File System Access API, save() and saveTo()
 * cannot write to the file system. Use export() to get the document
 * data and handle the download manually.
 *
 * @example
 * ```typescript
 * // In older browsers without File System Access API:
 * await editor.save(); // Error: File System Access API not available
 *
 * // Instead, use export():
 * const blob = await editor.export();
 * const url = URL.createObjectURL(blob);
 * // Create download link manually
 * ```
 */
export class FileSystemNotAvailableError extends EditorError {
  constructor(message: string) {
    super(message);
    this.name = 'FileSystemNotAvailableError';
  }
}

/**
 * Thrown when document loading fails.
 *
 * Wraps the underlying error with additional context about the
 * document loading operation.
 */
export class DocumentLoadError extends EditorError {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'DocumentLoadError';
    this.cause = cause;
  }
}
