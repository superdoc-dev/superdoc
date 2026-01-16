export type SelectionDebugLogLevel = 'off' | 'error' | 'warn' | 'info' | 'verbose';

export type SelectionDebugConfig = {
  logLevel: SelectionDebugLogLevel;
  hud: boolean;
  dumpRects: boolean;
  disableRectDedupe: boolean;
};

export type SelectionDebugHudState = {
  docEpoch: number;
  layoutEpoch: number;
  selection: { from: number; to: number } | null;
  lastPointer: {
    clientX: number;
    clientY: number;
    x: number;
    y: number;
  } | null;
  lastHit: {
    source: 'dom' | 'geometry' | 'margin' | 'none';
    pos: number | null;
    layoutEpoch: number | null;
    mappedPos: number | null;
  } | null;
};

type SuperdocDebugRoot = {
  selection?: Partial<SelectionDebugConfig>;
};

declare global {
  interface Window {
    superdocDebug?: SuperdocDebugRoot;
  }
}

const DEFAULT_CONFIG: SelectionDebugConfig = {
  logLevel: 'off',
  hud: false,
  dumpRects: false,
  disableRectDedupe: false,
};

const levelOrder: Record<Exclude<SelectionDebugLogLevel, 'off'>, number> = {
  error: 0,
  warn: 1,
  info: 2,
  verbose: 3,
};

export function getSelectionDebugConfig(): SelectionDebugConfig {
  if (typeof window === 'undefined') {
    return DEFAULT_CONFIG;
  }

  window.superdocDebug ??= {};
  window.superdocDebug.selection ??= {};

  const cfg = window.superdocDebug.selection;
  return {
    logLevel: cfg.logLevel ?? DEFAULT_CONFIG.logLevel,
    hud: cfg.hud ?? DEFAULT_CONFIG.hud,
    dumpRects: cfg.dumpRects ?? DEFAULT_CONFIG.dumpRects,
    disableRectDedupe: cfg.disableRectDedupe ?? DEFAULT_CONFIG.disableRectDedupe,
  };
}

export function debugLog(
  level: Exclude<SelectionDebugLogLevel, 'off'>,
  message: string,
  data?: Record<string, unknown>,
): void {
  const cfg = getSelectionDebugConfig();
  if (cfg.logLevel === 'off') return;
  if (levelOrder[level] > levelOrder[cfg.logLevel as Exclude<SelectionDebugLogLevel, 'off'>]) return;

  const prefix = '[Selection]';
  if (data) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
}

const HUD_DATA_ATTR = 'data-superdoc-selection-debug-hud';

export function updateSelectionDebugHud(host: HTMLElement, state: SelectionDebugHudState): void {
  const cfg = getSelectionDebugConfig();
  const doc = host.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
  if (!doc) return;

  const existing = host.querySelector(`[${HUD_DATA_ATTR}="true"]`) as HTMLElement | null;
  if (!cfg.hud) {
    existing?.remove();
    return;
  }

  const hud = existing ?? doc.createElement('div');
  hud.setAttribute(HUD_DATA_ATTR, 'true');
  hud.style.position = 'absolute';
  hud.style.top = '8px';
  hud.style.left = '8px';
  hud.style.zIndex = '9999';
  hud.style.maxWidth = '420px';
  hud.style.padding = '6px 8px';
  hud.style.borderRadius = '6px';
  hud.style.background = 'rgba(0, 0, 0, 0.72)';
  hud.style.color = 'white';
  hud.style.fontFamily =
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  hud.style.fontSize = '12px';
  hud.style.lineHeight = '1.3';
  hud.style.pointerEvents = 'none';
  hud.style.whiteSpace = 'pre';

  const behind = Math.max(0, state.docEpoch - state.layoutEpoch);
  const selectionText = state.selection ? `${state.selection.from}..${state.selection.to}` : 'null';
  const pointerText = state.lastPointer
    ? `${state.lastPointer.clientX},${state.lastPointer.clientY} -> ${Math.round(state.lastPointer.x)},${Math.round(
        state.lastPointer.y,
      )}`
    : 'null';
  const hitText = state.lastHit
    ? `${state.lastHit.source} pos=${state.lastHit.pos ?? 'null'} epoch=${state.lastHit.layoutEpoch ?? 'null'} mapped=${
        state.lastHit.mappedPos ?? 'null'
      }`
    : 'null';

  hud.textContent = [
    `docEpoch=${state.docEpoch} layoutEpoch=${state.layoutEpoch} behind=${behind}`,
    `selection=${selectionText}`,
    `pointer=${pointerText}`,
    `hit=${hitText}`,
  ].join('\n');

  if (!existing) {
    host.appendChild(hud);
  }
}
