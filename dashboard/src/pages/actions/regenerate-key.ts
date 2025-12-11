import type { APIRoute } from 'astro';
import crypto from 'crypto';
import { db } from '../../lib/server';

export const POST: APIRoute = async ({ redirect }) => {
  try {
    const newKey = crypto.randomBytes(32).toString('base64');
    db.prepare("INSERT INTO api_keys (key) VALUES (?)").run(newKey);

    return redirect('/settings?toast=New API key generated');
  } catch (e: any) {
    return redirect(`/settings?toast=${encodeURIComponent(e.message)}&type=error`);
  }
};
