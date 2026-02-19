import { logPackageVersion } from './shared/logger';

logPackageVersion();

export { AIActions } from './ai-actions';
export type { AIPlannerConfig, AIPlannerExecutionResult, AIPlan } from './ai-actions/planner';

export { AIActionsService } from './ai-actions/services';

export { EditorAdapter } from './ai-actions/editor';

export { createAIProvider } from './ai-actions/providers';

export * from './shared/types';
export * from './shared/utils';
export * from './shared/constants';

export { createToolRegistry, getToolDescriptions, isValidTool } from './ai-actions/tools';

export type {
  AIProviderInput,
  AnthropicProviderConfig,
  FetchLike,
  HttpProviderConfig,
  OpenAIProviderConfig,
  ProviderRequestContext,
} from './ai-actions/providers/types';
