const { assertNoErrorSteps } = require('./promptfoo-assertions.cjs');

module.exports = (output, context) => assertNoErrorSteps(output, context);
