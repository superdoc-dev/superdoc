import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Telemetry, COMMUNITY_LICENSE_KEY } from '@superdoc/common';

// Mock the Telemetry class to verify it's called correctly
vi.mock('@superdoc/common', () => ({
  Telemetry: vi.fn().mockImplementation(() => ({
    trackDocumentOpen: vi.fn(),
  })),
  COMMUNITY_LICENSE_KEY: 'community-and-eval-agplv3',
}));

// Test the telemetry initialization logic in isolation
// This mirrors the #initTelemetry method in Editor.ts
function initTelemetry(options: {
  telemetry?: {
    enabled: boolean;
    endpoint?: string;
    metadata?: Record<string, unknown>;
    licenseKey?: string | null;
  } | null;
  licenseKey?: string;
  mode?: string;
  isHeaderOrFooter?: boolean;
}): Telemetry | null {
  const { telemetry: telemetryConfig, licenseKey } = options;

  // Skip for sub-editors that are not primary document editors
  if (options.mode === 'text' || options.isHeaderOrFooter) {
    return null;
  }

  // Skip if telemetry is not enabled
  if (!telemetryConfig?.enabled) {
    return null;
  }

  // Root-level licenseKey has a priority; fall back to deprecated telemetry.licenseKey
  const resolvedLicenseKey =
    licenseKey !== undefined ? licenseKey : (telemetryConfig.licenseKey ?? COMMUNITY_LICENSE_KEY);

  try {
    return new Telemetry({
      enabled: true,
      endpoint: telemetryConfig.endpoint,
      licenseKey: resolvedLicenseKey,
      metadata: telemetryConfig.metadata,
    });
  } catch {
    // Fail silently - telemetry should never break the app
    return null;
  }
}

