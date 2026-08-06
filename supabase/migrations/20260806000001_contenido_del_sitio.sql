-- ═══════════════════════════════════════════════════════════════════════════
-- Contenido editable del sitio
--
-- El esquema inicial cubría el catálogo, pero la tabla `ajustes` se quedó
-- corta: data/catalogo.json guarda además el texto del hero, la barra
-- superior y el pie de página, y ésos también se editan desde el panel.
--
-- Si un dato vive en el JSON pero no en la base, la migración deja de ser
-- completa: al centralizar habría que seguir tocando archivos a mano para la
-- mitad del contenido. Esto cierra ese hueco — después de esta migración, la
-- base puede reproducir data/catalogo.json entero.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.ajustes
  -- La marca se pinta en dos colores: "MD" en blanco y "C" en el acento.
  -- Por eso son dos campos y no uno.
  add column if not exists marca_principal text not null default 'MD'
    check (length(trim(marca_principal)) between 1 and 20),
  add column if not exists marca_acento text not null default 'C'
    check (length(marca_acento) <= 20),

  add column if not exists barra_superior  text not null default ''
    check (length(barra_superior) <= 200),
  add column if not exists hero_etiqueta   text not null default ''
    check (length(hero_etiqueta) <= 120),
  add column if not exists hero_titulo     text not null default ''
    check (length(hero_titulo) <= 160),
  add column if not exists hero_resaltado  text not null default ''
    check (length(hero_resaltado) <= 160),
  add column if not exists hero_texto      text not null default ''
    check (length(hero_texto) <= 600),
  add column if not exists hero_imagen     text
    check (hero_imagen ~ '^https://'),
  add column if not exists vendedor        text not null default ''
    check (length(vendedor) <= 160),
  add column if not exists pie_descripcion text not null default ''
    check (length(pie_descripcion) <= 600);

-- `marca_nombre` quedó sustituida por marca_principal + marca_acento.
-- Se retira para que no haya dos campos que digan lo mismo: el día que
-- discrepen, nadie sabría cuál manda.
alter table public.ajustes drop column if exists marca_nombre;

comment on table public.ajustes is
  'Una sola fila (id = true). Contiene TODO el contenido editable del sitio: marca, contacto y textos de portada.';


-- ─────────────────────────────────────────────────────────────────────────
-- Vista pública del catálogo
--
-- El sitio consume pesos, no centavos, y nombres de campo que ya usa el
-- JavaScript. Convertir en la base —y no en cada lugar del cliente— evita
-- que un formateo distinto en una pantalla muestre un precio distinto.
--
-- `security_invoker = true` hace que la vista respete el RLS de quien
-- consulta. Sin esa opción, una vista corre con los permisos de su dueño y
-- se convierte en una puerta trasera que enseña las filas sin publicar.
-- ─────────────────────────────────────────────────────────────────────────
create or replace view public.catalogo_publico
with (security_invoker = true) as
select
  e.slug,
  e.id,
  e.nombre                        as name,
  e.marca                         as brand,
  e.categoria                     as cat,
  e.condicion                     as cond,
  (e.precio_cents / 100)::bigint  as price,
  (e.precio_anterior_cents / 100)::bigint as original,
  e.financiamiento                as finance,
  e.arrendamiento                 as leasing,
  e.envio_incluido                as shipping,
  e.ubicacion                     as location,
  e.anio                          as year,
  e.especificaciones              as specs,
  -- "desc" va entrecomillado: sin comillas Postgres lo lee como la palabra
  -- reservada de ordenamiento y la vista ni siquiera se crea.
  e.descripcion                   as "desc",
  e.icono                         as "svgKey",
  e.imagen_url                    as img,
  e.destacado                     as hot
from public.equipos e
where e.publicado
order by e.id;

-- Explícito a propósito. Supabase concede permisos por omisión sobre el
-- esquema public, pero depender de un valor por omisión para algo que se
-- consulta desde internet es dejarlo a merced de un cambio de plataforma.
grant select on public.catalogo_publico to anon, authenticated;

comment on view public.catalogo_publico is
  'Catálogo con los nombres de campo que espera el sitio y los precios ya en pesos. Respeta el RLS de equipos (security_invoker).';
