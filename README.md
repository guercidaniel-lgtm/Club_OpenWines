# Club Openwines

Membresía + catálogo de combos para la distribuidora. Frontend estático
(`/public`), backend en Netlify Functions (`/netlify/functions`), datos en
Supabase (Postgres, vía REST con la service role key).

## Estructura

```
public/            index.html (cliente), admin.html, out.html, css/, js/
netlify/functions/ funciones Node (una por endpoint)
supabase/schema.sql
netlify.toml
```

---

## 1. Crear el proyecto en Supabase

1. Entrá a [supabase.com](https://supabase.com) y creá una cuenta / iniciá sesión (esto lo hacés vos, con tus credenciales).
2. **New project** → elegí organización, nombre (ej. `club-openwines`), contraseña de base de datos (guardala) y región (la más cercana, ej. South America).
3. Esperá a que termine de aprovisionarse (1-2 min).
4. Andá a **SQL Editor** → **New query**, pegá el contenido completo de [`supabase/schema.sql`](supabase/schema.sql) y ejecutalo (▶ Run). Esto crea las 7 tablas, los índices, habilita RLS y carga el seed de bodegas (con `our_line`), un combo de ejemplo y los 3 restaurantes.
5. Andá a **Project Settings → API** y copiá:
   - **Project URL** → será `SUPABASE_URL`
   - **service_role key** (no la `anon`/`public`) → será `SUPABASE_SERVICE_KEY`. Es secreta, nunca la pongas en el frontend.

### Completar datos que todavía faltan

El seed deja `wineries.one_liner`, `website_url` y `logo_url` vacíos (no
inventamos contenido de marca de terceros). `our_line` ya viene cargado
como "Todas las líneas, según disponibilidad" para las 7. Completá lo
que falta desde **Table Editor → wineries** en Supabase, o con SQL:

```sql
update wineries set
  one_liner = 'Una línea de historia de la bodega',
  website_url = 'https://sitio-de-la-bodega.com',
  logo_url = 'https://.../logo.png'
where name = 'Bodega Budeguer';
```

Los 3 restaurantes ya están cargados con dirección, `maps_url` y `wines_on_menu`.

---

## 2. Instalar el CLI de Netlify y loguearte

```bash
npm install -g netlify-cli
netlify login       # abre el navegador para que autorices tu cuenta — lo hacés vos
```

## 3. Inicializar el sitio en Netlify

Desde la carpeta del proyecto (`C:\Users\Usuario\Club_OpenWines`):

```bash
netlify init
```

- Elegí **Create & configure a new site** (o **Link this directory to an existing site** si ya creaste uno desde el dashboard).
- Team: la tuya.
- Site name: lo que quieras (ej. `club-openwines`).
- Build command: dejalo vacío (no hay build step).
- Directory to deploy: `public`
- Functions directory: `netlify/functions`

Esto genera un `.netlify/state.json` local (ya está en `.gitignore`).

## 4. Configurar variables de entorno en Netlify

Por CLI:

```bash
netlify env:set SUPABASE_URL "https://XXXXXXXX.supabase.co"
netlify env:set SUPABASE_SERVICE_KEY "eyJ..."
netlify env:set ADMIN_KEY "elegí-una-clave-larga-y-rara"
netlify env:set WHATSAPP_NUMBER "5493585730000"
```

O desde el dashboard: **Site configuration → Environment variables → Add a variable**, una por una con esos mismos nombres.

> `ADMIN_KEY` es la clave que vas a tipear en `/admin.html` (se guarda en `localStorage` del navegador, se manda como header `x-admin-key` en cada request de admin).
>
> `WHATSAPP_NUMBER` es el número de la distribuidora, usado en el botón "WhatsApp" de los combos (formato `54` + `9` + área + línea, sin `+` ni espacios).

## 5. Probar localmente (opcional)

```bash
cp .env.example .env   # completar con tus valores reales
netlify dev
```

Abre `http://localhost:8888` (cliente) y `http://localhost:8888/admin.html`.

## 6. Deploy

```bash
netlify deploy --prod
```

Netlify sube `public/` como sitio estático y `netlify/functions/*.js` como
funciones serverless, accesibles en `/api/*` gracias al redirect de
[`netlify.toml`](netlify.toml). Al terminar te da la URL de producción.

---

## Notas de seguridad

- El frontend nunca habla directo con Supabase: todo pasa por las
  Netlify Functions, que son las únicas que tienen la `service_role key`.
- Las tablas tienen RLS habilitado sin policies, así que ni siquiera con
  la `anon key` se podría leer/escribir directo — solo la `service_role`
  (usada server-side) evita RLS.
- `/admin.html` no tiene autenticación robusta (es una clave compartida
  vía variable de entorno), acorde a lo pedido. Si más adelante necesitás
  algo más fuerte (usuarios individuales, roles), avisame y lo migramos a
  Supabase Auth.

## Qué falta para ir a producción

1. `one_liner`, `website_url` y `logo_url` de cada bodega (ver sección de arriba).
2. Ejecutar los pasos 1 a 6 de arriba con tus propias cuentas de Supabase y Netlify.
