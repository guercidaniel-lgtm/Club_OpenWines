const { sb } = require('./_supabase');
const { json } = require('./_http');

const prizeLabels = {
  '$10000': '$10.000',
  '$5000': '$5.000',
  '$2500': '$2.500',
  'points500': '+500 puntos'
};

async function sendEmail(toEmail, couponCode, prizeLabel, clientName) {
  // Usar SendGrid o servicio de email configurado
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.warn('SENDGRID_API_KEY no configurado, email no enviado');
    return false;
  }

  const html = `
    <h2>¡Felicidades, ${clientName}!</h2>
    <p>Ganaste: <strong>${prizeLabel}</strong></p>
    <p>Tu código de cupón es:</p>
    <h1 style="font-family: monospace; letter-spacing: 2px; background: #f0f0f0; padding: 20px; border-radius: 8px;">
      ${couponCode}
    </h1>
    <p><strong>Válido por 30 días • Uso único en checkout</strong></p>
    <p>¡No olvides usarlo en tu próxima compra!</p>
  `;

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail }] }],
        from: { email: 'noreply@club-openwines.com', name: 'Club Openwines' },
        subject: '¡Tu cupón está listo! 🎉',
        html,
      }),
    });
    return response.ok;
  } catch (err) {
    console.error('Error enviando email:', err);
    return false;
  }
}

// Genera un cupón usando el premio que envía el cliente
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { phone, email, prize, isBirthday } = JSON.parse(event.body || '{}');
    if (!phone || !email || !prize) return json(400, { error: 'Teléfono, email y premio requeridos' });

    // Validar que el premio sea válido
    const validPrizes = ['$10000', '$5000', '$2500', 'points500', 'retry'];
    if (!validPrizes.includes(prize)) {
      return json(400, { error: 'Premio inválido' });
    }

    // Buscar cliente
    const clients = await sb(`clients?phone=eq.${encodeURIComponent(phone)}&select=id,name`);
    if (!clients.length) return json(404, { error: 'Cliente no encontrado' });
    const client = clients[0];

    // Si es retry (mala suerte), no generar cupón pero sí registrar el intento
    if (prize === 'retry') {
      await sb('scratch_cards', {
        method: 'POST',
        body: JSON.stringify({
          client_id: client.id,
          prize: 'retry',
          coupon_code: 'NOLUCK',
          email,
          expires_at: new Date().toISOString(),
          is_birthday: isBirthday,
        }),
      });
      return json(200, {
        prize,
        couponCode: null,
        expiresAt: null,
      });
    }

    // Generar cupón único
    const couponCode = `LUCKY${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    // Vigencia: 30 días
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Guardar cupón
    await sb('scratch_cards', {
      method: 'POST',
      body: JSON.stringify({
        client_id: client.id,
        prize,
        coupon_code: couponCode,
        email,
        expires_at: expiresAt.toISOString(),
        is_birthday: isBirthday,
      }),
    });

    // Marcar cliente como que ya reclamó su cupón de bienvenida
    await sb(`clients?id=eq.${client.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ scratch_card_claimed: true }),
    });

    // Enviar email con el cupón
    const prizeLabel = prizeLabels[prize] || prize;
    await sendEmail(email, couponCode, prizeLabel, client.name);

    return json(200, {
      prize,
      couponCode,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
