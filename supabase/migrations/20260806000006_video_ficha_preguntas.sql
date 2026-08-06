-- ═══════════════════════════════════════════════════════════════════════════
-- Lo que le faltaba al catálogo para competir de verdad
--
-- Tres cosas, en una sola migración porque las tres tocan la misma vista
-- pública y reconstruirla tres veces sería pedir tres veces el mismo permiso.
--
--   1. VIDEO         — un video de 30 s vendiendo maquinaria usada pesa más
--                      que ocho fotos: el comprador quiere oír el motor.
--   2. FICHA TÉCNICA — hoy las especificaciones son tres textos libres
--                      ("20 ton", "148 HP"). No se pueden comparar ni filtrar
--                      porque nadie sabe qué significa cada uno.
--   3. PREGUNTAS     — las dudas de maquinaria se repiten. Contestarlas en
--                      público las contesta una vez para todos, y de paso
--                      Google las indexa.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. VIDEO
--
-- Se guarda el IDENTIFICADOR de YouTube (11 caracteres), no la dirección
-- completa. Dos motivos:
--
--   · Una dirección libre en esta columna es una puerta abierta: bastaría
--     guardar "javascript:…" o el dominio de un tercero para incrustar algo
--     ajeno dentro de tus fichas. Con 11 caracteres alfanuméricos no cabe una
--     dirección.
--   · El sitio arma el enlace a `youtube-nocookie.com`, que no pone cookies
--     hasta que alguien le da al play. Si se guardara la dirección tal cual,
--     la mitad de las veces vendría del dominio con rastreo.
--
-- No se sube el video a nuestro almacenamiento a propósito: un video de 30 MB
-- visto 200 veces son 6 GB de tráfico al mes, y el plan gratuito da 5. YouTube
-- pone ese ancho de banda gratis y además reproduce bien con mala señal.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.equipos
  add column if not exists video_url text
    check (video_url is null or video_url ~ '^[A-Za-z0-9_-]{11}$');

comment on column public.equipos.video_url is
  'Identificador de YouTube (11 caracteres), no la URL. El sitio arma el enlace a youtube-nocookie.com.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. FICHA TÉCNICA ESTRUCTURADA
--
-- `especificaciones` seguirá existiendo: son el resumen de tres líneas que se
-- ve en la tarjeta, y eso funciona. Lo que no funciona es que sean lo ÚNICO,
-- porque un texto libre no se puede comparar ni filtrar.
--
-- `atributos` es un objeto con claves conocidas: {"horas": 2400, "peso": 20,
-- "potencia": 148}. El catálogo de claves vive en assets/js/atributos.js y lo
-- comparten el panel, el comparador, los filtros y el generador de fichas.
--
-- ¿Por qué jsonb y no columnas? Porque una grúa torre y un minicargador no
-- comparten casi ningún dato. En columnas serían treinta, veinticinco de ellas
-- nulas en cada renglón. Aquí cada equipo trae sólo lo suyo.
--
-- La comprobación de tamaño no es paranoia: sin ella, esta columna es el único
-- sitio del esquema donde cabe cualquier cosa de cualquier tamaño.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.equipos
  add column if not exists atributos jsonb not null default '{}'::jsonb
    check (jsonb_typeof(atributos) = 'object' and pg_column_size(atributos) <= 4096);

comment on column public.equipos.atributos is
  'Ficha técnica con claves conocidas (horas, peso, potencia…). El catálogo de claves está en assets/js/atributos.js.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PREGUNTAS PÚBLICAS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.preguntas (
  id            bigint generated always as identity primary key,
  /* Se apunta al slug y no al id porque el slug es lo que aparece en la
     dirección de la ficha. `on delete cascade`: si un equipo se da de baja,
     sus preguntas se van con él — quedarían huérfanas y sin contexto. */
  slug          text not null references public.equipos(slug) on delete cascade,
  nombre        text not null check (char_length(nombre) between 2 and 60),
  pregunta      text not null check (char_length(pregunta) between 5 and 300),
  respuesta     text check (respuesta is null or char_length(respuesta) between 1 and 1000),
  /* Publicada Y respondida son cosas distintas. Una pregunta puede estar
     respondida y aún no querer enseñarse (se contestó por privado porque
     hablaba de un descuento). Sin las dos banderas no se puede distinguir. */
  publicada     boolean not null default false,
  creado_en     timestamptz not null default now(),
  respondida_en timestamptz
);

comment on table public.preguntas is
  'Preguntas del público sobre un equipo. Sólo se ven las respondidas y publicadas. Se insertan por la función preguntar(), nunca directo.';

create index if not exists preguntas_por_equipo on public.preguntas (slug, creado_en desc);

alter table public.preguntas enable row level security;
alter table public.preguntas force row level security;

