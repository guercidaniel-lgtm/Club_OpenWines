const { sb } = require('./_supabase');
const { json } = require('./_http');

// Guarda (o actualiza, por endpoint único) la suscripción push del
// navegador del cliente, para poder mandarle notificaciones más adelante.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { phone, subscription } = JSON.parse(event.body || '{}');
    if (!phone || !subscription || !subscription.endpoint || !subscription.keys) {
      return json(400, { error: 'Datos incompletos' });
    }

    const clients = await sb(`clients?phone=eq.${encodeURIComponent(phone)}&select=id`);
    if (!clients.length) return json(404, { error: 'Cliente no encontrado' });

    await sb('push_subscriptions', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        client_id: clients[0].id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      }),
    });

    return json(200, { subscribed: true });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
