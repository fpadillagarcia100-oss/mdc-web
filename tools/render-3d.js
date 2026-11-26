/**
 * render-3d.js — Renderiza en Blender la animación del hero y la deja lista
 * para publicar en assets/3d/.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 *
 * Se corre con:  npm run render3d
 *                npm run render3d -- --prueba 1,40,80   (sólo esos cuadros, rápido)
 *                npm run render3d -- --solo-codificar   (reusa los cuadros ya hechos)
 *                npm run render3d -- --solo-maquinas    (sólo las fotos de las tarjetas)
 *
 * ── Por qué así ──
 *
 * La escena no es un .blend guardado: es código, en tools/blender/. Un .blend
 * son megas de binario que nadie puede revisar en un diff, y que sólo sabe
 * editar quien tenga Blender abierto. Con la escena escrita en Python, mover
 * una luz o cambiar el amarillo es un cambio de una línea que se lee en el
 * commit, y el render se repite idéntico en cualquier computadora.
 *
 * Igual que los mapas (make-mapas.js), esto corre UNA vez, aquí, y lo que
 * produce se guarda en el repositorio. Ni el CI ni Cloudflare necesitan
 * Blender: publican los archivos que ya están en assets/3d/.
 *
 * Tarda: alrededor de una hora el render completo en una PC de oficina sin
 * tarjeta de video, casi todo en los 120 cuadros del video. La codificación
 * es un minuto y las seis máquinas, unos diez.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SALIDA = path.join(ROOT, 'assets', '3d');
const CUADROS = path.join(os.tmpdir(), 'mdc-render3d', 'hero');

/* Lo que puede pesar cada archivo. Si un cambio en la escena los pasa —más
   detalle en el fondo, ruido, una cámara que se mueve más— hay que saberlo
   aquí y no cuando la portada ya tarda en abrir. visual.test.js vuelve a
   medirlos en el navegador. */
const TOPE = {
  'excavadora.webm': 400 * 1024, 'excavadora.mp4': 400 * 1024, 'excavadora.webp': 40 * 1024,
  ...Object.fromEntries(['excavadora', 'retro', 'bulldozer', 'compactador', 'minicargador', 'grua']
    .map(m => [`maquinas/${m}.webp`, 40 * 1024])),
};

function buscarBlender() {
  if (process.env.BLENDER && fs.existsSync(process.env.BLENDER)) return process.env.BLENDER;
  const enPath = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['blender'], { encoding: 'utf8' });
  if (enPath.status === 0) return enPath.stdout.split(/\r?\n/)[0].trim();
  // En Windows el instalador no lo pone en el PATH: se busca la versión más nueva.
  const base = 'C:/Program Files/Blender Foundation';
  if (fs.existsSync(base)) {
    const versiones = fs.readdirSync(base).filter(d => fs.existsSync(path.join(base, d, 'blender.exe')))
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    if (versiones.length) return path.join(base, versiones.at(-1), 'blender.exe');
  }
  return null;
}

function blender(exe, script, args) {
  const r = spawnSync(exe, ['-b', '--factory-startup', '-P', path.join(__dirname, 'blender', script), '--', ...args],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // Blender imprime una línea por cada mosaico de cada cuadro; sólo se
  // enseñan los avisos propios y los errores.
  const salida = (r.stdout || '') + (r.stderr || '');
  for (const l of salida.split(/\r?\n/)) {
    if (/^MDC |Error|Traceback|^\s+File "/.test(l)) console.log('  ' + l.replace(/^MDC /, ''));
  }
  if (r.status !== 0 || /Traceback/.test(salida)) {
    console.error(`✗ Blender falló en ${script}`);
    process.exit(1);
  }
}

const exe = buscarBlender();
if (!exe) {
  console.error('✗ No encontré Blender. Instálalo (blender.org) o indica la ruta en la variable BLENDER.');
  process.exit(1);
}

const argv = process.argv.slice(2);
const prueba = argv.includes('--prueba') ? argv[argv.indexOf('--prueba') + 1] : null;

if (prueba) {
  const dir = path.join(os.tmpdir(), 'mdc-render3d', 'prueba');
  blender(exe, 'hero.py', ['--cuadros', dir, '--prueba', prueba]);
  console.log(`  Cuadros de prueba en ${dir}`);
  process.exit(0);
}

const soloMaquinas = argv.includes('--solo-maquinas');
if (!soloMaquinas) {
  if (!argv.includes('--solo-codificar')) {
    fs.rmSync(CUADROS, { recursive: true, force: true });
    console.log('  Renderizando 120 cuadros con EEVEE (tarda)…');
    blender(exe, 'hero.py', ['--cuadros', CUADROS]);
  }
  blender(exe, 'codificar.py', ['--cuadros', CUADROS, '--salida', SALIDA]);
}
if (soloMaquinas || !argv.includes('--solo-codificar')) {
  console.log('  Renderizando las seis máquinas con Cycles…');
  blender(exe, 'maquinas.py', ['--salida', path.join(SALIDA, 'maquinas')]);
}

let pasado = false;
for (const [archivo, tope] of Object.entries(TOPE)) {
  // Con --solo-codificar o --solo-maquinas sólo se revisa lo que se hizo.
  if (archivo.startsWith('maquinas/') !== soloMaquinas && argv.some(a => a.startsWith('--solo'))) continue;
  const peso = fs.statSync(path.join(SALIDA, archivo)).size;
  const ok = peso <= tope;
  pasado ||= !ok;
  console.log(`  ${ok ? '✓' : '✗'} ${archivo.padEnd(18)} ${(peso / 1024).toFixed(0).padStart(4)} kB de ${tope / 1024}`);
}
if (pasado) {
  console.error('✗ Algo pesa más de la cuenta. Sube el CRF en codificar.py o quita ruido de la escena.');
  process.exit(1);
}
