const { sb } = require('./_supabase');
const { json } = require('./_http');

const VALID_PREFS = ['Malbec', 'Cabernet Sauvignon', 'Cabernet Franc', 'Syrah', 'Merlot', 'Petit Verdot', 'Bonarda', 'Pinot Noir', 'Tempranillo', 'Garnacha', 'Sauvignon Blanc', 'Torrontés', 'Viognier', 'Chardonnay', 'Blanco Dulce', 'Rosé', 'Espumante Brut', 'Extra Brut', 'Brut Rosé', 'Blend', 'Ancellotta'];

// Bono de 150 puntos, una única vez, al completar fecha de nacimiento +
// preferencias de varietal. El flag profile_complete evita el doble bono.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { phone, birthday, prefs } = JSON.parse(event.body || '{}');
    if (!phone || !birthday || !Array.isArray(prefs) || !prefs.length) {
      return json(400, { error: 'Datos incompletos' });
    }
    const cleanPrefs = prefs.filter((p) => VALID_PREFS.includes(p));
    if (!cleanPrefs.length) return json(400, { error: 'Preferencias inválidas' });

    const clients = await sb(`clients?phone=eq.${encodeURIComponent(phone)}&select=*`);
    if (!clients.length) return json(404, { error: 'Cliente no encontrado' });
    const client = clients[0];

    if (client.profile_complete) {
      return json(200, { client, bonusApplied: false });
    }

    const updated = await sb(`clients?id=eq.${client.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        birthday,
        prefs: cleanPrefs,
        profile_complete: true,
        points: client.points + 150,
      }),
    });
    return json(200, { client: updated[0], bonusApplied: true });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
