/**
 * Utility functions for the AI package
 * @module utils
 */
import { Logger } from './logger';

/**
 * Validates that an input string is non-empty after trimming
 * @param input - String to validate
 * @returns True if valid, false otherwise
 */
export function validateInput(input: string): boolean {
  if (!input) {
    return false;
  }
  return input.trim().length > 0;
}

/**
 * Safely parses JSON with fallback
 * Handles markdown code blocks and various JSON formats
 * @param response - JSON string to parse (may contain markdown)
 * @param fallback - Fallback value if parsing fails
 * @param enableLogging - Whether to log parsing errors
 * @returns Parsed object or fallback
 */
export function parseJSON<T>(response: string, fallback: T, enableLogging = false): T {
  if (!response || !response.trim()) {
    return fallback;
  }

  try {
    let cleaned = response.trim();
    cleaned = removeMarkdownCodeBlocks(cleaned);
    return JSON.parse(cleaned) as T;
  } catch (error) {
    if (enableLogging) {
      const logger = new Logger(enableLogging);
      logger.error('[parseJSON] Failed to parse JSON', error, {
        original: response.substring(0, 200),
      });
    }
    return fallback;
  }
}

/**
 * Sanitizes user input for use in AI prompts to prevent prompt injection attacks.
 * Escapes special characters that could break prompt structure or inject malicious content.
 * @param input - User input string to sanitize
 * @returns Sanitized string safe for use in prompts
 */
export function sanitizePromptInput(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Replace control characters and problematic sequences
  return input
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\r/g, '\n') // Normalize line endings
    .replace(/\0/g, '') // Remove null bytes
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters except \n and \t
    .trim();
}

/**
 * Removes markdown code block syntax from a string
 * Handles various markdown formats like ```json, ```javascript, etc.
 * @param text - Text potentially wrapped in code blocks
 * @returns Cleaned text without markdown syntax
 */
export function removeMarkdownCodeBlocks(text: string): string {
  const trimmed = text.trim();

  if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
    let startIndex = 3; // Length of '```'
    const firstNewline = trimmed.indexOf('\n', startIndex);

    if (firstNewline !== -1) {
      startIndex = firstNewline + 1;
    } else {
      const languageMatch = trimmed.substring(3).match(/^(?:json|javascript|typescript|js|ts)/);
      if (languageMatch) {
        startIndex = 3 + languageMatch[0].length;
      }
    }

    const endIndex = trimmed.lastIndexOf('```');
    if (endIndex > startIndex) {
      return trimmed.substring(startIndex, endIndex).trim();
    }
  }

  return text;
}

/**
 * Generates a unique ID with a prefix
 * @param prefix - Prefix for the ID
 * @returns Unique ID string
 */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Safely extracts text content from a ProseMirror document
 * @param doc - ProseMirror document
 * @param from - Start position
 * @param to - End position
 * @param separator - Text separator (default: single space)
 * @returns Extracted text or empty string on error
 */
export function safeTextBetween(
  doc: { textBetween?: (from: number, to: number, separator?: string) => string } | null | undefined,
  from: number,
  to: number,
  separator = ' ',
): string {
  try {
    if (!doc || typeof doc.textBetween !== 'function') {
      return '';
    }
    return doc.textBetween(from, to, separator).trim();
  } catch {
    return '';
  }
}

/**
 * Extracts error message from various error types
 * @param error - Error object or value
 * @returns Error message string
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

/**
 * Creates a debounced function that delays execution
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Checks if a value is a plain object
 * @param value - Value to check
 * @returns True if plain object, false otherwise
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
  );
}

const LIST_PREFIX_REGEX = /^(\s*)(?:[-+*•◦▪●·]|(?:\d+(?:\.\d+)*))(?:[.)])?\s+/;

/**
 * Removes common list numbering/bullet prefixes from a string.
 * Examples removed: "1. ", "1.2. ", "- ", "• "
 *
 * @param text - Text potentially starting with numbering
 * @returns Text without leading list prefix
 */
export function stripListPrefix(text: string): string {
  if (!text || text.length === 0) {
    return text ?? '';
  }

  const match = text.match(LIST_PREFIX_REGEX);
  if (!match) {
    return text;
  }

  if (match[1]?.length) {
    return match[1] + text.slice(match[0].length);
  }

  return text.slice(match[0].length);
}
