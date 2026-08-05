/**
 * unit.test.js — Pruebas de la lógica de negocio, aisladas del navegador.
 *
 * A diferencia de smoke.test.js (que levanta la página entera), aquí cargamos
 * sólo los módulos que interesan y probamos casos borde: los precios, los
 * descuentos y el filtrado son donde un error cuesta dinero de verdad.
 *
 * Se corre con:  npm test
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const load = f => fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8');

/* Ejecutamos los módulos en un contexto limpio, con lo mínimo que esperan
   del navegador. Así probamos el código real, no una copia. */
const ctx = vm.createContext({
  document: { querySelector: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  Intl, Math, Date, JSON, Set, Number, String, Array, Object, RegExp,
  console, TextEncoder,
});
// El orden importa: catalogo-datos.js define CATALOGO, del que depende config.js.
['icons.js', 'catalogo-datos.js', 'config.js', 'utils.js', 'security.js', 'storage.js', 'state.js']
  .forEach(f => vm.runInContext(load(f), ctx, { filename: f }));

const run = expr => vm.runInContext(expr, ctx);

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`PASA  ${name}`); pass++ }
  catch (e) { console.log(`FALLA ${name}\n      ${e.message}`); fail++ }
}

/* ── Formato de precios ── */
test('Precios de millones se abrevian', () => {
  assert.strictEqual(run('fmtCompact(2850000)'), '$2.85 M');
  assert.strictEqual(run('fmtCompact(4000000)'), '$4 M', 'un millón exacto no lleva decimales');
});

test('Precios menores a un millón se escriben completos', () => {
  assert.strictEqual(run('fmtCompact(42000)'), '$42,000');
  assert.strictEqual(run('fmtCompact(999999)'), '$999,999');
});

test('El límite del millón se cruza correctamente', () => {
  assert.strictEqual(run('fmtCompact(999999)'), '$999,999');
  assert.strictEqual(run('fmtCompact(1000000)'), '$1 M');
});

/* ── Descuentos ── */
test('El descuento se calcula sobre el precio anterior', () => {
  assert.strictEqual(run('discPct({price:900, original:1000})'), 10);
});

test('Sin precio anterior no hay descuento', () => {
  assert.strictEqual(run('discPct({price:900, original:null})'), 0);
});

test('Un precio anterior menor NO inventa un descuento negativo', () => {
  // Si alguien teclea mal el precio anterior, la tarjeta no debe mostrar "-20%".
  assert.strictEqual(run('discPct({price:1000, original:800})'), 0);
  assert.strictEqual(run('discPct({price:1000, original:1000})'), 0);
});

/* ── Escapado de salida (la defensa contra HTML inyectado) ── */
test('Escapa los caracteres peligrosos', () => {
  assert.strictEqual(run(`esc('<img src=x onerror=alert(1)>')`),
    '&lt;img src=x onerror=alert(1)&gt;');
  assert.strictEqual(run(`esc('Comillas " y \\'')`), 'Comillas &quot; y &#39;');
});

test('Escapa el ampersand primero, sin doble escapado', () => {
  assert.strictEqual(run(`esc('Tornillos & Tuercas')`), 'Tornillos &amp; Tuercas');
});

test('Un valor nulo no revienta ni escribe "null"', () => {
  assert.strictEqual(run('esc(null)'), '');
  assert.strictEqual(run('esc(undefined)'), '');
});

/* ── Validación de contacto ── */
test('Acepta teléfonos mexicanos de 10 dígitos', () => {
  assert.ok(run(`PHONE_RE.test('9611234567')`));
});

test('Rechaza teléfonos incompletos o de más', () => {
  assert.ok(!run(`PHONE_RE.test('961123456')`), '9 dígitos');
  assert.ok(!run(`PHONE_RE.test('96112345678')`), '11 dígitos');
});

test('Valida correos con criterio razonable', () => {
  assert.ok(run(`EMAIL_RE.test('ventas@mdc.mx')`));
  assert.ok(!run(`EMAIL_RE.test('ventas@mdc')`), 'sin dominio de primer nivel');
  assert.ok(!run(`EMAIL_RE.test('sin arroba.com')`));
});

