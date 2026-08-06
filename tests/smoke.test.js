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

  /* ── Galería de fotos ──
     El catálogo semilla no trae fotos, así que le inyectamos tres al primer
     equipo y recorremos la galería como lo haría un cliente. */
  // products se declara con "let", así que no cuelga de window: hay que entrar
  // al ámbito global de la página para tocarlo.
  const ev = code => window.eval(code);
  const fotos = ['data:image/webp;base64,AAA', 'data:image/webp;base64,BBB', 'data:image/webp;base64,CCC'];
  ev(`products[0].imgs = ${JSON.stringify(fotos)}; products[0].img = products[0].imgs[0]; render()`);
  const equipo = { id: ev('products[0].id'), imgs: fotos };

  check('La tarjeta anuncia cuántas fotos hay',
    ($('.pcard-fotos') || {}).textContent === '📷 3');

  ev(`openModal(${equipo.id})`);
  check('La ficha abre con la portada', $('.gal-main').getAttribute('src') === equipo.imgs[0]);
  check('Hay una miniatura por foto', $$('.gal-thumb').length === 3);
  check('El contador arranca en 1', $('.gal-count').textContent === '1 / 3');

  $('[data-gal="1"]').click();
  check('La flecha avanza a la segunda foto', $('.gal-main').getAttribute('src') === equipo.imgs[1]);
  check('La miniatura activa acompaña a la foto',
    $$('.gal-thumb')[1].getAttribute('aria-selected') === 'true');

  $('[data-gal-go="2"]').click();
  check('La miniatura salta directo a esa foto', $('.gal-main').getAttribute('src') === equipo.imgs[2]);

  // El caso que rompe una galería mal hecha: pasar de la última a la primera.
  $('[data-gal="1"]').click();
  check('Después de la última vuelve a la primera',
    $('.gal-main').getAttribute('src') === equipo.imgs[0] && $('.gal-count').textContent === '1 / 3');
  $('[data-gal="-1"]').click();
  check('Antes de la primera va a la última',
    $('.gal-main').getAttribute('src') === equipo.imgs[2] && $('.gal-count').textContent === '3 / 3');

  $('#modalClose').click();
  ev('products[1].imgs = []; products[1].img = null; openModal(products[1].id)');
  check('Un equipo sin fotos muestra el ícono, no una galería rota',
    $('#modalImg').querySelector('svg') !== null && $('#modalImg').querySelector('.gal') === null);
  $('#modalClose').click();

  /* ── Simulador de financiamiento ── */
  ev('openModal(products.find(p => p.cond !== "Renta").id)');
  const calc = $('#modalInfo [data-calc]');
  check('La ficha trae el simulador', calc !== null);
  check('El simulador ya muestra una mensualidad al abrir',
    /\$[\d,]+/.test($('[data-calc-out="mensual"]').textContent),
    $('[data-calc-out="mensual"]').textContent);

  const mensualInicial = $('[data-calc-out="mensual"]').textContent;
  const engancheInput = $('[data-calc-in="enganche"]');
  engancheInput.value = '50';
  engancheInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  check('Subir el enganche baja la mensualidad',
    $('[data-calc-out="mensual"]').textContent !== mensualInicial,
    `${mensualInicial} → ${$('[data-calc-out="mensual"]').textContent}`);
  check('El enganche elegido se ve en pantalla',
    $('[data-calc-out="enganche"]').textContent === '50%');

  // Una tasa negativa haría que el simulador prometiera pagar menos que el precio.
  const tasaInput = $('[data-calc-in="tasa"]');
  tasaInput.value = '-20';
  tasaInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  const totalTexto = $('[data-calc-out="total"]').textContent;
  const total = Number(totalTexto.replace(/[^\d]/g, ''));
  const precioEq = Number(calc.dataset.precio);
  check('Una tasa negativa no regala dinero', total >= precioEq,
    `total ${totalTexto} contra precio ${precioEq}`);

  check('La ficha se puede imprimir', $('#modalInfo [data-imprimir]') !== null);
  check('La hoja impresa lleva la marca arriba',
    $('#printMarca').textContent.includes('MDC'), $('#printMarca').textContent);
  check('La hoja impresa lleva los datos de contacto',
    $('#modalInfo .solo-impresion').textContent.includes(ev('settings.phone')));

  // En papel no se ven los controles: la cifra tiene que decir de dónde salió.
  check('El simulador declara sus supuestos',
    /enganche/.test($('[data-calc-out="supuestos"]').textContent),
    $('[data-calc-out="supuestos"]').textContent);

  /* Lo que sigue se verifica sobre la hoja de estilos porque jsdom no calcula
     diseño: no puede decirnos cómo QUEDA la página, sólo qué reglas existen. */
  const impresion = fs.readFileSync(path.join(ROOT, 'assets/css/styles.css'), 'utf8')
    .split('@media print')[1] || '';

  /* Imprimir una mensualidad sin el aviso de que es un estimado sería
     presentarla como una oferta en firme. */
  check('El aviso legal no desaparece al imprimir',
    !/\.calc-nota\s*{[^}]*display\s*:\s*none/.test(impresion)
    && /\.calc-nota\s*{\s*display\s*:\s*block/.test(impresion));

  /* Antes se enumeraba qué ocultar y se colaban la barra superior, el menú y
     el banner. La regla que lo resuelve no puede desaparecer. */
  check('Al imprimir se esconde todo lo que no sea la ficha',
    /body:has\(\.modal-overlay\.open\)\s*>\s*\*:not\(\.modal-overlay\)\s*\{\s*display:none/.test(impresion));

  /* El modal tiene scroll propio: sin esto el papel sale cortado a la altura de
     la pantalla, que fue exactamente lo que pasó. */
  check('El modal recupera su alto natural en papel',
    /\.modal-overlay\.open \.modal\{[^}]*max-height:none/.test(impresion)
    && /\.modal-overlay\.open \.modal\{[^}]*overflow:visible/.test(impresion));
  $('#modalClose').click();

  /* ── Página de financiamiento ── */
  $('[data-goto="financiamiento"]').click();
  check('Financiamiento tiene su propia entrada en el menú',
    $('#pageOverlay').classList.contains('open') && $('#finEquipo') !== null);

  const finCalc = $('#pageBody [data-calc]');
  check('El simulador arranca con el primer equipo de venta',
    Number(finCalc.dataset.precio) === ev('products.find(p => p.cond !== "Renta").price'));
  check('Muestra una mensualidad de entrada',
    /\$[\d,]+/.test($('#pageBody [data-calc-out="mensual"]').textContent));

  // Sólo se financian equipos de venta: una renta no se financia.
  const rentas = ev('products.filter(p => p.cond === "Renta").length');
  const opciones = $$('#finEquipo option').length;
  check('Los equipos en renta no aparecen para financiar',
    opciones === ev('products.length') - rentas + 1, `${opciones} opciones, ${rentas} rentas fuera`);

  // Cambiar de equipo debe mover el monto Y los meses sin intereses.
  const conMsi = ev('JSON.stringify((products.find(p => p.cond !== "Renta" && p.finance) || {}))');
  const eqMsi = JSON.parse(conMsi);
  if(eqMsi.id){
    $('#finEquipo').value = String(eqMsi.id);
    $('#finEquipo').dispatchEvent(new window.Event('change', { bubbles: true }));
    check('Cambiar de equipo actualiza el monto',
      Number(finCalc.dataset.precio) === eqMsi.price);
    check('Los meses sin intereses corresponden al equipo elegido',
      $('#pageBody [data-calc-msi]').hidden === false
      && $('#pageBody [data-calc-msi]').textContent.includes(String(parseInt(eqMsi.finance, 10))),
      $('#pageBody [data-calc-msi]').textContent.slice(0, 60));
  }

  $('#finEquipo').value = 'otro';
  $('#finEquipo').dispatchEvent(new window.Event('change', { bubbles: true }));
  check('"Otro monto" descubre el campo libre', $('#finMontoCampo').hidden === false);
  $('#finMonto').value = '500000';
  $('#finMonto').dispatchEvent(new window.Event('input', { bubbles: true }));
  check('Un monto libre recalcula el simulador',
    Number(finCalc.dataset.precio) === 500000);

  abierto = null;
  $('[data-action="fin-wa"]').click();
  const msg = abierto ? decodeURIComponent(abierto) : '';
  check('La simulación se manda por WhatsApp con las cifras',
    msg.includes('wa.me') && /Mensualidad estimada: \$[\d,]+/.test(msg));
  check('El mensaje se presenta como simulación, no como solicitud de crédito',
    /Simulaci[oó]n/i.test(msg));
  $('#pageClose').click();

  /* ── Comparador ── */
  const ids = ev('JSON.stringify(products.slice(0,4).map(p => p.id))');
  const [a1, a2, a3, a4] = JSON.parse(ids);

  check('La barra de comparación empieza escondida', $('#cmpBar').hidden === true);

  ev(`toggleCompare(${a1})`);
  check('Al elegir un equipo aparece la barra', $('#cmpBar').hidden === false);
  check('Con uno solo no se puede comparar', $('#cmpOpen').disabled === true);

  ev(`toggleCompare(${a2})`);
  check('Con dos ya se puede comparar', $('#cmpOpen').disabled === false);
  check('El botón dice cuántos van', $('#cmpOpen').textContent === 'Comparar (2)');

  ev(`toggleCompare(${a3})`);
  ev(`toggleCompare(${a4})`);
  check(`No deja pasar del tope de ${ev('MAX_COMPARA')}`, ev('state.compare.length') === ev('MAX_COMPARA'),
    `quedaron ${ev('state.compare.length')}`);

  $('#cmpOpen').click();
  const filas = $$('#pageBody .cmp-tabla tbody tr').length;
  check('La comparación abre con una columna por equipo',
    $$('#pageBody .cmp-tabla thead th').length === 4, 'incluye la columna de criterios');
  check('Compara varios criterios', filas >= 10, `${filas} renglones`);
  check('Marca lo más conveniente de cada renglón',
    $$('#pageBody .cmp-gana').length > 0);

  // Quitar un equipo desde la propia comparación debe redibujarla, no dejarla vieja.
  $('#pageBody .cmp-th-quita').click();
  check('Quitar un equipo actualiza la comparación al momento',
    $$('#pageBody .cmp-tabla thead th').length === 3);

  ev('clearCompare()');
  check('Limpiar cierra la comparación y esconde la barra',
    ev('state.compare.length') === 0 && $('#cmpBar').hidden === true);

  /* ── Acceso al panel ──
     Ya no hay PIN: el acceso es con cuenta de Supabase y lo comprueba el
     servidor. Aquí sólo se verifica que la puerta esté cerrada y que no quede
     ningún rastro del PIN viejo, que se comparaba en el navegador. */
  $('#adminEntry').click();

  check('El panel pide correo y contraseña',
    $('#mailInput') !== null && $('#passInput') !== null);

  check('Ya no hay campo de PIN', $('#pinInput') === null);

  const ajustes = JSON.parse(window.localStorage.getItem('mdc_v1_settings') || '{}');
  check('No queda ningún PIN guardado en el navegador',
    !('pin' in ajustes) && !JSON.stringify(ajustes).includes('2580'));

  /* Entrar con credenciales falsas debe fallar CONTRA EL SERVIDOR, no aquí.
     En las pruebas no hay red, así que lo comprobable es que no se conceda
     acceso por el simple hecho de escribir algo. */
  $('#mailInput').value = 'intruso@ejemplo.com';
  $('#passInput').value = 'loquesea';
  $('#pinBtn').click();
  await waitFor(() => ev('isAdmin') === false, 'que el acceso siga cerrado');
  check('Escribir cualquier cosa no abre el panel', ev('isAdmin') === false);

  /* ── El panel no se abre con marcas del propio navegador ──
     Esto existe por un fallo real: `isAdmin` se leía de sessionStorage, resto
     del PIN viejo. Cualquiera podía ponerla desde las herramientas de
     desarrollador y el panel se abría sin contraseña.

     Que el servidor rechazara igual las escrituras no lo salvaba: un panel
     que se abre, deja tocarlo todo y falla al guardar es una trampa. */
  ev("window.sessionStorage.setItem('mdc_admin','1')");
  ev("window.localStorage.setItem('mdc_sesion', JSON.stringify(" +
     "{access_token:'inventado', refresh_token:'x', expira: Date.now()+9e9, correo:'a@b.c'}))");
  ev('closeAll()');
  $('#adminEntry').click();

  check('Una marca en sessionStorage NO abre el panel',
    ev('isAdmin') === false && $('#mailInput') !== null);

  check('Un token inventado en localStorage tampoco',
    ev('isAdmin') === false);

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
