/**
 * empaquetar.js — Copia el sitio publicable a dist/.
 *
 * Hasta ahora se publicaba la raíz del repositorio tal cual. Funcionaba en
 * Netlify, pero es una costumbre peligrosa: cualquier archivo que caiga en la
 * carpeta acaba servido en internet sin que nadie lo decida. Un respaldo, una
 * nota, un `.env` mal nombrado.
 *
 * Aquí es al revés: se copia SÓLO lo que está en la lista. Lo que no aparece
 * no se publica, y añadir algo nuevo obliga a escribirlo aquí — o sea, a
 * decidirlo.
 *
 * Además Cloudflare Pages sube entero el directorio de salida. Publicar la
 * raíz significaría subir node_modules: miles de archivos, y el código de las
 * herramientas de construcción con él.
 *
 *   npm run build      (build.js genera; esto empaqueta)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

/* Lo único que ve el público. Todo lo demás —tools, tests, supabase, docs,
   node_modules, .env— se queda fuera por no estar en la lista. */
const PUBLICAR = [
  'index.html',
  'robots.txt',
  'sitemap.xml',
  '_headers',
  'assets',
  'equipos',
  'maquinaria',
];

function copiar(desde, hacia) {
  const stat = fs.statSync(desde);
  if (stat.isDirectory()) {
    fs.mkdirSync(hacia, { recursive: true });
    for (const hijo of fs.readdirSync(desde)) copiar(path.join(desde, hijo), path.join(hacia, hijo));
  } else {
    fs.copyFileSync(desde, hacia);
  }
}

function contar(dir) {
  let n = 0;
  for (const hijo of fs.readdirSync(dir)) {
    const p = path.join(dir, hijo);
    n += fs.statSync(p).isDirectory() ? contar(p) : 1;
  }
  return n;
}

// Se borra y se rehace: si un equipo se da de baja, su ficha vieja no puede
// quedarse rondando en el sitio publicado.
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const faltan = [];
for (const nombre of PUBLICAR) {
  const origen = path.join(ROOT, nombre);
  if (!fs.existsSync(origen)) { faltan.push(nombre); continue; }
  copiar(origen, path.join(DIST, nombre));
}

if (faltan.length) {
  console.error('✗ Falta publicar: ' + faltan.join(', '));
  process.exit(1);
}

/* Último cerrojo antes de subir.

   Si un archivo con credenciales llegara a dist/, se publicaría en internet
   para siempre —lo que se sirve una vez, se cachea y se indexa—. Comprobarlo
   aquí cuesta milisegundos y cierra el modo de fallo más caro que tiene un
   despliegue. */
const prohibidos = ['.env', '.env.local', 'supabase', 'node_modules', 'tools', 'tests'];
for (const p of prohibidos) {
  if (fs.existsSync(path.join(DIST, p))) {
    console.error(`✗ "${p}" acabó en dist/. No se publica.`);
    process.exit(1);
  }
}

console.log(`  dist/                         ${contar(DIST)} archivos listos para publicar`);
