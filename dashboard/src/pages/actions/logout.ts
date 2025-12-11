import type { APIRoute } from 'astro';
import fs from 'fs';
import { getSock, setSock, setIsConnected, setQrCodeData, getSessionPath } from '../../lib/server';

export const POST: APIRoute = async ({ redirect }) => {
  const sock = getSock();
  const sessionPath = getSessionPath();

  try {
    if (sock) {
      await sock.logout();
      sock.end();
      setSock(null);
    }

    setIsConnected(false);
    setQrCodeData(null);

    // Wait a bit before deleting session
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (fs.existsSync(sessionPath)) {
      try {
        fs.rmSync(sessionPath, { recursive: true, force: true });
      } catch (e) {
        // Ignore deletion errors
      }
    }

    return redirect('/status?toast=Logged out successfully');
  } catch (e: any) {
    return redirect(`/status?toast=${encodeURIComponent(e.message)}&type=error`);
  }
};
