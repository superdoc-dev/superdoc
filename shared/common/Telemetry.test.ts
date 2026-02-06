import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Telemetry, TelemetryConfig, TelemetryPayload } from './Telemetry';

describe('Telemetry', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  const testConfig: TelemetryConfig = {
    enabled: true,
    endpoint: 'https://test.example.com/collect',
    licenseKey: 'test-license-key',
  };

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('telemetry disabled', () => {
    it('does not send telemetry when disabled', async () => {
      const telemetry = new Telemetry({ ...testConfig, enabled: false });
      telemetry.trackDocumentOpen('doc-123');

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('telemetry enabled', () => {
    it('sends telemetry when enabled', async () => {
      const telemetry = new Telemetry(testConfig);
      telemetry.trackDocumentOpen('doc-123', '2024-01-15T10:30:00Z');

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        testConfig.endpoint,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-License-Key': testConfig.licenseKey,
          },
        }),
      );

      const callArgs = fetchSpy.mock.calls[0];
      const payload: TelemetryPayload = JSON.parse(callArgs[1]?.body as string);

      expect(payload.superdocVersion).toBeDefined();
      expect(payload.browserInfo).toBeDefined();
      expect(payload.events).toHaveLength(1);
      expect(payload.events[0].documentId).toBe('doc-123');
      expect(payload.events[0].documentCreatedAt).toBe('2024-01-15T10:30:00Z');
      expect(payload.events[0].timestamp).toBeDefined();
    });
  });

  describe('telemetry without license key', () => {
    it('sends telemetry when enabled without license key', async () => {
      const telemetry = new Telemetry({ enabled: true, endpoint: 'https://test.example.com/collect' });
      telemetry.trackDocumentOpen('doc-123');

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://test.example.com/collect',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-License-Key': '',
          },
        }),
      );
    });
  });

  describe('telemetry without document id', () => {
    it('sends telemetry with null documentId', async () => {
      const telemetry = new Telemetry(testConfig);
      telemetry.trackDocumentOpen(null, null);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const callArgs = fetchSpy.mock.calls[0];
      const payload: TelemetryPayload = JSON.parse(callArgs[1]?.body as string);
      expect(payload.events[0].documentId).toBeNull();
      expect(payload.events[0].documentCreatedAt).toBeNull();
    });

    it('sends telemetry with documentId but no documentCreatedAt', async () => {
      const telemetry = new Telemetry(testConfig);
      telemetry.trackDocumentOpen('doc-456');

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const callArgs = fetchSpy.mock.calls[0];
      const payload: TelemetryPayload = JSON.parse(callArgs[1]?.body as string);
      expect(payload.events[0].documentId).toBe('doc-456');
      expect(payload.events[0].documentCreatedAt).toBeNull();
    });
  });

  describe('telemetry with custom endpoint', () => {
    it('sends telemetry to custom endpoint when provided', async () => {
      const customEndpoint = 'https://custom.telemetry.com/v1/events';
      const telemetry = new Telemetry({ enabled: true, endpoint: customEndpoint });
      telemetry.trackDocumentOpen('doc-123');

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(customEndpoint, expect.objectContaining({ method: 'POST' }));
    });

    it('sends telemetry to default endpoint when not provided', async () => {
      const telemetry = new Telemetry({ enabled: true });
      telemetry.trackDocumentOpen('doc-123');

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://ingest.superdoc.dev/v1/collect',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('telemetry with metadata', () => {
    it('includes metadata at root level when provided', async () => {
      const configWithMetadata: TelemetryConfig = {
        ...testConfig,
        metadata: {
          customerId: 'customer-123',
          plan: 'enterprise',
          nested: { key: 'value' },
        },
      };
      const telemetry = new Telemetry(configWithMetadata);
      telemetry.trackDocumentOpen('doc-123');

      await new Promise((resolve) => setTimeout(resolve, 0));

      const callArgs = fetchSpy.mock.calls[0];
      const payload: TelemetryPayload = JSON.parse(callArgs[1]?.body as string);

      expect(payload.metadata).toBeDefined();
      expect(payload.metadata?.customerId).toBe('customer-123');
      expect(payload.metadata?.plan).toBe('enterprise');
      expect(payload.metadata?.nested).toEqual({ key: 'value' });
    });

    it('omits metadata from payload when not provided', async () => {
      const telemetry = new Telemetry(testConfig);
      telemetry.trackDocumentOpen('doc-123');

      await new Promise((resolve) => setTimeout(resolve, 0));

      const callArgs = fetchSpy.mock.calls[0];
      const payload: TelemetryPayload = JSON.parse(callArgs[1]?.body as string);

      expect(payload.metadata).toBeUndefined();
    });

    it('includes empty metadata object when provided as empty', async () => {
      const telemetry = new Telemetry({ ...testConfig, metadata: {} });
      telemetry.trackDocumentOpen('doc-123');

      await new Promise((resolve) => setTimeout(resolve, 0));

      const callArgs = fetchSpy.mock.calls[0];
      const payload: TelemetryPayload = JSON.parse(callArgs[1]?.body as string);

      expect(payload.metadata).toEqual({});
    });
  });

  describe('payload structure', () => {
    it('includes browser info at root level', async () => {
      const telemetry = new Telemetry(testConfig);
      telemetry.trackDocumentOpen('doc-123');

      await new Promise((resolve) => setTimeout(resolve, 0));

      const callArgs = fetchSpy.mock.calls[0];
      const payload: TelemetryPayload = JSON.parse(callArgs[1]?.body as string);

      expect(payload.browserInfo).toBeDefined();
      expect(payload.browserInfo.userAgent).toBeDefined();
      expect(payload.browserInfo.screenSize).toBeDefined();
    });

    it('includes superdocVersion at root level', async () => {
      const telemetry = new Telemetry(testConfig);
      telemetry.trackDocumentOpen('doc-123');

      await new Promise((resolve) => setTimeout(resolve, 0));

      const callArgs = fetchSpy.mock.calls[0];
      const payload: TelemetryPayload = JSON.parse(callArgs[1]?.body as string);

      expect(payload.superdocVersion).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('fails silently on fetch error', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      const telemetry = new Telemetry(testConfig);

      // Should not throw
      expect(() => telemetry.trackDocumentOpen('doc-123')).not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });
});
