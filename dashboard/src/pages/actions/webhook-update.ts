import type { APIRoute } from 'astro';
import { db } from '../../lib/server';

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();
  const id = formData.get('id') as string;
  const url = formData.get('url') as string;
  const events = formData.getAll('events') as string[];
  const secret = formData.get('secret') as string || null;

  if (!url) {
    return redirect(`/webhooks/edit/${id}?toast=URL is required&type=error`);
  }

  if (!events || events.length === 0) {
    return redirect(`/webhooks/edit/${id}?toast=At least one event is required&type=error`);
  }

  try {
    const result = db.prepare(
      "UPDATE webhooks SET url = ?, events = ?, secret = ? WHERE id = ?"
    ).run(url, events.join(','), secret, id);

    if (result.changes === 0) {
      return redirect('/webhooks?toast=Webhook not found&type=error');
    }

    return redirect('/webhooks?toast=Webhook updated');
  } catch (e: any) {
    return redirect(`/webhooks/edit/${id}?toast=${encodeURIComponent(e.message)}&type=error`);
  }
};
