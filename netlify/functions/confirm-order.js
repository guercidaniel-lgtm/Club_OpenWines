const { sb } = require('./_supabase');
const { requireAdmin } = require('./_auth');
const { json } = require('./_http');

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

    if (order.status === 'Confirmado') {
      return json(200, { order, alreadyConfirmed: true });
    }

    const pointsToAward = Math.floor(order.total / 1000);

    // Actualizar orden
    await sb(`orders?id=eq.${order_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Confirmado' }),
    });

    // Acreditar puntos
    const clients = await sb(`clients?id=eq.${order.client_id}&select=id,points,points_vigent`);
    if (clients && clients.length) {
      const client = clients[0];
      const currentPoints = Number(client.points) || 0;
      const currentPointsVigent = Number(client.points_vigent) || 0;

      const updateData = {
        points: currentPoints + pointsToAward,
        points_vigent: currentPointsVigent + pointsToAward,
      };

      await sb(`clients?id=eq.${client.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
      });
    }

    return json(200, { success: true, pointsAwarded: pointsToAward });
  } catch (err) {
    console.error('Error in confirm-order:', err);
    return json(500, { error: err.message || 'Error desconocido' });
  }
};
