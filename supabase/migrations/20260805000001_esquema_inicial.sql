-- ═══════════════════════════════════════════════════════════════════════════
-- MDC · Maquinaria de Chiapas — Esquema inicial
--
-- PRINCIPIO RECTOR: negar por defecto.
-- Cada tabla enciende Row Level Security (RLS) y arranca sin ningún permiso.
-- Después se conceden permisos mínimos, uno por uno, de forma explícita.
--
-- Esto importa porque en Supabase el navegador habla DIRECTO con Postgres
-- usando la llave pública (anon). No hay un servidor intermedio que revise
-- nada: las políticas de aquí abajo SON la seguridad. Si una política está
-- mal, cualquiera con la llave pública —que es visible en el código— puede
-- leer o escribir esa tabla.
--
-- Aplicar con:  supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- PERFILES — quién es admin
--
-- No guardamos el rol en los metadatos del usuario porque ésos son
-- editables desde el cliente en algunas configuraciones. Va en una tabla
-- aparte que el usuario NO puede modificar.
-- ─────────────────────────────────────────────────────────────────────────
create table public.perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) between 2 and 120),
  rol         text not null default 'staff' check (rol in ('admin', 'staff')),
  creado_en   timestamptz not null default now()
);

comment on table public.perfiles is
  'Roles del personal. El rol NUNCA se modifica desde el cliente: ver trigger bloquear_escalada_de_rol.';

alter table public.perfiles enable row level security;
alter table public.perfiles force row level security;

/* Comprueba si quien hace la petición es administrador.

   `security definer` la ejecuta con los permisos del dueño, saltándose el RLS
   de perfiles — necesario para evitar una recursión infinita (la política de
   perfiles preguntaría por perfiles).

   `set search_path = ''` es obligatorio: sin eso, alguien que pueda crear un
   esquema podría suplantar la tabla `perfiles` y volverse admin. Es una vía
   de escalada de privilegios real, no teórica. */
create or replace function public.es_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'admin'
  );
$$;

/* Impide que alguien se ascienda a sí mismo a administrador.
   Sin esto, un usuario con permiso de editar su propio perfil podría
   cambiar `rol` a 'admin' y tomar control de todo el sistema. */
create or replace function public.bloquear_escalada_de_rol()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rol is distinct from old.rol and not public.es_admin() then
    raise exception 'Sólo un administrador puede cambiar roles';
  end if;
  return new;
end;
$$;

create trigger perfiles_bloquear_escalada
  before update on public.perfiles
  for each row execute function public.bloquear_escalada_de_rol();

create policy "cada quien ve su perfil"
  on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_admin());

create policy "cada quien edita su nombre"
  on public.perfiles for update to authenticated
  using (id = auth.uid() or public.es_admin());

-- Nadie inserta ni borra perfiles desde el cliente: eso lo hace el trigger
-- de alta de usuario, más abajo.


