export type LineEnd = {
  type?: string;
  width?: string;
  length?: string;
};

export type ConnectorSvgOptions = {
  kind?: string | null;
  strokeColor?: string | null;
  strokeWidth?: number;
  width: number;
  height: number;
};

export const CONNECTOR_PRESET_SHAPES: Set<string>;
export function isConnectorPresetShape(kind: unknown): boolean;
export function formatSvgNumber(value: number): string;
export function getConnectorPresetPath(kind: string | null | undefined, width: number, height: number): string | null;
export function getConnectorStrokePadding(strokeColor: string | null | undefined, strokeWidth: number): number;
export function createConnectorPresetSvg(options: ConnectorSvgOptions): string | null;
export function applyNonScalingStrokeToConnectorTarget(target: SVGElement): void;
export function applyNonScalingStrokeToConnector(svgElement: SVGElement): void;
export function createLineEndShape(doc: Document, type: string, strokeColor: string, isStart: boolean): SVGElement;
export function createLineEndMarker(
  doc: Document,
  defs: SVGDefsElement,
  id: string,
  lineEnd: LineEnd,
  strokeColor: string,
  strokeWidth: number,
  isStart: boolean,
): void;
