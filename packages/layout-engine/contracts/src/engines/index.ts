/**
 * Engine contracts for Word-specific layout logic.
 *
 * These pure functions implement Word's layout mathematics and are consumed
 * by both PM plugins and the standalone layout pipeline to ensure consistent results.
 *
 * Design principles:
 * - Pure functions only (no DOM/PM dependencies)
 * - Inputs/outputs in pt (points, 1/72 inch)
 * - Deterministic (same input → same output)
 * - Triple-tested (unit, PM-vs-layout parity, Word golden corpus)
 */

export * from './paragraph.js';
export * from './tabs.js';
export * from './lists.js';
export * from './image-wrap.js';
export * from './tables.js';
