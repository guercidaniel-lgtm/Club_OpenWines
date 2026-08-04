const { sb } = require('./_supabase');
const { requireAdmin } = require('./_auth');
const { json } = require('./_http');

// 1 punto cada $1.000 ARS de compra.
exports.handler = async (event) => {
  if (!requireAdmin(event)) return json(401, { error: 'No autorizado' });
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { phone, client_id, amount } = JSON.parse(event.body || '{}');
    if (!amount || amount <= 0 || (!phone && !client_id)) {
      return json(400, { error: 'Datos incompletos' });
    }

    const rows = client_id
      ? await sb(`clients?id=eq.${client_id}&select=*`)
      : await sb(`clients?phone=eq.${encodeURIComponent(phone)}&select=*`);
    if (!rows.length) return json(404, { error: 'Cliente no encontrado' });
    const client = rows[0];

    await sb('purchases', {
      method: 'POST',
      body: JSON.stringify({ client_id: client.id, amount }),
    });

    const pointsEarned = Math.floor(amount / 1000);
    const updated = await sb(`clients?id=eq.${client.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ points: client.points + pointsEarned }),
    });

    return json(200, { client: updated[0], pointsEarned });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
