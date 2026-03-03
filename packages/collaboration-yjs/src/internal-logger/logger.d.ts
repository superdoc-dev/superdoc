declare const COLORS: {
  ConnectionHandler: string;
  DocumentManager: string;
  SuperDocCollaboration: string;
  reset: string;
};
export type Logger = (...args: unknown[]) => void;
export declare function createLogger(label: keyof typeof COLORS | string): Logger;
export {};
//# sourceMappingURL=logger.d.ts.map
