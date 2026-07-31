const webpush = require('web-push');
const { sb } = require('./_supabase');
const { requireAdmin } = require('./_auth');
const { json } = require('./_http');

// Manda una notificación push a todos los clientes suscriptos. Si viene
// combo_id, arma el título/cuerpo a partir del combo; si no, usa title/body
// mandados directo. Las suscripciones vencidas (404/410) se borran solas.
exports.handler = async (event) => {
  if (!requireAdmin(event)) return json(401, { error: 'No autorizado' });
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
    const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
    const VAPID_SUBJECT = process.env.VAPID_SUBJECT;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
      return json(500, { error: 'Faltan las claves VAPID en las variables de entorno' });
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const { combo_id, title, body } = JSON.parse(event.body || '{}');
    let notifTitle = title;
    let notifBody = body;
    if (combo_id) {
      const combos = await sb(`combos?id=eq.${combo_id}&select=*`);
      if (!combos.length) return json(404, { error: 'Combo no encontrado' });
      const combo = combos[0];
      notifTitle = notifTitle || `Nuevo combo: ${combo.name}`;
      notifBody = notifBody || `${combo.bottles} botellas · $${Number(combo.price).toLocaleString('es-AR')}`;
      await sb(`combos?id=eq.${combo_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ notified_at: new Date().toISOString() }),
      });
    }
    if (!notifTitle) return json(400, { error: 'Falta combo_id o title' });

    const subscriptions = await sb('push_subscriptions?select=*');
    if (!subscriptions.length) {
      return json(200, { sent: 0, failed: 0, message: 'Todavía no hay nadie suscripto a notificaciones' });
    }

    const payload = JSON.stringify({ title: notifTitle, body: notifBody || '', url: '/' });

    let sent = 0;
    let failed = 0;
    const staleIds = [];
    await Promise.all(subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (err) {
        failed++;
        if (err.statusCode === 404 || err.statusCode === 410) staleIds.push(sub.id);
      }
    }));

    if (staleIds.length) {
      await sb(`push_subscriptions?id=in.(${staleIds.join(',')})`, { method: 'DELETE', prefer: 'return=minimal' });
    }

    return json(200, { sent, failed });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
