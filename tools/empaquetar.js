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
  /* El trabajador de servicio va en la raíz por obligación, no por gusto: sólo
     manda sobre las direcciones que cuelgan de su propia carpeta, y desde
     /assets/ no podría atender la portada. */
  'sw.js',
  'manifest.webmanifest',
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

/* sitio.js y panel.js no se versionan: se unen aquí desde assets/js/, para
   que empaquetar no dependa de que alguien haya corrido build.js antes. El CI
   lo necesita así: empaqueta lo que está en git SIN regenerarlo, porque sin
   el .env build.js escribiría un catalogo-datos.js sin backend. */
require('./empacar-js').empacarJS();

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

/* Lo publicado va minificado; el repositorio, no.

   Antes no se minificaba, con un motivo razonable: un minificador hecho en
   casa es justo lo que rompe en silencio. Por eso es esbuild y no uno propio,
   y por eso se comprueba aquí mismo lo único que de verdad podría romper este
   sitio: que se renombre una global. Los archivos se hablan entre ellos por
   nombres globales; si `render` pasara a llamarse `r`, main.js llamaría a
   algo que no existe. Se compara el contrato de antes y el de después con el
   mismo analizador que usa la prueba de arquitectura, y si falta un solo
   nombre la compilación se detiene en vez de publicar.

   Lo de gzip sigue siendo cierto, pero gzip no puede quitar los comentarios:
   en este código son casi la mitad del peso, y viajaban a cada teléfono. */
{
  const esbuild = require('esbuild');
  const { aportaciones } = require('./contrato-globales');
  let antes = 0, despues = 0;
  const minificar = (dir, loader) => {
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.' + loader))) {
      const ruta = path.join(dir, f);
      const src = fs.readFileSync(ruta, 'utf8');
      const { code } = esbuild.transformSync(src, { minify: true, loader, charset: 'utf8' });
      if (loader === 'js') {
        const salida = aportaciones(code);
        const perdidas = [...aportaciones(src)].filter(n => !salida.has(n));
        if (perdidas.length) {
          console.error(`✗ Al minificar ${f} se perdieron globales: ${perdidas.join(', ')}`);
          process.exit(1);
        }
      }
      fs.writeFileSync(ruta, code, 'utf8');
      antes += Buffer.byteLength(src);
      despues += Buffer.byteLength(code);
    }
  };
  minificar(path.join(DIST, 'assets', 'js'), 'js');
  minificar(path.join(DIST, 'assets', 'css'), 'css');
  console.log(`  JS y CSS minificados             ${(antes / 1024).toFixed(0)} kB → ${(despues / 1024).toFixed(0)} kB`);
}

/* El código publicado lleva su huella en el NOMBRE y se guarda un año.

   Antes la huella iba en la consulta (sitio.js?v=…) y el archivo se servía
   con max-age=0: el navegador volvía a preguntar en cada visita, con la
   señal de una obra, por un archivo que no había cambiado. Una consulta no
   sirve para cachear distinto: _headers decide por ruta, no por `?v=`.

   Ahora cada archivo que se publica sale en /assets/v/ con su huella en el
   nombre —sitio.3f9a…js— y esa carpeta se cachea un año como inmutable. Es
   seguro porque un archivo con huella NUNCA cambia: si cambia el contenido,
   cambia el nombre, y el HTML (que sí se revalida siempre) apunta al nuevo.

   Las copias sin huella se quedan en dist/: un HTML viejo que siga en algún
   caché todavía las pide, y no cuesta nada servírselas. */
const { htmlConBundle } = require('./empacar-js');
const huella = archivo => require('crypto')
  .createHash('sha256').update(fs.readFileSync(archivo)).digest('hex').slice(0, 10);

const VERSIONADOS = path.join(DIST, 'assets', 'v');
fs.mkdirSync(VERSIONADOS, { recursive: true });
/** Copia `rel` (dentro de dist/) a /assets/v/ con su huella. Devuelve la dirección. */
const versionar = rel => {
  const origen = path.join(DIST, rel);
  const { name, ext } = path.parse(rel);
  const nombre = `${name}.${huella(origen)}${ext}`;
  fs.copyFileSync(origen, path.join(VERSIONADOS, nombre));
  return `/assets/v/${nombre}`;
};

