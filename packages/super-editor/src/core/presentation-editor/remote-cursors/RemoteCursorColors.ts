/**
 * Gets a deterministic fallback color for a remote cursor based on client ID.
 *
 * Uses modulo arithmetic to cycle through the fallback color palette, ensuring
 * each client gets a consistent color across sessions while distributing colors
 * evenly when multiple clients are active.
 *
 * @param clientId - The Yjs client ID
 * @param fallbackColors - Array of fallback colors in hex format
 * @returns A hex color string from the fallback palette
 *
 * @remarks
 * Uses modulo to wrap client IDs to the palette size, providing deterministic
 * color assignment. The non-null assertion is safe because modulo guarantees
 * a valid index.
 */
export function getFallbackCursorColor(clientId: number, fallbackColors: readonly string[]): string {
  return fallbackColors[clientId % fallbackColors.length]!;
}

/**
 * Validates a cursor color string and returns a fallback if invalid.
 *
 * Ensures the color is a valid 6-digit hex color (#RRGGBB). If validation fails,
 * returns a deterministic fallback color based on the client ID.
 *
 * @param color - The color string to validate
 * @param clientId - The Yjs client ID for fallback color selection
 * @param fallbackColors - Array of fallback colors in hex format
 * @returns The validated color, or a fallback if invalid
 *
 * @remarks
 * Only accepts uppercase or lowercase 6-digit hex format (#RRGGBB).
 * Does not accept shorthand hex (#RGB) or other color formats.
 */
export function validateCursorColor(color: string, clientId: number, fallbackColors: readonly string[]): string {
  return color.match(/^#[0-9A-Fa-f]{6}$/) ? color : getFallbackCursorColor(clientId, fallbackColors);
}
