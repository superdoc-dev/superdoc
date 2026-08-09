const ENGINE_PACKAGE_NAME = '@superdoc/docx-engine';

export function resolveExactEngineVersion(dependencySpec, hasInternalWorkspace) {
  const pattern = hasInternalWorkspace ? /^workspace:(0\.\d+\.\d+(?:-next\.\d+)?)$/ : /^(0\.\d+\.\d+(?:-next\.\d+)?)$/;
  const match = typeof dependencySpec === 'string' ? dependencySpec.match(pattern) : null;
  if (!match) {
    const requiredSpec = hasInternalWorkspace ? 'workspace:0.x in Orbit' : 'exact 0.x in an exported checkout';
    throw new Error(`[superdoc-cdn] ${ENGINE_PACKAGE_NAME} must use ${requiredSpec}`);
  }
  return match[1];
}
