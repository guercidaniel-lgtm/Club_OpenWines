const { sb } = require('./_supabase');
const { requireAdmin } = require('./_auth');
const { json } = require('./_http');

// GET: lista de restaurantes. PATCH {id, background_image_url}: actualiza
// la imagen de fondo de un restaurante (subida previamente vía admin-upload-image).
exports.handler = async (event) => {
  if (!requireAdmin(event)) return json(401, { error: 'No autorizado' });
  try {
    if (event.httpMethod === 'GET') {
      const restaurants = await sb('restaurants?select=*&order=sort_order.asc');
      return json(200, { restaurants });
    }
    if (event.httpMethod === 'PATCH') {
      const { id, background_image_url } = JSON.parse(event.body || '{}');
      if (!id || !background_image_url) return json(400, { error: 'Datos incompletos' });
      const updated = await sb(`restaurants?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ background_image_url }),
      });
      if (!updated.length) return json(404, { error: 'Restaurante no encontrado' });
      return json(200, { restaurant: updated[0] });
    }
    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
