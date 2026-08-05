-- ═══════════════════════════════════════════════════════════════════════════
-- Almacenamiento de imágenes
--
-- Un bucket abierto a escritura es de los errores más caros que existen:
-- alguien sube gigabytes de basura, o peor, aloja contenido ilegal bajo tu
-- dominio y tu nombre. Aquí la escritura queda cerrada al personal, y el
-- tamaño y tipo de archivo se limitan en el servidor —no en el navegador,
-- que el atacante controla.
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'equipos',
  'equipos',
  true,                                    -- lectura pública: son fotos de catálogo
  3145728,                                 -- 3 MB por archivo
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marca',
  'marca',
  true,
  1048576,                                 -- 1 MB: un logo no pesa más
  array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Las fotos se ven sin iniciar sesión: es un catálogo público.
create policy "las fotos del catálogo son públicas"
  on storage.objects for select to anon, authenticated
  using (bucket_id in ('equipos', 'marca'));

-- Pero subir, reemplazar o borrar es exclusivo del personal.
create policy "sólo un admin sube imágenes"
  on storage.objects for insert to authenticated
  with check (bucket_id in ('equipos', 'marca') and public.es_admin());

create policy "sólo un admin reemplaza imágenes"
  on storage.objects for update to authenticated
  using (bucket_id in ('equipos', 'marca') and public.es_admin());

create policy "sólo un admin borra imágenes"
  on storage.objects for delete to authenticated
  using (bucket_id in ('equipos', 'marca') and public.es_admin());
