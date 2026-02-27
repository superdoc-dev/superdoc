/**
 * CLI metadata barrel export.
 *
 * All metadata is derived from `@superdoc/document-api` at init time.
 */

// Types
export type {
  CliTypeSpec,
  CliOperationParamSpec,
  CliOperationConstraints,
  CliOperationMetadata,
  CliOperationOptionSpec,
  CliCommandSpec,
  CliOperationArgsById,
} from './types';

// Operation set
export {
  CLI_DOC_OPERATIONS,
  CLI_ONLY_OPERATIONS,
  CLI_OPERATION_IDS,
  type CliOperationId,
  type CliExposedOperationId,
  type DocBackedCliOpId,
  toDocApiId,
  isDocBackedOperation,
  cliCategory,
  cliDescription,
  cliRequiresDocumentContext,
  cliCommandTokens,
  type CliCategory,
} from './operation-set';

// Operation hints (CLI-local metadata tables)
export {
  orchestrationKind,
  SUCCESS_VERB,
  OUTPUT_FORMAT,
  RESPONSE_ENVELOPE_KEY,
  OPERATION_FAMILY,
  type OutputFormat,
  type OperationFamily,
} from './operation-hints';

// Commands
export {
  CLI_COMMAND_SPECS,
  CLI_COMMAND_KEYS,
  CLI_MAX_COMMAND_TOKENS,
  CLI_HELP,
  CLI_OPERATION_COMMAND_KEYS,
  type CliCommandKey,
} from './commands';

// Operation params
export { CLI_OPERATION_METADATA, CLI_OPERATION_OPTION_SPECS } from './operation-params';

// Response schemas
export { getResponseSchema } from './response-schemas';
