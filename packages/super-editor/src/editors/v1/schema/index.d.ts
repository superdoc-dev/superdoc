/**
 * TypeScript definitions for Schema Versioning System
 *
 * This module provides type definitions for the schema versioning registry
 * and schema kit structures used throughout the SuperDoc editor.
 */

import { Schema as ProseMirrorSchema, Node as ProseMirrorNode } from 'prosemirror-model';
import * as Y from 'yjs';

/**
 * ProseMirror JSON document structure
 *
 * This represents the JSON serialization format used by ProseMirror for documents.
 * It's a recursive structure where each node can contain child nodes.
 *
 * @see {@link https://prosemirror.net/docs/ref/#model.Node.toJSON}
 */
export interface ProseMirrorJSON {
  /**
   * The type of this node (e.g., "doc", "paragraph", "text", "heading")
   */
  type: string;

  /**
   * Child nodes (for non-text nodes)
   */
  content?: ProseMirrorJSON[];

  /**
   * Marks applied to this node
   */
  marks?: Array<{
    /**
     * The type of mark (e.g., "bold", "italic", "link")
     */
    type: string;

    /**
     * Mark attributes (e.g., href for links)
     */
    attrs?: Record<string, unknown>;
  }>;

  /**
   * Node attributes (e.g., level for headings, src for images)
   */
  attrs?: Record<string, unknown>;

  /**
   * Text content (for text nodes)
   */
  text?: string;
}

/**
 * Complete schema kit containing everything needed to work with a specific schema version
 *
 * A schema kit packages together:
 * - The version identifier
 * - The complete ProseMirror schema
 * - Bidirectional Y.js <-> ProseMirror conversion functions
 *
 * Schema kits are immutable once registered and frozen to prevent accidental mutation.
 *
 * @example
 * ```typescript
 * const kit = getSchemaByVersion('1.0');
 * const schema = kit.pmSchema;
 * const pmJSON = kit.yXmlFragmentToProseMirrorJSON(yFragment);
 * ```
 */
export interface SchemaKit {
  /**
   * Version identifier for this schema
   * Format: "X.0" for single-digit versions (e.g., "1.0", "2.0", "3.0")
   * @example "1.0"
   * @example "2.0"
   */
  readonly schemaVersion: string;

  /**
   * Complete ProseMirror schema instance
   * Contains node types, mark types, and schema specification
   */
  readonly pmSchema: ProseMirrorSchema;

  /**
   * Convert Y.js XmlFragment to ProseMirror JSON
   *
   * @param yXmlFragment - Y.js XmlFragment to convert
   * @returns ProseMirror JSON document structure
   *
   * @example
   * ```typescript
   * const yFragment = ydoc.getXmlFragment('prosemirror');
   * const pmJSON = kit.yXmlFragmentToProseMirrorJSON(yFragment);
   * const doc = Node.fromJSON(kit.pmSchema, pmJSON);
   * ```
   */
  readonly yXmlFragmentToProseMirrorJSON: (yXmlFragment: Y.XmlFragment) => ProseMirrorJSON;

  /**
   * Convert ProseMirror JSON to Y.js XmlFragment
   *
   * Mutates the provided Y.js XmlFragment with the ProseMirror document structure.
   *
   * @param doc - ProseMirror document node, JSON representation, or object with toJSON() method
   * @param yXmlFragment - Target Y.js XmlFragment to populate
   *
   * @example
   * ```typescript
   * const yFragment = ydoc.getXmlFragment('prosemirror');
   * const pmDoc = editor.state.doc;
   * kit.prosemirrorJSONToYXmlFragment(pmDoc, yFragment);
   * ```
   */
  readonly prosemirrorJSONToYXmlFragment: (
    doc: ProseMirrorJSON | ProseMirrorNode | { toJSON(): ProseMirrorJSON },
    yXmlFragment: Y.XmlFragment,
  ) => void;
}

/**
 * Register a schema kit for a specific version
 *
 * This is primarily an internal API used during module initialization.
 * Most developers won't call this directly.
 *
 * @param versionId - Version identifier (e.g., "1.0", "2.0")
 * @param schemaKit - Complete schema kit object
 *
 * @throws {Error} If version is already registered
 * @throws {Error} If versionId is not a non-empty string
 * @throws {Error} If schemaKit is invalid or missing required fields
 *
 * @example
 * ```typescript
 * import { schemaKit as v3Kit } from './versions/v3/index.js';
 * registerSchemaVersion('3.0', v3Kit);
 * ```
 */
export function registerSchemaVersion(versionId: string, schemaKit: SchemaKit): void;

/**
 * Retrieve a schema kit by version identifier
 *
 * Returns a frozen, immutable schema kit for the specified version.
 * The same object reference is returned on repeated calls (cached).
 *
 * @param versionId - Version identifier (e.g., "1.0", "2.0")
 * @returns The schema kit for the specified version
 *
 * @throws {Error} If version is not found (includes list of available versions)
 * @throws {Error} If versionId is not a non-empty string
 *
 * @example
 * ```typescript
 * const v1Kit = getSchemaByVersion('1.0');
 * const schema = v1Kit.pmSchema;
 * const converter = v1Kit.yXmlFragmentToProseMirrorJSON;
 * ```
 */
export function getSchemaByVersion(versionId: string): Readonly<SchemaKit>;

/**
 * Get the current schema version identifier
 *
 * Returns the version ID of the current/latest schema.
 * This should be used as the default for new documents.
 *
 * @returns Current version ID (e.g., "2.0")
 *
 * @example
 * ```typescript
 * const currentVersion = getCurrentSchemaVersion(); // "2.0"
 * const currentKit = getSchemaByVersion(currentVersion);
 * ```
 */
export function getCurrentSchemaVersion(): string;

/**
 * List all registered schema version identifiers
 *
 * Returns a sorted array of all available version IDs.
 * The array is a copy, so modifications won't affect the registry.
 *
 * @returns Array of version IDs, sorted lexicographically
 *
 * @example
 * ```typescript
 * const versions = listSchemaVersions(); // ["1.0", "2.0"]
 * versions.forEach(v => {
 *   const kit = getSchemaByVersion(v);
 *   console.log(`Version ${v} has ${Object.keys(kit.pmSchema.nodes).length} node types`);
 * });
 * ```
 */
export function listSchemaVersions(): string[];
