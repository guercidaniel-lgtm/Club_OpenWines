const { sb } = require('./_supabase');
const { requireAdmin } = require('./_auth');
const { json } = require('./_http');

exports.handler = async (event) => {
  if (!requireAdmin(event)) return json(401, { error: 'No autorizado' });

  if (event.httpMethod === 'GET') {
    try {
      const flyers = await sb('flyers?select=*&order=display_order.asc');
      return json(200, { flyers: flyers || [] });
    } catch (err) {
      return json(500, { error: err.message });
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const { image_url, title, description, display_order } = JSON.parse(event.body || '{}');
      if (!image_url) return json(400, { error: 'image_url requerido' });

      const created = await sb('flyers', {
        method: 'POST',
        body: JSON.stringify({
          image_url,
          title: title || null,
          description: description || null,
          display_order: display_order || 0,
        }),
      });

      return json(200, { flyer: created[0] });
    } catch (err) {
      return json(500, { error: err.message });
    }
  }

  if (event.httpMethod === 'DELETE') {
    try {
      const { flyer_id } = JSON.parse(event.body || '{}');
      if (!flyer_id) return json(400, { error: 'flyer_id requerido' });

      await sb(`flyers?id=eq.${flyer_id}`, { method: 'DELETE' });
      return json(200, { message: 'Flyer eliminado' });
    } catch (err) {
      return json(500, { error: err.message });
    }
  }

  return json(405, { error: 'Method not allowed' });
};
