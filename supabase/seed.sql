-- ═══════════════════════════════════════════════════════════════════════════
-- Datos de arranque — GENERADO por tools/generar-seed.js. No editar a mano.
--
-- Fuente: data/catalogo.json
-- Equipos: 18 · Sucursales: 3
--
-- Se aplica solo con `npx supabase db reset`, o a mano con:
--   psql "$DATABASE_URL" -f supabase/seed.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Marca, contacto y textos de portada ──
insert into public.ajustes (
  id, marca_principal, marca_acento, marca_completa, color_acento, logo_url,
  barra_superior, hero_etiqueta, hero_titulo, hero_resaltado, hero_texto, hero_imagen,
  vendedor, telefono, whatsapp, correo, direccion, horario, pie_descripcion
) values (
  true,
  'MD', 'C', 'Maquinaria de Chiapas',
  '#F5C400', null,
  '🚧 Cobertura en todo Chiapas y el Sureste · Financiamiento disponible',
  '🏗️ Temporada de obra 2026', 'Equipos de construcción', 'hasta 18 meses sin intereses',
  'Las mejores marcas: CAT, Komatsu, JCB, Bobcat y Liebherr. Equipos nuevos y certificados con garantía, entregados en tu obra.', null,
  'MDC Maquinaria de Chiapas', '312 174 3817', '523121743817',
  'ventas@mdcmaquinaria.com', 'Tuxtla Gutiérrez, Chiapas', 'Lun–Vie 8:00–18:00 · Sáb 9:00–14:00',
  'Venta y renta de maquinaria pesada en Chiapas. Equipos verificados, garantía real y financiamiento a la medida de tu obra.'
)
on conflict (id) do update set
  marca_principal = excluded.marca_principal,
  marca_acento = excluded.marca_acento,
  marca_completa = excluded.marca_completa,
  color_acento = excluded.color_acento,
  logo_url = excluded.logo_url,
  barra_superior = excluded.barra_superior,
  hero_etiqueta = excluded.hero_etiqueta,
  hero_titulo = excluded.hero_titulo,
  hero_resaltado = excluded.hero_resaltado,
  hero_texto = excluded.hero_texto,
  hero_imagen = excluded.hero_imagen,
  vendedor = excluded.vendedor,
  telefono = excluded.telefono,
  whatsapp = excluded.whatsapp,
  correo = excluded.correo,
  direccion = excluded.direccion,
  horario = excluded.horario,
  pie_descripcion = excluded.pie_descripcion;

-- ── Sucursales ──
delete from public.sucursales;
insert into public.sucursales (nombre, direccion, telefono, horario, orden) values
  ('Matriz Tuxtla Gutiérrez', 'Blvd. Belisario Domínguez 1250, Tuxtla Gutiérrez, Chiapas', '961 123 4567', 'Lun–Vie 8:00–18:00 · Sáb 9:00–14:00', 0),
  ('Sucursal Tapachula', 'Carretera Costera km 4, Tapachula, Chiapas', '962 123 4567', 'Lun–Vie 8:00–18:00', 1),
  ('Sucursal San Cristóbal', 'Carretera Panamericana 890, San Cristóbal de las Casas, Chiapas', '967 123 4567', 'Lun–Vie 9:00–17:00', 2);

