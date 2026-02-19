/**
 * Provider factories and adapter utilities that normalize different LLM backends
 * (OpenAI, Anthropic, bespoke HTTP endpoints, or pre-built provider instances)
 * into the shared `AIProvider` interface consumed by SuperDoc AI.
 *
 * Consumers typically pass a configuration object to `createAIProvider`; internally
 * we map that object to an implementation that exposes the two required methods:
 * `getCompletion` for single-turn requests and `streamCompletion` for incremental
 * responses.  Each helper below handles nuances such as request body shape,
 * authentication headers, and stream parsing for the corresponding provider.
 */
import type { AIMessage, AIProvider, CompletionOptions, StreamOptions } from '../../shared';
import { AnthropicProviderConfig, HttpProviderConfig, OpenAIProviderConfig, ProviderRequestContext } from './types';
import { extractTextFromBlock, parseResponsePayload, readStreamResponse, safeReadText } from './streaming';
import { cleanUndefined, ensureContentType, joinUrl, resolveFetch } from './utils';

/**
 * Factory for arbitrary HTTP-based backends. Useful for self-hosted gateways
 * or thin wrappers around vendor APIs. Callers may override how the request
 * body is constructed (`buildRequestBody`) and how responses / stream chunks
 * are parsed (`parseCompletion`, `parseStreamChunk`) to fit their protocol.
 *
 * @param config - HTTP provider configuration.
 * @returns An `AIProvider` backed by the specified HTTP endpoint.
 */
export function createHttpProvider(config: HttpProviderConfig): AIProvider {
  const {
    url,
    streamUrl,
    headers = {},
    method = 'POST',
    fetch: customFetch,
    buildRequestBody,
    parseCompletion = defaultParseCompletion,
    parseStreamChunk = defaultParseStreamChunk,
    temperature,
    maxTokens,
    stop,
    streamResults,
  } = config;

  const fetchImpl = resolveFetch(customFetch);

  const buildBody =
    buildRequestBody ??
    ((context: ProviderRequestContext) =>
      cleanUndefined({
        messages: context.messages,
        stream: context.options?.stream ?? context.stream ?? streamResults,
        temperature: context.options?.temperature ?? temperature,
        max_tokens: context.options?.maxTokens ?? maxTokens,
        stop: context.options?.stop ?? stop,
        model: context.options?.model,
        ...context.options?.providerOptions,
      }));

  /**
   * Internal helper to execute an HTTP request against the configured provider.
   *
   * @param targetUrl - URL that should receive the JSON payload.
   * @param context - Context containing the chat messages and invocation options.
   * @returns The raw `Response` instance from fetch.
   * @throws Error when the provider responds with a non-ok status.
   */
  async function requestJson(targetUrl: string, context: ProviderRequestContext) {
    const resolvedStream = context.options?.stream ?? context.stream ?? streamResults;
    const bodyPayload = buildBody(context);
    const shouldForceStream = Boolean(
      buildRequestBody &&
        resolvedStream &&
        bodyPayload &&
        typeof bodyPayload === 'object' &&
        !Array.isArray(bodyPayload) &&
        !('stream' in bodyPayload),
    );
    const finalPayload = shouldForceStream ? { ...bodyPayload, stream: true } : bodyPayload;
    const response = await fetchImpl(targetUrl, {
      method,
      headers: ensureContentType(headers),
      body: JSON.stringify(finalPayload),
      signal: context.options?.signal,
    });

    if (!response.ok) {
      const errorText = await safeReadText(response);
      throw new Error(
        `AI provider request failed with status ${response.status} (${response.statusText}): ${errorText}`,
      );
    }

    return response;
  }

  return {
    streamResults,
    async *streamCompletion(messages: AIMessage[], options?: StreamOptions) {
      const target = streamUrl ?? url;

      if (!target) {
        const fullResult = await this.getCompletion(messages, options);
        if (fullResult) {
          yield fullResult;
        }
        return;
      }

      const response = await requestJson(target, { messages, stream: true, options });
      yield* readStreamResponse(response, parseStreamChunk, parseCompletion);
    },

    async getCompletion(messages: AIMessage[], options?: CompletionOptions): Promise<string> {
      const response = await requestJson(url, { messages, stream: false, options });
      return parseResponsePayload(response, parseCompletion);
    },
  };
}

