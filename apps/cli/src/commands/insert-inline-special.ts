import { runLegacyInsertLineBreak, runLegacyInsertTab } from './legacy-compat';

// The CLI surface still exposes `insert tab` / `insert line-break`, but the
// engine-aware implementation lives in `legacy-compat.ts`, the only sanctioned
// compatibility boundary for direct editor access.
export const runInsertTab = runLegacyInsertTab;
export const runInsertLineBreak = runLegacyInsertLineBreak;
