const path = require('path');

module.exports = [
  {
    entry: './docx-validator.js',
    output: {
      filename: 'docx-validator.bundle.js',
      path: path.resolve(__dirname, 'dist'),
      library: 'DocxValidator',
      libraryTarget: 'var'
    },
    mode: 'production',
    target: 'webworker'
  },
  {
    entry: './content.js',
    output: {
      filename: 'content.bundle.js',
      path: path.resolve(__dirname, 'dist')
    },
    mode: 'production',
    target: 'web'
  },
];
