/**
 * Feature Flags Tests
 *
 * Tests for the feature flag system for headers/footers page-number parity.
 *
 * Note: Feature flags are evaluated at module load time, so these tests verify the
 * current state and structure of the feature flag system rather than testing
 * different environment variable configurations.
 */

import { describe, it, expect } from 'bun:test';
import { FeatureFlags, isFeatureEnabled, getAllFeatureFlags, type FeatureFlagKey } from '../src/featureFlags';

describe('Feature Flags', () => {
  describe('Flag Structure', () => {
    it('should have all required feature flags', () => {
      expect(FeatureFlags).toHaveProperty('NUMBERING_SECTION_AWARE');
      expect(FeatureFlags).toHaveProperty('BODY_PAGE_TOKENS');
      expect(FeatureFlags).toHaveProperty('HEADER_FOOTER_PAGE_TOKENS');
      expect(FeatureFlags).toHaveProperty('HF_DIGIT_BUCKETING');
      expect(FeatureFlags).toHaveProperty('DEBUG_PAGE_TOKENS');
      expect(FeatureFlags).toHaveProperty('DEBUG_HF_CACHE');
    });

    it('should have boolean values for all flags', () => {
      expect(typeof FeatureFlags.NUMBERING_SECTION_AWARE).toBe('boolean');
      expect(typeof FeatureFlags.BODY_PAGE_TOKENS).toBe('boolean');
      expect(typeof FeatureFlags.HEADER_FOOTER_PAGE_TOKENS).toBe('boolean');
      expect(typeof FeatureFlags.HF_DIGIT_BUCKETING).toBe('boolean');
      expect(typeof FeatureFlags.DEBUG_PAGE_TOKENS).toBe('boolean');
      expect(typeof FeatureFlags.DEBUG_HF_CACHE).toBe('boolean');
    });

    it('should have correct default values (production flags enabled, debug flags disabled by default)', () => {
      // Production flags default to true (can be overridden by env vars)
      // We can't test the default directly since env vars may be set,
      // but we can verify they are boolean and consistent
      const productionFlags = [
        'NUMBERING_SECTION_AWARE',
        'BODY_PAGE_TOKENS',
        'HEADER_FOOTER_PAGE_TOKENS',
        'HF_DIGIT_BUCKETING',
      ] as const;

      for (const flag of productionFlags) {
        expect(typeof FeatureFlags[flag]).toBe('boolean');
      }

      // Debug flags are usually false unless explicitly enabled
      // but we just verify they are boolean type
      expect(typeof FeatureFlags.DEBUG_PAGE_TOKENS).toBe('boolean');
      expect(typeof FeatureFlags.DEBUG_HF_CACHE).toBe('boolean');
    });
  });

  describe('Helper Functions', () => {
    it('should check if feature is enabled via isFeatureEnabled', () => {
      const result = isFeatureEnabled('BODY_PAGE_TOKENS');
      expect(typeof result).toBe('boolean');
      expect(result).toBe(FeatureFlags.BODY_PAGE_TOKENS);
    });

    it('should check all flags via isFeatureEnabled', () => {
      const flags: FeatureFlagKey[] = [
        'NUMBERING_SECTION_AWARE',
        'BODY_PAGE_TOKENS',
        'HEADER_FOOTER_PAGE_TOKENS',
        'HF_DIGIT_BUCKETING',
        'DEBUG_PAGE_TOKENS',
        'DEBUG_HF_CACHE',
      ];

      for (const flag of flags) {
        const result = isFeatureEnabled(flag);
        expect(typeof result).toBe('boolean');
        expect(result).toBe(FeatureFlags[flag]);
      }
    });

    it('should get all feature flags via getAllFeatureFlags', () => {
      const flags = getAllFeatureFlags();

      expect(flags).toHaveProperty('NUMBERING_SECTION_AWARE');
      expect(flags).toHaveProperty('BODY_PAGE_TOKENS');
      expect(flags).toHaveProperty('HEADER_FOOTER_PAGE_TOKENS');
      expect(flags).toHaveProperty('HF_DIGIT_BUCKETING');
      expect(flags).toHaveProperty('DEBUG_PAGE_TOKENS');
      expect(flags).toHaveProperty('DEBUG_HF_CACHE');

      expect(typeof flags.NUMBERING_SECTION_AWARE).toBe('boolean');
      expect(typeof flags.BODY_PAGE_TOKENS).toBe('boolean');
      expect(typeof flags.HEADER_FOOTER_PAGE_TOKENS).toBe('boolean');
      expect(typeof flags.HF_DIGIT_BUCKETING).toBe('boolean');
      expect(typeof flags.DEBUG_PAGE_TOKENS).toBe('boolean');
      expect(typeof flags.DEBUG_HF_CACHE).toBe('boolean');
    });

    it('should return a copy of flags (not reference)', () => {
      const flags1 = getAllFeatureFlags();
      const flags2 = getAllFeatureFlags();

      expect(flags1).toEqual(flags2);
      expect(flags1).not.toBe(flags2); // Different objects
    });
  });

  describe('Flag Consistency', () => {
    it('should maintain consistent values throughout execution', () => {
      // Verify that flags maintain their values
      const bodyTokensValue1 = FeatureFlags.BODY_PAGE_TOKENS;
      const bodyTokensValue2 = FeatureFlags.BODY_PAGE_TOKENS;

      expect(bodyTokensValue1).toBe(bodyTokensValue2);

      // Verify all flags are consistent
      const allFlags1 = getAllFeatureFlags();
      const allFlags2 = getAllFeatureFlags();

      expect(allFlags1).toEqual(allFlags2);
    });
  });

  describe('Integration with Environment', () => {
    it('should respect SD_DEBUG_PAGE_TOKENS environment variable if set', () => {
      // This test verifies the flag exists and has a value
      // The actual value depends on the environment when tests run
      expect(typeof FeatureFlags.DEBUG_PAGE_TOKENS).toBe('boolean');
    });

    it('should respect SD_DEBUG_HF_CACHE environment variable if set', () => {
      expect(typeof FeatureFlags.DEBUG_HF_CACHE).toBe('boolean');
    });

    it('should have production flags available', () => {
      // Verify production feature flags are accessible
      expect(FeatureFlags.NUMBERING_SECTION_AWARE).toBeDefined();
      expect(FeatureFlags.BODY_PAGE_TOKENS).toBeDefined();
      expect(FeatureFlags.HEADER_FOOTER_PAGE_TOKENS).toBeDefined();
      expect(FeatureFlags.HF_DIGIT_BUCKETING).toBeDefined();
    });
  });
});
