const { sb } = require('./_supabase');
const { requireAdmin } = require('./_auth');
const { json } = require('./_http');

exports.handler = async (event) => {
  if (!requireAdmin(event)) return json(401, { error: 'No autorizado' });
  try {
    if (event.httpMethod === 'GET') {
      const combos = await sb('combos?select=*&order=created_at.desc');
      return json(200, { combos });
    }
    if (event.httpMethod === 'POST') {
      const { name, bottles, price, description, anticipo_horas, image_url, valid_until } = JSON.parse(event.body || '{}');
      if (!name || !bottles || !price) return json(400, { error: 'Datos incompletos' });
      const anticipo = [0, 24, 48].includes(Number(anticipo_horas)) ? Number(anticipo_horas) : 0;
      const created = await sb('combos', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          bottles: Number(bottles),
          price: Number(price),
          description: description || null,
          anticipo_horas: anticipo,
          image_url: image_url || null,
          valid_until: valid_until || null,
        }),
      });
      return json(200, { combo: created[0] });
    }
    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters && event.queryStringParameters.id;
      if (!id) return json(400, { error: 'id requerido' });

      // Si ya tiene pedidos asociados, no lo borramos de verdad (perderíamos
      // el historial de esos pedidos por el ON DELETE CASCADE) — lo marcamos
      // vencido ya mismo, que es lo que lo saca de la vista del cliente.
      const existingOrders = await sb(`orders?combo_id=eq.${id}&select=id&limit=1`);
      if (existingOrders.length) {
        await sb(`combos?id=eq.${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ valid_until: new Date().toISOString() }),
        });
        return json(200, {
          softExpired: true,
          message: 'Este combo tiene pedidos asociados: se marcó como vencido (dejó de mostrarse al cliente) en vez de borrarlo, para no perder el historial de pedidos.',
        });
      }

      await sb(`combos?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
      return json(200, { deleted: true });
    }
    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
