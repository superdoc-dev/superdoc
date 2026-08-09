import type { BaseNodeInfo } from './base.js';

export interface TableNodeInfo extends BaseNodeInfo {
  nodeType: 'table';
  kind: 'block';
  properties: TableProperties;
}

export interface TableRowNodeInfo extends BaseNodeInfo {
  nodeType: 'tableRow';
  kind: 'block';
  properties: TableRowProperties;
}

export interface TableCellNodeInfo extends BaseNodeInfo {
  nodeType: 'tableCell';
  kind: 'block';
  properties: TableCellProperties;
}

export interface TableBorders {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  insideH?: string;
  insideV?: string;
}

export interface TableProperties {
  layout?: string;
  width?: number;
  alignment?: 'left' | 'center' | 'right' | 'inside' | 'outside';
  borders?: TableBorders;
}

export interface TableRowProperties {
  rowIndex?: number;
}

export interface TableCellProperties {
  rowIndex?: number;
  colIndex?: number;
  width?: number;
  shading?: string;
  vMerge?: boolean;
  gridSpan?: number;
  padding?: number;
  borders?: TableBorders;
}
