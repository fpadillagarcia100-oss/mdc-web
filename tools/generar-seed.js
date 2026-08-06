/**
 * generar-seed.js — Convierte data/catalogo.json en supabase/seed.sql.
 *
 * Es el puente de ida: pasa lo que hoy vive en un archivo a la base de datos.
 * Se corre una vez al montar la base, y otra vez cada que quieras recrearla
 * desde cero con los mismos datos.
 *
 * Se genera en lugar de escribirse a mano por una razón concreta: 18 equipos
 * copiados a mano son 18 oportunidades de teclear mal un precio, y un precio
 * mal tecleado en el seed se ve idéntico a uno correcto. Aquí la única fuente
 * es el JSON que ya está probado.
 *
 * El SQL resultante es idempotente (`on conflict do update`): correrlo dos
 * veces deja la base igual que correrlo una.
 *
 *   npm run db:seed
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SALIDA = path.join(ROOT, 'supabase', 'seed.sql');

/** Escapa una cadena para SQL. null y undefined se vuelven NULL, no 'null'. */
const txt = v => (v === null || v === undefined || v === '')
  ? 'null'
  : `'${String(v).replace(/'/g, "''")}'`;

/** Igual que txt, pero para columnas `not null default ''`. */
const txtVacio = v => `'${String(v ?? '').replace(/'/g, "''")}'`;

const bool = v => (v ? 'true' : 'false');

/** Array de texto de Postgres: array['a','b']. */
const arr = xs => xs && xs.length
  ? `array[${xs.map(txtVacio).join(', ')}]`
  : `'{}'::text[]`;

/**
 * Pesos → centavos.
 *
 * Math.round importa: 2850000 * 100 en punto flotante puede dar
 * 284999999.99999994, y `bigint` truncaría el último centavo sin avisar.
 */
const centavos = pesos => (pesos === null || pesos === undefined)
  ? 'null'
  : String(Math.round(Number(pesos) * 100));

function generar() {
  const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'catalogo.json'), 'utf8'));
  const a = c.ajustes;
  const L = [];

  L.push('-- ═══════════════════════════════════════════════════════════════════════════');
  L.push('-- Datos de arranque — GENERADO por tools/generar-seed.js. No editar a mano.');
  L.push('--');
  L.push('-- Fuente: data/catalogo.json');
  L.push(`-- Equipos: ${c.equipos.length} · Sucursales: ${c.sucursales.length}`);
  L.push('--');
  L.push('-- Se aplica solo con `npx supabase db reset`, o a mano con:');
  L.push('--   psql "$DATABASE_URL" -f supabase/seed.sql');
  L.push('-- ═══════════════════════════════════════════════════════════════════════════');
  L.push('');

  /* ── Ajustes: una sola fila, id = true ── */
  L.push('-- ── Marca, contacto y textos de portada ──');
  L.push('insert into public.ajustes (');
  L.push('  id, marca_principal, marca_acento, marca_completa, color_acento, logo_url,');
  L.push('  barra_superior, hero_etiqueta, hero_titulo, hero_resaltado, hero_texto, hero_imagen,');
  L.push('  vendedor, telefono, whatsapp, correo, direccion, horario, pie_descripcion');
  L.push(') values (');
  L.push('  true,');
  L.push(`  ${txtVacio(a.marca_principal)}, ${txtVacio(a.marca_acento)}, ${txtVacio(a.marca_completa)},`);
  L.push(`  ${txtVacio(a.color_acento)}, ${txt(a.logo)},`);
  L.push(`  ${txtVacio(a.barra_superior)},`);
  L.push(`  ${txtVacio(a.hero_etiqueta)}, ${txtVacio(a.hero_titulo)}, ${txtVacio(a.hero_resaltado)},`);
  L.push(`  ${txtVacio(a.hero_texto)}, ${txt(a.hero_imagen)},`);
  L.push(`  ${txtVacio(a.vendedor)}, ${txtVacio(a.telefono)}, ${txtVacio(a.whatsapp)},`);
  L.push(`  ${txtVacio(a.correo)}, ${txtVacio(a.direccion)}, ${txtVacio(a.horario)},`);
  L.push(`  ${txtVacio(a.pie_descripcion)}`);
  L.push(')');
  L.push('on conflict (id) do update set');
  L.push([
    'marca_principal', 'marca_acento', 'marca_completa', 'color_acento', 'logo_url',
    'barra_superior', 'hero_etiqueta', 'hero_titulo', 'hero_resaltado', 'hero_texto',
    'hero_imagen', 'vendedor', 'telefono', 'whatsapp', 'correo', 'direccion',
    'horario', 'pie_descripcion',
  ].map(col => `  ${col} = excluded.${col}`).join(',\n') + ';');
  L.push('');

  /* ── Sucursales ──
     Se vacía y se vuelve a llenar: no tienen clave natural estable, y tres
     filas no justifican inventarle una. */
  L.push('-- ── Sucursales ──');
  L.push('delete from public.sucursales;');
  L.push('insert into public.sucursales (nombre, direccion, telefono, horario, orden) values');
  L.push(c.sucursales.map((s, i) =>
    `  (${txtVacio(s.name)}, ${txtVacio(s.address)}, ${txtVacio(s.phone)}, ${txtVacio(s.hours)}, ${i})`
  ).join(',\n') + ';');
  L.push('');

  /* ── Equipos ──
     El slug es la clave real: es lo que aparece en la URL de cada ficha, y
     por tanto lo que no puede cambiar sin romper enlaces ya publicados.
     El `id` numérico del JSON no se copia — lo asigna la base. */
  L.push('-- ── Catálogo ──');
  L.push('-- El conflicto se resuelve por `slug` porque es la clave que ve el mundo:');
  L.push('-- es la URL de la ficha. Volver a correr esto actualiza el equipo existente');
  L.push('-- en vez de duplicarlo con otra URL.');
  L.push('insert into public.equipos (');
  L.push('  slug, nombre, marca, categoria, condicion, precio_cents, precio_anterior_cents,');
  L.push('  financiamiento, arrendamiento, envio_incluido, ubicacion, anio,');
  L.push('  especificaciones, descripcion, imagen_url, icono, destacado, publicado');
  L.push(') values');
  L.push(c.equipos.map(e => '  (' + [
    txtVacio(e.slug), txtVacio(e.name), txtVacio(e.brand), txtVacio(e.cat), txtVacio(e.cond),
    centavos(e.price), centavos(e.original),
    txt(e.finance), bool(e.leasing), bool(e.shipping), txtVacio(e.location), e.year,
    arr(e.specs), txtVacio(e.desc), txt(e.img), txtVacio(e.svgKey), bool(e.hot),
    'true',  // el catálogo actual ya está en línea: nace publicado
  ].join(', ') + ')').join(',\n') + '');
  L.push('on conflict (slug) do update set');
  L.push([
    'nombre', 'marca', 'categoria', 'condicion', 'precio_cents', 'precio_anterior_cents',
    'financiamiento', 'arrendamiento', 'envio_incluido', 'ubicacion', 'anio',
    'especificaciones', 'descripcion', 'imagen_url', 'icono', 'destacado', 'publicado',
  ].map(col => `  ${col} = excluded.${col}`).join(',\n') + ';');
  L.push('');

  return L.join('\n');
}

