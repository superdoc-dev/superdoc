import path from 'path';

const sourceResolve = {
  conditions: ['source'],
  alias: [
    { find: '@shared', replacement: path.resolve(__dirname, 'shared') },
    { find: '@core', replacement: path.resolve(__dirname, 'packages/super-editor/src/core') },
    { find: '@extensions', replacement: path.resolve(__dirname, 'packages/super-editor/src/extensions') },
    { find: '@features', replacement: path.resolve(__dirname, 'packages/super-editor/src/features') },
    { find: '@components', replacement: path.resolve(__dirname, 'packages/super-editor/src/components') },
    { find: '@helpers', replacement: path.resolve(__dirname, 'packages/super-editor/src/core/helpers') },
    { find: '@converter', replacement: path.resolve(__dirname, 'packages/super-editor/src/core/super-converter') },
    { find: '@tests', replacement: path.resolve(__dirname, 'packages/super-editor/src/tests') },
    {
      find: '@translator',
      replacement: path.resolve(
        __dirname,
        'packages/super-editor/src/core/super-converter/v3/node-translator/index.js',
      ),
    },
    { find: '@utils', replacement: path.resolve(__dirname, 'packages/super-editor/src/utils') },
  ],
};

export default sourceResolve;
