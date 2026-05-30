export function isContentLockedMode(lockMode) {
  return lockMode === 'contentLocked' || lockMode === 'sdtContentLocked';
}

export function isSdtLockedMode(lockMode) {
  return lockMode === 'sdtLocked' || lockMode === 'sdtContentLocked';
}
