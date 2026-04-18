/**
 * Context object passed to extension config functions.
 * This represents the runtime context available to extension configuration.
 */
export interface ExtensionContext {
  /** The name of the extension */
  name: string;
  /** Extension-specific options */
  options?: Record<string, unknown>;
  /** Extension-specific storage */
  storage?: Record<string, unknown>;
  /** The editor instance (when available) */
  editor?: unknown;
  /** The schema type for this extension (when available) */
  type?: unknown;
  /** Additional context properties that may be passed */
  [key: string]: unknown;
}

/**
 * Base interface for extensions with a config object.
 */
export interface ExtensionLike {
  config: Record<string, unknown>;
}

/**
 * Get extension config field.
 * If the field is a function, it will be bound to the provided context.
 * @param extension The Editor extension.
 * @param field The config field name.
 * @param context The context object to bind to function.
 * @returns The config field value or bound function.
 * @template T The expected return type of the config field.
 */
export function getExtensionConfigField<T = unknown>(
  extension: ExtensionLike,
  field: string,
  context: ExtensionContext = { name: '' },
): T {
  const fieldValue = extension.config[field];

  if (typeof fieldValue === 'function') {
    const boundValue = fieldValue.bind({ ...context });
    return boundValue as T;
  }

  return fieldValue as T;
}
