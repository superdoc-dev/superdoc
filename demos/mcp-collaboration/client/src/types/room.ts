export interface RoomStatus {
  roomId: string;
  documentReady: boolean;
  error: string | null;
}

export interface StartRoomOptions {
  useSample?: boolean;
  file?: File | null;
}
