import type { APIRoute } from 'astro';
import { db } from '../../lib/server';

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();
  const id = formData.get('id') as string;
  const status = formData.get('status') as string;
  const redirectUrl = formData.get('redirect') as string || '/';

  const validStatuses = ['unread', 'read', 'replied', 'ignored', 'sent'];
  if (!validStatuses.includes(status)) {
    return redirect(`${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}toast=Invalid status&type=error`);
  }

  try {
    const result = db.prepare("UPDATE messages SET reply_status = ? WHERE id = ?").run(status, id);

    if (result.changes === 0) {
      return redirect(`${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}toast=Message not found&type=error`);
    }

    return redirect(`${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}toast=Marked as ${status}`);
  } catch (e: any) {
    return redirect(`${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}toast=${encodeURIComponent(e.message)}&type=error`);
  }
};
