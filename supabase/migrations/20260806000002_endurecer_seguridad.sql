-- ═══════════════════════════════════════════════════════════════════════════
-- Endurecimiento — cuatro huecos del esquema inicial
--
-- Ninguno es un error de bulto: el diseño de origen es sólido. Son las
-- rendijas que quedan cuando una política se escribe pensando en el uso
-- normal y no en el uso torcido. Van aquí, cada una con lo que permitía.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 1. El sello de tiempo lo pone el servidor, no el cliente
--
-- ⚠️ Éste es el importante: el freno de spam era saltable.
--
-- `creado_en` tiene `default now()`, pero un valor por omisión sólo aplica
-- cuando el cliente NO manda el campo. Y el cliente puede mandarlo: la
-- política de inserción sólo comprueba `estado = 'nueva'`, nada más.
--
-- El trigger contra spam cuenta las solicitudes con
-- `creado_en > now() - interval '10 minutes'`. Así que bastaba insertar con
-- creado_en = '2020-01-01' para que el conteo diera cero y el límite de 3
-- por teléfono no frenara absolutamente nada. Un script mete un millón de
-- filas y de paso quedan fechadas en el pasado, fuera de la vista del panel.
--
-- La regla general: un dato que sirve para decidir un permiso NUNCA puede
-- venir del cliente. Se impone en el servidor, aunque ya tenga un default.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.frenar_spam_solicitudes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recientes integer;
begin
  -- Se pisa lo que haya mandado el cliente. Sin excepciones.
  new.creado_en := now();

  select count(*) into recientes
  from public.solicitudes
  where telefono = new.telefono
    and creado_en > now() - interval '10 minutes';

  if recientes >= 3 then
    raise exception 'Demasiadas solicitudes seguidas. Intenta de nuevo en unos minutos.'
      using errcode = 'check_violation';
  end if;

  -- El estado tampoco: nadie marca su propia solicitud como atendida.
  -- La política ya lo exige; esto lo vuelve cierto aunque la política cambie.
  new.estado := 'nueva';

  return new;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────
-- 2. El carrito tenía tamaño ilimitado
--
-- `mensaje` está topado en 4 000 caracteres, pero `carrito` es un jsonb sin
-- límite. Postgres acepta hasta 1 GB por valor. Cualquiera con la llave
-- pública —que es pública por diseño— podía llenar tu base de basura hasta
-- agotar la cuota del plan, y con ella el sitio entero.
--
-- Topar el tamaño de TODO lo que un desconocido puede escribir es la regla;
-- que un campo se escape es lo que hay que buscar activamente.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.solicitudes
  add constraint solicitudes_carrito_acotado check (
    jsonb_typeof(carrito) = 'array'          -- un arreglo, no lo que se le ocurra
    and jsonb_array_length(carrito) <= 50    -- 50 equipos es más que generoso
    and pg_column_size(carrito) <= 16384     -- y 16 KB en total, pase lo que pase
  );

comment on constraint solicitudes_carrito_acotado on public.solicitudes is
  'Tope de tamaño para el único campo libre que puede escribir un desconocido.';


-- ─────────────────────────────────────────────────────────────────────────
-- 3. La política de edición de perfiles no revisaba el resultado
--
-- `using` decide QUÉ FILAS puedes tocar. `with check` decide CÓMO PUEDEN
-- QUEDAR. Sin `with check`, Postgres deja pasar una modificación que saca la
-- fila del alcance de la propia política — puedes editar tu perfil y dejarlo
-- apuntando a otro usuario.
--
-- Aquí el daño real es limitado (la llave primaria y la referencia a
-- auth.users frenan casi todo, y el trigger cubre el ascenso a admin), pero
-- una política de escritura sin `with check` está incompleta por definición.
-- No es algo que convenga dejar "porque de todos modos no se puede".
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "cada quien edita su nombre" on public.perfiles;

create policy "cada quien edita su nombre"
  on public.perfiles for update to authenticated
  using       (id = auth.uid() or public.es_admin())
  with check  (id = auth.uid() or public.es_admin());


-- ─────────────────────────────────────────────────────────────────────────
-- 4. El rol 'staff' no servía para nada
--
-- No es un agujero: es lo contrario, y por eso pasa desapercibido. TODAS las
-- políticas de escritura y de lectura privada exigen `es_admin()`. Un usuario
-- con rol 'staff' tiene exactamente los mismos permisos que un desconocido —
-- no puede ver una cotización ni editar un precio.
--
-- Importa porque el comentario del esquema dice "el personal ve todo" y no es
-- verdad. Una creencia falsa sobre quién puede qué es de donde salen los
-- permisos mal puestos: alguien lo nota, no entiende por qué, y "arregla" el
-- problema abriendo de más.
--
-- NO se amplía nada aquí a propósito: ampliar accesos es una decisión tuya,
-- no un efecto secundario de una migración. Dos caminos, elige uno:
--
--   a) Que 'staff' atienda cotizaciones sin poder tocar precios. Entonces
--      hace falta una función `es_personal()` y cambiar las políticas de
--      SELECT y UPDATE de `solicitudes` para que la usen.
--   b) Que sólo existan administradores. Entonces sobra la columna `rol` y
--      conviene quitarla, porque un campo que no hace nada acaba usándose mal.
--
-- Mientras se decide, al menos que el comentario no mienta.
-- ─────────────────────────────────────────────────────────────────────────
comment on column public.perfiles.rol is
  'HOY SÓLO ''admin'' concede permisos. ''staff'' equivale a un visitante: ninguna política lo menciona. Ver migración 20260806000002.';

drop policy if exists "el personal ve todo, incluso borradores" on public.equipos;

create policy "un admin ve todo, incluso borradores"
  on public.equipos for select to authenticated
  using (public.es_admin());

drop policy if exists "sólo el personal lee solicitudes" on public.solicitudes;

create policy "sólo un admin lee solicitudes"
  on public.solicitudes for select to authenticated
  using (public.es_admin());
