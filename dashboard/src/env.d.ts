/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    db: import('better-sqlite3').Database;
    isConnected: boolean;
    qrCodeData: string | null;
    sessionPath: string;
    sock: any;
    setSock: (sock: any) => void;
    setIsConnected: (connected: boolean) => void;
    setQrCodeData: (data: string | null) => void;
    connectWhatsApp: () => void;
  }
}