-- ── Catálogo ──
-- El conflicto se resuelve por `slug` porque es la clave que ve el mundo:
-- es la URL de la ficha. Volver a correr esto actualiza el equipo existente
-- en vez de duplicarlo con otra URL.
insert into public.equipos (
  slug, nombre, marca, categoria, condicion, precio_cents, precio_anterior_cents,
  financiamiento, arrendamiento, envio_incluido, ubicacion, anio,
  especificaciones, descripcion, imagen_url, icono, destacado, publicado
) values
  ('excavadora-cat-320-gc', 'Excavadora CAT 320 GC', 'CAT', 'Excavación', 'Nuevo', 285000000, 310000000, '18 MSI', true, true, 'Tuxtla Gutiérrez', 2025, array['20 ton', '148 HP', '6.5 m alcance'], 'Excavadora hidráulica de cadenas con sistema de gestión inteligente. Ideal para obra urbana y movimiento de tierra de mediana escala.', null, 'excavadora', true, true),
  ('excavadora-cat-336', 'Excavadora CAT 336', 'CAT', 'Excavación', 'Nuevo', 420000000, null, '18 MSI', true, true, 'Tapachula', 2025, array['36 ton', '270 HP', '7.8 m alcance'], 'Máxima potencia para proyectos de gran envergadura. Motor ACERT con tecnología de reducción de emisiones.', null, 'excavadora', false, true),
  ('excavadora-komatsu-pc290', 'Excavadora Komatsu PC290', 'Komatsu', 'Excavación', 'Usado', 165000000, 220000000, '12 MSI', true, false, 'San Cristóbal de las Casas', 2021, array['29 ton', '197 HP', '2,400 hrs'], 'Excavadora seminueva en excelentes condiciones. Con certificado de inspección y garantía de 6 meses.', null, 'excavadora', false, true),
  ('retroexcavadora-jcb-3cx-pro', 'Retroexcavadora JCB 3CX Pro', 'JCB', 'Carga', 'Nuevo', 98000000, 105000000, '18 MSI', true, true, 'Tuxtla Gutiérrez', 2025, array['8.5 ton', '109 HP', '4WD'], 'La retroexcavadora más vendida en México. Versatilidad total para obra civil, drenaje y construcción.', null, 'retro', true, true),
  ('retroexcavadora-jcb-4cx', 'Retroexcavadora JCB 4CX', 'JCB', 'Carga', 'Nuevo', 138000000, null, '18 MSI', true, true, 'Comitán', 2025, array['10 ton', '115 HP', '4WD extendido'], 'Versión extendida con mayor alcance y potencia. Ideal para obras en zonas rurales y caminos.', null, 'retro', false, true),
  ('retroexcavadora-cat-416f2', 'Retroexcavadora CAT 416F2', 'CAT', 'Carga', 'Usado', 75000000, 92000000, '6 MSI', false, false, 'Tapachula', 2020, array['7.8 ton', '95 HP', '2,800 hrs'], 'Unidad verificada y lista para trabajar. Mantenimiento al día con bitácora completa.', null, 'retro', false, true),
  ('bulldozer-komatsu-d65px', 'Bulldozer Komatsu D65PX', 'Komatsu', 'Nivelación', 'Nuevo', 375000000, null, '18 MSI', true, true, 'Tapachula', 2025, array['21 ton', '228 HP', 'Ripper incl.'], 'Dozer de alta productividad para nivelación de grandes volúmenes. Sistema de tracción hidrostática.', null, 'bulldozer', false, true),
  ('bulldozer-cat-d6t', 'Bulldozer CAT D6T', 'CAT', 'Nivelación', 'Nuevo', 490000000, 520000000, '18 MSI', true, true, 'Tuxtla Gutiérrez', 2025, array['24 ton', '215 HP', 'GPS Ready'], 'El estándar de la industria. Con sensor de pendiente integrado y sistema CAT LINK para telemetría.', null, 'bulldozer', false, true),
  ('bulldozer-komatsu-d51i', 'Bulldozer Komatsu D51i', 'Komatsu', 'Nivelación', 'Renta', 4200000, null, null, false, false, 'San Cristóbal de las Casas', 2023, array['14.6 ton', '130 HP', 'Inteligente'], 'Disponible en renta mensual. Incluye operador, seguro y mantenimiento preventivo.', null, 'bulldozer', false, true),
  ('compactador-dynapac-ca250', 'Compactador Dynapac CA250', 'Dynapac', 'Compactación', 'Nuevo', 120000000, 135000000, '12 MSI', true, true, 'Comitán', 2025, array['10 ton', '138 HP', '2 tambores'], 'Rodillo tándem vibratorio para asfalto. Sistema SEISMIC para control automático de compactación.', null, 'compactador', false, true),
  ('compactador-bomag-bw-216', 'Compactador Bomag BW 216', 'Bomag', 'Compactación', 'Usado', 68000000, 88000000, '6 MSI', false, false, 'San Cristóbal de las Casas', 2019, array['16 ton', '159 HP', '3,100 hrs'], 'Rodillo de suelos en buen estado. Inspección técnica reciente, todos los sistemas en óptimas condiciones.', null, 'compactador', false, true),
  ('compactador-cat-cs533', 'Compactador CAT CS533', 'CAT', 'Compactación', 'Renta', 2800000, null, null, false, false, 'Tuxtla Gutiérrez', 2022, array['12 ton', '141 HP', 'Vibratorio'], 'Renta mensual con todas las facilidades. Entrega en sitio sin costo en la zona metropolitana de Tuxtla.', null, 'compactador', false, true),
  ('minicargador-bobcat-s650', 'Minicargador Bobcat S650', 'Bobcat', 'Carga', 'Nuevo', 52000000, 58000000, '12 MSI', true, true, 'Tuxtla Gutiérrez', 2025, array['3.5 ton', '74 HP', 'Multi-attach'], 'El más ágil para espacios confinados. Sistema de acople rápido compatible con más de 100 aditamentos.', null, 'minicargador', true, true),
  ('minicargador-cat-262d3', 'Minicargador CAT 262D3', 'CAT', 'Carga', 'Nuevo', 61000000, null, '18 MSI', true, true, 'Tapachula', 2025, array['4.0 ton', '90 HP', 'Cabina ROPS'], 'Mayor capacidad de carga con visibilidad total. Sistema CAT SMART ATTACH para cambio rápido.', null, 'minicargador', false, true),
  ('minicargador-bobcat-t450', 'Minicargador Bobcat T450', 'Bobcat', 'Carga', 'Renta', 1800000, null, null, false, false, 'Tuxtla Gutiérrez', 2023, array['3.2 ton', '66 HP', 'Cadenas'], 'Versión de cadenas para terreno blando. Renta semanal o mensual disponible.', null, 'minicargador', false, true),
  ('grua-torre-liebherr-160ec', 'Grúa Torre Liebherr 160EC', 'Liebherr', 'Elevación', 'Nuevo', 680000000, null, '18 MSI', true, false, 'Tuxtla Gutiérrez', 2025, array['8 ton punta', '50 m pluma', 'Montaje incl.'], 'Ideal para edificios de hasta 20 niveles. Montaje, operación e instalación eléctrica incluidos.', null, 'grua', false, true),
  ('grua-torre-potain-mdt-178', 'Grúa Torre Potain MDT 178', 'Potain', 'Elevación', 'Renta', 8500000, null, null, false, false, 'Tapachula', 2022, array['6 ton punta', '45 m pluma', 'Full servicio'], 'Renta mensual con operador certificado, mantenimiento y seguro de responsabilidad civil.', null, 'grua', false, true),
  ('retroexcavadora-komatsu-wb97', 'Retroexcavadora Komatsu WB97', 'Komatsu', 'Carga', 'Nuevo', 115000000, 128000000, '18 MSI', true, true, 'Palenque', 2025, array['9.5 ton', '97 HP', '4WD'], 'Potencia Komatsu con bajo consumo de combustible. Cabina ergonómica con A/C de serie.', null, 'retro', false, true)
on conflict (slug) do update set
  nombre = excluded.nombre,
  marca = excluded.marca,
  categoria = excluded.categoria,
  condicion = excluded.condicion,
  precio_cents = excluded.precio_cents,
  precio_anterior_cents = excluded.precio_anterior_cents,
  financiamiento = excluded.financiamiento,
  arrendamiento = excluded.arrendamiento,
  envio_incluido = excluded.envio_incluido,
  ubicacion = excluded.ubicacion,
  anio = excluded.anio,
  especificaciones = excluded.especificaciones,
  descripcion = excluded.descripcion,
  imagen_url = excluded.imagen_url,
  icono = excluded.icono,
  destacado = excluded.destacado,
  publicado = excluded.publicado;
