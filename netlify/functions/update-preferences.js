const { sb } = require('./_supabase');
const { json } = require('./_http');

// Actualiza las preferencias de vino del cliente
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { phone, prefs } = JSON.parse(event.body || '{}');
    if (!phone) return json(400, { error: 'Teléfono requerido' });
    if (!Array.isArray(prefs)) return json(400, { error: 'Preferencias debe ser un array' });

    const clients = await sb(`clients?phone=eq.${encodeURIComponent(phone)}&select=id`);
    if (!clients.length) return json(404, { error: 'Cliente no encontrado' });

    await sb(`clients?id=eq.${clients[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ prefs }),
    });

    return json(200, { updated: true });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
