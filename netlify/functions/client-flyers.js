const { sb } = require('./_supabase');
const { json } = require('./_http');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  try {
    const flyers = await sb('flyers?select=*&order=display_order.asc');
    return json(200, { flyers: flyers || [] });
  } catch (err) {
    console.error('Error fetching flyers:', err);
    return json(500, { error: err.message });
  }
};
