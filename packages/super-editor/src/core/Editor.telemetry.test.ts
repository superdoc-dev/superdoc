import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Telemetry } from '@superdoc/common';
import { Editor } from './Editor.js';

// Mock the Telemetry class to verify it's called correctly
vi.mock('@superdoc/common', () => ({
  Telemetry: vi.fn().mockImplementation(() => ({
    trackDocumentOpen: vi.fn(),
    isEnabled: vi.fn().mockReturnValue(true),
    disable: vi.fn(),
    enable: vi.fn(),
  })),
}));

// Test the telemetry initialization logic in isolation
// This mirrors the #initTelemetry method in Editor.ts
function initTelemetry(options: {
  telemetry?: { enabled: boolean; endpoint?: string; metadata?: Record<string, unknown> } | null;
  licenseKey?: string;
}): Telemetry | null {
  // Use default license key if not provided (mirrors Editor.options default)
  const licenseKey = options.licenseKey ?? Editor.COMMUNITY_LICENSE_KEY;
  const { telemetry: telemetryConfig } = options;

  // Skip if telemetry is not enabled
  if (!telemetryConfig?.enabled) {
    return null;
  }

  try {
    return new Telemetry({
      config: {
        enabled: true,
        endpoint: telemetryConfig.endpoint,
        licenseKey,
        metadata: telemetryConfig.metadata,
      },
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

  describe('telemetry enabled', () => {
    it('creates Telemetry instance when enabled', () => {
      const result = initTelemetry({
        telemetry: { enabled: true },
        licenseKey: 'test-key',
      });

      expect(result).not.toBeNull();
      expect(Telemetry).toHaveBeenCalledTimes(1);
      expect(Telemetry).toHaveBeenCalledWith({
        config: {
          enabled: true,
          endpoint: undefined,
          licenseKey: 'test-key',
          metadata: undefined,
        },
      });
    });
  });

  describe('default license key', () => {
    it('uses default community license key when licenseKey is not provided', () => {
      const result = initTelemetry({
        telemetry: { enabled: true },
      });

      expect(result).not.toBeNull();
      expect(Telemetry).toHaveBeenCalledTimes(1);
      expect(Telemetry).toHaveBeenCalledWith({
        config: {
          enabled: true,
          endpoint: undefined,
          licenseKey: Editor.COMMUNITY_LICENSE_KEY,
          metadata: undefined,
        },
      });
    });

    it('uses default community license key value "community-and-eval-agplv3"', () => {
      expect(Editor.COMMUNITY_LICENSE_KEY).toBe('community-and-eval-agplv3');
    });

    it('overrides default license key when custom key is provided', () => {
      const customKey = 'my-custom-license-key';
      const result = initTelemetry({
        telemetry: { enabled: true },
        licenseKey: customKey,
      });

      expect(result).not.toBeNull();
      expect(Telemetry).toHaveBeenCalledWith({
        config: {
          enabled: true,
          endpoint: undefined,
          licenseKey: customKey,
          metadata: undefined,
        },
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
        config: {
          enabled: true,
          endpoint: customEndpoint,
          licenseKey: 'test-key',
          metadata: undefined,
        },
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
        config: {
          enabled: true,
          endpoint: undefined,
          licenseKey: 'test-key',
          metadata,
        },
      });
    });

    it('passes nested metadata to Telemetry', () => {
      const metadata = {
        customerId: 'customer-123',
        nested: { key: 'value', deep: { level: 2 } },
      };
      const result = initTelemetry({
        telemetry: { enabled: true, metadata },
      });

      expect(result).not.toBeNull();
      expect(Telemetry).toHaveBeenCalledWith({
        config: {
          enabled: true,
          endpoint: undefined,
          licenseKey: Editor.COMMUNITY_LICENSE_KEY,
          metadata,
        },
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
        config: {
          enabled: true,
          endpoint: 'https://custom.endpoint.com/collect',
          licenseKey: 'license-key-123',
          metadata: { customerId: 'abc', env: 'production' },
        },
      });
    });
  });
});
