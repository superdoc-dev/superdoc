/**
 * Allowed URL protocol schemes for hyperlink validation.
 * These protocols have been vetted for safety and common use.
 */
export type Protocol = 'http' | 'https' | 'mailto' | 'tel' | 'sms' | 'ftp' | 'sftp' | 'irc';

/**
 * Configuration options for URL sanitization.
 */
export type SanitizerConfig = {
  /**
   * Override default allowed protocols. WARNING: This REPLACES defaults, not extends them.
   * If provided, you must include all protocols you want to allow (e.g., ['http', 'https', 'mailto']).
   * Only Protocol types are accepted for type safety.
   */
  allowedProtocols?: Protocol[];

  /**
   * Additional protocols to enable beyond the defaults.
   * Only whitelisted optional protocols (ftp, sftp, irc) are accepted.
   * Dangerous protocols like 'javascript:', 'data:' are automatically rejected for security.
   */
  optionalProtocols?: Protocol[];

  /**
   * Additional protocols to block beyond the built-in blocked list.
   * Use this to add custom protocol restrictions for your application.
   */
  blockedProtocols?: Protocol[];

  /**
   * List of blocked hostnames or URL prefixes to reject.
   * Examples: ['malicious.com', 'https://ads.example.com/track']
   * Matching is case-insensitive.
   */
  redirectBlocklist?: string[];

  /**
   * Maximum allowed length for URLs in characters.
   * @default 2048
   */
  maxLength?: number;
};

/**
 * Result of successful URL sanitization.
 */
export type SanitizedLink = {
  /**
   * The sanitized, validated URL string safe for use in href attributes.
   */
  href: string;

  /**
   * The protocol/scheme extracted from the URL (e.g., 'https', 'mailto').
   * Null for anchor links (e.g., '#section').
   */
  protocol: string | null;

  /**
   * Whether this is an external link (http/https protocols).
   * Useful for adding target="_blank" or external link indicators.
   */
  isExternal: boolean;
};

/**
 * Result of tooltip encoding operation.
 */
export type EncodedTooltip = {
  /**
   * The processed tooltip text (trimmed and optionally truncated).
   * NOT HTML-encoded - browsers handle escaping when setting as attribute value.
   */
  text: string;

  /**
   * Whether the original text was truncated to fit within maxLength.
   * Use this to add visual indicators (e.g., ellipsis) or expand functionality.
   */
  wasTruncated: boolean;
};

export function sanitizeHref(raw: string | null | undefined, config?: SanitizerConfig): SanitizedLink | null;

export function encodeTooltip(raw: string | null | undefined, maxLength?: number): EncodedTooltip | null;

export const DEFAULT_TOOLTIP_MAX_LENGTH: number;

export const MAX_IMAGE_DATA_URL_LENGTH: number;

export const IMAGE_DATA_URL_MIME_TYPES: readonly string[];

export type DataUriMetadata = {
  hasPayloadSeparator: boolean;
  payload: string;
  rawMimeType: string;
  mimeType: string;
  isBase64: boolean;
};

export function getDataUriMetadata(src?: string): DataUriMetadata | null;

export function tryDecodeDataUriText(payload?: string): string | null;

export function isValidImageDataUrl(src: unknown): boolean;

export const UrlValidationConstants: {
  DEFAULT_ALLOWED_PROTOCOLS: string[];
  OPTIONAL_PROTOCOLS: string[];
  BLOCKED_PROTOCOLS: string[];
  DEFAULT_MAX_LENGTH: number;
};
