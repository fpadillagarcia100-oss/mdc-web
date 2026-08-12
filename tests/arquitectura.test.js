/**
 * arquitectura.test.js — Vigila la forma del programa, no lo que hace.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 *
 * Se corre con:  npm run test:arq   (y dentro de `npm test`)
 *
 * ── Qué vigila y por qué ──
 *
 * El sitio son 21 scripts clásicos que se hablan por variables globales. Es
 * una decisión defendible a esta escala, pero tiene tres formas de pudrirse
 * que ninguna otra prueba ve, porque el programa sigue funcionando mientras se
 * pudre:
 *
 *   1. Dos archivos declarando la misma global. El segundo pisa al primero en
 *      silencio y quién gana depende del orden de carga.
 *   2. Un archivo usando algo de otro que carga DESPUÉS. Si ocurre dentro de
 *      una función no pasa nada —cuando se llama ya cargó todo—; si ocurre en
 *      el cuerpo del archivo, la página revienta al abrirse. Las pruebas
 *      normales no lo ven: para cuando hacen clic, ya cargó todo.
 *   3. Crecimiento sin freno. Un archivo de 1,700 líneas no falla ninguna
 *      prueba y sin embargo es el que nadie quiere tocar.
 *
 * Los números de tope son trinquetes: están en el valor de hoy para que la
 * situación no empeore sin que alguien lo decida a propósito. Subir un tope es
 * legítimo — hacerlo sin darse cuenta, no.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { contrato, dependencias, huerfanos, sinUso, ordenDeCarga, ROOT } = require('../tools/contrato-globales');

const resultados = [];
const check = (nombre, ok, extra = '') =>
  resultados.push(`${ok ? 'PASA ' : 'FALLA'}  ${nombre}${extra ? ' — ' + extra : ''}`);

/* ── TRINQUETES ──
   El valor de hoy. Si mejoras, bájalos; si necesitas subirlos, que sea una
   línea en un commit y no un descuido. */
const TOPES = {
  lineasPorArchivo: 900,   // ningún archivo del sitio debe pasar de aquí
  entreCapas: 14,          // dependencias contra el orden ENTRE subsistemas distintos
  /* El tamaño del contrato compartido. Subió de 270 a 280 al entrar la gestión
     de personal: un subsistema nuevo son sus funciones y su estado, y no hay
     forma de tenerlo sin nombres nuevos.

     Subirlo es legítimo; que suba sin que nadie lo note, no. Por eso está aquí
     y no en una constante escondida: quien lo cambie escribe una línea en un
     commit y alguien la lee. */
  globales: 280,
};

const { orden, colisiones, todos } = contrato();
const dep = dependencias();

/* ── 1. El contrato es coherente ── */
check('Ningún archivo pisa una global de otro', colisiones.length === 0,
  colisiones.length ? colisiones.map(c => `${c.nombre} en ${c.archivos.join(' y ')}`).join('; ')
                    : `${todos.length} globales, todas de un solo dueño`);

check('No hay archivos huérfanos en assets/js', huerfanos().length === 0,
  huerfanos().join(', ') || 'todos se cargan desde index.html');

/* ── 2. El orden de carga es correcto ──
   Ésta es la que de verdad importa. Una sola rota es un fallo en producción. */
check('Nadie usa durante la carga algo que aún no existe', dep.rotas.length === 0,
  dep.rotas.length ? dep.rotas.map(r => `${r.archivo} usa ${r.usa} de ${r.de}`).join('; ')
                   : `${dep.aristas.length} dependencias comprobadas`);

/* Se cuentan sólo las que cruzan de un subsistema a otro. Las cuatro piezas
   del panel se llaman entre sí porque hasta hace poco eran un único archivo:
   contarlas sería castigar el haberlo partido, que es justo lo contrario de lo
   que esta prueba quiere premiar. */
check('Ninguna capa depende de otra que carga después', dep.entreCapas.length <= TOPES.entreCapas,
  `${dep.entreCapas.length} de ${TOPES.entreCapas} permitidas · ` +
  `${dep.haciaAtras.length} contando las de dentro del propio panel`);

/* ── 3. El tamaño no se descontrola ── */
const gordos = orden
  .map(rel => ({ rel, n: fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').length }))
  .filter(x => x.n > TOPES.lineasPorArchivo)
  .sort((a, b) => b.n - a.n);

check(`Ningún archivo pasa de ${TOPES.lineasPorArchivo} líneas`, gordos.length === 0,
  gordos.length ? gordos.map(g => `${g.rel} tiene ${g.n}`).join('; ') : 'el mayor cabe de sobra');

check('El contrato compartido no engorda', todos.length <= TOPES.globales,
  `${todos.length} globales de ${TOPES.globales} permitidas`);

/* ── 4. Lo que se publica es lo que se carga ──
   El empaquetado lee el orden del propio index.html. Si algún día se genera
   de otra forma, esto lo detecta antes de que se publique un sitio con los
   scripts en otro orden — que es un fallo de los que no dan síntoma claro. */
const { scriptsDelHtml } = require('../tools/empacar-js');
const bundlePath = path.join(ROOT, 'assets', 'js', 'sitio.js');
if (fs.existsSync(bundlePath)) {
  const bundle = fs.readFileSync(bundlePath, 'utf8');
  const enBundle = (bundle.match(/══════════ (assets\/js\/[^\s]+) ══════════/g) || [])
    .map(m => m.replace(/══════════ | ══════════/g, ''));
  const esperado = scriptsDelHtml(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  check('El empaquetado conserva el orden exacto del HTML',
    JSON.stringify(enBundle) === JSON.stringify(esperado),
    `${enBundle.length} bloques`);
} else {
  check('El empaquetado conserva el orden exacto del HTML', true, 'sin compilar: se salta');
}

/* ── 5. Informativo: cuánto de lo global necesita serlo ──
   No falla nunca. Es la medida de cuánto margen hay para encerrar cosas si
   algún día se pasa a módulos: una global que sólo usa su propio archivo no
   tiene por qué estar en el contrato de todos. */
const privadas = sinUso().length;
check('Informe del contrato', true,
  `${todos.length} globales, ${todos.length - privadas} usadas entre archivos, ` +
  `${privadas} sólo dentro del suyo`);

/* ── Reporte ── */
console.log('\n' + resultados.join('\n'));
const fallidas = resultados.filter(r => r.startsWith('FALLA')).length;
console.log(`\n${resultados.length - fallidas}/${resultados.length} pruebas de arquitectura pasaron`);
console.log(`${ordenDeCarga().length} scripts · ${dep.aristas.length} dependencias entre archivos`);
process.exit(fallidas ? 1 : 0);
