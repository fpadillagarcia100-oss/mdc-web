/**
 * smoke.test.js — Levanta el sitio completo en un navegador simulado (jsdom) y
 * recorre los flujos que un cliente usaría de verdad.
 *
 * A diferencia de unit.test.js, aquí sí se cargan los 13 módulos y el HTML real:
 * si un archivo se rompe, se renombra o se sale del orden de carga, esta prueba
 * lo detecta.
 *
 * Nunca esperes un tiempo fijo: espera a que la condición ocurra (waitFor). Un
 * `setTimeout` de N milisegundos pasa en una máquina rápida y falla en el
 * servidor de integración, que es justo donde no quieres sorpresas.
 *
 * Se corre con:  npm run test:smoke
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, requestInterceptor } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const errors = [];

/* Sirve los archivos del proyecto como si vinieran de un servidor real. Usamos
   un origen https:// en vez de file:// para que localStorage funcione. */
const serveLocal = requestInterceptor(request => {
  const { url } = request;
  const type = url.endsWith('.css') ? 'text/css' : 'text/javascript';
  if (url.startsWith('https://mdc.test/')) {
    const file = path.join(ROOT, url.replace('https://mdc.test/', ''));
    try {
      return new Response(fs.readFileSync(file), { headers: { 'Content-Type': type } });
    } catch {
      errors.push('ARCHIVO NO ENCONTRADO: ' + url);
      return new Response('', { status: 404 });
    }
  }
  return new Response('', { headers: { 'Content-Type': type } });   // tipografías externas
});

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  resources: { interceptors: [serveLocal] },
  url: 'https://mdc.test/',
  beforeParse(w) {
    w.addEventListener('error', e => errors.push('ERROR EN CONSOLA: ' + (e.error?.stack || e.message)));
    // jsdom no implementa estas APIs de imagen; las simulamos.
    w.createImageBitmap = async () => ({ width: 100, height: 100, close() {} });
    w.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() {}, set fillStyle(v) {} });
    w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/webp;base64,AAAA';
  },
});

const { window } = dom;
const doc = window.document;
const $ = s => doc.querySelector(s);
const $$ = s => doc.querySelectorAll(s);

const results = [];
const check = (name, cond, extra = '') =>
  results.push(`${cond ? 'PASA ' : 'FALLA'}  ${name}${extra ? ' — ' + extra : ''}`);

/** Espera a que algo sea cierto, sondeando. Nunca a que pasen N milisegundos. */
async function waitFor(condition, label, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if (condition()) return } catch { /* aún no existe: seguimos */ }
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error(`Se agotó el tiempo esperando ${label} (${timeout} ms)`);
}

const submit = form =>
  $(form).dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

(async () => {
  /* ── Arranque ── */
  await waitFor(() => $$('.pcard').length > 0, 'que el catálogo se renderice');

  check('Catálogo renderiza 9 tarjetas', $$('.pcard').length === 9, `hay ${$$('.pcard').length}`);
  check('Nav de categorías se construye', $$('.nav-cat').length === 7);
  check('Logo muestra la marca', $('#logoSlot').textContent.includes('Maquinaria de Chiapas'));
  check('Título de pestaña actualizado', doc.title.startsWith('MDC'));
  check('Botón "Ingresar" existe', $('[data-goto="cuenta"]') !== null);

  /* ── Páginas de contenido ── */
  for (const p of ['ayuda', 'sucursales', 'vender', 'cuenta', 'privacidad']) {
    $(`[data-goto="${p}"]`).click();
    const abierta = $('#pageOverlay').classList.contains('open');
    const largo = $('#pageBody').innerHTML.length;
    check(`Página "${p}" abre con contenido`, abierta && largo > 200, `${largo} caracteres`);
    $('#pageClose').click();
  }

  $('[data-goto="ayuda"]').click();
  check('Ayuda tiene 8 preguntas', $('#pageBody').querySelectorAll('details').length === 8);
  $('#pageClose').click();

  $('[data-goto="sucursales"]').click();
  check('Sucursales lista 3 ubicaciones', $('#pageBody').querySelectorAll('.branch').length === 3);
  check('Sucursales enlaza a Google Maps', $('#pageBody').innerHTML.includes('google.com/maps'));
  $('#pageClose').click();

  /* ── Publicar equipo: validación y envío ── */
  $('[data-goto="vender"]').click();
  check('Trampa anti-bot presente', $('#hp_empresa') !== null);

  $('#v-name').value = '';
  $('#v-phone').value = '123';          // teléfono inválido
  submit('#sellForm');
  const marcados = $$('#sellForm .field.err').length;
  check('Rechaza datos inválidos', marcados >= 2, `${marcados} campos marcados`);

  $('#v-name').value = 'Juan Pérez';
  $('#v-phone').value = '9611234567';
  $('#v-brand').value = 'CAT 320';
  let abierto = null;
  window.open = url => { abierto = url; return null };

  submit('#sellForm');
  check('Bloquea el envío inmediato (anti-bot)', abierto === null);
  submit('#sellForm');
  check('Envía por WhatsApp al reintentar', abierto !== null && abierto.includes('wa.me'));
  check('El mensaje incluye el equipo',
    abierto !== null && decodeURIComponent(abierto).includes('CAT 320'));

  /* ── Carrito y cotización ── */
  $('.btn-add').click();
  check('Agregar al carrito actualiza el contador', $('#cartBadge').textContent === '1');

  $('#checkoutBtn').click();
  check('Checkout abre el formulario de cotización', $('#quoteForm') !== null);
  $('#c-name').value = 'Ana López';
  $('#c-phone').value = '9619876543';
  $('#c-save').checked = true;
  abierto = null;
  submit('#quoteForm');   // consumido por el filtro anti-bot
  submit('#quoteForm');
  check('La cotización se envía por WhatsApp', abierto !== null && abierto.includes('wa.me'));
  check('Guarda los datos del cliente',
    (window.localStorage.getItem('mdc_v1_account') || '').includes('Ana López'));
  check('El encabezado muestra el nombre', $('#acctLabel').textContent === 'Ana');

  /* ── Seguridad del PIN ── */
  const ajustes = JSON.parse(window.localStorage.getItem('mdc_v1_settings') || '{}');
  check('El PIN NO se guarda en claro',
    !('pin' in ajustes) && !JSON.stringify(ajustes).includes('2580'));
  check('El PIN se guarda hasheado',
    typeof ajustes.pinHash === 'string' && /^(sha256|fnv):/.test(ajustes.pinHash),
    ajustes.pinHash ? ajustes.pinHash.slice(0, 18) + '…' : 'sin hash');

  $('#adminEntry').click();
  check('El panel pide PIN', $('#pinInput') !== null);
  for (let i = 0; i < 5; i++) { $('#pinInput').value = '0000'; $('#pinBtn').click() }

  await waitFor(() => $('#pinInput').disabled === true, 'el bloqueo por intentos fallidos');
  check('Bloquea tras 5 intentos fallidos', true, $('#pinErr').textContent);

  /* ── Reporte ── */
  console.log('\n' + results.join('\n'));
  const fallidas = results.filter(r => r.startsWith('FALLA')).length;
  console.log(`\n${results.length - fallidas}/${results.length} pruebas de integración pasaron`);
  if (errors.length) console.log('\n' + errors.join('\n'));

  process.exit(fallidas || errors.length ? 1 : 0);
})().catch(err => {
  console.error('\nLa prueba no pudo completarse:\n  ' + err.message);
  if (errors.length) console.error('\n' + errors.join('\n'));
  process.exit(1);
});
