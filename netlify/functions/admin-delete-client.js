const { sb } = require('./_supabase');
const { requireAdmin } = require('./_auth');
const { json } = require('./_http');

// Borra un cliente y todo lo relacionado (órdenes, cupones, compras, etc.)
exports.handler = async (event) => {
  if (!requireAdmin(event)) return json(401, { error: 'No autorizado' });
  if (event.httpMethod !== 'DELETE') return json(405, { error: 'Method not allowed' });
  try {
    const phone = event.queryStringParameters && event.queryStringParameters.phone;
    if (!phone) return json(400, { error: 'Teléfono requerido' });

    const clients = await sb(`clients?phone=eq.${encodeURIComponent(phone)}&select=id`);
    if (!clients.length) return json(404, { error: 'Cliente no encontrado' });

    // Borrar cliente (cascade elimina órdenes, compras, cupones, etc.)
    await sb(`clients?id=eq.${clients[0].id}`, { method: 'DELETE', prefer: 'return=minimal' });

    return json(200, { deleted: true });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
