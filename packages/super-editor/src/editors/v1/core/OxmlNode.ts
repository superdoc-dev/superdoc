import { Node } from './Node.js';
import type { NodeConfig } from './Node.js';

/**
 * Configuration for OXML Node extensions (extends NodeConfig)
 * @template Options - Type for node options
 * @template Storage - Type for node storage
 * @template Attrs - Type for node attributes (optional, enables typed addAttributes)
 */
export interface OxmlNodeConfig<
  Options extends Record<string, unknown> = Record<string, never>,
  Storage extends Record<string, unknown> = Record<string, never>,
  Attrs extends Record<string, unknown> = Record<string, unknown>,
> extends NodeConfig<Options, Storage, Attrs> {
  /** The OXML element name */
  oXmlName: string;

  /** Child attributes to extract */
  childToAttributes?: string[];
}

/**
 * OxmlNode class extends Node with OXML-specific properties.
 * @template Options - Type for node options
 * @template Storage - Type for node storage
 * @template Attrs - Type for node attributes (enables typed attribute access)
 */
export class OxmlNode<
  Options extends Record<string, unknown> = Record<string, never>,
  Storage extends Record<string, unknown> = Record<string, never>,
  Attrs extends Record<string, unknown> = Record<string, unknown>,
> extends Node<Options, Storage, Attrs> {
  oXmlName: string;

  constructor(config: OxmlNodeConfig<Options, Storage, Attrs>) {
    super(config);
    this.oXmlName = config.oXmlName;
  }

  /**
   * Factory method to construct a new OxmlNode instance.
   * @param config - The OXML node configuration.
   * @returns A new OxmlNode instance.
   */
  static create<
    O extends Record<string, unknown> = Record<string, never>,
    S extends Record<string, unknown> = Record<string, never>,
    A extends Record<string, unknown> = Record<string, unknown>,
  >(config: OxmlNodeConfig<O, S, A>): OxmlNode<O, S, A> {
    return new OxmlNode<O, S, A>(config);
  }
}
