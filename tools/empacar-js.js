/**
 * empacar-js.js — Une los 21 scripts del sitio en uno solo para publicar.
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
 * No se minifica. Cloudflare comprime con gzip al servir, que es de donde sale
 * la mayor parte del ahorro, y un minificador propio es justo el tipo de
 * herramienta que rompe en silencio un martes por la tarde.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** Saca del index.html la lista de scripts, EN SU ORDEN. */
function scriptsDelHtml(html) {
  const orden = [];
  const re = /<script\s+src="(assets\/js\/[^"]+)"/g;
  let m;
  while ((m = re.exec(html))) orden.push(m[1]);
  return orden;
}

function empacarJS() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const archivos = scriptsDelHtml(html);
  if (!archivos.length) throw new Error('No encontré scripts en index.html');

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

  const destino = path.join(ROOT, 'assets', 'js', 'sitio.js');
  const salida = partes.join('\n');
  fs.writeFileSync(destino, salida, 'utf8');

  return {
    archivos: archivos.length,
    antes: bytes,
    despues: Buffer.byteLength(salida),
    destino: 'assets/js/sitio.js',
  };
}

/**
 * Deja el index.html publicable cargando un solo script.
 *
 * Devuelve el HTML modificado; NO toca el archivo del repositorio. El
 * index.html con sus 21 scripts es el que se trabaja y el que depuras: ahí
 * cada error apunta a su archivo y a su línea de verdad.
 */
function htmlConBundle(html, version) {
  const scripts = scriptsDelHtml(html);
  const primero = html.indexOf(`<script src="${scripts[0]}"`);
  const ultimoTag = `<script src="${scripts[scripts.length - 1]}" defer></script>`;
  const fin = html.indexOf(ultimoTag) + ultimoTag.length;
  if (primero < 0 || fin < ultimoTag.length) throw new Error('No pude ubicar el bloque de scripts');

  /* La versión en la dirección es lo que hace que un despliegue llegue de
     verdad: el archivo no cambia de nombre, pero sí la petición, así que
     ningún caché intermedio puede servir el de ayer. */
  return html.slice(0, primero) +
    `<!-- Los ${scripts.length} scripts de assets/js/ unidos en la compilación. El original,\n` +
    `     archivo por archivo, sigue en el repositorio: es el que se edita. -->\n` +
    `<script src="/assets/js/sitio.js?v=${version}" defer></script>` +
    html.slice(fin);
}

module.exports = { empacarJS, htmlConBundle, scriptsDelHtml };
