import type { APIRoute } from 'astro';
import { v4 as uuidv4 } from 'uuid';
import { db, getIsConnected, getSock } from '../../lib/server';

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();
  const id = formData.get('id') as string;
  const message = formData.get('message') as string;
  const redirectUrl = formData.get('redirect') as string || '/';

  if (!message || !message.trim()) {
    return redirect(`/reply/${id}?redirect=${encodeURIComponent(redirectUrl)}&toast=Message is required&type=error`);
  }

  const sock = getSock();
  const isConnected = getIsConnected();

  if (!isConnected || !sock) {
    return redirect(`/reply/${id}?redirect=${encodeURIComponent(redirectUrl)}&toast=WhatsApp not connected&type=error`);
  }

  // Get original message
  const original = db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as any;
  if (!original) {
    return redirect(`${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}toast=Message not found&type=error`);
  }

  try {
    // Send the reply
    await sock.sendMessage(original.phone, { text: message });

    // Update original message status
    db.prepare("UPDATE messages SET reply_status = 'replied' WHERE id = ?").run(id);

    // Insert outgoing message
    const replyId = uuidv4();
    db.prepare(
      "INSERT INTO messages (id, direction, phone, message, reply_status) VALUES (?, 'outgoing', ?, ?, 'sent')"
    ).run(replyId, original.phone, message);

    // Trigger webhook for message sent
    const { triggerWebhooks } = await import('../../../../src/webhook.js');
    triggerWebhooks(db, "message.sent", {
      id: replyId,
      phone: original.phone,
      message,
      inReplyTo: id,
      timestamp: new Date().toISOString(),
    });

    return redirect(`${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}toast=Reply sent!`);
  } catch (e: any) {
    return redirect(`/reply/${id}?redirect=${encodeURIComponent(redirectUrl)}&toast=${encodeURIComponent(e.message)}&type=error`);
  }
};
