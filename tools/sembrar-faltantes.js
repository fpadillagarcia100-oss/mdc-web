/**
 * sembrar-faltantes.js — Añade a la base los equipos que están en el sitio
 * pero no en ella, y NADA más.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 *
 * Se corre con:  npm run db:faltantes
 *
 * ── Por qué no basta con `npm run db:seed` ──
 *
 * El seed completo usa `on conflict do update`: correrlo pisaría los equipos
 * que ya están en la base con lo que diga data/catalogo.json. Si alguien ajustó
 * un precio, marcó un equipo como vendido o le cambió una foto desde el panel,
 * eso se perdería sin aviso y sin forma de recuperarlo.
 *
 * Esto genera INSERTs sólo para los que faltan, con `on conflict do nothing`.
 * Correrlo dos veces no hace nada la segunda; correrlo por error no rompe nada.
 *
 * ── Por qué importa que falten ──
 *
 * La tabla `preguntas` referencia `equipos(slug)`. Un equipo que se ve en el
 * sitio pero no existe en la base RECHAZA las preguntas: el cliente ve un
 * error, y tú no te enteras de que alguien quiso preguntar. Es la peor clase
 * de fallo — silencioso y del lado de quien iba a comprar.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* Las credenciales salen del archivo que genera la compilación, para no pedir
   nada más ni duplicar la configuración. Son las públicas: sólo dan lectura de
   lo publicado, que es todo lo que hace falta aquí. */
function credenciales() {
  const s = fs.readFileSync(path.join(ROOT, 'assets/js/catalogo-datos.js'), 'utf8');
  const m = s.match(/const BACKEND_CONFIG = (\{[\s\S]*?\});/);
  if (!m || m[1].trim() === 'null') return null;
  /* Se evalúa como literal de JavaScript en vez de convertirlo a JSON con
     expresiones regulares: el primer intento hacía eso y rompía las comillas
     de los valores que ya las traían. Es un archivo que genera nuestra propia
     compilación, no entrada de nadie de fuera. */
  return new Function(`return (${m[1]})`)();
}

const txt = v => (v === null || v === undefined || v === '')
  ? 'null'
  : `'${String(v).replace(/'/g, "''")}'`;
const txtVacio = v => `'${String(v ?? '').replace(/'/g, "''")}'`;
const bool = v => (v ? 'true' : 'false');
const arr = xs => (xs && xs.length ? `array[${xs.map(txtVacio).join(', ')}]` : `'{}'::text[]`);
const centavos = n => (n === null || n === undefined ? 'null' : Math.round(Number(n) * 100));

function fila(e) {
  return '  (' + [
    txt(e.slug), txtVacio(e.name), txtVacio(e.brand), txtVacio(e.cat), txtVacio(e.cond),
    centavos(e.price), centavos(e.original),
    txt(e.finance), bool(e.leasing), bool(e.shipping),
    txtVacio(e.location), Number(e.year) || 'null',
    arr(e.specs), txtVacio(e.desc), txt(e.img), txt(e.svgKey), bool(e.hot), 'true',
  ].join(', ') + ')';
}

(async () => {
  const cfg = credenciales();
  if (!cfg) {
    console.error('Sin credenciales en catalogo-datos.js. Corre `npm run build` primero.');
    process.exit(1);
  }

  const catalogo = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/catalogo.json'), 'utf8'));

  const r = await fetch(`${cfg.url}/rest/v1/equipos?select=slug`, {
    headers: { apikey: cfg.llave, Authorization: `Bearer ${cfg.llave}` },
  });
  if (!r.ok) {
    console.error(`No pude leer la base: HTTP ${r.status}`);
    process.exit(1);
  }

  const enBase = new Set((await r.json()).map(e => e.slug));
  const faltan = catalogo.equipos.filter(e => !enBase.has(e.slug));

  console.log(`\nEn el sitio: ${catalogo.equipos.length} equipos`);
  console.log(`En la base : ${enBase.size} equipos`);

  if (!faltan.length) {
    console.log('\n✓ No falta ninguno. La base y el sitio dicen lo mismo.\n');
    return;
  }

  console.log(`\nFaltan ${faltan.length}, y cada uno RECHAZA las preguntas del público:`);
  faltan.forEach(e => console.log(`  · ${e.slug}`));

  const sql = `-- ═══════════════════════════════════════════════════════════════════════════
-- Equipos que están en el sitio pero no en la base.
-- GENERADO por tools/sembrar-faltantes.js — no editar a mano.
--
-- \`do nothing\`, no \`do update\`: esto AÑADE lo que falta y no toca nada de lo
-- que ya está. Si ajustaste un precio desde el panel, sigue como lo dejaste.
--
-- Pégalo en Supabase → SQL Editor → Run.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.equipos (
  slug, nombre, marca, categoria, condicion, precio_cents, precio_anterior_cents,
  financiamiento, arrendamiento, envio_incluido, ubicacion, anio,
  especificaciones, descripcion, imagen_url, icono, destacado, publicado
) values
${faltan.map(fila).join(',\n')}
on conflict (slug) do nothing;

-- Comprobación: deben salir ${catalogo.equipos.length}.
select count(*) as equipos_en_la_base from public.equipos;
`;

  const salida = path.join(ROOT, 'supabase', 'faltantes.sql');
  fs.writeFileSync(salida, sql, 'utf8');
  console.log(`\n✓ supabase/faltantes.sql — ${faltan.length} equipos listos para pegar en el SQL Editor\n`);
})();
