import type { APIRoute } from 'astro';
import { db } from '../../lib/server';

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();
  const url = formData.get('url') as string;
  const events = formData.getAll('events') as string[];
  const secret = formData.get('secret') as string || null;

  if (!url) {
    return redirect('/webhooks/new?toast=URL is required&type=error');
  }

  if (!events || events.length === 0) {
    return redirect('/webhooks/new?toast=At least one event is required&type=error');
  }

  try {
    db.prepare(
      "INSERT INTO webhooks (url, events, secret) VALUES (?, ?, ?)"
    ).run(url, events.join(','), secret);

    return redirect('/webhooks?toast=Webhook created');
  } catch (e: any) {
    return redirect(`/webhooks/new?toast=${encodeURIComponent(e.message)}&type=error`);
  }
};