/* El público ve las respondidas y publicadas. Nada más.

   Lo que esto cierra: sin el filtro, cualquiera podría leer las preguntas
   pendientes — incluidas las que traen nombre y contexto de un cliente que
   todavía no sabe que va a salir en público. */
drop policy if exists "cualquiera lee las preguntas ya contestadas" on public.preguntas;
create policy "cualquiera lee las preguntas ya contestadas"
  on public.preguntas for select to anon, authenticated
  using (publicada and respuesta is not null);

drop policy if exists "un admin lee todas las preguntas" on public.preguntas;
create policy "un admin lee todas las preguntas"
  on public.preguntas for select to authenticated
  using (public.es_admin());

drop policy if exists "un admin responde" on public.preguntas;
create policy "un admin responde"
  on public.preguntas for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

/* Estas SÍ se pueden borrar, al revés que las solicitudes.

   Una solicitud es registro comercial y evidencia del consentimiento con que
   alguien dio sus datos: se cierra o se marca spam, pero se queda. Una
   pregunta de spam no es registro de nada, y dejarla obliga a mirarla cada vez
   que se abre la bandeja. */
drop policy if exists "un admin borra spam" on public.preguntas;
create policy "un admin borra spam"
  on public.preguntas for delete to authenticated
  using (public.es_admin());

/* NO hay política de INSERT, y es deliberado.

   Si el público pudiera insertar directamente, tendría que poder mandar todas
   las columnas — incluidas `respuesta` y `publicada`. Una política con `with
   check` lo taparía, pero cada columna nueva volvería a abrir el hueco hasta
   que alguien se acordara de actualizarla.

   Con la función de abajo como única puerta, el problema no existe: los
   campos que decide el servidor ni siquiera se pueden nombrar desde fuera. */

/**
 * Deja una pregunta. Es la única forma de escribir en esta tabla.
 *
 * Nace sin responder y sin publicar, siempre. Quien pregunta no elige nada de
 * eso — si pudiera, el formulario de preguntas sería un formulario para
 * publicar texto en tus fichas.
 */
create or replace function public.preguntar(p_slug text, p_nombre text, p_pregunta text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  recientes  int;
  pendientes int;
  v_nombre   text := trim(coalesce(p_nombre, ''));
  v_pregunta text := trim(coalesce(p_pregunta, ''));
begin
  -- Se exige `publicado`: un borrador no está a la vista, así que una pregunta
  -- sobre él sólo puede venir de alguien hurgando en la API.
  if not exists (select 1 from public.equipos where slug = p_slug and publicado) then
    raise exception 'Ese equipo no existe.';
  end if;

  if char_length(v_nombre) < 2 or char_length(v_nombre) > 60 then
    raise exception 'Escribe tu nombre.';
  end if;

  if char_length(v_pregunta) < 5 or char_length(v_pregunta) > 300 then
    raise exception 'La pregunta debe tener entre 5 y 300 caracteres.';
  end if;

  /* Dos frenos distintos porque son dos problemas distintos.

     El primero es contra el que aporrea el botón: cinco preguntas en diez
     minutos sobre la misma máquina ya no es interés.

     El segundo es contra el que vuelve mañana y pasado: treinta preguntas sin
     contestar acumuladas es una bandeja que nadie quiere abrir, y con ella se
     pierden las de verdad. Se libera solo conforme se van contestando. */
  select count(*) into recientes
    from public.preguntas
   where slug = p_slug and creado_en > now() - interval '10 minutes';
  if recientes >= 5 then
    raise exception 'Ya hay varias preguntas recientes sobre este equipo. Espera unos minutos.';
  end if;

  select count(*) into pendientes
    from public.preguntas
   where slug = p_slug and respuesta is null;
  if pendientes >= 30 then
    raise exception 'Hay demasiadas preguntas sin contestar sobre este equipo. Escríbenos por WhatsApp.';
  end if;

  insert into public.preguntas (slug, nombre, pregunta)
  values (p_slug, v_nombre, v_pregunta);
end;
$$;

comment on function public.preguntar is
  'Unica forma de crear una pregunta. Nace sin responder y sin publicar; valida longitudes y frena el spam.';

grant execute on function public.preguntar(text, text, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- La vista pública, con lo nuevo
--
-- `create or replace view` no puede añadir ni renombrar columnas, así que hay
-- que tirarla y rehacerla. Ojo con el orden: quien tenga la vista abierta en
-- otra sesión verá el error un instante. Es una vista, no hay datos que perder.
-- ─────────────────────────────────────────────────────────────────────────────
drop view if exists public.catalogo_publico;

create view public.catalogo_publico
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
  e.disponibilidad as disponibilidad,
  e.video_url as video,
  e.atributos as atributos
from public.equipos e
where e.publicado
order by e.id;

grant select on public.catalogo_publico to anon, authenticated;

-- Sin esto la API sigue sirviendo la estructura vieja y responde "no encuentro
-- la columna" aunque ya exista.
notify pgrst, 'reload schema';