/**
 * Convenience wrapper around the OpenAI Chat Completions API. Translates the
 * generic `AIProvider` contract into the expected OpenAI request shape, applies
 * auth headers, and reuses the streaming helpers defined in this module.
 *
 * @param config - OpenAI provider configuration.
 * @returns An `AIProvider` targeting OpenAI's chat completions endpoint.
 */
export function createOpenAIProvider(config: OpenAIProviderConfig): AIProvider {
  const {
    apiKey,
    baseURL = 'https://api.openai.com/v1',
    model,
    organizationId,
    headers,
    completionPath = '/chat/completions',
    requestOptions,
    fetch: customFetch,
    temperature,
    maxTokens,
    stop,
    streamResults,
  } = config;

  const url = joinUrl(baseURL, completionPath);
  const baseHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    ...(organizationId ? { 'OpenAI-Organization': organizationId } : {}),
    ...headers,
  };

  return createHttpProvider({
    type: 'http',
    url,
    streamUrl: url,
    headers: baseHeaders,
    fetch: customFetch,
    temperature,
    maxTokens,
    stop,
    streamResults,
    buildRequestBody: ({ messages, stream: contextStream, options }) =>
      cleanUndefined({
        model: options?.model ?? model,
        temperature: options?.temperature ?? temperature,
        max_tokens: options?.maxTokens ?? maxTokens,
        stop: options?.stop ?? stop,
        stream: options?.stream ?? contextStream ?? streamResults,
        messages,
        ...requestOptions,
        ...options?.providerOptions,
      }),
    parseCompletion: parseOpenAICompletion,
    parseStreamChunk: parseOpenAIStreamChunk,
  });
}

/**
 * Convenience wrapper for Anthropic Messages API (Claude). Handles conversion
 * from the SuperDoc chat message format to Anthropic's `system` and `messages`
 * structure and unifies streaming behaviour with the rest of the providers.
 *
 * @param config - Anthropic provider configuration.
 * @returns An `AIProvider` targeting Anthropic's messages endpoint.
 */
export function createAnthropicProvider(config: AnthropicProviderConfig): AIProvider {
  const {
    apiKey,
    baseURL = 'https://api.anthropic.com',
    apiVersion = '2023-06-01',
    model,
    headers,
    requestOptions,
    fetch: customFetch,
    temperature,
    maxTokens = 1024,
    stop,
    streamResults,
  } = config;

  const url = joinUrl(baseURL, '/v1/messages');
  const baseHeaders = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': apiVersion,
    ...headers,
  };

  return createHttpProvider({
    type: 'http',
    url,
    streamUrl: url,
    headers: baseHeaders,
    fetch: customFetch,
    temperature,
    maxTokens,
    stop,
    streamResults,
    buildRequestBody: ({ messages, stream: contextStream, options }) => {
      const { system, anthropicMessages } = convertToAnthropicMessages(messages);
      return cleanUndefined({
        model: options?.model ?? model,
        temperature: options?.temperature ?? temperature,
        max_tokens: options?.maxTokens ?? maxTokens,
        stop_sequences: options?.stop ?? stop,
        stream: options?.stream ?? contextStream ?? streamResults,
        system,
        messages: anthropicMessages,
        ...requestOptions,
        ...options?.providerOptions,
      });
    },
    parseCompletion: parseAnthropicCompletion,
    parseStreamChunk: parseAnthropicStreamChunk,
  });
}

/**
 * Fallback completion parser capable of handling several common payload shapes
 * (OpenAI-style choices, Anthropic content blocks, or raw strings).
 *
 * @param payload - Provider response payload.
 * @returns Extracted text content suitable for callers.
 */
function defaultParseCompletion(payload: any): string {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';

  // OpenAI format: choices[0].message.content or choices[0].text
  const choice = payload.choices?.[0];
  if (choice) {
    if (choice.message?.content) return choice.message.content;
    if (choice.text) return choice.text;
  }

  // Anthropic format: content (string or array)
  const { content } = payload;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.flatMap((block) => extractTextFromBlock(block)).join('');
  }

  return JSON.stringify(payload);
}

