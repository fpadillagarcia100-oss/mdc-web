-- ═══════════════════════════════════════════════════════════════════════════
-- Equipos que están en el sitio pero no en la base.
-- GENERADO por tools/sembrar-faltantes.js — no editar a mano.
--
-- `do nothing`, no `do update`: esto AÑADE lo que falta y no toca nada de lo
-- que ya está. Si ajustaste un precio desde el panel, sigue como lo dejaste.
--
-- Pégalo en Supabase → SQL Editor → Run.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.equipos (
  slug, nombre, marca, categoria, condicion, precio_cents, precio_anterior_cents,
  financiamiento, arrendamiento, envio_incluido, ubicacion, anio,
  especificaciones, descripcion, imagen_url, icono, destacado, publicado
) values
  ('excavadora-cat-320-gc', 'Excavadora CAT 320 GC', 'CAT', 'Excavación', 'Nuevo', 285000000, 310000000, '18 MSI', true, true, 'Tuxtla Gutiérrez', 2025, array['20 ton', '148 HP', '6.5 m alcance'], 'Excavadora hidráulica de cadenas con sistema de gestión inteligente. Ideal para obra urbana y movimiento de tierra de mediana escala.', null, 'excavadora', true, true),
  ('excavadora-cat-336', 'Excavadora CAT 336', 'CAT', 'Excavación', 'Nuevo', 420000000, null, '18 MSI', true, true, 'Tapachula', 2025, array['36 ton', '270 HP', '7.8 m alcance'], 'Máxima potencia para proyectos de gran envergadura. Motor ACERT con tecnología de reducción de emisiones.', null, 'excavadora', false, true),
  ('excavadora-komatsu-pc290', 'Excavadora Komatsu PC290', 'Komatsu', 'Excavación', 'Usado', 165000000, 220000000, '12 MSI', true, false, 'San Cristóbal de las Casas', 2021, array['29 ton', '197 HP', '2,400 hrs'], 'Excavadora seminueva en excelentes condiciones. Con certificado de inspección y garantía de 6 meses.', null, 'excavadora', false, true),
  ('bulldozer-komatsu-d65px', 'Bulldozer Komatsu D65PX', 'Komatsu', 'Nivelación', 'Nuevo', 375000000, null, '18 MSI', true, true, 'Tapachula', 2025, array['21 ton', '228 HP', 'Ripper incl.'], 'Dozer de alta productividad para nivelación de grandes volúmenes. Sistema de tracción hidrostática.', null, 'bulldozer', false, true),
  ('bulldozer-cat-d6t', 'Bulldozer CAT D6T', 'CAT', 'Nivelación', 'Nuevo', 490000000, 520000000, '18 MSI', true, true, 'Tuxtla Gutiérrez', 2025, array['24 ton', '215 HP', 'GPS Ready'], 'El estándar de la industria. Con sensor de pendiente integrado y sistema CAT LINK para telemetría.', null, 'bulldozer', false, true),
  ('bulldozer-komatsu-d51i', 'Bulldozer Komatsu D51i', 'Komatsu', 'Nivelación', 'Renta', 4200000, null, null, false, false, 'San Cristóbal de las Casas', 2023, array['14.6 ton', '130 HP', 'Inteligente'], 'Disponible en renta mensual. Incluye operador, seguro y mantenimiento preventivo.', null, 'bulldozer', false, true),
  ('minicargador-bobcat-s650', 'Minicargador Bobcat S650', 'Bobcat', 'Carga', 'Nuevo', 52000000, 58000000, '12 MSI', true, true, 'Tuxtla Gutiérrez', 2025, array['3.5 ton', '74 HP', 'Multi-attach'], 'El más ágil para espacios confinados. Sistema de acople rápido compatible con más de 100 aditamentos.', null, 'minicargador', true, true),
  ('minicargador-cat-262d3', 'Minicargador CAT 262D3', 'CAT', 'Carga', 'Nuevo', 61000000, null, '18 MSI', true, true, 'Tapachula', 2025, array['4.0 ton', '90 HP', 'Cabina ROPS'], 'Mayor capacidad de carga con visibilidad total. Sistema CAT SMART ATTACH para cambio rápido.', null, 'minicargador', false, true),
  ('minicargador-bobcat-t450', 'Minicargador Bobcat T450', 'Bobcat', 'Carga', 'Renta', 1800000, null, null, false, false, 'Tuxtla Gutiérrez', 2023, array['3.2 ton', '66 HP', 'Cadenas'], 'Versión de cadenas para terreno blando. Renta semanal o mensual disponible.', null, 'minicargador', false, true),
  ('grua-torre-liebherr-160ec', 'Grúa Torre Liebherr 160EC', 'Liebherr', 'Elevación', 'Nuevo', 680000000, null, '18 MSI', true, false, 'Tuxtla Gutiérrez', 2025, array['8 ton punta', '50 m pluma', 'Montaje incl.'], 'Ideal para edificios de hasta 20 niveles. Montaje, operación e instalación eléctrica incluidos.', null, 'grua', false, true),
  ('grua-torre-potain-mdt-178', 'Grúa Torre Potain MDT 178', 'Potain', 'Elevación', 'Renta', 8500000, null, null, false, false, 'Tapachula', 2022, array['6 ton punta', '45 m pluma', 'Full servicio'], 'Renta mensual con operador certificado, mantenimiento y seguro de responsabilidad civil.', null, 'grua', false, true),
  ('retroexcavadora-komatsu-wb97', 'Retroexcavadora Komatsu WB97', 'Komatsu', 'Carga', 'Nuevo', 115000000, 128000000, '18 MSI', true, true, 'Palenque', 2025, array['9.5 ton', '97 HP', '4WD'], 'Potencia Komatsu con bajo consumo de combustible. Cabina ergonómica con A/C de serie.', null, 'retro', false, true)
on conflict (slug) do nothing;

-- Comprobación: deben salir 18.
select count(*) as equipos_en_la_base from public.equipos;
