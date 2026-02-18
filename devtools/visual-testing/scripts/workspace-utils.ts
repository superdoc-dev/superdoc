import fs from 'node:fs';
import path from 'node:path';

/**
 * Find the pnpm workspace root by traversing up from a starting directory.
 *
 * @param startDir - Directory to start searching from
 * @returns Absolute path to workspace root, or null if not found
 */
export function findWorkspaceRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    const marker = path.join(current, 'pnpm-workspace.yaml');
    if (fs.existsSync(marker)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/** Result from findLocalSuperdocTarball when a tarball is found. */
export interface LocalSuperdocTarball {
  /** Absolute path to the workspace root directory. */
  root: string;
  /** Absolute path to the superdoc.tgz tarball. */
  tarball: string;
}

/**
 * Find a local superdoc tarball in the workspace.
 * Searches for packages/superdoc/superdoc.tgz relative to the workspace root.
 *
 * @param startDir - Directory to start searching from
 * @returns Tarball info if found, or null if not in a workspace or tarball doesn't exist
 */
export function findLocalSuperdocTarball(startDir: string): LocalSuperdocTarball | null {
  let current = path.resolve(startDir);
  while (true) {
    const tarball = path.join(current, 'packages', 'superdoc', 'superdoc.tgz');
    if (fs.existsSync(tarball)) {
      return { root: current, tarball };
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/**
 * Ensure the harness uses a local superdoc tarball if available.
 * Checks if a tarball exists in the workspace and if the harness is not already
 * configured to use it, switches the harness to use the tarball.
 *
 * @param cwd - Current working directory (visual-testing root)
 * @param runVersionSwitch - Function to switch superdoc version
 * @param log - Optional logging function for status messages
 */
export async function ensureLocalTarballInstalled(
  cwd: string,
  runVersionSwitch: (version: string) => Promise<void>,
  log?: (message: string) => void,
): Promise<void> {
  const info = findLocalSuperdocTarball(cwd);
  if (!info) {
    return;
  }
  const harnessPkgPath = path.resolve(cwd, 'packages/harness/package.json');
  if (!fs.existsSync(harnessPkgPath)) {
    return;
  }
  const harnessInstallPath = path.resolve(cwd, 'packages/harness/node_modules/superdoc');
  const hasInstalledPackage = fs.existsSync(path.join(harnessInstallPath, 'package.json'));
  const pkg = JSON.parse(fs.readFileSync(harnessPkgPath, 'utf8')) as { dependencies?: Record<string, string> };
  const currentSpec = pkg.dependencies?.superdoc ?? '';
  if (currentSpec.includes('superdoc.tgz') && hasInstalledPackage) {
    return;
  }
  if (log) {
    log(`Switching to local SuperDoc tarball: ${info.tarball}`);
  }
  await runVersionSwitch(path.join(info.root, 'packages', 'superdoc'));
}
