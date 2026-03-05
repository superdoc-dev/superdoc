export interface OverlayElements {
  viewportHost: HTMLElement;
  painterHost: HTMLElement;
  selectionOverlay: HTMLElement;
  remoteCursorOverlay: HTMLElement;
  localSelectionLayer: HTMLElement;
  permissionOverlay: HTMLElement;
  hoverOverlay: HTMLElement;
  hoverTooltip: HTMLElement;
  modeBanner: HTMLElement;
  ariaLiveRegion: HTMLElement;
}

/**
 * Creates all DOM elements for the PresentationEditor's visual layers.
 * These elements are created once in the constructor and never recreated.
 */
export function createOverlayElements(
  visibleHost: HTMLElement,
  overlayId: string,
  defaultPageHeight: number,
): OverlayElements {
  const doc = visibleHost.ownerDocument ?? document;

  // Viewport host — contains painter + overlays
  const viewportHost = doc.createElement('div');
  viewportHost.className = 'presentation-editor__viewport';
  viewportHost.setAttribute('aria-hidden', 'true');
  viewportHost.style.position = 'relative';
  viewportHost.style.width = '100%';
  viewportHost.style.minHeight = `${defaultPageHeight}px`;
  visibleHost.appendChild(viewportHost);

  // Painter host — DomPainter mounts pages here
  const painterHost = doc.createElement('div');
  painterHost.className = 'presentation-editor__pages';
  painterHost.style.transformOrigin = 'top left';
  viewportHost.appendChild(painterHost);

  // Permission overlay
  const permissionOverlay = doc.createElement('div');
  permissionOverlay.className = 'presentation-editor__permission-overlay';
  Object.assign(permissionOverlay.style, {
    position: 'absolute',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '5',
  });
  viewportHost.appendChild(permissionOverlay);

  // Selection overlay container (holds remote + local layers)
  const selectionOverlay = doc.createElement('div');
  selectionOverlay.className = 'presentation-editor__selection-overlay';
  selectionOverlay.id = overlayId;
  selectionOverlay.style.position = 'absolute';
  selectionOverlay.style.inset = '0';
  selectionOverlay.style.pointerEvents = 'none';
  selectionOverlay.style.zIndex = '10';

  // Remote cursor layer (below local)
  const remoteCursorOverlay = doc.createElement('div');
  remoteCursorOverlay.className = 'presentation-editor__selection-layer--remote';
  remoteCursorOverlay.style.position = 'absolute';
  remoteCursorOverlay.style.inset = '0';
  remoteCursorOverlay.style.pointerEvents = 'none';

  // Local selection layer (above remote)
  const localSelectionLayer = doc.createElement('div');
  localSelectionLayer.className = 'presentation-editor__selection-layer--local';
  localSelectionLayer.style.position = 'absolute';
  localSelectionLayer.style.inset = '0';
  localSelectionLayer.style.pointerEvents = 'none';

  selectionOverlay.appendChild(remoteCursorOverlay);
  selectionOverlay.appendChild(localSelectionLayer);
  viewportHost.appendChild(selectionOverlay);

  // Hover overlay (H/F hover region indicator)
  const hoverOverlay = doc.createElement('div');
  hoverOverlay.className = 'presentation-editor__hover-overlay';
  Object.assign(hoverOverlay.style, {
    position: 'absolute',
    border: '1px dashed rgba(51, 102, 255, 0.8)',
    borderRadius: '2px',
    pointerEvents: 'none',
    display: 'none',
    zIndex: '11',
  });
  selectionOverlay.appendChild(hoverOverlay);

  // Hover tooltip
  const hoverTooltip = doc.createElement('div');
  hoverTooltip.className = 'presentation-editor__hover-tooltip';
  Object.assign(hoverTooltip.style, {
    position: 'absolute',
    background: 'rgba(18, 22, 33, 0.85)',
    color: '#fff',
    padding: '2px 6px',
    fontSize: '12px',
    borderRadius: '2px',
    pointerEvents: 'none',
    display: 'none',
    zIndex: '12',
    whiteSpace: 'nowrap',
  });
  selectionOverlay.appendChild(hoverTooltip);

  // Mode banner for H/F editing mode
  const modeBanner = doc.createElement('div');
  modeBanner.className = 'presentation-editor__mode-banner';
  Object.assign(modeBanner.style, {
    position: 'absolute',
    top: '0',
    left: '50%',
    transform: 'translate(-50%, -100%)',
    background: '#1b3fbf',
    color: '#fff',
    padding: '4px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    display: 'none',
    zIndex: '15',
  });
  visibleHost.appendChild(modeBanner);

  // ARIA live region for selection announcements
  const ariaLiveRegion = doc.createElement('div');
  ariaLiveRegion.className = 'presentation-editor__aria-live';
  ariaLiveRegion.setAttribute('role', 'status');
  ariaLiveRegion.setAttribute('aria-live', 'polite');
  ariaLiveRegion.setAttribute('aria-atomic', 'true');
  Object.assign(ariaLiveRegion.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clip: 'rect(1px, 1px, 1px, 1px)',
  });
  visibleHost.appendChild(ariaLiveRegion);

  return {
    viewportHost,
    painterHost,
    selectionOverlay,
    remoteCursorOverlay,
    localSelectionLayer,
    permissionOverlay,
    hoverOverlay,
    hoverTooltip,
    modeBanner,
    ariaLiveRegion,
  };
}
