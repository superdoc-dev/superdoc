import type { NodeHandlerParams } from '@converter/v2/importer/types';
import type { OpenXmlNode, SuperDocNode } from '@converter/v2/types';
import type { Editor } from '@core/Editor';
import type { Comment } from '@superdoc/common';

export type { Comment } from '@superdoc/common';

/**
 * @enum {string}
 */
export const TranslatorTypes = Object.freeze({
  NODE: 'node',
  ATTRIBUTE: 'attribute',
});

export type TranslatorTypeKey = keyof typeof TranslatorTypes;
export type TranslatorType = (typeof TranslatorTypes)[TranslatorTypeKey];
export type XmlNodeName = string;
export type SuperDocNodeOrKeyName = string | string[];

export type AttrConfig = {
  /** The name of the attribute in OOXML */
  xmlName: string;

  /** The name of the attribute in SuperDoc */
  sdName: string;

  /** Function to encode the attribute from OOXML to SuperDoc */
  encode: (...args: any[]) => any;

  /** Function to decode the attribute from SuperDoc to OOXML */
  decode: (...args: any[]) => any;
};

export type SCEncoderConfig = NodeHandlerParams;
export type SCEncoderResult = SuperDocNode;

export type SCDecoderConfig = {
  node: {
    attrs?: any;
    marks?: any[];
    type: string;
    content?: any[];
    text?: string;
  };

  children: any[];
  relationships: any[];
  comments: Comment[];
  commentsExporter: 'external' | 'clean';
  commentsExportType?: any;
  exportedCommentDefs: any[];
  extraParams: Record<string, any>;
  editor: Editor;
};

export type SCDecoderResult = OpenXmlNode | OpenXmlNode[] | undefined;

export type NodeTranslatorEncodeFn<TEncodeResult extends SCEncoderResult = SCEncoderResult> = (
  params: SCEncoderConfig,
  encodedAttrs?: EncodedAttributes,
) => TEncodeResult;
export type NodeTranslatorDecodeFn<TDecodeResult extends SCDecoderResult = SCDecoderResult> = (
  params: SCDecoderConfig,
  decodedAttrs?: DecodedAttributes,
) => TDecodeResult;
export type MatchesEncodeFn = (nodes: any[], ctx?: any) => boolean;
export type MatchesDecodeFn = (node: any, ctx?: any) => boolean;

export type EncodedAttributes = Record<string, any>;
export type DecodedAttributes = Record<string, string>;

export type NodeTranslatorConfig<
  TDecodeResult extends SCDecoderResult = SCDecoderResult,
  TEncodeResult extends SCEncoderResult = SCEncoderResult,
> = {
  /** The name of the node in OOXML */
  xmlName: string;
  /** The name of the node in SuperDoc */
  sdNodeOrKeyName: SuperDocNodeOrKeyName;
  /** The type of the translator. */
  type?: TranslatorType;
  /** The function to encode the data. */
  encode: NodeTranslatorEncodeFn<TEncodeResult>;
  /** The function to decode the data. */
  decode: NodeTranslatorDecodeFn<TDecodeResult>;
  /** The priority of the handler. */
  priority?: number;
  /** Attribute handlers list. */
  attributes?: AttrConfig[];
  /** The function to check if the handler can encode the data. */
  matchesEncode?: MatchesEncodeFn;
  /** The function to check if the handler can decode the data. */
  matchesDecode?: MatchesDecodeFn;
};

export class NodeTranslator<
  TDecodeResult extends SCDecoderResult = SCDecoderResult,
  TEncodeResult extends SCEncoderResult = SCEncoderResult,
