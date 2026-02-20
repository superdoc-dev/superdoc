import { describe, it, expect, vi, afterEach } from 'vitest';
import path from 'path';
import fs from 'node:fs';
import { findWorkspaceRoot, findLocalSuperdocTarball, ensureLocalTarballInstalled } from './workspace-utils.js';

describe('findWorkspaceRoot', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null when no pnpm-workspace.yaml is found', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const result = findWorkspaceRoot('/some/deep/nested/path');
    expect(result).toBe(null);
  });

  it('should return the directory containing pnpm-workspace.yaml', () => {
    const workspaceRoot = '/home/user/project';
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      return p === path.join(workspaceRoot, 'pnpm-workspace.yaml');
    });

    const result = findWorkspaceRoot('/home/user/project/packages/subpackage');
    expect(result).toBe(workspaceRoot);
  });

  it('should handle absolute paths', () => {
    const workspaceRoot = '/workspace';
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      return p === path.join(workspaceRoot, 'pnpm-workspace.yaml');
    });

    const result = findWorkspaceRoot('/workspace/deep/nested');
    expect(result).toBe(workspaceRoot);
  });
});

describe('findLocalSuperdocTarball', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null when tarball does not exist', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const result = findLocalSuperdocTarball('/some/path');
    expect(result).toBe(null);
  });

  it('should return tarball info when tarball exists in an ancestor', () => {
    const workspaceRoot = '/home/user/project';
    const tarballPath = path.join(workspaceRoot, 'packages', 'superdoc', 'superdoc.tgz');

    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (p === tarballPath) return true;
      return false;
    });

    const result = findLocalSuperdocTarball('/home/user/project/packages/subpackage');
    expect(result).toEqual({
      root: workspaceRoot,
      tarball: tarballPath,
    });
  });
});

describe('ensureLocalTarballInstalled', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should do nothing when no tarball is found', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const runVersionSwitch = vi.fn();
    await ensureLocalTarballInstalled('/some/path', runVersionSwitch);

    expect(runVersionSwitch).not.toHaveBeenCalled();
  });

  it('should do nothing when harness package.json does not exist', async () => {
    const workspaceRoot = '/home/user/project';
    const tarballPath = path.join(workspaceRoot, 'packages', 'superdoc', 'superdoc.tgz');

    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (p === tarballPath) return true;
      return false;
    });

    const runVersionSwitch = vi.fn();
    await ensureLocalTarballInstalled(workspaceRoot, runVersionSwitch);

    expect(runVersionSwitch).not.toHaveBeenCalled();
  });

  it('should do nothing when already using tarball and superdoc is installed', async () => {
    const workspaceRoot = '/home/user/project';
    const tarballPath = path.join(workspaceRoot, 'packages', 'superdoc', 'superdoc.tgz');
    const harnessPkgPath = path.join(workspaceRoot, 'packages', 'harness', 'package.json');
    const installedPkgPath = path.join(
      workspaceRoot,
      'packages',
      'harness',
      'node_modules',
      'superdoc',
      'package.json',
    );

    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (p === tarballPath) return true;
      if (p === harnessPkgPath) return true;
      if (p === installedPkgPath) return true;
      return false;
    });

    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ dependencies: { superdoc: 'file:../../superdoc/superdoc.tgz' } }),
    );

    const runVersionSwitch = vi.fn();
    await ensureLocalTarballInstalled(workspaceRoot, runVersionSwitch);

    expect(runVersionSwitch).not.toHaveBeenCalled();
  });

  it('should switch version when tarball exists but not configured', async () => {
    const workspaceRoot = '/home/user/project';
    const tarballPath = path.join(workspaceRoot, 'packages', 'superdoc', 'superdoc.tgz');
    const harnessPkgPath = path.join(workspaceRoot, 'packages', 'harness', 'package.json');
    const installedPkgPath = path.join(
      workspaceRoot,
      'packages',
      'harness',
      'node_modules',
      'superdoc',
      'package.json',
    );

    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (p === tarballPath) return true;
      if (p === harnessPkgPath) return true;
      if (p === installedPkgPath) return false;
      return false;
    });

    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ dependencies: { superdoc: '1.5.0' } }));

    const runVersionSwitch = vi.fn();
    const log = vi.fn();
    await ensureLocalTarballInstalled(workspaceRoot, runVersionSwitch, log);

    expect(runVersionSwitch).toHaveBeenCalledWith(path.join(workspaceRoot, 'packages', 'superdoc'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Switching to local SuperDoc tarball'));
  });
});
