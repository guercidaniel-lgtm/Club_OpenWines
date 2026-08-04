const { sb } = require('./_supabase');
const { json } = require('./_http');

// Marcar que el usuario vio el modal de scratch card
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { phone } = JSON.parse(event.body || '{}');
    if (!phone) return json(400, { error: 'Teléfono requerido' });

    const clients = await sb(`clients?phone=eq.${encodeURIComponent(phone)}&select=id`);
    if (!clients.length) return json(404, { error: 'Cliente no encontrado' });
    const clientId = clients[0].id;

    // Marcar en la BD que ya vio el modal
    await sb(`clients?id=eq.${clientId}`, {
      method: 'PATCH',
      body: JSON.stringify({ scratch_card_claimed: true }),
    });

    return json(200, { marked: true });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
