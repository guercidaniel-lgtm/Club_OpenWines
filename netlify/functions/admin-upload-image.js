const { requireAdmin } = require('./_auth');
const { json } = require('./_http');

const MAX_BYTES = 3 * 1024 * 1024; // 3MB — deja margen bajo el límite de payload de Netlify Functions
const ALLOWED_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png' };
const ALLOWED_BUCKETS = new Set(['combo-images', 'restaurant-images', 'moment-photos', 'flyer-images']);

// Sube una imagen (mandada en base64 desde el navegador) a uno de los
// buckets públicos de Supabase Storage y devuelve la URL pública.
// Compartida entre combos (image_url) y restaurantes (background_image_url).
exports.handler = async (event) => {
  if (!requireAdmin(event)) return json(401, { error: 'No autorizado' });
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { bucket, filename, contentType, dataBase64 } = JSON.parse(event.body || '{}');
    if (!bucket || !ALLOWED_BUCKETS.has(bucket)) return json(400, { error: 'Bucket inválido' });
    if (!filename || !contentType || !dataBase64) return json(400, { error: 'Datos incompletos' });
    if (!ALLOWED_TYPES[contentType]) return json(400, { error: 'Solo se aceptan imágenes JPG o PNG' });

    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length > MAX_BYTES) return json(400, { error: 'La imagen no puede pesar más de 3MB' });

    const ext = ALLOWED_TYPES[contentType];
    const safeName = filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-]+/g, '-').slice(0, 40) || 'img';
    const path = `${Date.now()}-${safeName}.${ext}`;

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return json(500, { error: 'Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en las variables de entorno' });
    }

    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        apikey: SUPABASE_SERVICE_KEY,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: buffer,
    });
    if (!uploadRes.ok) {
      const text = await uploadRes.text().catch(() => '');
      return json(502, { error: `No se pudo subir la imagen: ${text}` });
    }

    return json(200, { url: `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}` });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
