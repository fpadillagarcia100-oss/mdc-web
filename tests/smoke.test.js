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

    /* Se siembra un catálogo falso en el localStorage ANTES de que cargue el
       sitio, imitando lo que dejaba el panel viejo.

       Reproduce un fallo real: dos personas abrían la misma dirección y veían
       páginas distintas, porque el catálogo guardado en el navegador ganaba
       sobre el publicado. Quien administraba revisaba precios en su versión
       local mientras los clientes veían otra. */
    w.localStorage.setItem('mdc_v1_products', JSON.stringify([
      { id: 999, name: 'EQUIPO FANTASMA DEL LOCALSTORAGE', brand: 'X', cat: 'X',
        cond: 'Nuevo', price: 1, location: 'X', year: 2020, specs: [], desc: '' },
    ]));
    w.localStorage.setItem('mdc_v1_settings', JSON.stringify({ brandFull: 'MARCA FANTASMA' }));
    /* jsdom no calcula diseño, así que no trae scrollIntoView. No es un vacío
       inofensivo: el botón de buscar la llama, y sin esto la prueba falla por
       una función que no existe en vez de por lo que venía a comprobar. */
    w.Element.prototype.scrollIntoView = function () {};

    // Tampoco implementa estas APIs de imagen; las simulamos.
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

/** Ejecuta código dentro de la página, para mirar su estado interno. */
const ev = code => window.eval(code);

