/**
 * empacar-js.js — Une los scripts del sitio en dos archivos para publicar.
 *
 * Parte de MDC · Maquinaria de Chiapas. Lo llama tools/build.js.
 *
 * ── El problema ──
 *
 * index.html carga 21 archivos con `defer`. En escritorio con fibra da igual;
 * en un teléfono de gama media con la señal de una obra, cada archivo es una
 * ida y vuelta más antes de que la página haga nada. La medición lo dice: 25
 * peticiones para abrir la portada, y 20 de ellas son JavaScript propio.
 *
 * ── Por qué unir y no empaquetar de verdad ──
 *
 * Estos archivos NO son módulos. Se cargan como scripts clásicos y se hablan
 * entre ellos por variables globales: `render()` en catalog.js lo llama
 * main.js sin importar nada. Un empaquetador de módulos no serviría sin
 * reescribir los 21, y reescribirlos para ganar unos milisegundos es un mal
 * negocio. Concatenar en el mismo orden que el HTML da exactamente el mismo
 * resultado con la misma semántica.
 *
 * ── El detalle que sí importa ──
 *
 * Cada archivo empieza con 'use strict'. Esa línea sólo tiene efecto cuando es
 * la PRIMERA del archivo o de la función; a mitad de un archivo unido es una
 * cadena suelta que no hace nada. Así que se pone una sola vez arriba del
 * todo, y se quitan las de dentro para que nadie crea que siguen mandando.
 * El resultado es más estricto que antes, no menos: antes cada archivo era
 * estricto por su cuenta y ahora lo es el conjunto entero.
 *
 * ── Dos archivos, no uno ──
 *
 * Los admin-*.js (equipos, bandeja, personal, la escena de la obra) eran casi
 * un tercio del total y sólo los usan quienes administran. Van en panel.js,
 * que main.js baja con conPanel() la primera vez que alguien entra al panel.
 * El resto de los visitantes no lo descarga nunca.
 *
 * Funciona porque el panel no hace nada al cargarse: sólo declara funciones y
 * estado, y nadie de fuera lo llama sin pasar por conPanel(). Las dos cosas
 * las vigila tests/arquitectura.test.js.
 *
 * Aquí no se minifica: sitio.js y panel.js quedan legibles, con un rótulo por
 * archivo, que es lo que lee la prueba de arquitectura. Lo que se publica en
 * dist/ sí va minificado; eso lo hace empaquetar.js.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* Una etiqueta de script del sitio, con la ruta absoluta (/assets/js/…) o
   relativa (assets/js/…): las dos llegan al mismo archivo desde la raíz. */
const RE_SCRIPT = /<script\s+src="\/?(assets\/js\/[^"]+)"[^>]*><\/script>/g;

/** Saca del index.html la lista de scripts, EN SU ORDEN, como rutas del
    repositorio (sin la barra inicial). */
function scriptsDelHtml(html) {
  return [...html.matchAll(RE_SCRIPT)].map(m => m[1]);
}

/** Lo que sólo usa quien administra: viaja aparte, en panel.js. */
const esDelPanel = rel => path.basename(rel).startsWith('admin');

/** Une `archivos`, en ese orden, en assets/js/<nombre>. */
function unir(archivos, nombre) {
  const partes = [
    `/* MDC · Maquinaria de Chiapas — ${archivos.length} archivos unidos por tools/empacar-js.js.`,
    `   NO se edita a mano: se regenera en cada 'npm run build'.`,
    `   El original de cada bloque está en assets/js/, que es donde se trabaja. */`,
    `'use strict';`,
  ];

  let bytes = 0;
  for (const rel of archivos) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    bytes += Buffer.byteLength(src);
    // Fuera el 'use strict' propio: ya no es una directiva, sólo ruido que
    // haría pensar que cada bloque decide por su cuenta.
    const limpio = src.replace(/^\s*['"]use strict['"];?\s*$/m, '');
    partes.push(`\n/* ══════════ ${rel} ══════════ */\n${limpio}`);
  }

  const salida = partes.join('\n');
  fs.writeFileSync(path.join(ROOT, 'assets', 'js', nombre), salida, 'utf8');

  return {
    archivos: archivos.length,
    antes: bytes,
    despues: Buffer.byteLength(salida),
    destino: `assets/js/${nombre}`,
  };
}

function empacarJS() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const archivos = scriptsDelHtml(html);
  if (!archivos.length) throw new Error('No encontré scripts en index.html');

  const sitio = unir(archivos.filter(r => !esDelPanel(r)), 'sitio.js');
  const panel = unir(archivos.filter(esDelPanel), 'panel.js');

  return {
    archivos: sitio.archivos + panel.archivos,
    antes: sitio.antes + panel.antes,
    despues: sitio.despues + panel.despues,
    destino: `${sitio.destino} + ${panel.destino}`,
  };
}

/**
 * Deja el index.html publicable cargando un solo script.
 *
 * Devuelve el HTML modificado; NO toca el archivo del repositorio. El
 * index.html con sus 21 scripts es el que se trabaja y el que depuras: ahí
 * cada error apunta a su archivo y a su línea de verdad.
 *
 * `rutas` son las direcciones publicadas de los dos archivos: { sitio, panel }.
 */
function htmlConBundle(html, rutas) {
  const etiquetas = [...html.matchAll(RE_SCRIPT)];
  if (!etiquetas.length) throw new Error('No pude ubicar el bloque de scripts');
  const primero = etiquetas[0].index;
  const ultima = etiquetas[etiquetas.length - 1];
  const fin = ultima.index + ultima[0].length;

  /* Las direcciones llevan el hash del contenido: un despliegue nuevo es una
     dirección nueva, así que ningún caché puede servir el código de ayer. La
     del panel va en data-panel, y main.js la lee cuando alguien entra. */
  return html.slice(0, primero) +
    `<!-- Los ${etiquetas.length} scripts de assets/js/ unidos en la compilación; los del panel van\n` +
    `     aparte y se bajan al entrar a él. El original, archivo por archivo, sigue en el\n` +
    `     repositorio: es el que se edita. -->\n` +
    `<script src="${rutas.sitio}" data-panel="${rutas.panel}" defer></script>` +
    html.slice(fin);
}

module.exports = { empacarJS, htmlConBundle, scriptsDelHtml, esDelPanel };
