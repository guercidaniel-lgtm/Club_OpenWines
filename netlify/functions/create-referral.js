const { sb } = require('./_supabase');
const { json } = require('./_http');

// Crea la fila en `referrals` (Pendiente) y da de alta al amigo como
// cliente (origen 'referido') si todavía no existía, para que pueda
// loguearse y ver su 15% de bienvenida ni bien entra. Los 300 puntos al
// que refirió se acreditan aparte, cuando el admin confirma la compra.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { referrer_phone, referrer_name, friend_name, friend_phone } = JSON.parse(event.body || '{}');
    if (!referrer_phone || !friend_name || !friend_phone) {
      return json(400, { error: 'Datos incompletos' });
    }
    const cleanReferrer = referrer_phone.trim();
    const cleanFriendPhone = friend_phone.trim();
    if (cleanFriendPhone === cleanReferrer) {
      return json(400, { error: 'El teléfono del amigo no puede ser el mismo que el tuyo' });
    }

    const existingFriend = await sb(`clients?phone=eq.${encodeURIComponent(cleanFriendPhone)}&select=id`);
    if (!existingFriend.length) {
      await sb('clients', {
        method: 'POST',
        body: JSON.stringify({
          phone: cleanFriendPhone,
          name: friend_name.trim(),
          origin: 'referido',
          origin_detail: referrer_name || cleanReferrer,
        }),
      });
    }

    const referral = await sb('referrals', {
      method: 'POST',
      body: JSON.stringify({
        referrer_phone: cleanReferrer,
        referrer_name: referrer_name || null,
        friend_name: friend_name.trim(),
        friend_phone: cleanFriendPhone,
        status: 'Pendiente',
      }),
    });

    return json(200, { referral: referral[0] });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