/**
 * Specialized completion parser for OpenAI chat responses.
 * Handles both string content and content-part arrays (GPT-4o default).
 *
 * @param payload - Raw OpenAI JSON payload.
 * @returns Message content or the default parsing result.
 */
function parseOpenAICompletion(payload: any): string {
  const message = payload?.choices?.[0]?.message;
  if (!message) return defaultParseCompletion(payload);

  const content = message.content;

  // Handle content-part arrays (GPT-4o, JSON mode, multimodal)
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && part.type === 'text' && part.text) {
          return part.text;
        }
        return '';
      })
      .join('');
  }

  // Handle string content (legacy format)
  if (typeof content === 'string') {
    return content;
  }

  return defaultParseCompletion(payload);
}

/**
 * Extracts incremental content from OpenAI stream delta payloads.
 * Handles both delta.content strings and delta.content content-part arrays.
 *
 * @param payload - Stream event payload.
 * @returns Concatenated chunk text or undefined when no content is present.
 */
function parseOpenAIStreamChunk(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  if ('choices' in payload && Array.isArray(payload?.choices)) {
    const choices = payload?.choices;
    return choices
      .map((choice: unknown) => {
        if (!choice || typeof choice !== 'object') return '';
        const choiceObj = choice as { delta?: { content?: unknown; text?: unknown } };
        const delta = choiceObj.delta;
        if (!delta) return '';

        const content = delta.content ?? delta.text;

        // Handle content-part arrays in streaming
        if (Array.isArray(content)) {
          return content
            .map((part) => {
              if (typeof part === 'string') return part;
              if (
                part &&
                typeof part === 'object' &&
                'type' in part &&
                part.type === 'text' &&
                'text' in part &&
                typeof part.text === 'string'
              ) {
                return part.text;
              }
              return '';
            })
            .join('');
        }

        // Handle string content
        return typeof content === 'string' ? content : '';
      })
      .join('');
  }

  return undefined;
}

/**
 * Converts the SuperDoc message format into Anthropic's `system` and `messages`
 * structure required by the Claude Messages API.
 *
 * @param messages - Chat messages supplied by SuperDoc.
 * @returns Object containing an optional system string and Anthropic-formatted messages.
 */
function convertToAnthropicMessages(messages: AIMessage[]) {
  const anthropicMessages = [];
  const systemMessages: string[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      systemMessages.push(message.content);
      continue;
    }
    anthropicMessages.push({
      role: message.role,
      content: [{ type: 'text', text: message.content }],
    });
  }

  return {
    system: systemMessages.length ? systemMessages.join('\n') : undefined,
    anthropicMessages,
  };
}

/**
 * Extracts text content from Anthropic completion payloads.
 *
 * @param payload - Raw Anthropic JSON payload.
 * @returns Parsed text content, falling back to the default parser when needed.
 */
function parseAnthropicCompletion(payload: any): string {
  if (!Array.isArray(payload?.content)) {
    return defaultParseCompletion(payload);
  }

  return payload.content.flatMap((block: unknown) => extractTextFromBlock(block)).join('');
}

/**
 * Extracts incremental text from Anthropic streaming events.
 *
 * @param payload - Stream event payload emitted by Anthropic.
 * @returns Text chunk when available, otherwise undefined.
 */
function parseAnthropicStreamChunk(payload: any): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  if ((payload.type === 'content_block_delta' || payload.type === 'message_delta') && payload.delta?.text) {
    return payload.delta.text;
  }

  if (payload.type === 'message_start' && payload.message) {
    return parseAnthropicCompletion(payload.message);
  }

  return undefined;
}

/**
 * Generic stream chunk parser that attempts OpenAI parsing first and then falls
 * back to Anthropic-specific parsing.
 *
 * @param payload - Stream event payload.
 * @returns Parsed chunk text or undefined when nothing could be extracted.
 */
function defaultParseStreamChunk(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  return parseOpenAIStreamChunk(payload) ?? parseAnthropicStreamChunk(payload);
}
