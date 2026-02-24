/**
 * Canonical alias sets for platform_machine values.
 *
 * Used to generate both PEP 508 marker OR-conditions (install-time)
 * and the Python _normalized_machine() lookup (run-time).
 *
 * PEP 508 markers are case-sensitive — include all casing variants
 * observed in practice from platform.machine().
 */
export const MACHINE_ALIASES = Object.freeze({
  x64: Object.freeze(['x86_64', 'AMD64', 'amd64']),
  arm64: Object.freeze(['arm64', 'aarch64', 'ARM64']),
});

/**
 * Generate a PEP 508 marker OR-condition from MACHINE_ALIASES.
 * e.g. machineMarker('arm64') =>
 *   "(platform_machine == 'arm64' or platform_machine == 'aarch64' or platform_machine == 'ARM64')"
 */
export function machineMarker(canonicalArch) {
  const aliases = MACHINE_ALIASES[canonicalArch];
  if (!aliases) {
    throw new Error(`Unknown canonical architecture: "${canonicalArch}". Expected one of: ${Object.keys(MACHINE_ALIASES).join(', ')}`);
  }
  if (aliases.length === 1) return `platform_machine == '${aliases[0]}'`;
  return '(' + aliases.map((a) => `platform_machine == '${a}'`).join(' or ') + ')';
}

export const PYTHON_CLI_PLATFORM_TARGETS = Object.freeze([
  Object.freeze({
    id: 'darwin-arm64',
    sourcePackage: 'cli-darwin-arm64',
    binaryName: 'superdoc',
    companionPypiName: 'superdoc-sdk-cli-darwin-arm64',
    companionModuleName: 'superdoc_sdk_cli_darwin_arm64',
    marker: `platform_system == 'Darwin' and ${machineMarker('arm64')}`,
  }),
  Object.freeze({
    id: 'darwin-x64',
    sourcePackage: 'cli-darwin-x64',
    binaryName: 'superdoc',
    companionPypiName: 'superdoc-sdk-cli-darwin-x64',
    companionModuleName: 'superdoc_sdk_cli_darwin_x64',
    marker: `platform_system == 'Darwin' and ${machineMarker('x64')}`,
  }),
  Object.freeze({
    id: 'linux-x64',
    sourcePackage: 'cli-linux-x64',
    binaryName: 'superdoc',
    companionPypiName: 'superdoc-sdk-cli-linux-x64',
    companionModuleName: 'superdoc_sdk_cli_linux_x64',
    marker: `platform_system == 'Linux' and ${machineMarker('x64')}`,
  }),
  Object.freeze({
    id: 'linux-arm64',
    sourcePackage: 'cli-linux-arm64',
    binaryName: 'superdoc',
    companionPypiName: 'superdoc-sdk-cli-linux-arm64',
    companionModuleName: 'superdoc_sdk_cli_linux_arm64',
    marker: `platform_system == 'Linux' and ${machineMarker('arm64')}`,
  }),
  Object.freeze({
    id: 'windows-x64',
    sourcePackage: 'cli-windows-x64',
    binaryName: 'superdoc.exe',
    companionPypiName: 'superdoc-sdk-cli-windows-x64',
    companionModuleName: 'superdoc_sdk_cli_windows_x64',
    marker: `platform_system == 'Windows' and ${machineMarker('x64')}`,
  }),
]);

/** Backward-compatible alias — prefer PYTHON_CLI_PLATFORM_TARGETS for new code. */
export const PYTHON_EMBEDDED_CLI_TARGETS = PYTHON_CLI_PLATFORM_TARGETS;

/** Return companion wheel binary path entries (module-based, not _vendor-based). */
export function toCompanionWheelBinaryEntries(targets = PYTHON_CLI_PLATFORM_TARGETS) {
  return targets.map((t) => `${t.companionModuleName}/bin/${t.binaryName}`);
}

/** @deprecated Use toCompanionWheelBinaryEntries(). Kept for one release cycle. */
export function toPythonWheelEmbeddedCliEntries(targets = PYTHON_CLI_PLATFORM_TARGETS) {
  return targets.map((t) => `superdoc/_vendor/cli/${t.id}/${t.binaryName}`);
}

export function pythonEmbeddedCliTargetIds(targets = PYTHON_CLI_PLATFORM_TARGETS) {
  return targets.map((t) => t.id);
}
