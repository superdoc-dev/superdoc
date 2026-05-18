export function shouldRecoverPackageRelease({
  publishComplete,
  githubComplete,
  pythonPublished = true,
  hasPythonPackages = false,
  tagAtHead = false,
}) {
  const needsSnapshotPython = Boolean(hasPythonPackages) && !pythonPublished && !tagAtHead;
  return !publishComplete || !githubComplete || needsSnapshotPython;
}
