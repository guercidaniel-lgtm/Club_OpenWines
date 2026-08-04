const { sb } = require('./_supabase');
const { json } = require('./_http');

// Verificar y actualizar vigencia de puntos para un cliente
// Reglas:
// - 12 meses sin compras: pierde 50% de puntos vigentes
// - 24 meses sin compras: pierde todos los puntos y vuelve a Bronce
// Nota: Esta función debe llamarse periódicamente (ej: admin dashboard) o antes de operaciones críticas
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { phone } = JSON.parse(event.body || '{}');
    if (!phone) return json(400, { error: 'phone requerido' });

    const clients = await sb(`clients?phone=eq.${encodeURIComponent(phone)}&select=*`);
    if (!clients.length) return json(404, { error: 'Cliente no encontrado' });
    const client = clients[0];

    if (!client.last_purchase_at) {
      // Nunca compró
      return json(200, { message: 'Cliente nunca realizó compras', pointsUpdated: false });
    }

    const now = new Date();
    const lastPurchase = new Date(client.last_purchase_at);
    const monthsWithoutPurchase = (now - lastPurchase) / (1000 * 60 * 60 * 24 * 30);

    let updated = false;
    let newPointsVigent = client.points_vigent || client.points;
    let newPoints = client.points;

    if (monthsWithoutPurchase >= 24) {
      // 24+ meses: pierde todos los puntos
      newPointsVigent = 0;
      newPoints = 0;
      updated = true;
    } else if (monthsWithoutPurchase >= 12) {
      // 12+ meses: pierde 50% de puntos vigentes
      const previousVigent = newPointsVigent;
      newPointsVigent = Math.floor(newPointsVigent * 0.5);
      if (newPointsVigent !== previousVigent) {
        updated = true;
      }
    }

    if (updated) {
      await sb(`clients?id=eq.${client.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          points: newPoints,
          points_vigent: newPointsVigent,
        }),
      });
    }

    return json(200, {
      message: 'Vigencia de puntos verificada',
      monthsWithoutPurchase: Math.floor(monthsWithoutPurchase),
      pointsUpdated: updated,
      newPointsVigent,
      newPoints,
    });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
