export const PYTHON_EMBEDDED_CLI_TARGETS = Object.freeze([
  Object.freeze({ id: 'darwin-arm64', sourcePackage: 'cli-darwin-arm64', binaryName: 'superdoc' }),
  Object.freeze({ id: 'darwin-x64', sourcePackage: 'cli-darwin-x64', binaryName: 'superdoc' }),
  Object.freeze({ id: 'linux-x64', sourcePackage: 'cli-linux-x64', binaryName: 'superdoc' }),
  Object.freeze({ id: 'linux-arm64', sourcePackage: 'cli-linux-arm64', binaryName: 'superdoc' }),
  Object.freeze({ id: 'windows-x64', sourcePackage: 'cli-windows-x64', binaryName: 'superdoc.exe' }),
]);

export function toPythonWheelEmbeddedCliEntries(targets = PYTHON_EMBEDDED_CLI_TARGETS) {
  return targets.map((target) => `superdoc/_vendor/cli/${target.id}/${target.binaryName}`);
}

export function pythonEmbeddedCliTargetIds(targets = PYTHON_EMBEDDED_CLI_TARGETS) {
  return targets.map((target) => target.id);
}
