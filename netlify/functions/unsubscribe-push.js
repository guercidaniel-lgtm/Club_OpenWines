const { sb } = require('./_supabase');
const { json } = require('./_http');

// Borra la suscripción push del cliente (por endpoint, verificando que
// sea dueño vía teléfono) cuando desactiva las notificaciones.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { phone, endpoint } = JSON.parse(event.body || '{}');
    if (!phone || !endpoint) return json(400, { error: 'Datos incompletos' });

    const clients = await sb(`clients?phone=eq.${encodeURIComponent(phone)}&select=id`);
    if (!clients.length) return json(404, { error: 'Cliente no encontrado' });

    await sb(
      `push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&client_id=eq.${clients[0].id}`,
      { method: 'DELETE', prefer: 'return=minimal' }
    );

    return json(200, { unsubscribed: true });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
