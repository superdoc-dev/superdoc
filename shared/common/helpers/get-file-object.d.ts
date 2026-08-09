import type { DocumentType } from '../document-types';
/**
 * Known MIME types - provides autocomplete
 */
export type KnownMimeType = DocumentType | 'text/plain' | 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
/**
 * Custom MIME type - use for application-specific or uncommon MIME types
 * Template literal type allows for type-safe custom MIME patterns
 */
export type CustomMimeType = `${string}/${string}`;
/**
 * MIME type - either a known type (with autocomplete) or a custom type
 */
export type MimeType =
  | KnownMimeType
  | (CustomMimeType & {
      readonly __custom?: never;
    });
/**
 * Base error class for file object operations
 */
export declare class FileObjectError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown);
}
/**
 * Error thrown when data URI format is invalid
 */
export declare class InvalidDataUriError extends FileObjectError {
  readonly uri: string;
  constructor(uri: string);
}
/**
 * Error thrown when network fetch fails
 */
export declare class FetchFailedError extends FileObjectError {
  readonly url: string;
  constructor(url: string, cause: unknown);
}
/**
 * Turn a file URL into a File object
 *
 * @param fileUrl - The url or data URI
 * @param name - The name to assign the file object
 * @param type - The MIME type (e.g., 'application/pdf', 'image/png')
 * @returns The file object
 * @throws {InvalidDataUriError} If data URI format is invalid
 * @throws {FetchFailedError} If network request fails
 * @throws {FileObjectError} For other file creation errors
 */
export declare const getFileObject: (fileUrl: string, name: string, type: MimeType) => Promise<File>;
