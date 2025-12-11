import type { APIRoute } from 'astro';
import { db } from '../../lib/server';

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();
  const id = formData.get('id') as string;
  const active = formData.get('active') as string;

  try {
    const result = db.prepare(
      "UPDATE webhooks SET active = ? WHERE id = ?"
    ).run(parseInt(active), id);

    if (result.changes === 0) {
      return redirect('/webhooks?toast=Webhook not found&type=error');
    }

    return redirect(`/webhooks?toast=Webhook ${active === '1' ? 'enabled' : 'disabled'}`);
  } catch (e: any) {
    return redirect(`/webhooks?toast=${encodeURIComponent(e.message)}&type=error`);
  }
};
