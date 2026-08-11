const { sb } = require('./_supabase');
const { computeLevel, effectiveDiscount } = require('./_lib');
const { json } = require('./_http');

// El descuento se recalcula acá server-side (no se confía en lo que
// mande el navegador) para que el total del pedido sea siempre correcto.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { phone, combo_id, quantity, payment_method, couponCode } = JSON.parse(event.body || '{}');
    if (!phone || !combo_id || !quantity || quantity < 1) {
      return json(400, { error: 'Datos incompletos' });
    }

    const clients = await sb(`clients?phone=eq.${encodeURIComponent(phone)}&select=*`);
    if (!clients.length) return json(404, { error: 'Cliente no encontrado' });
    const client = clients[0];

    const combos = await sb(`combos?id=eq.${combo_id}&select=*`);
    if (!combos.length) return json(404, { error: 'Combo no encontrado' });
    const combo = combos[0];

    if (combo.valid_until && new Date(combo.valid_until).getTime() < Date.now()) {
      return json(403, { error: 'Esta promoción ya venció' });
    }

    const level = computeLevel(client.points);
    if (level === 'Bronce' && combo.anticipo_horas > 0) {
      const unlockTime = new Date(combo.created_at).getTime() + combo.anticipo_horas * 3600000;
      if (Date.now() < unlockTime) {
        return json(403, { error: 'Este combo todavía no está disponible para tu nivel' });
      }
    }

    const purchases = await sb(`purchases?client_id=eq.${client.id}&select=id`);
    const discountPercent = effectiveDiscount(client, level, purchases.length);
    const subtotal = Math.round(combo.price * quantity);
    const referralDiscount = Math.round(subtotal * (discountPercent / 100));

    // Validar y aplicar cupón si existe
    let couponDiscount = 0;
    if (couponCode) {
      const coupons = await sb(`scratch_cards?coupon_code=eq.${encodeURIComponent(couponCode)}&select=*`);
      if (coupons.length && coupons[0].client_id === client.id && !coupons[0].used_at && new Date(coupons[0].expires_at).getTime() > Date.now()) {
        const coupon = coupons[0];
        const prizeMap = { '$10000': 10000, '$5000': 5000, '$2500': 2500, 'points500': 0, 'retry': 0 };
        couponDiscount = prizeMap[coupon.prize] || 0;
        // Marcar cupón como usado
        await sb(`scratch_cards?id=eq.${coupon.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ used_at: new Date().toISOString() }),
        });
      }
    }

    const total = subtotal - referralDiscount - couponDiscount;

    // Calcular puntos que se acreditarán después de entrega
    const pointsToAward = Math.floor(subtotal / 1000);

    const orderBody = {
      client_id: client.id,
      combo_id: combo.id,
      quantity,
      subtotal,
      referral_discount: referralDiscount,
      coupon_discount: couponDiscount,
      total: Math.max(total, 0),
      payment_method: payment_method || null,
      status: 'Pendiente',
      points_awarded: 0,
    };
    if (couponCode) orderBody.coupon_code = couponCode;

    const created = await sb('orders', {
      method: 'POST',
      body: JSON.stringify(orderBody),
    });

    return json(200, { order: created[0], discountPercent, pointsToAward });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
