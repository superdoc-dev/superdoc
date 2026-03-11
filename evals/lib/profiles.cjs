/**
 * Assertion profiles -- named bundles of checks that run automatically.
 *
 * Tests set `vars.profile` to select a profile. Default is "base".
 * Tests can add extra checks via `vars.checks: [checkName, ...]`.
 */
module.exports = {
  // Hygiene only (default for all tests)
  base: ['noHallucinatedParams'],

  // Reading tests (query_match / get_document_text)
  reading: ['noHallucinatedParams'],

  // Mutation tests (apply_mutations)
  mutation: [
    'noHallucinatedParams',
    'validOpNames',
    'stepFields',
    'noRequireAny',
    'noMixedBatch',
  ],

  // Tracked changes tests (mutations in tracked mode)
  tracked: [
    'noHallucinatedParams',
    'validOpNames',
    'stepFields',
    'noRequireAny',
    'noMixedBatch',
    'isTrackedMode',
  ],

  // Format tests (format.apply steps)
  format: [
    'noHallucinatedParams',
    'validOpNames',
    'stepFields',
    'correctFormatArgs',
  ],
};
