/**
 * Provider factory functions
 * @module providers/factory
 */

import type { AIProvider } from '../../shared';
import type { AIProviderInput } from './types';
import { createOpenAIProvider, createAnthropicProvider, createHttpProvider } from './ai-providers';

/**
 * Type guard that determines whether a value already implements the `AIProvider`
 * contract (both `getCompletion` and `streamCompletion` functions).
 *
 * @param value - Candidate object to validate.
 * @returns True if the value satisfies the provider interface.
 */
export function isAIProvider(value: unknown): value is AIProvider {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const provider = value as AIProvider;
  return typeof provider.getCompletion === 'function' && typeof provider.streamCompletion === 'function';
}

/**
 * Entry point for consumers. Accepts either an already-instantiated provider
 * (anything that satisfies the `AIProvider` interface) or a configuration object
 * describing one of the supported backends. The helper returns a normalized
 * provider that SuperDoc AI can call without knowing the underlying vendor.
 *
 * @param config - Provider instance or configuration object.
 * @returns An `AIProvider` ready for use by SuperDoc AI.
 * @throws Error when an unsupported provider type is supplied.
 *
 * @example
 * ```typescript
 * const provider = createAIProvider({
 *   type: 'openai',
 *   apiKey: process.env.OPENAI_API_KEY,
 *   model: 'gpt-4'
 * });
 * ```
 */
export function createAIProvider(config: AIProviderInput): AIProvider {
  if (isAIProvider(config)) {
    return config;
  }

  switch (config.type) {
    case 'openai':
      return createOpenAIProvider(config);
    case 'anthropic':
      return createAnthropicProvider(config);
    case 'http':
      return createHttpProvider(config);
    default:
      throw new Error(`Unsupported provider type: ${(config as { type?: unknown })?.type}`);
  }
}
