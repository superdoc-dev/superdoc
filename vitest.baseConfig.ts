import { ViteUserConfig } from 'vitest/config.js';
import sourceResolve from './vite.sourceResolve';

const baseConfig: ViteUserConfig = {
  resolve: sourceResolve,
  // Work around bug: when environment is node, resolve conditions aren't respected.
  // See https://github.com/vitest-dev/vitest/issues/6992#issuecomment-2509408660
  environments: {
    ssr: {
      resolve: sourceResolve,
    },
  },
};

export default baseConfig;