/* ── Comprobaciones antes de escribir ──
   Un seed que viola una restricción falla a mitad de `db reset` y deja la
   base a medias. Es más barato descubrirlo aquí. */
function revisar(catalogo) {
  const problemas = [];
  const slugs = new Set();

  for (const e of catalogo.equipos) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.slug)) problemas.push(`slug inválido: ${e.slug}`);
    if (slugs.has(e.slug)) problemas.push(`slug repetido: ${e.slug}`);
    slugs.add(e.slug);

    if (!['Nuevo', 'Usado', 'Renta'].includes(e.cond)) problemas.push(`${e.slug}: condición "${e.cond}"`);
    if (!(e.price >= 0)) problemas.push(`${e.slug}: precio inválido`);
    if (e.original !== null && e.original !== undefined && !(e.original > e.price))
      problemas.push(`${e.slug}: el precio anterior debe ser mayor al actual`);
    if (e.specs && e.specs.length > 12) problemas.push(`${e.slug}: más de 12 especificaciones`);
    if (!(e.year >= 1970 && e.year <= 2100)) problemas.push(`${e.slug}: año ${e.year}`);
    if (e.img && !/^https:\/\//.test(e.img)) problemas.push(`${e.slug}: la imagen debe ser https`);
  }

  for (const s of catalogo.sucursales) {
    if (!/^[0-9 +()-]{7,20}$/.test(s.phone)) problemas.push(`sucursal ${s.name}: teléfono "${s.phone}"`);
  }

  if (!/^#[0-9A-Fa-f]{6}$/.test(catalogo.ajustes.color_acento))
    problemas.push(`color de acento inválido: ${catalogo.ajustes.color_acento}`);
  if (!/^[0-9]*$/.test(catalogo.ajustes.whatsapp))
    problemas.push('el whatsapp debe ser sólo dígitos');

  return problemas;
}

const catalogo = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'catalogo.json'), 'utf8'));
const problemas = revisar(catalogo);

if (problemas.length) {
  console.error('✗ data/catalogo.json no cumple las restricciones del esquema:\n');
  problemas.forEach(p => console.error('   · ' + p));
  console.error('\nCorrige el JSON antes de generar el seed.');
  process.exit(1);
}

fs.writeFileSync(SALIDA, generar(), 'utf8');
console.log(`✓ supabase/seed.sql — ${catalogo.equipos.length} equipos, ${catalogo.sucursales.length} sucursales`);
