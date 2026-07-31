const { sb } = require('./_supabase');
const { requireAdmin } = require('./_auth');
const { json } = require('./_http');

// Altas nuevas del mes agrupadas por origen (orgánico / referido / restaurante).
exports.handler = async (event) => {
  if (!requireAdmin(event)) return json(401, { error: 'No autorizado' });
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  try {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const clients = await sb(`clients?created_at=gte.${firstOfMonth}&select=origin`);
    const counts = { organico: 0, referido: 0, restaurante: 0 };
    clients.forEach((c) => { counts[c.origin] = (counts[c.origin] || 0) + 1; });
    return json(200, { counts, total: clients.length });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