if (fs.existsSync(path.join(DIST, 'assets', 'js', 'sitio.js'))) {
  const rutas = {
    sitio: versionar('assets/js/sitio.js'),
    panel: versionar('assets/js/panel.js'),
    css:   versionar('assets/css/styles.css'),
    ficha: versionar('assets/js/ficha.js'),
  };

  /* El index.html que se publica carga UN script en vez de veintiuno. El del
     repositorio no se toca: ahí cada error del navegador sigue apuntando a su
     archivo y a su línea, que es lo que hace posible depurar. */
  fs.writeFileSync(path.join(DIST, 'index.html'),
    htmlConBundle(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), rutas), 'utf8');

  /* La hoja y el script de las fichas, en TODAS las páginas: la portada, las
     18 fichas y las 5 categorías. Se cuenta cuántas se tocaron, porque si el
     día de mañana una plantilla escribe la ruta de otra forma, el reemplazo
     fallaría en silencio y esa página se quedaría con el caché de un día. */
  const paginas = [];
  const recorrer = dir => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) recorrer(p);
      else if (f.endsWith('.html')) paginas.push(p);
    }
  };
  recorrer(DIST);
  const sinHoja = [];
  for (const p of paginas) {
    const antes = fs.readFileSync(p, 'utf8');
    const html = antes
      .replace(/(href=")\/?assets\/css\/styles\.css(")/g, `$1${rutas.css}$2`)
      .replace(/(src=")\/?assets\/js\/ficha\.js(")/g, `$1${rutas.ficha}$2`);
    if (!html.includes(rutas.css)) sinHoja.push(path.relative(DIST, p));
    fs.writeFileSync(p, html, 'utf8');
  }
  if (sinHoja.length) {
    console.error(`✗ Estas páginas no cargan la hoja versionada: ${sinHoja.join(', ')}`);
    process.exit(1);
  }
  console.log(`  ${paginas.length} páginas con código versionado     ${path.basename(rutas.sitio)}, ${path.basename(rutas.css)}`);

  /* El trabajador de servicio estrena cachés en cada despliegue.

     Con la versión fija que traía antes, un archivo guardado hace semanas
     podía seguir sirviéndose —basta con que la red tarde una vez— y el
     visitante acababa viendo código nuevo con estilos viejos. Eso no da ningún
     error en consola: simplemente se ve roto, y no hay por dónde empezar a
     mirar. Atando el nombre del caché al contenido publicado, `activate` borra
     los anteriores y el problema deja de existir.

     Y lo que guarda al instalarse es lo que de verdad carga la portada
     publicada. La lista del repositorio nombra los archivos sueltos de
     desarrollo, que en producción nadie pide: se bajaban sólo para ocupar
     cuota. */
  const version = require('crypto').createHash('sha256')
    .update(Object.values(rutas).join('|')).digest('hex').slice(0, 10);
  const sw = path.join(DIST, 'sw.js');
  if (fs.existsSync(sw)) {
    const base = ['/', rutas.css, rutas.sitio, '/assets/fonts/inter-v20-latin.woff2'];
    const cuerpo = fs.readFileSync(sw, 'utf8')
      .replace(/const VERSION = '[^']*';/, `const VERSION = 'mdc-${version}';`)
      .replace(/const BASE = \[[^\]]*\];/, `const BASE = ${JSON.stringify(base)};`);
    if (!cuerpo.includes(`const BASE = ${JSON.stringify(base)};`)) {
      console.error('✗ No pude reescribir la lista BASE de sw.js');
      process.exit(1);
    }
    fs.writeFileSync(sw, cuerpo, 'utf8');
    console.log(`  sw.js con cachés propios de este despliegue (mdc-${version})`);
  }
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
