/**
 * Step executor registry — runtime dispatch by op prefix.
 *
 * Domain executors register here. The plan engine looks up executors by
 * matching the step's `op` field against registered prefixes.
 */

import type { StepExecutor } from './executor-registry.types.js';

const registry = new Map<string, StepExecutor>();

export function registerStepExecutor(opPrefix: string, executor: StepExecutor): void {
  if (registry.has(opPrefix)) {
    throw new Error(`Step executor already registered for op prefix "${opPrefix}"`);
  }
  registry.set(opPrefix, executor);
}

export function getStepExecutor(op: string): StepExecutor | undefined {
  // Exact match first, then prefix match
  if (registry.has(op)) return registry.get(op);
  const prefix = op.split('.')[0];
  return registry.get(prefix);
}

export function hasStepExecutor(op: string): boolean {
  return getStepExecutor(op) !== undefined;
}

export function clearExecutorRegistry(): void {
  registry.clear();
}
