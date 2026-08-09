import path from 'path';

const sourceResolve = {
  conditions: ['source'],
  alias: [
    // Local workspace aliases for private source-first packages used by public
    // builds and tests. The published `superdoc` package rewrites these to its
    // own emitted dist surface during postbuild.
    { find: '@superdoc/document-api', replacement: path.resolve(__dirname, 'packages/document-api/src/index.ts') },
    {
      find: '@superdoc/layout-resolved',
      replacement: path.resolve(__dirname, 'packages/layout-engine/layout-resolved/src/index.ts'),
    },
    {
      find: '@superdoc/layout-bridge',
      replacement: path.resolve(__dirname, 'packages/layout-engine/layout-bridge/src/index.ts'),
    },
    { find: '@superdoc/common', replacement: path.resolve(__dirname, 'shared/common') },
    { find: '@shared', replacement: path.resolve(__dirname, 'shared') },
  ],
};

export default sourceResolve;
