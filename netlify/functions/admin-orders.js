const { sb } = require('./_supabase');
const { requireAdmin } = require('./_auth');
const { json } = require('./_http');

exports.handler = async (event) => {
  if (!requireAdmin(event)) return json(401, { error: 'No autorizado' });
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  try {
    const orders = await sb('orders?select=*,clients(name,phone),combos(name,price)&order=created_at.desc');
    return json(200, { orders });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
