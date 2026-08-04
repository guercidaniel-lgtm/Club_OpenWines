const { sb } = require('./_supabase');
const { requireAdmin } = require('./_auth');
const { json } = require('./_http');

// "Momentos Openwines": fotos de catas/eventos, con dos descripciones
// breves (dónde se hizo y con qué bodega). GET lista, POST crea, DELETE borra.
exports.handler = async (event) => {
  if (!requireAdmin(event)) return json(401, { error: 'No autorizado' });
  try {
    if (event.httpMethod === 'GET') {
      const moments = await sb('moments?select=*&order=created_at.desc');
      return json(200, { moments });
    }
    if (event.httpMethod === 'POST') {
      const { image_url, location, winery } = JSON.parse(event.body || '{}');
      if (!image_url) return json(400, { error: 'Falta la imagen' });
      const created = await sb('moments', {
        method: 'POST',
        body: JSON.stringify({
          image_url,
          location: location || null,
          winery: winery || null,
        }),
      });
      return json(200, { moment: created[0] });
    }
    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters && event.queryStringParameters.id;
      if (!id) return json(400, { error: 'id requerido' });
      await sb(`moments?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
      return json(200, { deleted: true });
    }
    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
