import { describe, it, expect } from 'bun:test';
import { buildPatchSchema, buildStateSchema } from './schema.js';
import { ALLOWED_KEYS_BY_CHANNEL, EXCLUDED_KEYS, EXCLUDED_KEYS_BY_SCOPE, type StylesChannel } from './registry.js';

const CHANNELS: StylesChannel[] = ['run', 'paragraph'];

function schemaKeys(channel: StylesChannel, scope?: 'docDefaults' | 'style'): string[] {
  const schema = scope ? buildPatchSchema(channel, scope) : buildPatchSchema(channel);
  return Object.keys(schema.properties as Record<string, unknown>).sort();
}

/**
 * The published schema and the validator have to accept the same set.
 *
 * The registry backs two destinations now, so "in the registry" no longer means
 * "accepted here". Without this gate a patch schema would advertise properties
 * its own validator rejects, and the mismatch is invisible: nothing else in the
 * contract compares the two.
 */
describe('buildPatchSchema: scope filtering', () => {
  for (const channel of CHANNELS) {
    it(`omits every docDefaults-excluded key from the ${channel} schema`, () => {
      const published = schemaKeys(channel, 'docDefaults');
      const leaked = published.filter((key) => EXCLUDED_KEYS[channel].has(key));
      expect(leaked).toEqual([]);
    });

    it(`publishes exactly what the ${channel} validator accepts in docDefaults`, () => {
      const accepted = [...ALLOWED_KEYS_BY_CHANNEL[channel]].filter((key) => !EXCLUDED_KEYS[channel].has(key)).sort();
      expect(schemaKeys(channel, 'docDefaults')).toEqual(accepted);
    });

    it(`publishes exactly what the ${channel} validator accepts in a named style`, () => {
      const accepted = [...ALLOWED_KEYS_BY_CHANNEL[channel]]
        .filter((key) => !EXCLUDED_KEYS_BY_SCOPE.style[channel].has(key))
        .sort();
      expect(schemaKeys(channel, 'style')).toEqual(accepted);
    });

    it(`defaults the ${channel} schema to docDefaults when no scope is given`, () => {
      // schemas.ts calls buildPatchSchema(channel) with no scope for
      // styles.apply. If the default flipped, styles.apply would publish the
      // wider style-scope surface.
      expect(schemaKeys(channel)).toEqual(schemaKeys(channel, 'docDefaults'));
    });
  }

  it('reaches exactly four more run properties under the style scope', () => {
    const extra = schemaKeys('run', 'style').filter((key) => !schemaKeys('run', 'docDefaults').includes(key));
    expect(extra.sort()).toEqual(['cs', 'highlight', 'oMath', 'rtl']);
  });

  it('publishes the same paragraph surface in both scopes', () => {
    expect(schemaKeys('paragraph', 'style')).toEqual(schemaKeys('paragraph', 'docDefaults'));
  });
});

/**
 * The receipt state map is scoped for the same reason the patch schema is.
 * These objects carry `additionalProperties: false`, so an unscoped state
 * schema does not merely mislead — it loosens receipt validation for every
 * contract-driven consumer.
 */
describe('buildStateSchema: scope filtering', () => {
  const stateKeys = (scope?: 'docDefaults' | 'style') =>
    Object.keys((scope ? buildStateSchema(scope) : buildStateSchema()).properties as Record<string, unknown>).sort();

  it('omits every docDefaults-excluded key', () => {
    const published = stateKeys('docDefaults');
    for (const channel of CHANNELS) {
      expect(published.filter((key) => EXCLUDED_KEYS[channel].has(key))).toEqual([]);
    }
  });

  it('defaults to docDefaults, which is what styles.apply publishes', () => {
    expect(stateKeys()).toEqual(stateKeys('docDefaults'));
  });

  it('reaches exactly four more keys under the style scope', () => {
    const extra = stateKeys('style').filter((key) => !stateKeys('docDefaults').includes(key));
    expect(extra.sort()).toEqual(['cs', 'highlight', 'oMath', 'rtl']);
  });
});

describe('buildStateSchema: channel narrowing', () => {
  const keys = (scope: 'docDefaults' | 'style', channel?: StylesChannel) =>
    Object.keys(buildStateSchema(scope, channel).properties as Record<string, unknown>).sort();

  it('reports one channel only when a channel is given', () => {
    // The whole reason styles.create splits before/after per channel: three
    // keys exist on both, and `borders` means w:bdr on one and w:pBdr on the
    // other. A folded map cannot say which it described.
    expect(keys('style', 'run')).not.toContain('keepNext');
    expect(keys('style', 'paragraph')).not.toContain('rtl');
    expect(keys('style', 'run')).toContain('rtl');
  });

  it('folds both channels when no channel is given, as styles.apply needs', () => {
    const folded = keys('style');
    for (const key of [...keys('style', 'run'), ...keys('style', 'paragraph')]) {
      expect(folded).toContain(key);
    }
  });
});
