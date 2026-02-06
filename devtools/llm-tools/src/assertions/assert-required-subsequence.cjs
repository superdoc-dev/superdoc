const { assertRequiredSubsequencePresent } = require('./promptfoo-assertions.cjs');

module.exports = (output, context) => assertRequiredSubsequencePresent(output, context);
