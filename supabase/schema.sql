-- Club Openwines — esquema inicial Supabase (Postgres)
-- Ejecutar completo en Supabase SQL Editor (proyecto nuevo).

create extension if not exists "pgcrypto";

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  name text not null,
  points integer not null default 0,
  birthday date,
  prefs text[] not null default '{}',
  profile_complete boolean not null default false,
  scratch_card_claimed boolean not null default false,
  origin text not null default 'organico' check (origin in ('organico','referido','restaurante')),
  origin_detail text,
  created_at timestamptz not null default now()
);

-- Agregar columna si la tabla ya existe sin ella
alter table clients add column if not exists scratch_card_claimed boolean not null default false;

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists combos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bottles integer not null check (bottles > 0),
  price numeric not null check (price > 0),
  description text,
  anticipo_horas integer not null default 0 check (anticipo_horas in (0,24,48)),
  image_url text,
  valid_until timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

-- Por si esta tabla ya existía de un schema anterior sin estas columnas.
alter table combos add column if not exists image_url text;
alter table combos add column if not exists valid_until timestamptz;
alter table combos add column if not exists notified_at timestamptz;
create index if not exists idx_combos_valid_until on combos(valid_until);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  combo_id uuid not null references combos(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  subtotal numeric not null default 0,
  referral_discount numeric not null default 0,
  coupon_discount numeric not null default 0,
  coupon_code text,
  total numeric not null,
  payment_method text,
  status text not null default 'Pendiente',
  created_at timestamptz not null default now()
);

-- Agregar columnas si la tabla ya existía sin ellas
alter table orders add column if not exists subtotal numeric not null default 0;
alter table orders add column if not exists referral_discount numeric not null default 0;
alter table orders add column if not exists coupon_discount numeric not null default 0;
alter table orders add column if not exists coupon_code text;

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_phone text not null,
  referrer_name text,
  friend_name text not null,
  friend_phone text not null,
  status text not null default 'Pendiente' check (status in ('Pendiente','Confirmado')),
  created_at timestamptz not null default now()
);

create table if not exists wineries (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  one_liner text,
  our_line text,
  website_url text,
  logo_url text,
  sort_order integer not null default 0
);

create table if not exists restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text,
  maps_url text,
  wines_on_menu text,
  instagram_url text,
  background_image_url text,
  sort_order integer not null default 0
);

-- Por si esta tabla ya existía de un schema anterior sin estas columnas.
alter table restaurants add column if not exists instagram_url text;
alter table restaurants add column if not exists background_image_url text;

-- "Momentos Openwines": fotos de catas/eventos organizados por la
-- distribuidora, con dos descripciones breves (dónde se hizo y con qué
-- bodega). Se ordenan por fecha de carga, más nuevo primero.
create table if not exists moments (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  location text,
  winery text,
  created_at timestamptz not null default now()
);
alter table moments enable row level security;

-- Suscripciones a notificaciones push del navegador (Web Push). Cada
-- fila es un dispositivo/navegador suscripto de un cliente. endpoint es
-- único: si el mismo navegador se vuelve a suscribir, se actualiza en
-- vez de duplicarse.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;

-- Cupones de "Probá tu suerte" — raspa tu suerte al loguear, gana premio,
-- descarga email, genera cupón de uso único.
create table if not exists scratch_cards (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  prize text not null check (prize in ('$10000', '$5000', '$2500', 'points500', 'retry')),
  coupon_code text not null unique,
  email text not null,
  claimed_at timestamptz not null default now(),
  used_at timestamptz,
  expires_at timestamptz not null,
  is_birthday boolean not null default false
);
alter table scratch_cards enable row level security;

create index if not exists idx_scratch_cards_client on scratch_cards(client_id);
create index if not exists idx_scratch_cards_coupon on scratch_cards(coupon_code);

create index if not exists idx_purchases_client on purchases(client_id);
create index if not exists idx_orders_client on orders(client_id);
create index if not exists idx_orders_combo on orders(combo_id);
create index if not exists idx_clients_phone on clients(phone);
create index if not exists idx_referrals_referrer_phone on referrals(referrer_phone);
create index if not exists idx_referrals_friend_phone on referrals(friend_phone);

