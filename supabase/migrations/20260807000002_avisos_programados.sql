-- ─────────────────────────────────────────────────────────────────────────────
-- AVISOS PROGRAMADOS
--
-- Dos correos que se mandan solos:
--
--   · Cada día a las 9:00 — lo que sigue sin contestar después de 24 horas.
--   · Los lunes a las 8:00 — el resumen de la semana.
--
-- El primero es el que de verdad cumple "que no se me pase ninguno". El aviso
-- que salta al entrar una cotización se puede perder: estabas en obra, se te
-- fue la señal, lo viste y lo dejaste para luego. Éste no depende de que lo
-- hayas visto — insiste hasta que la bandeja queda limpia.
--
-- ── Cómo se aplica ──
--
--   Supabase → SQL Editor → pega este archivo entero → Run.
--   Requiere que ya esté puesto el disparador de avisos (la migración
--   anterior), porque de ahí saca la dirección y el secreto.
--
-- ── Por qué en la base y no en un servicio de fuera ──
--
-- Porque los datos ya están aquí. Un cron externo tendría que consultarlos por
-- la API, y para eso necesitaría una llave con permiso de lectura sobre las
-- solicitudes — o sea, crear una llave capaz de leer tu lista de clientes sólo
-- para poder contarla. Aquí la consulta no sale de la base; lo único que viaja
-- es el resumen ya hecho.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LO QUE SIGUE ESPERANDO
--
-- Un día es el plazo a propósito. Con menos, el recordatorio llega mientras
-- todavía estabas contestando y se vuelve ruido; con más, el cliente ya llamó
-- a otro. Las 9:00 porque es cuando se empieza a trabajar, no a las 3 de la
-- madrugada cuando el correo se entierra bajo los demás.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function avisos.pendientes()
returns void
language plpgsql
security definer
set search_path = avisos, public, net, pg_catalog
as $$
declare
  destino avisos.destinos%rowtype;
  cuerpo  jsonb;
  cot     jsonb;
  preg    jsonb;
begin
  -- Se reutiliza la configuración del aviso de cotizaciones: mismo secreto,
  -- misma casa. Sólo cambia la dirección final.
  select * into destino from avisos.destinos where tabla = 'solicitudes' and activo;
  if not found then return; end if;

  select coalesce(jsonb_agg(x order by x->>'creado_en'), '[]'::jsonb) into cot
    from (
      select jsonb_build_object(
               'nombre', nombre, 'telefono', telefono, 'creado_en', creado_en
             ) as x
        from public.solicitudes
       where estado = 'nueva'
         and creado_en < now() - interval '24 hours'
       order by creado_en
       limit 20
    ) s;

  select coalesce(jsonb_agg(x order by x->>'creado_en'), '[]'::jsonb) into preg
    from (
      select jsonb_build_object(
               'nombre', nombre, 'pregunta', pregunta, 'slug', slug, 'creado_en', creado_en
             ) as x
        from public.preguntas
       where respuesta is null
         and creado_en < now() - interval '24 hours'
       order by creado_en
       limit 20
    ) p;

  -- Nada pendiente, ni se molesta a la red. La función del sitio también lo
  -- comprueba; hacerlo aquí evita el viaje entero.
  if jsonb_array_length(cot) = 0 and jsonb_array_length(preg) = 0 then
    return;
  end if;

  cuerpo := jsonb_build_object('tipo', 'pendientes', 'solicitudes', cot, 'preguntas', preg);

  perform net.http_post(
    url     := 'https://mdcmaquinaria.com/api/aviso-resumen',
    body    := cuerpo,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-aviso-secreto', destino.secreto)
  );
exception when others then
  -- Igual que en el disparador: un aviso roto no puede tumbar nada.
  raise warning 'avisos.pendientes(): %', sqlerrm;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. EL RESUMEN SEMANAL
--
-- Los contadores de `metricas` son acumulados desde siempre, no por semana.
-- Guardar una foto de cada lunes permitiría restar y dar la cifra exacta de
-- los últimos siete días; sin eso se manda el acumulado, que sigue sirviendo
-- para lo único que importa aquí: QUÉ SE MIRA Y NO SE COTIZA. Ese cociente no
-- cambia por ser acumulado.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function avisos.resumen_semanal()
returns void
language plpgsql
security definer
set search_path = avisos, public, net, pg_catalog
as $$
declare
  destino avisos.destinos%rowtype;
  equipos jsonb;
  totales jsonb;
begin
  select * into destino from avisos.destinos where tabla = 'solicitudes' and activo;
  if not found then return; end if;

  select coalesce(jsonb_agg(x order by (x->>'vistas')::bigint desc), '[]'::jsonb) into equipos
    from (
      select jsonb_build_object(
               'slug', m.slug, 'vistas', m.vistas, 'cotizaciones', m.cotizaciones
             ) as x
        from public.metricas m
       where m.vistas > 0
       order by m.vistas desc
       limit 10
    ) e;

  select jsonb_build_object(
           'vistas', coalesce(sum(vistas), 0),
           'cotizaciones', coalesce(sum(cotizaciones), 0)
         ) into totales
    from public.metricas;

  perform net.http_post(
    url     := 'https://mdcmaquinaria.com/api/aviso-resumen',
    body    := jsonb_build_object('tipo', 'semanal', 'equipos', equipos, 'totales', totales),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-aviso-secreto', destino.secreto)
  );
exception when others then
  raise warning 'avisos.resumen_semanal(): %', sqlerrm;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. EL RELOJ
--
-- Las horas van en UTC, que es como cuenta el servidor. Chiapas es UTC-6, así
-- que 15:00 UTC son las 9:00 de la mañana aquí, y 14:00 UTC las 8:00. Si algún
-- día cambia el horario del país, hay que mover estos números — por eso queda
-- escrito y no sólo en el panel.
--
-- `unschedule` antes de `schedule`: correr esta migración dos veces dejaría si
-- no dos trabajos idénticos y dos correos por día.
-- ─────────────────────────────────────────────────────────────────────────────
select cron.unschedule('avisos-pendientes')
 where exists (select 1 from cron.job where jobname = 'avisos-pendientes');

select cron.schedule('avisos-pendientes', '0 15 * * *', $$select avisos.pendientes()$$);

select cron.unschedule('avisos-resumen-semanal')
 where exists (select 1 from cron.job where jobname = 'avisos-resumen-semanal');

select cron.schedule('avisos-resumen-semanal', '0 14 * * 1', $$select avisos.resumen_semanal()$$);

-- ─────────────────────────────────────────────────────────────────────────────
-- Para probarlos ahora mismo, sin esperar a mañana:
--
--   select avisos.pendientes();        -- no manda nada si no hay nada esperando
--   select avisos.resumen_semanal();
--
-- Y para ver qué contestó el sitio:
--
--   select status_code, content, created from net._http_response
--    order by created desc limit 3;
-- ─────────────────────────────────────────────────────────────────────────────