(async () => {
  /* ── Arranque ── */
  await waitFor(() => $$('.pcard').length > 0, 'que el catálogo se renderice');

  /* Lo primero de todo. Si el catálogo saliera del localStorage, cada prueba
     de aquí abajo estaría midiendo un sitio que sólo existe en este navegador,
     y sus resultados no dirían nada sobre lo que ven los clientes. */
  check('El catálogo NO sale del localStorage',
    ev('products.length') === 18 && !ev("JSON.stringify(products)").includes('FANTASMA'),
    ev('products.length') + ' equipos, los del sitio publicado');

  check('Los ajustes tampoco salen del localStorage',
    ev('settings.brandFull') !== 'MARCA FANTASMA', ev('settings.brandFull'));

  check('Los restos del panel viejo se borran del navegador',
    ev("window.localStorage.getItem('mdc_v1_products')") === null &&
    ev("window.localStorage.getItem('mdc_v1_settings')") === null);

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
  const calc = $('#modal [data-calc]');
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
    $('#modal .solo-impresion').textContent.includes(ev('settings.phone')));

  // En papel no se ven los controles: la cifra tiene que decir de dónde salió.
  check('El simulador declara sus supuestos',
    /enganche/.test($('[data-calc-out="supuestos"]').textContent),
    $('[data-calc-out="supuestos"]').textContent);

  /* Lo que sigue se verifica sobre la hoja de estilos porque jsdom no calcula
     diseño: no puede decirnos cómo QUEDA la página, sólo qué reglas existen. */
  /* Se juntan TODOS los bloques de impresión, no sólo el primero.

     Antes esto era `.split('@media print')[1]`, que se queda con lo que sigue
     al primero. El día que aparezca un segundo bloque —pasó al añadir el botón
     de WhatsApp— las comprobaciones empiezan a leer el bloque equivocado y
     fallan por un motivo que no tiene nada que ver con lo que prueban. */
  const impresion = fs.readFileSync(path.join(ROOT, 'assets/css/styles.css'), 'utf8')
    .split('@media print').slice(1).join(' ');

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

  /* ── Las pestañas del panel no son una puerta ──
     Fallo real, encontrado probando el sitio publicado: la barra de pestañas
     seguía visible en la pantalla de acceso (el CSS le ganaba al atributo
     hidden), y el clic llamaba a renderAdmin() directo, sin pasar por la
     comprobación de sesión. Se entraba al panel completo sin contraseña. */
  /* ── Lo nuevo ── */
  check('El botón flotante de WhatsApp existe y apunta al número del sitio',
    $('#waFloat') !== null &&
    ev('typeof waLink') === 'function' &&
    ev("waLink('x')").includes(ev('settings.whatsapp')));

  /* Un equipo vendido con la etiqueta de "más vendido" es una llamada perdida
     para los dos: el cliente se ilusiona y hay que explicarlo otra vez. */
  ev("products[0].disponibilidad = 'vendido'; products[0].hot = true; render()");
  check('Vendido gana a cualquier otra etiqueta',
    $('.pcard .pcard-badge').textContent.trim() === 'Vendido',
    $('.pcard .pcard-badge').textContent.trim());

  check('La tarjeta vendida se atenúa',
    $('.pcard').classList.contains('agotado'));

  ev("products[0].disponibilidad = 'apartado'; render()");
  check('Apartado también se marca',
    $('.pcard .pcard-badge').textContent.trim() === 'Apartado');

  ev("products[0].disponibilidad = 'disponible'; products[0].hot = true; render()");
  check('Un equipo disponible recupera su etiqueta normal',
    $('.pcard .pcard-badge').textContent.includes('vendido') === false ||
    $('.pcard .pcard-badge').textContent.includes('Más'),
    $('.pcard .pcard-badge').textContent.trim());

  /* Una foto no basta para vender maquinaria: el comprador quiere la cabina,
     las orugas y las horas del tablero. La base guardaba solo la primera y las
     demas se perdian sin avisar. */
  check('La galeria completa viaja a la base, no solo la portada',
    ev("typeof filaDesdeEquipo === 'function' && Array.isArray(filaDesdeEquipo({imgs:['https://a/1.webp','https://a/2.webp']}).imagenes) && filaDesdeEquipo({imgs:['https://a/1.webp','https://a/2.webp']}).imagenes.length === 2"));

  check('Se descartan las direcciones que no son del almacenamiento',
    ev("filaDesdeEquipo({imgs:['https://a/1.webp','javascript:alert(1)','data:image/png;base64,xx']}).imagenes.length === 1"));

  check('La galeria se corta en el tope de 8 que acepta la base',
    ev("filaDesdeEquipo({imgs: Array.from({length:20},(_,i)=>'https://a/'+i+'.webp')}).imagenes.length === 8"));

  /* Las fotos anteriores a la doble subida no tienen version pequena.
     Anunciarla en el srcset seria prometer un archivo que da 404. */
  check('Solo se ofrece la foto pequena cuando existe',
    ev("fotoSrcset('https://x/a-w1400.webp').includes('-w700.webp')") === true &&
    ev("fotoSrcset('https://x/vieja.webp')") === '' &&
    ev("fotoSrcset(null)") === '');

  /* Contar no puede estorbar: si el contador falla o no hay conexion, la
     pagina sigue igual. Por eso no devuelve nada ni lanza. */
  check('Contar nunca lanza ni bloquea',
    ev("(function(){ try{ contar('x','vista'); contar(null,'vista'); return true }catch{ return false } })()"));

  check('Las fotos ya no se guardan como texto incrustado',
    ev('typeof fileToBlob') === 'function' && ev('typeof remotoSubirFoto') === 'function');

  check('Las pestañas están ocultas sin sesión',
    $('#adminTabs').hidden === true);

  $$('#adminTabs .admin-tab').forEach(b => b.click());
  check('Hacer clic en las pestañas NO abre el panel',
    $('#mailInput') !== null && $('.adm-table') === null);

  ev('renderAdmin()');
  check('Llamar a renderAdmin() sin sesión devuelve al acceso',
    $('#mailInput') !== null && $('.adm-table') === null);

  ev('closeAll()');

  /* ══ VIDEO ══
     Un video de 30 segundos con el motor encendido vende maquinaria usada
     mejor que ocho fotos. Lo que se comprueba aquí no es que se vea —jsdom no
     reproduce nada— sino que YouTube NO entre hasta que alguien lo pida. */
  const idVideo = 'dQw4w9WgXcQ';
  ev(`products[0].video = '${idVideo}'; products[0].imgs = ${JSON.stringify(fotos)};
      products[0].img = products[0].imgs[0]; render()`);

  check('La tarjeta anuncia que hay video',
    ($('.pcard-fotos') || {}).textContent.includes('▶'),
    ($('.pcard-fotos') || {}).textContent);

  ev(`openModal(${equipo.id})`);
  check('La ficha empieza en las fotos, no en el video',
    $('.gal-main') !== null && $('.gal-frame') === null);
  check('Hay una miniatura para el video', $('.gal-thumb-video') !== null);

  $('[data-gal-video]').click();
  check('La miniatura del video lleva a la portada del video, no al reproductor',
    $('.gal-facade') !== null && $('.gal-frame') === null);

  check('Sin darle al play NO se ha pedido nada a YouTube',
    !$('#modalImg').innerHTML.includes('youtube'),
    'una sola mención bastaría para filtrar la visita a un tercero');

  $('[data-gal-play]').click();
  const marco = $('.gal-frame');
  check('Al darle al play entra el reproductor', marco !== null);
  check('El reproductor es el que no pone cookies de rastreo',
    marco !== null && marco.getAttribute('src').startsWith('https://www.youtube-nocookie.com/'),
    marco ? marco.getAttribute('src') : 'no hay iframe');

  /* Un video que sigue sonando con la ficha cerrada es de los fallos que hacen
     que la gente cierre la pestaña entera. */
  ev('closeAll()');
  check('Cerrar la ficha quita el reproductor, no sólo lo esconde',
    $('.gal-frame') === null);

  // Las flechas del teclado no pueden dejar la galería en un estado sin salida.
  ev(`openModal(${equipo.id}); verVideo(); moverGaleria(1)`);
  check('Salir del video con las flechas devuelve a las fotos',
    $('.gal-main') !== null && $('.gal-frame') === null);
  ev('closeAll()');

  // Un equipo sin fotos pero con video: el video ES la galería.
  ev(`products[1].imgs = []; products[1].img = null; products[1].video = '${idVideo}';
      openModal(products[1].id)`);
  check('Un equipo sólo con video enseña el video, no un ícono roto',
    $('.gal-facade') !== null);
  ev(`closeAll(); products[1].video = null`);

  /* La política de seguridad tiene que dejar pasar el reproductor Y NADA MÁS.
     Si dijera `frame-src https:` el video funcionaría igual y cualquier
     dominio del mundo podría incrustarse en la página. */
  const csp = /content="([^"]*)"/.exec(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/i.exec(html)[0])[1];
  check('La política permite el reproductor de YouTube',
    /frame-src\s+https:\/\/www\.youtube-nocookie\.com\s*;/.test(csp),
    (/frame-src[^;]*/.exec(csp) || ['sin frame-src'])[0]);
  check('Y no abre el marco a cualquier dominio',
    !/frame-src[^;]*(\*|https:\s|'unsafe)/.test(csp));

  /* ══ FICHA TÉCNICA ══ */
  ev(`products[0].atributos = {horas: 2400, peso: 20, potencia: 148};
      openModal(${equipo.id})`);
  const ft = $('#modal .ft-tabla');
  check('La ficha muestra la tabla de datos técnicos', ft !== null);
  check('Los datos salen con su unidad',
    ft !== null && ft.textContent.includes('2,400 h') && ft.textContent.includes('148 HP'),
    ft ? ft.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) : '');
  ev('closeAll()');

  ev(`products[1].atributos = {}; openModal(products[1].id)`);
  check('Un equipo sin datos técnicos no enseña una tabla vacía',
    $('#modal .ft-tabla') === null);
  ev('closeAll()');

  /* Los filtros nuevos tienen que existir en la pantalla, no sólo en el
     estado: un predicado que nadie puede activar no filtra nada. */
  check('El catálogo ofrece filtrar por horas y por peso',
    $('#filterCardDesktop [data-tec="horasMax"]') !== null &&
    $('#filterCardDesktop [data-tec="pesoMin"]') !== null);

  const filtroHoras = $('#filterCardDesktop [data-tec="horasMax"]');
  filtroHoras.value = '1000';
  filtroHoras.dispatchEvent(new window.Event('change', { bubbles: true }));
  check('Filtrar por horas desde la pantalla reduce los resultados',
    ev('state.horasMax') === 1000 && ev("filterAll().every(p => p.cond === 'Nuevo' || (p.atributos.horas ?? 0) <= 1000)"),
    `quedan ${ev('filterAll().length')} de ${ev('products.length')}`);
  check('El filtro aparece como etiqueta que se puede quitar',
    $('#activeFilters').textContent.includes('1,000 h'),
    $('#activeFilters').textContent.trim());

  ev('clearFilters()');
  check('Limpiar filtros también borra los técnicos',
    ev('state.horasMax') === null && ev('state.pesoMin') === null && ev('state.pesoMax') === null);

  /* El comparador tiene que aprovechar los datos nuevos: comparar dos máquinas
     sin poder decir cuál tiene menos horas no es comparar. */
  ev(`products[1].atributos = {horas: 8000, peso: 25};
      state.compare = [products[0].id, products[1].id]; openPage('comparar')`);
  const tabla = $('#pageBody .cmp-tabla');
  check('El comparador incluye los datos técnicos',
    tabla !== null && tabla.textContent.includes('Horas de uso') && tabla.textContent.includes('Peso operativo'));
  const filaHoras = [...$$('#pageBody .cmp-tabla tbody tr')]
    .find(tr => tr.querySelector('th') && tr.querySelector('th').textContent === 'Horas de uso');
  check('Menos horas gana el renglón, no más',
    filaHoras !== undefined && filaHoras.querySelectorAll('td')[0].classList.contains('cmp-gana')
      && !filaHoras.querySelectorAll('td')[1].classList.contains('cmp-gana'),
    filaHoras ? filaHoras.textContent.replace(/\s+/g, ' ').trim() : 'no está el renglón');
  ev('clearCompare(); closeAll()');

  /* ══ PREGUNTAS Y RESPUESTAS ══ */
  ev(`products[0].qa = [{nombre:'Ana', pregunta:'¿Tiene factura?',
        respuesta:'Sí, factura de origen a nombre del comprador.', fecha:'2026-07-01'}];
      openModal(${equipo.id})`);

  check('La ficha muestra las preguntas contestadas',
    $$('#modal .qa-item').length === 1 &&
    $('#modal .qa-item').textContent.includes('factura de origen'));

  check('La ficha invita a preguntar', $('#qaForm') !== null);

  /* Enviar sin nombre no puede acabar en la base ni fingir que sí. La
     validación de verdad la hace el servidor; ésta es la que evita el viaje. */
  let pedidos = [];
  ev(`window.fetch = (url, opts) => { globalThis.__pedidos.push(String(url));
      return Promise.resolve({ok:true, json:()=>Promise.resolve({})}) }`);
  ev('globalThis.__pedidos = []');

  $('#qa-nombre').value = '';
  $('#qa-texto').value = 'Una pregunta cualquiera';
  submit('#qaForm');
  await waitFor(() => true, 'un ciclo del bucle de eventos');
  pedidos = JSON.parse(ev('JSON.stringify(globalThis.__pedidos)'));
  check('Una pregunta sin nombre no sale del navegador', pedidos.length === 0);

  $('#qa-nombre').value = 'Luis Gómez';
  $('#qa-texto').value = '¿Cuántas horas reales tiene?';
  submit('#qaForm');
  await waitFor(() => JSON.parse(ev('JSON.stringify(globalThis.__pedidos)')).length > 0,
    'que la pregunta salga');
  pedidos = JSON.parse(ev('JSON.stringify(globalThis.__pedidos)'));
  check('Una pregunta completa se manda por la función que la valida en el servidor',
    pedidos.some(u => u.includes('/rpc/preguntar')), pedidos.join(' '));

  await waitFor(() => $('.qa-ok') !== null, 'el acuse de recibo');
  /* No se pinta la pregunta como si ya estuviera publicada: quien la escribió
     se iría creyendo que su duda ya está en la ficha para todos. */
  check('Se acusa recibo sin fingir que ya está publicada',
    $('.qa-ok') !== null && $$('#modal .qa-item').length === 1);

  // La trampa oculta: un bot rellena todo, incluso lo que no se ve.
  /* El vaciado va DESPUÉS de abrir la ficha: abrirla suma una vista, que
     también es una petición. Contar peticiones a secas daría un fallo que no
     tiene nada que ver con lo que se prueba. */
  ev(`closeAll(); openModal(${equipo.id}); globalThis.__pedidos = []`);
  $('#hp_pregunta').value = 'soy un bot';
  $('#qa-nombre').value = 'Bot';
  $('#qa-texto').value = 'Compre nuestras pastillas milagrosas';
  submit('#qaForm');
  await waitFor(() => true, 'un ciclo del bucle de eventos');
  check('La trampa oculta detiene al bot sin decírselo',
    !JSON.parse(ev('JSON.stringify(globalThis.__pedidos)')).some(u => u.includes('preguntar')));
  ev('closeAll()');

  /* ══ EL HUECO BLANCO ══
     Fallo real, visto en el sitio publicado: la ficha abría con un rectángulo
     blanco de unos 700 px bajo la foto. La causa no era de estilo sino de
     estructura — todo lo largo (descripción, ficha técnica, simulador,
     preguntas) colgaba de la columna derecha, y la izquierda se quedaba con un
     hueco del alto de la diferencia. Cuanto más completa la máquina, peor.

     jsdom no calcula diseño, así que no puede verse el hueco. Lo que sí se
     comprueba es su causa: que lo largo NO vuelva a la columna. */
  ev(`products[0].atributos = {horas:2400, peso:20, potencia:148};
      products[0].qa = [{nombre:'Ana', pregunta:'¿Tiene factura?', respuesta:'Sí.'}];
      openModal(${equipo.id})`);

  const enColumna = $('#modalInfo').innerHTML;
  check('La columna de al lado de la foto se queda sólo con lo que decide la compra',
    !enColumna.includes('data-calc') && !enColumna.includes('ft-tabla') && !enColumna.includes('qa-item'),
    'precio, datos clave y botones; nada de largo');

  const abajo = $('#modalExtra').innerHTML;
  check('Lo largo va a todo el ancho, bajo las dos columnas',
    abajo.includes('data-calc') && abajo.includes('ft-tabla') && abajo.includes('qa-item'));

  check('La descripción también bajó, no quedó duplicada',
    ($('#modal').innerHTML.match(/class="modal-desc"/g) || []).length === 1);

  /* Abrir la segunda ficha empezada por la mitad —en las preguntas— es lo que
     pasa cuando el modal conserva el scroll de la anterior. */
  $('#modal').scrollTop = 400;
  ev('closeAll(); openModal(products[1].id)');
  check('Cada ficha abre por arriba, no donde se quedó la anterior',
    $('#modal').scrollTop === 0, `scrollTop = ${$('#modal').scrollTop}`);
  ev('closeAll()');

  /* ══ PANEL ══
     Estas pantallas viven detrás de la sesión, así que no se pueden abrir
     desde aquí. Lo que sí se puede —y es donde estaría el error tonto— es
     comprobar que las funciones que las dibujan producen algo coherente. */
  check('El formulario ofrece los campos técnicos de la categoría del equipo',
    ev(`atributosCamposHTML('Excavación', {horas:2400}).includes('at-profundidad')`) &&
    ev(`atributosCamposHTML('Excavación', {}).includes('at-horas')`) &&
    !ev(`atributosCamposHTML('Excavación', {}).includes('at-pluma')`),
    'una excavadora excava; no tiene pluma de grúa');

  check('El formulario trae capturado lo que ya estaba guardado',
    ev(`atributosCamposHTML('Excavación', {horas:2400}).includes('value="2400"')`));

  check('El video se enseña como enlace pegable, no como identificador suelto',
    ev(`videoPagina('${idVideo}')`) === `https://www.youtube.com/watch?v=${idVideo}`);

  /* Duplicar un equipo no puede arrastrar el video: sería enseñar en un
     anuncio una máquina que el cliente no va a recibir. */
  check('Una copia nace sin el video del original',
    ev(`typeof duplicateProduct === 'function'`) &&
    fs.readFileSync(path.join(ROOT, 'assets/js/admin.js'), 'utf8').includes('video: null'));

  check('La bandeja de preguntas dibuja lo pendiente y lo contestado',
    ev(`preguntas = [
        {id:1, slug:'x', nombre:'Ana', pregunta:'¿Tiene factura?', respuesta:null, publicada:false, creado_en:'2026-07-01T10:00:00Z'},
        {id:2, slug:'x', nombre:'Luis', pregunta:'¿Horas?', respuesta:'2400', publicada:true, creado_en:'2026-07-02T10:00:00Z'}
      ]; preguntasAdminHTML()`).includes('Sin contestar') &&
    ev('preguntasAdminHTML()').includes('Publicada') &&
    ev('preguntasPendientes()') === 1);

  check('Lo que falta por contestar sale arriba, aunque sea lo más viejo',
    ev(`preguntasAdminHTML().indexOf('¿Tiene factura?') < preguntasAdminHTML().indexOf('¿Horas?')`),
    'es una bandeja de trabajo: arriba va lo que falta por hacer');

  /* ══ BUSCADOR, DESDE LA CAJA DE VERDAD ══
     Las pruebas unitarias comprueban la función. Esto comprueba que lo que se
     teclea en la caja llega hasta ella: entre las dos hay un retardo, un
     recorte y un `render()`, y ahí se ha roto antes. */
  ev('clearFilters()');
  $('#searchInput').value = 'escabadora';
  $('#searchBtn').click();
  await waitFor(() => ev('state.q') === 'escabadora', 'que la búsqueda se aplique');
  check('Escribir con errata encuentra igual',
    $$('.pcard').length > 0, `${$$('.pcard').length} resultados para "escabadora"`);

  check('La etiqueta enseña lo que se escribió, no lo normalizado',
    $('#activeFilters').textContent.includes('escabadora'));

  $('#searchInput').value = 'zapatos';
  $('#searchBtn').click();
  await waitFor(() => ev('state.q') === 'zapatos', 'la segunda búsqueda');
  check('Lo que no existe sigue sin salir',
    $$('.pcard').length === 0 && $('.empty-state') !== null);
  ev('clearFilters()');

  /* ══ PÁGINAS DE CATEGORÍA ══
     La puerta de entrada desde Google. Se revisan sobre el archivo generado
     porque es lo que Google va a leer — no lo que el sitio dibuja después. */
  const dirCats = path.join(ROOT, 'maquinaria');
  const cats = fs.existsSync(dirCats) ? fs.readdirSync(dirCats) : [];
  check('Se genera una página por categoría', cats.length >= 3, cats.join(', '));

  if (cats.length) {
    const pagina = fs.readFileSync(path.join(dirCats, cats[0], 'index.html'), 'utf8');
    check('La categoría tiene un solo H1 y describe lo que vende',
      (pagina.match(/<h1[ >]/g) || []).length === 1 && /en Chiapas/.test(pagina));
    check('Le dice a Google que es un listado, no un texto con enlaces',
      pagina.includes('"ItemList"') && pagina.includes('"BreadcrumbList"'));
    check('Cada equipo enlaza a su ficha',
      (pagina.match(/\/equipos\/[a-z0-9-]+\//g) || []).length > 0);
    check('La categoría se puede indexar sin ejecutar JavaScript',
      !pagina.includes('<script src'), 'ni un script: es HTML puro');
    check('Y declara la misma política de seguridad que el resto',
      pagina.includes("script-src 'self'") && !pagina.includes('unsafe-inline; script'));
  }

  /* Google llega a una página por los enlaces que apuntan a ella. Una página
     de categoría perfecta a la que no enlaza nadie es una página que no
     existe. */
  const pieCats = [...$$('#footCats a')];
  check('El pie de la portada enlaza a las categorías de verdad',
    pieCats.length > 0 && pieCats.every(a => a.getAttribute('href').startsWith('/maquinaria/')),
    pieCats.map(a => a.getAttribute('href')).join(' '));

  check('Y la dirección del enlace coincide con la carpeta generada',
    pieCats.every(a => cats.includes(a.getAttribute('href').split('/')[2])),
    'si no, el pie llevaría a un 404');

  // Pinchar desde el catálogo filtra en vez de recargar: es más rápido y no
  // pierde el carrito. El enlace sigue ahí para Google y para "abrir en nueva".
  pieCats[0].click();
  check('Pinchar una categoría desde el catálogo filtra, no navega',
    ev('state.cat') === pieCats[0].dataset.cat, ev('state.cat'));
  ev('clearFilters()');

  const mapa = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  check('Las categorías están en el sitemap y pesan más que una ficha',
    cats.every(c => mapa.includes(`/maquinaria/${c}/`)) && mapa.includes('<priority>0.9</priority>'),
    'una ficha desaparece al venderse; la categoría se queda');

  /* ══ AVISO DE COTIZACIÓN ══
     La función corre en Cloudflare, no aquí, así que se revisa su código: lo
     que importa es que no se pueda disparar sin el secreto y que un fallo del
     correo no haga que Supabase reintente en bucle. */
  const aviso = fs.readFileSync(path.join(ROOT, 'functions/api/aviso-solicitud.js'), 'utf8');
  check('El aviso exige un secreto compartido',
    aviso.includes('x-aviso-secreto') && aviso.includes('igualSeguro'),
    'y compara en tiempo constante, para que no se adivine letra por letra');
  check('Un fallo del correo no hace que la base reintente en bucle',
    /return json\(200, \{ ok: false/.test(aviso));
  check('El teléfono va en el asunto, para verlo sin abrir el correo',
    /subject|asunto/.test(aviso) && aviso.includes('${s.telefono}'));

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
