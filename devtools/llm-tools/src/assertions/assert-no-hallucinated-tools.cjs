const { assertNoHallucinatedTools } = require('./promptfoo-assertions.cjs');

module.exports = (output, context) => assertNoHallucinatedTools(output, context);
