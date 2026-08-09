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
export type MimeType = KnownMimeType | (CustomMimeType & { readonly __custom?: never });

/**
 * V8-specific Error constructor with captureStackTrace
 */
interface V8ErrorConstructor extends ErrorConstructor {
  captureStackTrace(targetObject: object, constructorOpt?: new (...args: unknown[]) => unknown): void;
}

/**
 * Type guard to check if Error constructor has V8's captureStackTrace
 */
function hasV8CaptureStackTrace(error: ErrorConstructor): error is V8ErrorConstructor {
  return typeof (error as V8ErrorConstructor).captureStackTrace === 'function';
}

/**
 * Base error class for file object operations
 */
export class FileObjectError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FileObjectError';
    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (hasV8CaptureStackTrace(Error)) {
      Error.captureStackTrace(this, this.constructor as new (...args: unknown[]) => unknown);
    }
  }
}

/**
 * Error thrown when data URI format is invalid
 */
export class InvalidDataUriError extends FileObjectError {
  constructor(public readonly uri: string) {
    super(`Invalid data URI format: URI must contain exactly one comma separator`);
    this.name = 'InvalidDataUriError';
  }
}

/**
 * Error thrown when network fetch fails
 */
export class FetchFailedError extends FileObjectError {
  constructor(
    public readonly url: string,
    cause: unknown,
  ) {
    super(`Failed to fetch file from URL: ${url}`, cause);
    this.name = 'FetchFailedError';
  }
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
export const getFileObject = async (fileUrl: string, name: string, type: MimeType): Promise<File> => {
  try {
    // Handle base64 data URIs without fetch (CSP-safe)
    if (fileUrl.startsWith('data:') && fileUrl.includes(';base64,')) {
      const parts = fileUrl.split(',');
      if (parts.length !== 2) {
        throw new InvalidDataUriError(fileUrl);
      }
      const binary = atob(parts[1]);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new File([bytes], name, { type });
    }

    // Regular URLs and non-base64 data URIs use fetch
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new FetchFailedError(fileUrl, new Error(`HTTP ${response.status}: ${response.statusText}`));
    }
    const blob = await response.blob();
    return new File([blob], name, { type });
  } catch (error) {
    // Re-throw our custom errors
    if (error instanceof FileObjectError) {
      throw error;
    }
    // Wrap other errors
    throw new FileObjectError('Failed to create file object', error);
  }
};
