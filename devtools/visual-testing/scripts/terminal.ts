/**
 * Terminal styling utilities for visual testing scripts.
 * Provides consistent colored output with automatic TTY detection.
 */

import kleur from 'kleur';

/** Detect if stdout is a TTY and disable colors if not or if NO_COLOR is set. */
const isTty = Boolean(process.stdout.isTTY);
if (!isTty || process.env.NO_COLOR) {
  kleur.enabled = false;
}

/**
 * Color functions for terminal output.
 * Automatically disabled when stdout is not a TTY or NO_COLOR is set.
 */
export const colors = {
  /** Bold cyan for section headers */
  header: (value: string) => kleur.bold().cyan(value),
  /** Cyan for informational messages */
  info: (value: string) => kleur.cyan(value),
  /** Green for success messages */
  success: (value: string) => kleur.green(value),
  /** Yellow for warning messages */
  warning: (value: string) => kleur.yellow(value),
  /** Red for error messages */
  error: (value: string) => kleur.red(value),
  /** Gray for secondary/muted text */
  muted: (value: string) => kleur.gray(value),
  /** Magenta for accent/highlight text */
  accent: (value: string) => kleur.magenta(value),
  /** Cyan for file paths */
  path: (value: string) => kleur.cyan(value),
  /** Bold for emphasized text */
  strong: (value: string) => kleur.bold(value),
};
