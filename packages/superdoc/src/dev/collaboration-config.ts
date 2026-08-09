export type DevCollaborationRoomMode = 'auto' | 'create' | 'join';
export type DevResolvedCollaborationRoomMode = Exclude<DevCollaborationRoomMode, 'auto'>;

export const DEFAULT_DEV_COLLABORATION_SERVER_URL = 'ws://localhost:8081/v2/collaboration';

export type DevV2CollaborationConfig = {
  providerType: 'y-websocket';
  serverUrl: string;
  documentId: string;
  roomMode: DevResolvedCollaborationRoomMode;
  params?: Record<string, string>;
};

type DevDocumentSource = Blob & {
  markdownContent?: string;
  htmlContent?: string;
};

export function resolveDevCollaborationRoomMode(rawMode: string | null): DevCollaborationRoomMode {
  if (rawMode == null || rawMode === '') return 'auto';
  if (rawMode === 'auto' || rawMode === 'create' || rawMode === 'join') return rawMode;
  throw new Error(`Invalid collabRoomMode "${rawMode}". Expected "auto", "create", or "join".`);
}

export function resolveDevCollaborationServerUrl(rawUrl: string | null): string {
  const candidate = rawUrl?.trim();
  return candidate || DEFAULT_DEV_COLLABORATION_SERVER_URL;
}

export function createDevCollaborationAutoUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.searchParams.delete('collabRoomMode');
  return url.toString();
}

export function createDevV2CollaborationConfig({
  enabled,
  serverUrl,
  documentId,
  roomMode,
  userId,
}: {
  enabled: boolean;
  serverUrl: string;
  documentId: string;
  roomMode: DevResolvedCollaborationRoomMode | null;
  userId?: string | null;
}): DevV2CollaborationConfig | null {
  if (!enabled) return null;
  if (roomMode !== 'create' && roomMode !== 'join') {
    throw new Error('V2 collaboration requires an explicit create or join room mode.');
  }

  return {
    providerType: 'y-websocket',
    serverUrl,
    documentId,
    roomMode,
    ...(userId ? { params: { userId } } : {}),
  };
}

export function createDevDocumentConfig({
  source,
  id,
  v2Collaboration,
}: {
  source: DevDocumentSource | null;
  id: string;
  v2Collaboration: DevV2CollaborationConfig | null;
}) {
  if (!source) return null;

  return {
    data: source,
    id,
    ...(source.markdownContent ? { markdown: source.markdownContent } : {}),
    ...(source.htmlContent ? { html: source.htmlContent } : {}),
    ...(v2Collaboration ? { v2Collaboration } : {}),
  };
}
