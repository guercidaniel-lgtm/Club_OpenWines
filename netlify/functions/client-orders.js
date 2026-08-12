const { sb } = require('./_supabase');
const { json } = require('./_http');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  const phone = event.queryStringParameters && event.queryStringParameters.phone;
  if (!phone) return json(400, { error: 'phone requerido' });

  try {
    const clients = await sb(`clients?phone=eq.${encodeURIComponent(phone)}&select=id`);
    if (!clients.length) return json(404, { error: 'Cliente no encontrado' });
    const clientId = clients[0].id;

    // Obtener pedidos del cliente con info de combo
    const orders = await sb(
      `orders?client_id=eq.${clientId}&select=*,combos(name,price)&order=created_at.desc`
    );

    return json(200, { orders: orders || [] });
  } catch (err) {
    console.error('Error fetching orders:', err);
    return json(500, { error: err.message });
  }
};
