export const DISABLE_TRACKED_CHANGE_LOADING_ENV = 'SUPERDOC_DISABLE_TRACKED_CHANGE_LOADING';
export const DISABLE_TRACKED_CHANGE_LOADING_DEFINE = '__SUPERDOC_DISABLE_TRACKED_CHANGE_LOADING__';

/**
 * Resolve the Orbit-only tracked-change loading bypass.
 *
 * AIDEV-NOTE: This switch may only alter the live private source graph. Keeping
 * it out of package mode and builds prevents a diagnostic posture from becoming
 * part of a customer artifact when an environment variable leaks into CI.
 *
 * @param {{ command: 'build' | 'serve', runtimeMode: string, env?: NodeJS.ProcessEnv }} input
 */
export function resolveDisableTrackedChangeLoading({ command, runtimeMode, env = process.env }) {
  const requested = env[DISABLE_TRACKED_CHANGE_LOADING_ENV];
  if (requested == null || requested === '' || requested === '0') return false;
  if (requested !== '1') {
    throw new Error(
      `[tracked-change-loading] invalid ${DISABLE_TRACKED_CHANGE_LOADING_ENV}="${requested}"; expected "0" or "1".`,
    );
  }
  if (command !== 'serve' || runtimeMode !== 'source') {
    throw new Error(
      `[tracked-change-loading] ${DISABLE_TRACKED_CHANGE_LOADING_ENV}=1 is allowed only for the Orbit source-mode dev server.`,
    );
  }
  return true;
}
