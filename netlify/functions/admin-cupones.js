const { sb } = require('./_supabase');
const { requireAdmin } = require('./_auth');
const { json } = require('./_http');

// GET: lista de cupones | DELETE: borrar cupón por ID
exports.handler = async (event) => {
  if (!requireAdmin(event)) return json(401, { error: 'No autorizado' });

  try {
    if (event.httpMethod === 'GET') {
      const coupons = await sb('scratch_cards?select=*&order=claimed_at.desc');
      return json(200, { coupons });
    }

    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters && event.queryStringParameters.id;
      if (!id) return json(400, { error: 'ID requerido' });
      await sb(`scratch_cards?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
      return json(200, { deleted: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