/* ── Normalización de datos que entran ── */
test('Un respaldo con basura no tumba el catálogo', () => {
  const out = run(`normalizeProducts([
    null, 'texto suelto', {sinNombre:true},
    {name:'Equipo válido', price:'1500', cond:'Inventada', specs:'no es arreglo'}
  ]).length`);
  assert.strictEqual(out, 1, 'sólo debe sobrevivir el registro con nombre');
});

test('Los campos inválidos se corrigen a valores seguros', () => {
  const p = run(`JSON.stringify(normalizeProducts([
    {name:'X', price:'1500', cond:'Inventada', specs:'no es arreglo', svgKey:'inexistente', img:'javascript:alert(1)'}
  ])[0])`);
  const o = JSON.parse(p);
  assert.strictEqual(o.price, 1500, 'el precio se convierte a número');
  assert.strictEqual(o.cond, 'Nuevo', 'una condición inventada cae al valor por defecto');
  assert.deepStrictEqual(o.specs, [], 'las specs que no son arreglo se descartan');
  assert.strictEqual(o.svgKey, 'excavadora', 'un ícono inexistente cae al de respaldo');
  assert.strictEqual(o.img, null, 'una imagen que no sea data:image se rechaza');
});

test('El catálogo por defecto pasa su propia normalización', () => {
  assert.strictEqual(run('normalizeProducts(DEFAULT_PRODUCTS).length'), 18);
});

/* ── Galería de fotos ── */
test('Un equipo con varias fotos las conserva todas', () => {
  const p = JSON.parse(run(`JSON.stringify(normalizeProducts([
    {name:'X', imgs:['data:image/webp;base64,AA','data:image/jpeg;base64,BB','data:image/png;base64,CC']}
  ])[0])`));
  assert.strictEqual(p.imgs.length, 3);
  assert.strictEqual(p.img, 'data:image/webp;base64,AA', 'la portada es la primera foto');
});

test('Un respaldo viejo de una sola foto se convierte en galería', () => {
  // Los respaldos hechos antes de la galería traen "img", no "imgs".
  const p = JSON.parse(run(`JSON.stringify(normalizeProducts([
    {name:'X', img:'data:image/webp;base64,AA'}
  ])[0])`));
  assert.deepStrictEqual(p.imgs, ['data:image/webp;base64,AA']);
  assert.strictEqual(p.img, 'data:image/webp;base64,AA');
});

test('Una foto maliciosa no entra a la galería', () => {
  const p = JSON.parse(run(`JSON.stringify(normalizeProducts([
    {name:'X', imgs:['javascript:alert(1)','//otrodominio.com/rastreo.gif','data:text/html,<script>',
                     'https://otrodominio.com/foto.jpg','data:image/webp;base64,AA','/assets/img/real.jpg']}
  ])[0])`));
  assert.deepStrictEqual(p.imgs, ['data:image/webp;base64,AA','/assets/img/real.jpg'],
    'sólo sobreviven fotos incrustadas y archivos del propio sitio');
});

test('La galería se corta en el tope de fotos', () => {
  const n = run(`normalizeProducts([{name:'X',
    imgs: Array.from({length: MAX_FOTOS + 5}, () => 'data:image/webp;base64,AA')}])[0].imgs.length`);
  assert.strictEqual(n, run('MAX_FOTOS'));
});

test('Sin fotos, la galería es un arreglo vacío y no null', () => {
  // El resto del código hace p.imgs.length sin preguntar: un null reventaría.
  const p = JSON.parse(run(`JSON.stringify(normalizeProducts([{name:'X'}])[0])`));
  assert.deepStrictEqual(p.imgs, []);
  assert.strictEqual(p.img, null);
});

/* ── Utilidades de marca ── */
test('Oscurecer un color devuelve hexadecimal válido', () => {
  assert.match(run(`darken('#F5C400')`), /^#[0-9a-f]{6}$/);
});

test('Un color inválido no rompe el sitio', () => {
  assert.strictEqual(run(`darken('no es un color')`), '#D4A900');
});

console.log(`\n${pass}/${pass + fail} pruebas unitarias pasaron`);
process.exit(fail ? 1 : 0);
