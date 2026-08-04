const { sb } = require('./_supabase');
const { requireAdmin } = require('./_auth');
const { json } = require('./_http');

// Cumpleaños del mes, filtrados a nivel Oro (3000+ puntos).
exports.handler = async (event) => {
  if (!requireAdmin(event)) return json(401, { error: 'No autorizado' });
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  try {
    const clients = await sb('clients?points=gte.3000&birthday=not.is.null&select=*');
    const month = new Date().getMonth() + 1;
    // birthday es un `date` tipo "1990-08-01": comparar el string
    // directamente evita que new Date() lo lea como medianoche UTC y,
    // por el huso horario, lo corra a un mes distinto (ej. los nacidos
    // el día 1 quedarían filtrados en el mes anterior).
    const birthdays = clients.filter((c) => Number(c.birthday.split('-')[1]) === month);
    return json(200, { clients: birthdays });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