> {
  xmlName: string;

  sdNodeOrKeyName: SuperDocNodeOrKeyName;

  priority: number;

  encodeFn: NodeTranslatorEncodeFn<TEncodeResult>;

  decodeFn: NodeTranslatorDecodeFn<TDecodeResult>;

  matchesEncode: MatchesEncodeFn;

  matchesDecode: MatchesDecodeFn;

  static translatorTypes: typeof TranslatorTypes = TranslatorTypes;

  attributes: AttrConfig[];

  constructor(
    xmlName: string,
    sdNodeOrKeyName: SuperDocNodeOrKeyName,
    encode: NodeTranslatorEncodeFn<TEncodeResult>,
    decode: NodeTranslatorDecodeFn<TDecodeResult>,
    priority: number,
    matchesEncode?: MatchesEncodeFn,
    matchesDecode?: MatchesDecodeFn,
    attributes?: AttrConfig[],
  ) {
    this.xmlName = xmlName;
    this.sdNodeOrKeyName = sdNodeOrKeyName;

    this.encodeFn = encode ?? (() => undefined);
    this.decodeFn = decode ?? (() => undefined);
    this.attributes = attributes || [];

    this.priority = typeof priority === 'number' ? priority : 0;

    this.matchesEncode = typeof matchesEncode === 'function' ? matchesEncode : () => true;
    this.matchesDecode = typeof matchesDecode === 'function' ? matchesDecode : () => true;
  }

  /**
   * Encode the attributes for the node.
   * @returns - Encoded attributes object.
   */
  encodeAttributes(params: SCEncoderConfig): object {
    const { nodes = [] } = params || {};
    const node = nodes[0];
    const { attributes = {} } = node || {};

    const encodedAttrs: Record<string, string> = {};
    this.attributes.forEach(({ sdName, encode }) => {
      if (!encode) return;

      const encodedAttr = encode(attributes);
      if (encodedAttr !== undefined && encodedAttr !== null) {
        encodedAttrs[sdName] = encodedAttr;
      }
    });

    return encodedAttrs;
  }

  /**
   * Decode the attributes for the node.
   * @returns - Decoded attributes object.
   */
  decodeAttributes(params: SCDecoderConfig): object {
    const { node } = params || {};
    const { attrs = {} } = node || {};

    const /** @type Record<string, string> */ decodedAttrs: Record<string, string> = {};
    this.attributes.forEach(({ xmlName, decode }) => {
      if (!decode) return;

      const decodedAttr = decode(attrs);
      if (decodedAttr !== undefined && decodedAttr !== null) {
        decodedAttrs[xmlName] = decodedAttr;
      }
    });

    return decodedAttrs;
  }

  /**
   * Decode the attributes for the node.
   * @returns - Decoded attributes object.
   */
  decode(params: SCDecoderConfig): TDecodeResult {
    const decodedAttrs = this.decodeAttributes(params);
    return this.decodeFn.call(this, params, decodedAttrs);
  }

  /**
   * Encode the attributes for the node.
   * @returns - Encoded attributes object.
   */
  encode(params: SCEncoderConfig): TEncodeResult {
    const encodedAttrs = this.encodeAttributes(params);
    return this.encodeFn.call(this, params, encodedAttrs);
  }

  /**
   * Create a new NodeTranslator instance from a configuration object.
   * @param config - The configuration object.
   * @returns - The created NodeTranslator instance.
   */
  static from<TDecodeResult extends SCDecoderResult = SCDecoderResult>(
    config: NodeTranslatorConfig<TDecodeResult>,
  ): NodeTranslator<TDecodeResult> {
    const { xmlName, sdNodeOrKeyName, encode, decode, priority = 0, matchesEncode, matchesDecode, attributes } = config;
    if (typeof encode !== 'function' || (!!decode && typeof decode !== 'function')) {
      throw new TypeError(`${xmlName}: encode/decode must be functions`);
    }
    const inst = new NodeTranslator(
      xmlName,
      sdNodeOrKeyName,
      encode,
      decode,
      priority,
      matchesEncode,
      matchesDecode,
      attributes,
    );
    return Object.freeze(inst);
  }

  /**
   * Convert the NodeTranslator instance to a string representation.
   * @returns {string} - The string representation of the NodeTranslator instance.
   */
  toString(): string {
    return `NodeTranslator(${this.xmlName}, priority=${this.priority})`;
  }
}
