/**
 * Executes a cleanup function and catches any errors, logging them with context.
 *
 * Used to ensure cleanup operations (removing event listeners, clearing intervals,
 * disposing resources) don't throw and interrupt the cleanup sequence. Errors are
 * logged to the console with the provided context for debugging.
 *
 * @param fn - The cleanup function to execute
 * @param context - A description of what is being cleaned up (for error logging)
 *
 * @remarks
 * This is particularly important during dispose/teardown sequences where multiple
 * cleanup operations must run even if earlier ones fail. For example, when disposing
 * a PresentationEditor, all subscriptions must be cleaned up regardless of individual
 * failures.
 */
export function safeCleanup(fn: () => void, context: string): void {
  try {
    fn();
  } catch (error) {
    console.warn(`[PresentationEditor] ${context} cleanup failed:`, error);
  }
}
