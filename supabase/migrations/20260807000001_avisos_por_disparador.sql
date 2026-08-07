-- ─────────────────────────────────────────────────────────────────────────────
-- AVISOS POR DISPARADOR
--
-- Hace lo mismo que los "Database Webhooks" del panel de Supabase: cuando entra
-- una cotización o una pregunta, llama a la función del sitio que manda el
-- correo.
--
-- ¿Por qué a mano y no desde el panel? Porque el panel falló. Crear un webhook
-- devolvía `ERROR: 3F000: schema "supabase_functions" does not exist`: esa
-- integración instala andamiaje propio y en este proyecto no llegó a ponerse.
-- Pelear con eso es depender de una pieza que ya demostró que se rompe.
--
-- Esto usa `pg_net` directamente, que es la extensión sobre la que el panel se
-- apoya de todas formas — y ya está instalada. A cambio se gana algo que el
-- panel no da: queda escrito en el repositorio, versionado y revisable, en vez
-- de vivir en un formulario que nadie recuerda haber llenado.
--
-- ── Cómo se aplica ──
--
--   Supabase → SQL Editor → pega este archivo entero → Run.
--   Después, una sola vez, guarda el secreto (ver el final del archivo).
--
-- ── La regla que manda sobre todo lo demás ──
--
-- Un aviso que falla NO puede impedir que se guarde la cotización. El aviso es
-- una mejora; el registro es el negocio. Por eso todo va envuelto en un
-- manejador de excepciones que se traga cualquier error: si la configuración
-- falta, si la red no responde, si alguien borra la tabla de ajustes — la fila
-- se inserta igual y como mucho no llega el correo.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_net;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DÓNDE VIVE LA CONFIGURACIÓN
--
-- En un esquema aparte, NO en `public`. Todo lo que está en `public` lo publica
-- PostgREST como API; el secreto de los avisos no tiene por qué asomarse ahí ni
-- aunque las políticas lo protejan. Lo que no se expone no se puede filtrar.
-- ─────────────────────────────────────────────────────────────────────────────
create schema if not exists avisos;

revoke all on schema avisos from anon, authenticated;

create table if not exists avisos.destinos (
  tabla     text primary key,          -- 'solicitudes' | 'preguntas'
  url       text not null,             -- a dónde se avisa
  secreto   text not null,             -- viaja en la cabecera x-aviso-secreto
  activo    boolean not null default true
);

comment on table avisos.destinos is
  'A qué dirección avisar por cada tabla, y con qué secreto. Vive fuera de public para que PostgREST no la exponga jamás.';

revoke all on table avisos.destinos from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. EL DISPARADOR
--
-- Manda el mismo cuerpo que mandaría el panel —{type, table, record}— para que
-- las funciones del sitio no distingan de dónde viene el aviso y sigan
-- sirviendo si algún día se vuelve al webhook del panel.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function avisos.notificar()
returns trigger
language plpgsql
security definer
-- `search_path` fijo: sin esto, alguien que pudiera crear una tabla con el
-- mismo nombre en otro esquema podría hacer que esta función leyera la suya.
set search_path = avisos, net, pg_catalog
as $$
declare
  destino avisos.destinos%rowtype;
begin
  select * into destino from avisos.destinos
   where tabla = tg_table_name and activo;

  -- Sin configurar no es un error: es el estado normal hasta que alguien active
  -- los avisos. La fila ya está guardada, que es lo que importa.
  if not found then
    return new;
  end if;

  perform net.http_post(
    url     := destino.url,
    body    := jsonb_build_object(
                 'type',   'INSERT',
                 'table',  tg_table_name,
                 'record', to_jsonb(new)
               ),
    headers := jsonb_build_object(
                 'Content-Type',     'application/json',
                 'x-aviso-secreto',  destino.secreto
               )
  );

  return new;
exception when others then
  /* Aquí está la decisión importante del archivo.

     Sin este bloque, cualquier problema al avisar —red caída, tabla de ajustes
     borrada, cambio en pg_net— haría fallar el INSERT entero. O sea: por no
     poder mandarte un correo, el cliente vería un error y su cotización no se
     guardaría. Sería cambiar una molestia por una pérdida.

     Se anota en el log del servidor y se sigue. */
  raise warning 'avisos.notificar(%): %', tg_table_name, sqlerrm;
  return new;
end;
$$;

comment on function avisos.notificar() is
  'Avisa al sitio de una fila nueva. Nunca falla hacia fuera: un aviso roto no puede impedir que se guarde una cotización.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ENGANCHARLO A LAS DOS TABLAS
--
-- AFTER INSERT: se avisa de lo que ya está guardado. Con BEFORE se podría
-- avisar de algo que después no llega a existir.
-- ─────────────────────────────────────────────────────────────────────────────
drop trigger if exists avisar_solicitud on public.solicitudes;
create trigger avisar_solicitud
  after insert on public.solicitudes
  for each row execute function avisos.notificar();

drop trigger if exists avisar_pregunta on public.preguntas;
create trigger avisar_pregunta
  after insert on public.preguntas
  for each row execute function avisos.notificar();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. LO ÚNICO QUE FALTA, Y NO VA EN ESTE ARCHIVO
--
-- El secreto. Corre esto UNA VEZ en el SQL Editor, cambiando el valor por el
-- mismo que pusiste en Cloudflare como AVISO_SECRETO:
--
--   insert into avisos.destinos (tabla, url, secreto) values
--     ('solicitudes', 'https://mdcmaquinaria.com/api/aviso-solicitud', 'TU_SECRETO'),
--     ('preguntas',   'https://mdcmaquinaria.com/api/aviso-pregunta',  'TU_SECRETO')
--   on conflict (tabla) do update
--     set url = excluded.url, secreto = excluded.secreto, activo = true;
--
-- NO lo escribas en este archivo ni en ningún otro del repositorio. Un secreto
-- que está en el código deja de ser un secreto: cualquiera con acceso al
-- repositorio podría disparar avisos falsos contra tu correo.
--
-- Para comprobar que quedó, sin esperar a un cliente:
--
--   insert into public.preguntas (slug, nombre, pregunta)
--   values ('excavadora-cat-320-gc', 'Prueba', '¿Llega el aviso por correo?');
--
-- Debe llegarte el correo en segundos. Después, para no dejar basura:
--
--   delete from public.preguntas where nombre = 'Prueba';
-- ─────────────────────────────────────────────────────────────────────────────
