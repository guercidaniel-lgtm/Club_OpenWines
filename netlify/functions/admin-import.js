const { sb } = require('./_supabase');
const { requireAdmin } = require('./_auth');
const { json } = require('./_http');

// Importación masiva desde Excel/CSV (parseado en el navegador con
// SheetJS). Por cada fila: crea el cliente si no existe (origen
// 'organico') y, si viene un monto, carga la compra y suma los puntos.
exports.handler = async (event) => {
  if (!requireAdmin(event)) return json(401, { error: 'No autorizado' });
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { rows } = JSON.parse(event.body || '{}');
    if (!Array.isArray(rows) || !rows.length) return json(400, { error: 'Sin filas para importar' });
    if (rows.length > 500) return json(400, { error: 'Máximo 500 filas por importación' });

    const results = [];
    for (const row of rows) {
      const phone = String(row.phone || '').trim();
      const name = String(row.name || '').trim();
      const amount = row.amount ? Number(row.amount) : 0;

      if (!phone || !name) {
        results.push({ phone: phone || '(sin teléfono)', status: 'omitido: falta nombre o teléfono' });
        continue;
      }

      let client;
      const existing = await sb(`clients?phone=eq.${encodeURIComponent(phone)}&select=*`);
      if (existing.length) {
        client = existing[0];
      } else {
        const created = await sb('clients', {
          method: 'POST',
          body: JSON.stringify({ name, phone, origin: 'organico' }),
        });
        client = created[0];
      }

      let pointsEarned = 0;
      if (amount > 0) {
        await sb('purchases', { method: 'POST', body: JSON.stringify({ client_id: client.id, amount }) });
        pointsEarned = Math.floor(amount / 1000);
        await sb(`clients?id=eq.${client.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ points: client.points + pointsEarned }),
        });
      }
      results.push({ phone, status: existing.length ? 'actualizado' : 'creado', pointsEarned });
    }

    return json(200, { results });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
