-- ═══════════════════════════════════════════════════════════════════════════
-- Métricas: qué máquinas se miran y cuáles se cotizan
--
-- Hoy no hay forma de saberlo. Se decide qué destacar, qué bajar de precio y
-- qué fotos poner completamente a ciegas.
--
-- ── Por qué no un medidor de los de siempre ──
--
-- Google Analytics y compañía piden abrir la CSP a un script ajeno, ponen
-- cookies y mandan a un tercero el comportamiento de tus clientes. Todo eso
-- para responder dos preguntas: qué se mira y qué se cotiza.
--
-- Aquí se cuentan dos números por equipo. Sin cookies, sin identificar a
-- nadie, sin que salga un solo dato de tu proyecto. No se puede saber QUIÉN
-- miró — sólo CUÁNTAS veces se miró. Es lo único que sirve para decidir, y es
-- lo único que se guarda.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.metricas (
  slug         text primary key,
  vistas       bigint not null default 0,
  cotizaciones bigint not null default 0,
  ultima_vista timestamptz
);

comment on table public.metricas is
  'Dos contadores por equipo. Sin cookies ni identificación: sólo cuántas veces, nunca quién.';

alter table public.metricas enable row level security;
alter table public.metricas force row level security;

/* Nadie escribe esta tabla directamente, ni siquiera un admin.

   Si el público pudiera hacer UPDATE, podría poner cualquier número —o
   borrarlos— y las cifras dejarían de servir para decidir nada. Se toca sólo
   a través de la función de abajo, que suma de uno en uno y nada más. */
create policy "sólo un admin lee las métricas"
  on public.metricas for select to authenticated
  using (public.es_admin());

/**
 * Suma una vista o una cotización a un equipo.
 *
 * `security definer` la ejecuta con permisos elevados, que es lo que permite
 * escribir en una tabla cerrada sin abrirla a nadie. La función es la única
 * puerta, y sólo sabe hacer una cosa: sumar uno.
 *
 * El slug se comprueba contra `equipos`: sin eso, cualquiera podría llenar la
 * tabla de filas inventadas hasta hacerla inútil.
 */
create or replace function public.contar(p_slug text, p_tipo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_tipo not in ('vista', 'cotizacion') then
    return;   -- en silencio: no es un error del que haya que informar a nadie
  end if;

  if not exists (select 1 from public.equipos where slug = p_slug) then
    return;
  end if;

  insert into public.metricas (slug, vistas, cotizaciones, ultima_vista)
  values (
    p_slug,
    case when p_tipo = 'vista' then 1 else 0 end,
    case when p_tipo = 'cotizacion' then 1 else 0 end,
    now()
  )
  on conflict (slug) do update set
    vistas       = public.metricas.vistas + (case when p_tipo = 'vista' then 1 else 0 end),
    cotizaciones = public.metricas.cotizaciones + (case when p_tipo = 'cotizacion' then 1 else 0 end),
    ultima_vista = case when p_tipo = 'vista' then now() else public.metricas.ultima_vista end;
end;
$$;

comment on function public.contar is
  'Unica forma de escribir en metricas. Suma de uno en uno y valida el slug contra equipos.';

grant execute on function public.contar(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