describe('Editor Telemetry Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('telemetry disabled', () => {
    it('does not create Telemetry instance when disabled', () => {
      const result = initTelemetry({
        telemetry: { enabled: false },
        licenseKey: 'test-key',
      });

      expect(result).toBeNull();
      expect(Telemetry).not.toHaveBeenCalled();
    });

    it('does not create Telemetry instance when telemetry config is null', () => {
      const result = initTelemetry({
        telemetry: null,
        licenseKey: 'test-key',
      });

      expect(result).toBeNull();
      expect(Telemetry).not.toHaveBeenCalled();
    });

    it('does not create Telemetry instance when telemetry config is undefined', () => {
      const result = initTelemetry({
        licenseKey: 'test-key',
      });

      expect(result).toBeNull();
      expect(Telemetry).not.toHaveBeenCalled();
    });
  });

  describe('sub-editor skipping', () => {
    it('skips telemetry for text mode editors', () => {
      const result = initTelemetry({
        telemetry: { enabled: true },
        licenseKey: 'test-key',
        mode: 'text',
      });

      expect(result).toBeNull();
      expect(Telemetry).not.toHaveBeenCalled();
    });

    it('skips telemetry for header/footer editors', () => {
      const result = initTelemetry({
        telemetry: { enabled: true },
        licenseKey: 'test-key',
        isHeaderOrFooter: true,
      });

      expect(result).toBeNull();
      expect(Telemetry).not.toHaveBeenCalled();
    });

    it('allows telemetry for docx mode editors', () => {
      const result = initTelemetry({
        telemetry: { enabled: true },
        licenseKey: 'test-key',
        mode: 'docx',
      });

      expect(result).not.toBeNull();
      expect(Telemetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('telemetry enabled', () => {
    it('creates Telemetry instance when enabled', () => {
      const result = initTelemetry({
        telemetry: { enabled: true },
        licenseKey: 'test-key',
      });

      expect(result).not.toBeNull();
      expect(Telemetry).toHaveBeenCalledTimes(1);
      expect(Telemetry).toHaveBeenCalledWith({
        enabled: true,
        endpoint: undefined,
        licenseKey: 'test-key',
        metadata: undefined,
      });
    });
  });

  describe('license key handling', () => {
    it('uses COMMUNITY_LICENSE_KEY when licenseKey not provided', () => {
      const result = initTelemetry({
        telemetry: { enabled: true },
      });

      expect(result).not.toBeNull();
      expect(Telemetry).toHaveBeenCalledTimes(1);
      expect(Telemetry).toHaveBeenCalledWith({
        enabled: true,
        endpoint: undefined,
        licenseKey: 'community-and-eval-agplv3',
        metadata: undefined,
      });
    });

    it('passes custom license key when provided', () => {
      const customKey = 'my-custom-license-key';
      const result = initTelemetry({
        telemetry: { enabled: true },
        licenseKey: customKey,
      });

      expect(result).not.toBeNull();
      expect(Telemetry).toHaveBeenCalledWith({
        enabled: true,
        endpoint: undefined,
        licenseKey: customKey,
        metadata: undefined,
      });
    });
  });

  describe('deprecated telemetry.licenseKey', () => {
    it('uses telemetry.licenseKey when root licenseKey is not provided', () => {
      const result = initTelemetry({
        telemetry: { enabled: true, licenseKey: 'deprecated-key' },
      });

      expect(result).not.toBeNull();
      expect(Telemetry).toHaveBeenCalledWith({
        enabled: true,
        endpoint: undefined,
        licenseKey: 'deprecated-key',
        metadata: undefined,
      });
    });

    it('root licenseKey wins over telemetry.licenseKey', () => {
      const result = initTelemetry({
        telemetry: { enabled: true, licenseKey: 'deprecated-key' },
        licenseKey: 'root-key',
      });

      expect(result).not.toBeNull();
      expect(Telemetry).toHaveBeenCalledWith({
        enabled: true,
        endpoint: undefined,
        licenseKey: 'root-key',
        metadata: undefined,
      });
    });

    it('falls back to COMMUNITY_LICENSE_KEY when both are absent', () => {
      const result = initTelemetry({
        telemetry: { enabled: true },
      });

      expect(result).not.toBeNull();
      expect(Telemetry).toHaveBeenCalledWith({
        enabled: true,
        endpoint: undefined,
        licenseKey: 'community-and-eval-agplv3',
        metadata: undefined,
      });
    });
  });

  describe('telemetry with custom endpoint', () => {
    it('passes custom endpoint to Telemetry', () => {
      const customEndpoint = 'https://custom.telemetry.com/v1/events';
      const result = initTelemetry({
        telemetry: { enabled: true, endpoint: customEndpoint },
        licenseKey: 'test-key',
      });

      expect(result).not.toBeNull();
      expect(Telemetry).toHaveBeenCalledWith({
        enabled: true,
        endpoint: customEndpoint,
        licenseKey: 'test-key',
        metadata: undefined,
      });
    });
  });

  describe('telemetry with metadata', () => {
    it('passes metadata to Telemetry', () => {
      const metadata = {
        customerId: 'customer-123',
        plan: 'enterprise',
      };
      const result = initTelemetry({
        telemetry: { enabled: true, metadata },
        licenseKey: 'test-key',
      });

      expect(result).not.toBeNull();
      expect(Telemetry).toHaveBeenCalledWith({
        enabled: true,
        endpoint: undefined,
        licenseKey: 'test-key',
        metadata,
      });
    });

    it('passes nested metadata to Telemetry', () => {
      const metadata = {
        customerId: 'customer-123',
        nested: { key: 'value', deep: { level: 2 } },
      };
      const result = initTelemetry({
        telemetry: { enabled: true, metadata },
        licenseKey: 'test-key',
      });

      expect(result).not.toBeNull();
      expect(Telemetry).toHaveBeenCalledWith({
        enabled: true,
        endpoint: undefined,
        licenseKey: 'test-key',
        metadata,
      });
    });
  });

  describe('full configuration', () => {
    it('passes all config options to Telemetry', () => {
      const config = {
        telemetry: {
          enabled: true,
          endpoint: 'https://custom.endpoint.com/collect',
          metadata: { customerId: 'abc', env: 'production' },
        },
        licenseKey: 'license-key-123',
      };

      const result = initTelemetry(config);

      expect(result).not.toBeNull();
      expect(Telemetry).toHaveBeenCalledWith({
        enabled: true,
        endpoint: 'https://custom.endpoint.com/collect',
        licenseKey: 'license-key-123',
        metadata: { customerId: 'abc', env: 'production' },
      });
    });
  });
});
