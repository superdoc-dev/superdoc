export interface RoomStatus {
  roomId: string;
  model: string;
  changeMode: string;
  agentReady: boolean;
  activeRunId: string | null;
  conversationLength: number;
}

export interface RoomConfig {
  roomId: string;
  model: string;
  changeMode: 'direct' | 'tracked';
  displayName: string;
  document?: File | null;
  useSample?: boolean;
}
