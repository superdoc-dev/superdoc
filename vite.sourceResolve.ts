import path from 'path';

const sourceResolve = {
  conditions: ['source'],
  alias: [
    { find: '@shared', replacement: path.resolve(__dirname, 'shared') },
    { find: '@core', replacement: path.resolve(__dirname, 'packages/super-editor/src/editors/v1/core') },
    { find: '@extensions', replacement: path.resolve(__dirname, 'packages/super-editor/src/editors/v1/extensions') },
    { find: '@features', replacement: path.resolve(__dirname, 'packages/super-editor/src/editors/v1/features') },
    { find: '@components', replacement: path.resolve(__dirname, 'packages/super-editor/src/editors/v1/components') },
    { find: '@helpers', replacement: path.resolve(__dirname, 'packages/super-editor/src/editors/v1/core/helpers') },
    {
      find: '@converter',
      replacement: path.resolve(__dirname, 'packages/super-editor/src/editors/v1/core/super-converter'),
    },
    { find: '@tests', replacement: path.resolve(__dirname, 'packages/super-editor/src/editors/v1/tests') },
    {
      find: '@translator',
      replacement: path.resolve(
        __dirname,
        'packages/super-editor/src/editors/v1/core/super-converter/v3/node-translator/index.js',
      ),
    },
    { find: '@utils', replacement: path.resolve(__dirname, 'packages/super-editor/src/editors/v1/utils') },
  ],
};

export default sourceResolve;
