/**
 * Command type augmentations for permission range helpers.
 *
 * @module PermissionCommands
 */

/** Options for wrapBetweenPermission command */
export type WrapBetweenPermissionOptions = {
  /** Optional identifier shared between permStart/permEnd nodes */
  id?: string;
  /** Optional w:ed attribute for the permStart node */
  ed?: string;
  /** Optional w:edGrp attribute for both permStart/permEnd nodes */
  edGrp?: string;
};

export interface PermissionCommands {
  /**
   * Wrap the current selection with w:permStart/w:permEnd tags.
   * @param options - Optional attributes applied to the generated nodes
   */
  wrapBetweenPermission: (options?: WrapBetweenPermissionOptions) => boolean;
}

declare module '../../core/types/ChainedCommands.js' {
  interface ExtensionCommandMap extends PermissionCommands {}
}
