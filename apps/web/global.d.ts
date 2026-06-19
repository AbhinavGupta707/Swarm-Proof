type PendoMetadata = Record<string, string | number | boolean | null | undefined>;

type PendoGlobal = {
  initialize: (options: { visitor: { id: string } & PendoMetadata; account?: { id?: string } & PendoMetadata }) => void;
  identify?: (options: { visitor: { id: string } & PendoMetadata; account?: { id?: string } & PendoMetadata }) => void;
  updateOptions?: (options: { visitor?: PendoMetadata; account?: PendoMetadata }) => void;
  pageLoad?: () => void;
  track?: (name: string, metadata?: PendoMetadata) => void;
  trackAgent?: (name: string, metadata?: PendoMetadata) => void;
  clearSession?: () => void;
  _q?: unknown[];
};

declare global {
  interface Window {
    pendo?: PendoGlobal;
  }
}

export {};
