export const PRETTY_ROW_LIMIT = 20;

export function truncate(text: string, maxLen: number): string {
  if (maxLen <= 3) return text.slice(0, Math.max(0, maxLen));
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)}...`;
}

export function toSingleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function padCol(text: string, width: number): string {
  return text.padEnd(width);
}

export function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function moreLine(shown: number, total: number): string | null {
  if (total <= shown) return null;
  return `...and ${total - shown} more`;
}
