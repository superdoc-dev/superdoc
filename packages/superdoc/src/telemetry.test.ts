import { describe, it, expect } from 'vitest';

// Test the telemetry config transformation logic used in SuperDoc.vue
// This mirrors the getEditorOptions function's telemetry handling
function transformTelemetryConfig(superdocConfig: {
  telemetry?: {
    enabled?: boolean;
    endpoint?: string;
    metadata?: Record<string, unknown>;
    licenseKey?: string | null;
  } | null;
  licenseKey?: string | null;
}): {
  telemetry: {
    enabled: boolean;
    endpoint?: string;
    metadata?: Record<string, unknown>;
    licenseKey?: string | null;
  } | null;
  licenseKey?: string | null;
} {
  return {
    licenseKey: superdocConfig.licenseKey,
    telemetry: superdocConfig.telemetry?.enabled
      ? {
          enabled: true,
          endpoint: superdocConfig.telemetry?.endpoint,
          metadata: superdocConfig.telemetry?.metadata,
          licenseKey: superdocConfig.telemetry?.licenseKey,
        }
      : null,
  };
}

describe('SuperDoc Telemetry Configuration', () => {
  describe('telemetry disabled', () => {
    it('returns null telemetry when not enabled', () => {
      const result = transformTelemetryConfig({
        telemetry: { enabled: false },
        licenseKey: 'test-key',
      });

      expect(result.telemetry).toBeNull();
      expect(result.licenseKey).toBe('test-key');
    });

    it('returns null telemetry when telemetry config is undefined', () => {
      const result = transformTelemetryConfig({
        licenseKey: 'test-key',
      });

      expect(result.telemetry).toBeNull();
    });

    it('returns null telemetry when telemetry config is null', () => {
      const result = transformTelemetryConfig({
        telemetry: null,
        licenseKey: 'test-key',
      });

      expect(result.telemetry).toBeNull();
    });
  });

  describe('telemetry enabled', () => {
    it('returns enabled telemetry config', () => {
      const result = transformTelemetryConfig({
        telemetry: { enabled: true },
        licenseKey: 'test-key',
      });

      expect(result.telemetry).toEqual({
        enabled: true,
        endpoint: undefined,
        metadata: undefined,
      });
      expect(result.licenseKey).toBe('test-key');
    });
  });

  describe('telemetry without license key', () => {
    it('sends telemetry without license key', () => {
      const result = transformTelemetryConfig({
        telemetry: { enabled: true },
      });

      expect(result.telemetry).toEqual({
        enabled: true,
        endpoint: undefined,
        metadata: undefined,
      });
      expect(result.licenseKey).toBeUndefined();
    });

    it('handles null license key', () => {
      const result = transformTelemetryConfig({
        telemetry: { enabled: true },
        licenseKey: null,
      });

      expect(result.telemetry?.enabled).toBe(true);
      expect(result.licenseKey).toBeNull();
    });
  });

  describe('telemetry with custom endpoint', () => {
    it('passes custom endpoint', () => {
      const customEndpoint = 'https://custom.telemetry.com/v1/events';
      const result = transformTelemetryConfig({
        telemetry: { enabled: true, endpoint: customEndpoint },
      });

      expect(result.telemetry).toEqual({
        enabled: true,
        endpoint: customEndpoint,
        metadata: undefined,
      });
    });
  });

  describe('telemetry with metadata', () => {
    it('passes metadata to editor config', () => {
      const metadata = {
        customerId: 'customer-123',
        plan: 'enterprise',
      };
      const result = transformTelemetryConfig({
        telemetry: { enabled: true, metadata },
      });

      expect(result.telemetry).toEqual({
        enabled: true,
        endpoint: undefined,
        metadata,
      });
    });

    it('passes complex nested metadata', () => {
      const metadata = {
        customerId: 'customer-123',
        settings: {
          theme: 'dark',
          features: ['a', 'b', 'c'],
        },
      };
      const result = transformTelemetryConfig({
        telemetry: { enabled: true, metadata },
      });

      expect(result.telemetry?.metadata).toEqual(metadata);
    });
  });

  describe('deprecated telemetry.licenseKey passthrough', () => {
    it('passes deprecated telemetry.licenseKey to editor config', () => {
      const result = transformTelemetryConfig({
        telemetry: { enabled: true, licenseKey: 'deprecated-key' },
      });

      expect(result.telemetry).toEqual({
        enabled: true,
        endpoint: undefined,
        metadata: undefined,
        licenseKey: 'deprecated-key',
      });
    });

    it('passes both root licenseKey and deprecated telemetry.licenseKey', () => {
      const result = transformTelemetryConfig({
        telemetry: { enabled: true, licenseKey: 'deprecated-key' },
        licenseKey: 'root-key',
      });

      expect(result.licenseKey).toBe('root-key');
      expect(result.telemetry?.licenseKey).toBe('deprecated-key');
    });
  });

  describe('full configuration flow', () => {
    it('transforms complete SuperDoc config to Editor config', () => {
      const superdocConfig = {
        telemetry: {
          enabled: true,
          endpoint: 'https://api.example.com/telemetry',
          metadata: {
            customerId: 'cust-456',
            environment: 'production',
          },
        },
        licenseKey: 'lic-789',
      };

      const result = transformTelemetryConfig(superdocConfig);

      expect(result).toEqual({
        licenseKey: 'lic-789',
        telemetry: {
          enabled: true,
          endpoint: 'https://api.example.com/telemetry',
          metadata: {
            customerId: 'cust-456',
            environment: 'production',
          },
        },
      });
    });
  });
});
