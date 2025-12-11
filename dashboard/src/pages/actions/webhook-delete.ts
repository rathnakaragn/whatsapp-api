import type { APIRoute } from 'astro';
import { db } from '../../lib/server';

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();
  const id = formData.get('id') as string;

  try {
    const result = db.prepare("DELETE FROM webhooks WHERE id = ?").run(id);

    if (result.changes === 0) {
      return redirect('/webhooks?toast=Webhook not found&type=error');
    }

    return redirect('/webhooks?toast=Webhook deleted');
  } catch (e: any) {
    return redirect(`/webhooks?toast=${encodeURIComponent(e.message)}&type=error`);
  }
};
