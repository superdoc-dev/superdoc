const { assertFinalAnswerQuality } = require('./promptfoo-assertions.cjs');

module.exports = (output, context) => assertFinalAnswerQuality(output, context);
