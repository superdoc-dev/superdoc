/* eslint-env node */

const strictBreakingParserOpts = {
  noteKeywords: ['BREAKING CHANGE', 'BREAKING-CHANGE'],
  notesPattern: (noteKeywordsSelection) => new RegExp(`^(${noteKeywordsSelection}):[ \\t]+(.+)$`),
};

function mergeStrictParserOpts(options = {}) {
  return {
    ...options,
    parserOpts: {
      ...(options.parserOpts || {}),
      ...strictBreakingParserOpts,
    },
  };
}

function createCommitAnalyzer(options = {}) {
  return ['@semantic-release/commit-analyzer', mergeStrictParserOpts(options)];
}

function createReleaseNotesGenerator(options = {}) {
  return ['@semantic-release/release-notes-generator', mergeStrictParserOpts(options)];
}

module.exports = {
  strictBreakingParserOpts,
  createCommitAnalyzer,
  createReleaseNotesGenerator,
};
