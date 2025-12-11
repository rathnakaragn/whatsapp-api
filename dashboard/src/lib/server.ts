// Server-side access to shared state from parent Express app
// These are injected via globalThis from app.js

declare global {
  var __whatsapp_api: {
    db: any;
    config: any;
    getIsConnected: () => boolean;
    getQrCodeData: () => string | null;
    getSock: () => any;
    setSock: (sock: any) => void;
    setIsConnected: (connected: boolean) => void;
    setQrCodeData: (data: string | null) => void;
    connectWhatsApp: () => void;
  };
}

const api = globalThis.__whatsapp_api;

if (!api) {
  throw new Error('Astro SSR pages must be served through the Express app (app.js)');
}

export const db = api.db;
export const config = api.config;

export function getIsConnected(): boolean {
  return api.getIsConnected();
}

export function getQrCodeData(): string | null {
  return api.getQrCodeData();
}

export function getSock(): any {
  return api.getSock();
}

export function setSock(sock: any): void {
  api.setSock(sock);
}

export function setIsConnected(connected: boolean): void {
  api.setIsConnected(connected);
}

export function setQrCodeData(data: string | null): void {
  api.setQrCodeData(data);
}

export function getSessionPath(): string {
  return api.config.SESSION_PATH;
}

export function connectWhatsApp(): void {
  api.connectWhatsApp();
}
