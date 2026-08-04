const { sb } = require('./_supabase');
const { json } = require('./_http');

// Marcar una orden como entregada y acreditar puntos al cliente
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { order_id } = JSON.parse(event.body || '{}');
    if (!order_id) return json(400, { error: 'order_id requerido' });

    // Obtener la orden
    const orders = await sb(`orders?id=eq.${order_id}&select=*`);
    if (!orders.length) return json(404, { error: 'Orden no encontrada' });
    const order = orders[0];

    if (order.status === 'Entregada') {
      return json(400, { error: 'Esta orden ya fue marcada como entregada' });
    }

    // Calcular puntos a acreditar (1 punto por cada $1.000 de compra, sin contar envío ni descuentos)
    const pointsToAward = Math.floor(order.subtotal / 1000);

    // Obtener cliente actual
    const clients = await sb(`clients?id=eq.${order.client_id}&select=*`);
    if (!clients.length) return json(404, { error: 'Cliente no encontrado' });
    const client = clients[0];

    // Actualizar orden: marcar como entregada y registrar puntos
    await sb(`orders?id=eq.${order_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'Entregada',
        points_awarded: pointsToAward,
        delivered_at: new Date().toISOString(),
      }),
    });

    // Actualizar cliente: acumular puntos y actualizar fecha de última compra
    const newPoints = client.points + pointsToAward;
    const newPointsVigent = (client.points_vigent || 0) + pointsToAward;

    await sb(`clients?id=eq.${order.client_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        points: newPoints,
        points_vigent: newPointsVigent,
        last_purchase_at: new Date().toISOString(),
      }),
    });

    return json(200, {
      message: 'Orden entregada y puntos acreditados',
      pointsAwarded: pointsToAward,
      totalPointsNow: newPoints,
    });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
