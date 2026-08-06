-- ═══════════════════════════════════════════════════════════════════════════
-- Varias fotos por equipo
--
-- La tabla tenía una sola columna de imagen. El panel deja subir hasta ocho,
-- pero al guardar sólo sobrevivía la primera y las demás se perdían sin decir
-- nada — el peor tipo de fallo: parece que funcionó.
--
-- Para vender maquinaria pesada una foto no basta. El comprador quiere ver la
-- cabina, las orugas, el número de horas en el tablero. Es la diferencia
-- entre un anuncio y una ficha.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.equipos
  add column if not exists imagenes text[] not null default '{}'
    check (cardinality(imagenes) <= 8);

comment on column public.equipos.imagenes is
  'Galería completa, en orden. La primera es la portada. imagen_url se conserva y se mantiene igual a imagenes[1].';

-- Los equipos que ya tenían foto conservan la suya como primera de la galería.
update public.equipos
   set imagenes = array[imagen_url]
 where imagen_url is not null
   and cardinality(imagenes) = 0;

/* `imagen_url` NO se elimina.

   La usan las fichas estáticas, los datos estructurados de Google y la vista
   previa al compartir por WhatsApp — sitios donde sólo cabe una imagen. Se
   conserva como la portada, y el trigger de abajo garantiza que nunca se
   separe de la galería.

   Dos campos que dicen lo mismo se separan tarde o temprano: alguien
   actualiza uno y olvida el otro. Aquí no puede pasar, porque no se escribe
   a mano — lo hace la base. */
create or replace function public.sincronizar_portada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if cardinality(new.imagenes) > 0 then
    new.imagen_url := new.imagenes[1];
  elsif new.imagen_url is not null then
    -- Vino sólo la portada (una ficha vieja, un respaldo): se adopta como galería.
    new.imagenes := array[new.imagen_url];
  end if;
  return new;
end;
$$;

drop trigger if exists equipos_portada on public.equipos;
create trigger equipos_portada
  before insert or update on public.equipos
  for each row execute function public.sincronizar_portada();


-- La vista pública entrega la galería completa.
create or replace view public.catalogo_publico
with (security_invoker = true) as
select
  e.slug, e.id,
  e.nombre as name, e.marca as brand, e.categoria as cat, e.condicion as cond,
  (e.precio_cents / 100)::bigint as price,
  (e.precio_anterior_cents / 100)::bigint as original,
  e.financiamiento as finance, e.arrendamiento as leasing,
  e.envio_incluido as shipping, e.ubicacion as location, e.anio as year,
  e.especificaciones as specs, e.descripcion as "desc",
  e.icono as "svgKey",
  e.imagen_url as img,
  e.imagenes as imgs,
  e.destacado as hot,
  e.disponibilidad as disponibilidad
from public.equipos e
where e.publicado
order by e.id;

grant select on public.catalogo_publico to anon, authenticated;

-- Sin esto, la API sigue sirviendo la estructura vieja y responde
-- "no encuentro la columna" aunque ya exista.
notify pgrst, 'reload schema';
