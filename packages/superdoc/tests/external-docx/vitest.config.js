import { mergeConfig } from 'vitest/config';
import packageConfigFactory from '../../vite.config.js';

const packageConfig = packageConfigFactory({ mode: 'test', command: 'serve' });

export default mergeConfig(packageConfig, {
  test: {
    include: ['tests/external-docx/external-docx.fixture.js'],
    retry: 0,
    testTimeout: 60_000,
  },
});
