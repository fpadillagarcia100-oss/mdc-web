-- ═══════════════════════════════════════════════════════════════════════════
-- Disponibilidad: disponible, apartado o vendido
--
-- Hasta ahora un equipo sólo podía estar publicado o no. Eso obliga a una
-- decisión mala cuando algo se vende: si se despublica, desaparece del sitio
-- y se pierden los enlaces que ya circulan por WhatsApp y lo que esa página
-- haya ganado en Google. Si se deja igual, entran llamadas por una máquina
-- que ya no está.
--
-- Con esta columna la ficha sigue viva, con su dirección y su posicionamiento,
-- pero avisa. Y un catálogo donde se ve que las cosas se venden vende más que
-- uno donde todo lleva meses igual.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.equipos
  add column if not exists disponibilidad text not null default 'disponible'
    check (disponibilidad in ('disponible', 'apartado', 'vendido'));

comment on column public.equipos.disponibilidad is
  'disponible | apartado | vendido. Un equipo vendido SIGUE publicado: conserva su URL y su posición en Google, sólo se marca.';

-- Los filtros del catálogo preguntan por esto en cada carga.
create index if not exists equipos_disponibilidad_idx
  on public.equipos (disponibilidad) where publicado;


-- La vista pública tiene que entregarlo, o el sitio no se entera.
-- `security_invoker` se repite porque CREATE OR REPLACE no hereda las opciones:
-- sin él, la vista pasaría a correr con los permisos de su dueño y enseñaría
-- los borradores sin publicar.
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
  e.descripcion                   as "desc",
  e.icono                         as "svgKey",
  e.imagen_url                    as img,
  e.destacado                     as hot,
  e.disponibilidad                as disponibilidad
from public.equipos e
where e.publicado
order by e.id;

grant select on public.catalogo_publico to anon, authenticated;
