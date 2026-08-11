const { sb } = require('./_supabase');
const { requireAdmin } = require('./_auth');
const { json } = require('./_http');

// Confirmar un pedido: cambiar estado a "Confirmado" y acreditar puntos al cliente
exports.handler = async (event) => {
  if (!requireAdmin(event)) return json(401, { error: 'No autorizado' });
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { order_id } = JSON.parse(event.body || '{}');
    if (!order_id) return json(400, { error: 'order_id requerido' });

    // Obtener el pedido
    const orders = await sb(`orders?id=eq.${order_id}&select=*`);
    if (!orders.length) return json(404, { error: 'Pedido no encontrado' });
    const order = orders[0];

    // Si ya está confirmado, no hacer nada
    if (order.status === 'Confirmado') {
      return json(200, { order, alreadyConfirmed: true });
    }

    // Calcular puntos: 1 punto cada $1000 del subtotal
    const pointsToAward = Math.floor(order.total / 1000);

    // Actualizar pedido a "Confirmado"
    const updatedOrder = await sb(`orders?id=eq.${order_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Confirmado' }),
    });

    // Acreditar puntos al cliente
    const clients = await sb(`clients?id=eq.${order.client_id}&select=*`);
    if (clients.length) {
      const client = clients[0];
      await sb(`clients?id=eq.${client.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          points: client.points + pointsToAward,
          points_vigent: client.points_vigent + pointsToAward,
          last_purchase_at: new Date().toISOString(),
        }),
      });
    }

    return json(200, { order: updatedOrder[0], pointsAwarded: pointsToAward });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
