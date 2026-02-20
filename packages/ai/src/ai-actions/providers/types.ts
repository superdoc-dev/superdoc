/**
 * Provider type definitions and configurations
 * @module providers/types
 */

import type { AIMessage, AIProvider, CompletionOptions } from '../../shared';

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ProviderRequestContext {
  messages: AIMessage[];
  options?: CompletionOptions;
  stream: boolean;
}

export interface ProviderDefaults {
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  streamResults?: boolean;
}

export interface HttpProviderConfig extends ProviderDefaults {
  type: 'http';
  url: string;
  streamUrl?: string;
  headers?: Record<string, string>;
  method?: string;
  fetch?: FetchLike;
  buildRequestBody?: (context: ProviderRequestContext) => Record<string, unknown>;
  parseCompletion?: (payload: unknown) => string;
  parseStreamChunk?: (payload: unknown) => string | undefined;
}

export interface OpenAIProviderConfig extends ProviderDefaults {
  type: 'openai';
  apiKey: string;
  model: string;
  baseURL?: string;
  organizationId?: string;
  headers?: Record<string, string>;
  completionPath?: string;
  requestOptions?: Record<string, unknown>;
  fetch?: FetchLike;
}

export interface AnthropicProviderConfig extends ProviderDefaults {
  type: 'anthropic';
  apiKey: string;
  model: string;
  baseURL?: string;
  apiVersion?: string;
  headers?: Record<string, string>;
  requestOptions?: Record<string, unknown>;
  fetch?: FetchLike;
}

export type AIProviderInput = AIProvider | OpenAIProviderConfig | AnthropicProviderConfig | HttpProviderConfig;