-- ─────────────────────────────────────────────────────────────────────────
-- EQUIPOS — el catálogo
-- ─────────────────────────────────────────────────────────────────────────
create table public.equipos (
  id            bigint generated always as identity primary key,
  slug          text not null unique
                check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre        text not null check (length(trim(nombre)) between 3 and 160),
  marca         text not null check (length(trim(marca)) between 1 and 60),
  categoria     text not null check (length(trim(categoria)) between 1 and 60),
  condicion     text not null check (condicion in ('Nuevo', 'Usado', 'Renta')),

  -- Los precios en centavos, como enteros. Nunca en punto flotante: 0.1 + 0.2
  -- no da 0.3 en binario, y en dinero eso son centavos que desaparecen.
  precio_cents      bigint not null check (precio_cents >= 0),
  precio_anterior_cents bigint check (precio_anterior_cents > precio_cents),

  financiamiento text check (length(financiamiento) <= 40),
  arrendamiento  boolean not null default false,
  envio_incluido boolean not null default false,
  ubicacion      text not null check (length(trim(ubicacion)) between 2 and 120),
  anio           smallint not null check (anio between 1970 and 2100),
  especificaciones text[] not null default '{}'
                   check (cardinality(especificaciones) <= 12),
  descripcion    text not null default '' check (length(descripcion) <= 4000),
  imagen_url     text check (imagen_url ~ '^https://'),
  icono          text not null default 'excavadora',
  destacado      boolean not null default false,

  -- Un equipo sólo es visible al público si está publicado. Permite preparar
  -- fichas sin que se vean a medias.
  publicado      boolean not null default false,

  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on column public.equipos.precio_cents is
  'En centavos. $2,850,000.00 MXN se guarda como 285000000.';

create index equipos_publicados_idx on public.equipos (publicado, categoria)
  where publicado;
create index equipos_slug_idx on public.equipos (slug);

alter table public.equipos enable row level security;
alter table public.equipos force row level security;

-- El catálogo es público POR DISEÑO: para eso existe la tienda.
-- Pero sólo lo publicado, y sólo lectura.
create policy "cualquiera lee el catálogo publicado"
  on public.equipos for select to anon, authenticated
  using (publicado = true);

create policy "el personal ve todo, incluso borradores"
  on public.equipos for select to authenticated
  using (public.es_admin());

create policy "sólo un admin da de alta equipos"
  on public.equipos for insert to authenticated
  with check (public.es_admin());

create policy "sólo un admin edita equipos"
  on public.equipos for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

create policy "sólo un admin borra equipos"
  on public.equipos for delete to authenticated
  using (public.es_admin());


-- ─────────────────────────────────────────────────────────────────────────
-- SUCURSALES Y AJUSTES — contenido editable del sitio
-- ─────────────────────────────────────────────────────────────────────────
create table public.sucursales (
  id        bigint generated always as identity primary key,
  nombre    text not null check (length(trim(nombre)) between 2 and 120),
  direccion text not null check (length(trim(direccion)) between 5 and 240),
  telefono  text not null check (telefono ~ '^[0-9 +()-]{7,20}$'),
  horario   text not null default '',
  orden     smallint not null default 0
);

alter table public.sucursales enable row level security;
alter table public.sucursales force row level security;

create policy "las sucursales son públicas"
  on public.sucursales for select to anon, authenticated using (true);
create policy "sólo un admin edita sucursales"
  on public.sucursales for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Ajustes del sitio: una sola fila, forzada por la restricción de abajo.
create table public.ajustes (
  id             boolean primary key default true check (id),
  marca_nombre   text not null default 'MDC',
  marca_completa text not null default 'Maquinaria de Chiapas',
  color_acento   text not null default '#F5C400' check (color_acento ~ '^#[0-9A-Fa-f]{6}$'),
  logo_url       text check (logo_url ~ '^https://'),
  telefono       text not null default '',
  whatsapp       text not null default '' check (whatsapp ~ '^[0-9]*$'),
  correo         text not null default '',
  direccion      text not null default '',
  horario        text not null default '',
  actualizado_en timestamptz not null default now()
);

alter table public.ajustes enable row level security;
alter table public.ajustes force row level security;

create policy "los ajustes son públicos"
  on public.ajustes for select to anon, authenticated using (true);
create policy "sólo un admin cambia los ajustes"
  on public.ajustes for all to authenticated
  using (public.es_admin()) with check (public.es_admin());


-- ─────────────────────────────────────────────────────════════════════════
-- SOLICITUDES — cotizaciones y publicaciones de equipo
--
-- ⚠️ LA TABLA MÁS DELICADA DEL SISTEMA.
-- Contiene datos personales de clientes: nombre, teléfono, correo. Bajo la
-- LFPDPPP somos responsables de protegerlos.
--
-- Regla: cualquiera puede ESCRIBIR (para eso es el formulario), pero NADIE
-- puede LEER salvo el personal. Confundir esto es la filtración clásica:
-- se deja `for all using (true)` y de pronto tu competencia descarga tu
-- lista completa de prospectos con una sola petición.
-- ─────────────────────────────────────────────────────────────────────────
create table public.solicitudes (
  id          bigint generated always as identity primary key,
  tipo        text not null check (tipo in ('cotizacion', 'publicacion')),
  nombre      text not null check (length(trim(nombre)) between 2 and 120),
  telefono    text not null check (telefono ~ '^[0-9]{10}$'),
  correo      text check (correo ~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  empresa     text check (length(empresa) <= 160),
  mensaje     text not null default '' check (length(mensaje) <= 4000),
  carrito     jsonb not null default '[]'::jsonb,
  estado      text not null default 'nueva'
              check (estado in ('nueva', 'atendida', 'cerrada', 'spam')),
  creado_en   timestamptz not null default now()
);

create index solicitudes_pendientes_idx on public.solicitudes (creado_en desc)
  where estado = 'nueva';
create index solicitudes_telefono_idx on public.solicitudes (telefono, creado_en desc);

alter table public.solicitudes enable row level security;
alter table public.solicitudes force row level security;

/* Freno de spam del lado del servidor.

   El filtro del navegador (campo trampa y tiempo mínimo) se salta con un
   script en dos líneas. Esta comprobación corre en la base de datos, donde
   el atacante no llega: máximo 3 solicitudes por teléfono cada 10 minutos. */
create or replace function public.frenar_spam_solicitudes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recientes integer;
begin
  select count(*) into recientes
  from public.solicitudes
  where telefono = new.telefono
    and creado_en > now() - interval '10 minutes';

  if recientes >= 3 then
    raise exception 'Demasiadas solicitudes seguidas. Intenta de nuevo en unos minutos.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger solicitudes_frenar_spam
  before insert on public.solicitudes
  for each row execute function public.frenar_spam_solicitudes();

-- Cualquiera puede enviar una solicitud...
create policy "cualquiera puede enviar una solicitud"
  on public.solicitudes for insert to anon, authenticated
  with check (
    -- El estado inicial no se elige desde el cliente: nadie marca su
    -- propia solicitud como "atendida" o "spam".
    estado = 'nueva'
  );

-- ...pero SÓLO el personal puede leerlas.
-- Sin esta restricción, la llave pública bastaría para descargar toda la
-- base de clientes.
create policy "sólo el personal lee solicitudes"
  on public.solicitudes for select to authenticated
  using (public.es_admin());

create policy "sólo el personal cambia el estado"
  on public.solicitudes for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Nadie borra solicitudes, ni siquiera un admin: son el registro comercial
-- y la evidencia de consentimiento. Se marcan como 'cerrada' o 'spam'.


-- ─────────────────────────────────────────────────────────────────────────
-- BITÁCORA — quién cambió qué
--
-- Sin registro no hay forma de saber si un precio se movió por error o por
-- alguien que no debía. El día que algo salga mal, esto es lo único que
-- responde "¿qué pasó?".
-- ─────────────────────────────────────────────────────────────────────────
create table public.bitacora (
  id         bigint generated always as identity primary key,
  actor      uuid references auth.users(id) on delete set null,
  tabla      text not null,
  operacion  text not null check (operacion in ('INSERT', 'UPDATE', 'DELETE')),
  registro   bigint,
  antes      jsonb,
  despues    jsonb,
  ocurrio_en timestamptz not null default now()
);

create index bitacora_reciente_idx on public.bitacora (ocurrio_en desc);

alter table public.bitacora enable row level security;
alter table public.bitacora force row level security;

-- Sólo lectura, y sólo para admins. Nadie la escribe ni la altera desde el
-- cliente: la llena el trigger, que corre con permisos elevados.
create policy "sólo un admin consulta la bitácora"
  on public.bitacora for select to authenticated
  using (public.es_admin());

create or replace function public.registrar_en_bitacora()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.bitacora (actor, tabla, operacion, registro, antes, despues)
  values (
    auth.uid(),
    tg_table_name,
    tg_op,
    case when tg_op = 'DELETE' then old.id else new.id end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger equipos_bitacora
  after insert or update or delete on public.equipos
  for each row execute function public.registrar_en_bitacora();

create trigger sucursales_bitacora
  after insert or update or delete on public.sucursales
  for each row execute function public.registrar_en_bitacora();


-- ─────────────────────────────────────────────────────────────────────────
-- ALTA DE USUARIOS
--
-- El primer usuario que se registre queda como admin (eres tú, al montar el
-- sistema). Los siguientes entran como 'staff' y un admin debe promoverlos.
-- Evita que cualquiera que se registre tenga control total.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.crear_perfil_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  es_el_primero boolean;
begin
  select not exists (select 1 from public.perfiles) into es_el_primero;

  insert into public.perfiles (id, nombre, rol)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), 'Sin nombre'),
    case when es_el_primero then 'admin' else 'staff' end
  );
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_al_registrarse();


-- ─────────────────────────────────────────────────────────────────────────
-- MANTENIMIENTO
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.tocar_actualizado_en()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

create trigger equipos_actualizado before update on public.equipos
  for each row execute function public.tocar_actualizado_en();
create trigger ajustes_actualizado before update on public.ajustes
  for each row execute function public.tocar_actualizado_en();

insert into public.ajustes (id) values (true) on conflict do nothing;
