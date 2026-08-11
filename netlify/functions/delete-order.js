const { sb } = require('./_supabase');
const { requireAdmin } = require('./_auth');
const { json } = require('./_http');

// Eliminar un pedido (útil para pedidos de prueba)
exports.handler = async (event) => {
  if (!requireAdmin(event)) return json(401, { error: 'No autorizado' });
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { order_id } = JSON.parse(event.body || '{}');
    if (!order_id) return json(400, { error: 'order_id requerido' });

    await sb(`orders?id=eq.${order_id}`, { method: 'DELETE' });
    return json(200, { message: 'Pedido eliminado' });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
