const { assertExpectedBlockIds } = require('./promptfoo-assertions.cjs');

module.exports = (output, context) => assertExpectedBlockIds(output, context);
