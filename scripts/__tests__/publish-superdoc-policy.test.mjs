import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { assertPublicPublisherVersionAllowed } = require('../publish-superdoc.cjs');

test('public publisher remains a 1.x-only release lane', () => {
  assert.doesNotThrow(() => assertPublicPublisherVersionAllowed('1.44.2'));
  assert.throws(
    () => assertPublicPublisherVersionAllowed('2.3.0-next.1'),
    /public publisher is restricted to 1\.x releases/u,
  );
});
