const { sb } = require('./_supabase');
const { requireAdmin } = require('./_auth');
const { json } = require('./_http');
const { computeLevel } = require('./_lib');

exports.handler = async (event) => {
  if (!requireAdmin(event)) return json(401, { error: 'No autorizado' });
  try {
    if (event.httpMethod === 'GET') {
      const clients = await sb('clients?select=*&order=created_at.desc');
      return json(200, { clients: clients.map((c) => ({ ...c, level: computeLevel(c.points) })) });
    }
    if (event.httpMethod === 'POST') {
      const { name, phone, origin, origin_detail } = JSON.parse(event.body || '{}');
      if (!name || !phone) return json(400, { error: 'Nombre y teléfono son requeridos' });
      const created = await sb('clients', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          origin: ['organico', 'referido', 'restaurante'].includes(origin) ? origin : 'organico',
          origin_detail: origin_detail || null,
        }),
      });
      return json(200, { client: created[0] });
    }
    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
