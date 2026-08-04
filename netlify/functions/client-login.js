const { sb } = require('./_supabase');
const { json } = require('./_http');

// Login solo con teléfono. Si el teléfono no existe todavía, el frontend
// debe reintentar mandando también `name` para dar de alta al cliente
// (origen 'organico': alta orgánica hecha por el propio cliente).
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { phone, name } = JSON.parse(event.body || '{}');
    if (!phone || !phone.trim()) return json(400, { error: 'Teléfono requerido' });
    const cleanPhone = phone.trim();

    const existing = await sb(`clients?phone=eq.${encodeURIComponent(cleanPhone)}&select=*`);
    if (existing.length) {
      return json(200, { client: existing[0], isNew: false });
    }

    if (!name || !name.trim()) {
      return json(200, { needsName: true });
    }

    // Si hay una recomendación Pendiente esperando este teléfono, el alta
    // es 'referido' (con su 15% de bienvenida) en vez de 'organico',
    // aunque el cliente no haya sido pre-creado por create-referral.js
    // (por ejemplo, si los formatos de teléfono no coincidieron antes).
    const pendingReferrals = await sb(
      `referrals?friend_phone=eq.${encodeURIComponent(cleanPhone)}&status=eq.Pendiente&select=*&order=created_at.desc&limit=1`
    );
    const referral = pendingReferrals[0];

    const created = await sb('clients', {
      method: 'POST',
      body: JSON.stringify({
        phone: cleanPhone,
        name: name.trim(),
        origin: referral ? 'referido' : 'organico',
        origin_detail: referral ? (referral.referrer_name || referral.referrer_phone) : null,
      }),
    });
    return json(200, { client: created[0], isNew: true });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
