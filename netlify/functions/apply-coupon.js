const { sb } = require('./_supabase');
const { json } = require('./_http');

// Aplica un cupón a una orden. Valida: coupon existe, no usado, no expirado,
// pertenece al cliente. Retorna discount_amount.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { phone, couponCode } = JSON.parse(event.body || '{}');
    if (!phone || !couponCode) return json(400, { error: 'Teléfono y cupón requeridos' });

    // Buscar cliente
    const clients = await sb(`clients?phone=eq.${encodeURIComponent(phone)}&select=id`);
    if (!clients.length) return json(404, { error: 'Cliente no encontrado' });
    const clientId = clients[0].id;

    // Buscar cupón
    const coupons = await sb(`scratch_cards?coupon_code=eq.${encodeURIComponent(couponCode)}&select=*`);
    if (!coupons.length) return json(404, { error: 'Cupón no encontrado' });

    const coupon = coupons[0];

    // Validaciones
    if (coupon.client_id !== clientId) return json(403, { error: 'Este cupón no es tuyo' });
    if (coupon.used_at) return json(400, { error: 'Cupón ya fue usado' });
    if (new Date(coupon.expires_at) < new Date()) return json(400, { error: 'Cupón expirado' });

    // Calcular descuento
    let discountAmount = 0;
    if (coupon.prize === '$10000') discountAmount = 10000;
    else if (coupon.prize === '$5000') discountAmount = 5000;
    else if (coupon.prize === '$2500') discountAmount = 2500;
    else if (coupon.prize === 'points500') discountAmount = 0; // +500 puntos manejo en otra función
    else if (coupon.prize === 'retry') return json(400, { error: 'Este cupón no es válido, intenta otra vez' });

    // Marcar como usado
    await sb(`scratch_cards?id=eq.${coupon.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ used_at: new Date().toISOString() }),
    });

    return json(200, {
      applied: true,
      prize: coupon.prize,
      discountAmount,
      message: discountAmount > 0
        ? `¡Descuento de $${discountAmount.toLocaleString('es-AR')} aplicado!`
        : 'Premio: +500 puntos bonus (se sumarán al confirmar la compra)',
    });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
