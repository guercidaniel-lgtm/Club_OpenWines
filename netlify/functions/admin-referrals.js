const { sb } = require('./_supabase');
const { requireAdmin } = require('./_auth');
const { json } = require('./_http');

// GET: lista de referidos. POST {referral_id}: confirma la primera
// compra del amigo y acredita 300 puntos a quien lo recomendó. El
// beneficio solo se acredita acá, nunca al enviar la invitación.
exports.handler = async (event) => {
  if (!requireAdmin(event)) return json(401, { error: 'No autorizado' });
  try {
    if (event.httpMethod === 'GET') {
      const referrals = await sb('referrals?select=*&order=created_at.desc');
      return json(200, { referrals });
    }
    if (event.httpMethod === 'POST') {
      const { referral_id } = JSON.parse(event.body || '{}');
      if (!referral_id) return json(400, { error: 'referral_id requerido' });

      const rows = await sb(`referrals?id=eq.${referral_id}&select=*`);
      if (!rows.length) return json(404, { error: 'Referido no encontrado' });
      const referral = rows[0];
      if (referral.status === 'Confirmado') {
        return json(200, { referral, alreadyConfirmed: true });
      }

      const referrerRows = await sb(`clients?phone=eq.${encodeURIComponent(referral.referrer_phone)}&select=*`);
      if (referrerRows.length) {
        const referrer = referrerRows[0];
        await sb(`clients?id=eq.${referrer.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ points: referrer.points + 300 }),
        });
      }

      const updated = await sb(`referrals?id=eq.${referral.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'Confirmado' }),
      });
      return json(200, { referral: updated[0] });
    }
    if (event.httpMethod === 'DELETE') {
      const { referral_id } = JSON.parse(event.body || '{}');
      if (!referral_id) return json(400, { error: 'referral_id requerido' });

      await sb(`referrals?id=eq.${referral_id}`, { method: 'DELETE' });
      return json(200, { message: 'Recomendación eliminada' });
    }
    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
