const { sb } = require('./_supabase');
const { computeLevel, nextLevelInfo, isWelcomeEligible, effectiveDiscount } = require('./_lib');
const { json } = require('./_http');

// Endpoint agregado: todo lo que necesita el dashboard del cliente en un
// solo viaje (nivel, puntos, combos con su estado de bloqueo, bodegas,
// restaurantes y el número de WhatsApp de la distribuidora).
exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  const phone = event.queryStringParameters && event.queryStringParameters.phone;
  if (!phone) return json(400, { error: 'phone requerido' });

  try {
    const clients = await sb(`clients?phone=eq.${encodeURIComponent(phone)}&select=*`);
    if (!clients.length) return json(404, { error: 'Cliente no encontrado' });
    const client = clients[0];

    // Usar puntos vigentes para calcular nivel (considera vigencia 12/24 meses)
    const pointsForLevel = client.points_vigent !== null ? client.points_vigent : client.points;
    const level = computeLevel(pointsForLevel);
    const { nextLevel, pointsToNext } = nextLevelInfo(pointsForLevel);

    const purchases = await sb(`purchases?client_id=eq.${client.id}&select=id`);
    const welcomeDiscount = isWelcomeEligible(client, purchases.length);
    const discountPercent = effectiveDiscount(client, level, purchases.length);

    // Verificar si ya reclamó cupón de scratch
    // Contar si tiene CUALQUIER fila en scratch_cards (incluso retry/mala suerte)
    let hasScratchCard = false;
    try {
      const scratchCards = await sb(`scratch_cards?client_id=eq.${client.id}&select=id`);
      hasScratchCard = Array.isArray(scratchCards) && scratchCards.length > 0;
    } catch (err) {
      // Si hay error, asumir que SÍ tiene cupón (más seguro)
      console.error('Error verificando scratch cards:', err);
      hasScratchCard = true;
    }

    // Solo combos vigentes: sin vencimiento o con valid_until todavía no cumplido.
    const nowIso = encodeURIComponent(new Date().toISOString());
    const combosRaw = await sb(
      `combos?select=*&order=created_at.desc&or=(valid_until.is.null,valid_until.gte.${nowIso})`
    );
    const now = Date.now();
    const combos = combosRaw.map((c) => {
      let locked = false;
      let unlocksAt = null;
      if (level === 'Bronce' && c.anticipo_horas > 0) {
        const unlockTime = new Date(c.created_at).getTime() + c.anticipo_horas * 3600000;
        if (now < unlockTime) {
          locked = true;
          unlocksAt = new Date(unlockTime).toISOString();
        }
      }
      return { ...c, locked, unlocksAt };
    });

    const wineries = await sb('wineries?select=*&order=sort_order.asc');
    const restaurants = await sb('restaurants?select=*&order=sort_order.asc');
    const moments = await sb('moments?select=*&order=created_at.desc');

    return json(200, {
      client,
      level,
      nextLevel,
      pointsToNext,
      welcomeDiscount,
      discountPercent,
      hasScratchCard,
      combos,
      wineries,
      restaurants,
      moments,
      business: {
        whatsapp: process.env.WHATSAPP_NUMBER || '',
        vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
      },
    });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
