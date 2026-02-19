import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isAIProvider,
  createAIProvider,
  createHttpProvider,
  createOpenAIProvider,
  createAnthropicProvider,
  type HttpProviderConfig,
  type OpenAIProviderConfig,
  type AnthropicProviderConfig,
} from '../../providers';
import type { AIProvider, AIMessage } from '../../../shared/types';

describe('providers', () => {
  describe('isAIProvider', () => {
    it('should return true for valid provider', () => {
      const provider: AIProvider = {
        async *streamCompletion() {
          yield 'test';
        },
        async getCompletion() {
          return 'test';
        },
      };
      expect(isAIProvider(provider)).toBe(true);
    });

    it('should return false for object without required methods', () => {
      expect(isAIProvider({})).toBe(false);
      expect(
        isAIProvider({
          getCompletion: () => {
            // Mock implementation
          },
        }),
      ).toBe(false);
      expect(
        isAIProvider({
          streamCompletion: () => {
            // Mock implementation
          },
        }),
      ).toBe(false);
    });

    it('should return false for non-objects', () => {
      expect(isAIProvider(null)).toBe(false);
      expect(isAIProvider(undefined)).toBe(false);
      expect(isAIProvider('string')).toBe(false);
      expect(isAIProvider(123)).toBe(false);
    });
  });

  describe('createAIProvider', () => {
    it('should return the provider if already an AIProvider', () => {
      const provider: AIProvider = {
        async *streamCompletion() {
          yield 'test';
        },
        async getCompletion() {
          return 'test';
        },
      };
      expect(createAIProvider(provider)).toBe(provider);
    });

    it('should create OpenAI provider from config', () => {
      const config: OpenAIProviderConfig = {
        type: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      };
      const provider = createAIProvider(config);
      expect(provider).toBeDefined();
      expect(provider.getCompletion).toBeDefined();
      expect(provider.streamCompletion).toBeDefined();
    });

    it('should create Anthropic provider from config', () => {
      const config: AnthropicProviderConfig = {
        type: 'anthropic',
        apiKey: 'test-key',
        model: 'claude-3-opus-20240229',
      };
      const provider = createAIProvider(config);
      expect(provider).toBeDefined();
      expect(provider.getCompletion).toBeDefined();
      expect(provider.streamCompletion).toBeDefined();
    });

    it('should create HTTP provider from config', () => {
      const config: HttpProviderConfig = {
        type: 'http',
        url: 'https://example.com/api',
        streamResults: true,
      };
      const provider = createAIProvider(config);
      expect(provider).toBeDefined();
      expect(provider.getCompletion).toBeDefined();
      expect(provider.streamCompletion).toBeDefined();
      expect(provider.streamResults).toBe(true);
    });

    it('should throw for unsupported provider type', () => {
      const config = { type: 'unsupported' } as unknown as HttpProviderConfig;
      expect(() => createAIProvider(config)).toThrow('Unsupported provider type');
    });
  });

  describe('createHttpProvider', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
    });

    it('should make POST request with correct body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ choices: [{ message: { content: 'response' } }] }),
      });

      const config: HttpProviderConfig = {
        type: 'http',
        url: 'https://example.com/api',
        fetch: mockFetch,
      };

      const provider = createHttpProvider(config);
      const messages: AIMessage[] = [{ role: 'user', content: 'test' }];

      await provider.getCompletion(messages);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('"messages"'),
        }),
      );
    });

    it('should handle custom headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ choices: [{ message: { content: 'response' } }] }),
      });

      const config: HttpProviderConfig = {
        type: 'http',
        url: 'https://example.com/api',
        headers: { 'X-Custom-Header': 'value' },
        fetch: mockFetch,
      };

      const provider = createHttpProvider(config);
      await provider.getCompletion([{ role: 'user', content: 'test' }]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'value',
          }),
        }),
      );
    });

    it('should throw on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Error details',
      });

      const config: HttpProviderConfig = {
        type: 'http',
        url: 'https://example.com/api',
        fetch: mockFetch,
      };

      const provider = createHttpProvider(config);

      await expect(provider.getCompletion([{ role: 'user', content: 'test' }])).rejects.toThrow(
        'AI provider request failed with status 500',
      );
    });

    it('should handle streaming with streamUrl', async () => {
      const mockBody = {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'),
            })
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('data: [DONE]\n\n'),
            })
            .mockResolvedValueOnce({ done: true }),
          releaseLock: vi.fn(),
        }),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        body: mockBody,
        headers: { get: () => null },
      });

      const config: HttpProviderConfig = {
        type: 'http',
        url: 'https://example.com/api',
        streamUrl: 'https://example.com/stream',
        fetch: mockFetch,
      };

      const provider = createHttpProvider(config);
      const chunks: string[] = [];

      for await (const chunk of provider.streamCompletion([{ role: 'user', content: 'test' }])) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/stream', expect.any(Object));
    });

    it('should use custom buildRequestBody if provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ result: 'custom' }),
      });

      const customBuilder = vi.fn().mockReturnValue({ custom: 'body' });

      const config: HttpProviderConfig = {
        type: 'http',
        url: 'https://example.com/api',
        buildRequestBody: customBuilder,
        fetch: mockFetch,
      };

      const provider = createHttpProvider(config);
      await provider.getCompletion([{ role: 'user', content: 'test' }]);

      expect(customBuilder).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ custom: 'body' }),
        }),
      );
    });

    it('should inject stream flag when using custom buildRequestBody with streaming enabled', async () => {
      const mockBody = {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'),
            })
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('data: [DONE]\n\n'),
            })
            .mockResolvedValueOnce({ done: true }),
          releaseLock: vi.fn(),
        }),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        body: mockBody,
        headers: { get: () => null },
      });

      const customBuilder = vi.fn().mockReturnValue({ custom: 'payload' });

      const config: HttpProviderConfig = {
        type: 'http',
        url: 'https://example.com/api',
        streamUrl: 'https://example.com/stream',
        buildRequestBody: customBuilder,
        streamResults: true,
        fetch: mockFetch,
      };

      const provider = createHttpProvider(config);
      const chunks: string[] = [];

      for await (const chunk of provider.streamCompletion([{ role: 'user', content: 'test' }])) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(customBuilder).toHaveBeenCalledWith(expect.objectContaining({ stream: true }));
      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://example.com/stream',
        expect.objectContaining({
          body: JSON.stringify({ custom: 'payload', stream: true }),
        }),
      );
    });
  });

  describe('createOpenAIProvider', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
    });

    it('should add Authorization header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ choices: [{ message: { content: 'response' } }] }),
      });

      const config: OpenAIProviderConfig = {
        type: 'openai',
        apiKey: 'sk-test-key',
        model: 'gpt-4',
        fetch: mockFetch,
      };

      const provider = createOpenAIProvider(config);
      await provider.getCompletion([{ role: 'user', content: 'test' }]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-test-key',
          }),
        }),
      );
    });

    it('should use custom baseURL if provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ choices: [{ message: { content: 'response' } }] }),
      });

      const config: OpenAIProviderConfig = {
        type: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
        baseURL: 'https://custom.openai.com/v1',
        fetch: mockFetch,
      };

      const provider = createOpenAIProvider(config);
      await provider.getCompletion([{ role: 'user', content: 'test' }]);

      expect(mockFetch).toHaveBeenCalledWith('https://custom.openai.com/v1/chat/completions', expect.any(Object));
    });

    it('should include organizationId if provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ choices: [{ message: { content: 'response' } }] }),
      });

      const config: OpenAIProviderConfig = {
        type: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
        organizationId: 'org-123',
        fetch: mockFetch,
      };

      const provider = createOpenAIProvider(config);
      await provider.getCompletion([{ role: 'user', content: 'test' }]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'OpenAI-Organization': 'org-123',
          }),
        }),
      );
    });

    it('should include model in request body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ choices: [{ message: { content: 'response' } }] }),
      });

      const config: OpenAIProviderConfig = {
        type: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4-turbo',
        fetch: mockFetch,
        streamResults: true,
      };

      const provider = createOpenAIProvider(config);
      await provider.getCompletion([{ role: 'user', content: 'test' }]);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.model).toBe('gpt-4-turbo');
      expect(provider.streamResults).toBe(true);
    });
  });

  describe('createAnthropicProvider', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
    });

    it('should add Anthropic-specific headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ content: [{ text: 'response' }] }),
      });

      const config: AnthropicProviderConfig = {
        type: 'anthropic',
        apiKey: 'sk-ant-test',
        model: 'claude-3-opus-20240229',
        fetch: mockFetch,
      };

      const provider = createAnthropicProvider(config);
      await provider.getCompletion([{ role: 'user', content: 'test' }]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'sk-ant-test',
            'anthropic-version': '2023-06-01',
          }),
        }),
      );
    });

    it('should convert system messages correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ content: [{ text: 'response' }] }),
      });

      const config: AnthropicProviderConfig = {
        type: 'anthropic',
        apiKey: 'test-key',
        model: 'claude-3-opus-20240229',
        fetch: mockFetch,
      };

      const provider = createAnthropicProvider(config);
      const messages: AIMessage[] = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ];

      await provider.getCompletion(messages);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.system).toBe('You are helpful');
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe('user');
    });

    it('should use custom apiVersion if provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ content: [{ text: 'response' }] }),
      });

      const config: AnthropicProviderConfig = {
        type: 'anthropic',
        apiKey: 'test-key',
        model: 'claude-3-opus-20240229',
        apiVersion: '2024-01-01',
        fetch: mockFetch,
      };

      const provider = createAnthropicProvider(config);
      await provider.getCompletion([{ role: 'user', content: 'test' }]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'anthropic-version': '2024-01-01',
          }),
        }),
      );
    });

    it('should set default maxTokens to 1024', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ content: [{ text: 'response' }] }),
      });

      const config: AnthropicProviderConfig = {
        type: 'anthropic',
        apiKey: 'test-key',
        model: 'claude-3-opus-20240229',
        fetch: mockFetch,
        streamResults: true,
      };

      const provider = createAnthropicProvider(config);
      await provider.getCompletion([{ role: 'user', content: 'test' }]);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.max_tokens).toBe(1024);
      expect(provider.streamResults).toBe(true);
    });
  });
});
