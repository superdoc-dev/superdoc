import { describe, expect, test } from 'bun:test';
import { resolveArtifactSourcePath, validateBinaryName } from '../stage-artifacts.js';

describe('resolveArtifactSourcePath', () => {
  test('resolves valid artifact-relative paths', () => {
    const resolvedPath = resolveArtifactSourcePath('linux-x64/superdoc');
    expect(resolvedPath.includes('apps/cli/artifacts')).toBe(true);
    expect(resolvedPath.includes('linux-x64')).toBe(true);
    expect(resolvedPath.endsWith('superdoc')).toBe(true);
  });

  test('rejects absolute paths', () => {
    expect(() => resolveArtifactSourcePath('/tmp/superdoc')).toThrow('Artifact path must be relative');
  });

  test('rejects traversal outside artifacts root', () => {
    expect(() => resolveArtifactSourcePath('../package.json')).toThrow('Artifact path escapes artifacts root');
  });
});

describe('validateBinaryName', () => {
  test('accepts simple binary file names', () => {
    expect(validateBinaryName('superdoc', 'linux-x64')).toBe('superdoc');
    expect(validateBinaryName('superdoc.exe', 'windows-x64')).toBe('superdoc.exe');
  });

  test('rejects path traversal or path segments', () => {
    expect(() => validateBinaryName('../superdoc', 'linux-x64')).toThrow('Invalid binaryName');
    expect(() => validateBinaryName('nested/superdoc', 'linux-x64')).toThrow('Invalid binaryName');
    expect(() => validateBinaryName('nested\\superdoc.exe', 'windows-x64')).toThrow('Invalid binaryName');
  });
});