-- RLS habilitado sin policies: solo la service_role key (usada desde las
-- Netlify Functions) puede leer/escribir. El frontend nunca habla
-- directo con Supabase, así que no hace falta exponer anon key.
alter table clients enable row level security;
alter table purchases enable row level security;
alter table combos enable row level security;
alter table orders enable row level security;
alter table referrals enable row level security;
alter table wineries enable row level security;
alter table restaurants enable row level security;

-- Seed: bodegas iniciales. our_line es un texto fijo (no se sincroniza
-- con el catálogo real, que cambia seguido). one_liner, website_url y
-- logo_url quedan NULL a propósito: completalos vos (Table Editor de
-- Supabase o UPDATE) con el texto y las URLs reales de cada bodega.
insert into wineries (name, our_line, sort_order) values
  ('WHT (Huarpe-Riglos Family Wines)', 'Todas las líneas, según disponibilidad', 1),
  ('Bodega Budeguer', 'Todas las líneas, según disponibilidad', 2),
  ('Finca La Anita', 'Todas las líneas, según disponibilidad', 3),
  ('Bodega Sottano', 'Todas las líneas, según disponibilidad', 4),
  ('Sin Reglas', 'Todas las líneas, según disponibilidad', 5),
  ('Colosso Wines', 'Todas las líneas, según disponibilidad', 6),
  ('Domaine Bousquet', 'Todas las líneas, según disponibilidad', 7)
on conflict (name) do nothing;

-- Seed: combo de ejemplo para poder probar el flujo de punta a punta.
insert into combos (name, bottles, price, description, anticipo_horas) values
  ('Combo Boutique x6', 6, 45000, 'Selección de línea media de la semana.', 24)
on conflict do nothing;

-- Seed: restaurantes iniciales, con dirección real, link de Google Maps e Instagram.
insert into restaurants (name, address, maps_url, wines_on_menu, instagram_url, sort_order) values
  ('Casa Pauline', 'Calle Alvear 757, Río Cuarto, Córdoba (CP 5800)', 'https://www.google.com/maps/place/Casa+Pauline/@-33.1234918,-64.3529542,17z/data=!3m1!4b1!4m6!3m5!1s0x95d201b6bc0013d7:0x93bc0a068fdfe351!8m2!3d-33.1234963!4d-64.3503793!16s%2Fg%2F11qqxwk2v1', 'Carta rotativa — variedad según temporada', 'https://www.instagram.com/casapauline.bar/', 1),
  ('Los Primos Hnos', 'Isla de los Estados 328, X5800 Río Cuarto, Córdoba (Patio Line)', 'https://www.google.com/maps/place/Los+Primos+hnos/@-33.1096875,-64.3858216,17z/data=!3m1!4b1!4m6!3m5!1s0x95d20112867bfc8d:0x4b95b846df75f523!8m2!3d-33.109692!4d-64.3832467!16s%2Fg%2F11swzlj6kt', 'Carta rotativa — variedad según temporada', 'https://www.instagram.com/losprimoshnos/', 2),
  ('Pizzería Popular Río Cuarto', 'Isla de los Estados 328, X5800 Río Cuarto, Córdoba (Patio Line)', 'https://www.google.com/maps/place/POPULAR+%E2%80%93+RINCO%CC%81N+NUESTRO/@-33.1096184,-64.3859214,17z/data=!3m1!4b1!4m6!3m5!1s0x95d2019aa2ae7855:0xf6b9b21acf8f7075!8m2!3d-33.1096229!4d-64.3833465!16s%2Fg%2F11rr2fv1k4', 'Carta rotativa — variedad según temporada', 'https://www.instagram.com/pizzeriapopular_riocuarto/', 3)
on conflict (name) do nothing;

-- Si tu proyecto de Supabase ya existía desde antes de que `name` fuera
-- UNIQUE en wineries/restaurants (por eso este script, corrido dos veces,
-- pudo duplicar filas), corré esto UNA VEZ en el SQL Editor para ponerte
-- al día — primero borra los duplicados quedándose con la fila más
-- vieja de cada nombre, después agrega la restricción:
--
-- delete from wineries a using wineries b
--   where a.name = b.name and a.ctid > b.ctid;
-- alter table wineries add constraint wineries_name_key unique (name);
--
-- delete from restaurants a using restaurants b
--   where a.name = b.name and a.ctid > b.ctid;
-- alter table restaurants add constraint restaurants_name_key unique (name);
