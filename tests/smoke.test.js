const fs = require('fs');
const { JSDOM, requestInterceptor } = require('jsdom');

const ROOT = require('path').join(__dirname, '..').replace(/\\/g, '/') + '/';
const html = fs.readFileSync(ROOT + 'index.html', 'utf8');
const errors = [];

// Sirve los archivos del proyecto como si vinieran de un servidor real, para que
// el origen siga siendo https:// y localStorage funcione.
const serveLocal = requestInterceptor(request => {
  const url = request.url;
  const type = url.endsWith('.css') ? 'text/css' : 'text/javascript';
  if (url.startsWith('https://mdc.test/')) {
    const file = ROOT + url.replace('https://mdc.test/', '');
    try {
      return new Response(fs.readFileSync(file), { headers: { 'Content-Type': type } });
    } catch {
      errors.push('ARCHIVO NO ENCONTRADO: ' + url);
      return new Response('', { status: 404 });
    }
  }
  return new Response('', { headers: { 'Content-Type': type } });   // fuentes externas
});

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  resources: { interceptors: [serveLocal] },
  url: 'https://mdc.test/',
  beforeParse(w) {
    w.addEventListener('error', e => errors.push('window.error: ' + (e.error?.stack || e.message)));
    // jsdom no implementa estas APIs; las simulamos para poder ejecutar el flujo.
    w.createImageBitmap = async () => ({ width: 100, height: 100, close() {} });
    w.HTMLCanvasElement.prototype.getContext = () => ({ fillRect(){}, drawImage(){}, set fillStyle(v){} });
    w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/webp;base64,AAAA';
  },
});

const { window } = dom;
const doc = window.document;
const $ = s => doc.querySelector(s);
const results = [];
const check = (name, cond, extra = '') =>
  results.push(`${cond ? 'PASA' : 'FALLA'}  ${name}${extra ? ' â€” ' + extra : ''}`);

setTimeout(() => {
  // â”€â”€ Render inicial â”€â”€
  const cards = doc.querySelectorAll('.pcard');
  check('CatÃ¡logo renderiza 9 tarjetas', cards.length === 9, `hay ${cards.length}`);
  check('Nav de categorÃ­as se construye', doc.querySelectorAll('.nav-cat').length === 7);
  check('Logo muestra la marca', $('#logoSlot').textContent.includes('Maquinaria de Chiapas'));
  check('TÃ­tulo de pestaÃ±a actualizado', doc.title.startsWith('MDC'));
  check('BotÃ³n "Ingresar" existe', $('[data-goto="cuenta"]') !== null);

  // â”€â”€ PÃ¡ginas â”€â”€
  const pages = ['ayuda', 'sucursales', 'vender', 'cuenta', 'privacidad'];
  for (const p of pages) {
    doc.querySelector(`[data-goto="${p}"]`).click();
    const open = $('#pageOverlay').classList.contains('open');
    const body = $('#pageBody').innerHTML.length;
    check(`PÃ¡gina "${p}" abre con contenido`, open && body > 200, `${body} chars`);
    $('#pageClose').click();
  }

  // â”€â”€ Contenido especÃ­fico â”€â”€
  doc.querySelector('[data-goto="ayuda"]').click();
  check('Ayuda tiene 8 preguntas', $('#pageBody').querySelectorAll('details').length === 8);
  $('#pageClose').click();

  doc.querySelector('[data-goto="sucursales"]').click();
  check('Sucursales lista 3 ubicaciones', $('#pageBody').querySelectorAll('.branch').length === 3);
  check('Sucursales enlaza a Google Maps', $('#pageBody').innerHTML.includes('google.com/maps'));
  $('#pageClose').click();

  // â”€â”€ ValidaciÃ³n del formulario de venta â”€â”€
  doc.querySelector('[data-goto="vender"]').click();
  check('Trampa anti-bot presente', $('#hp_empresa') !== null);
  $('#v-name').value = '';
  $('#v-phone').value = '123';           // telÃ©fono invÃ¡lido
  $('#sellForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  check('Rechaza datos invÃ¡lidos', doc.querySelectorAll('#sellForm .field.err').length >= 2,
        `${doc.querySelectorAll('#sellForm .field.err').length} campos marcados`);

  $('#v-name').value = 'Juan PÃ©rez';
  $('#v-phone').value = '9611234567';
  $('#v-brand').value = 'CAT 320';
  let opened = null;
  window.open = (u) => { opened = u; return null };
  $('#sellForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  check('Bloquea envÃ­o demasiado rÃ¡pido (anti-bot)', opened === null);
  $('#sellForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  check('EnvÃ­a a WhatsApp al reintentar', opened && opened.includes('wa.me'),
        opened ? decodeURIComponent(opened).slice(30, 70) : 'no abriÃ³');
  check('El mensaje incluye el equipo', opened && decodeURIComponent(opened).includes('CAT 320'));

  // â”€â”€ Carrito y cotizaciÃ³n â”€â”€
  doc.querySelector('.btn-add').click();
  check('Agregar al carrito actualiza el badge', $('#cartBadge').textContent === '1');
  $('#checkoutBtn').click();
  check('Checkout abre el formulario de cotizaciÃ³n', $('#pageBody').querySelector('#quoteForm') !== null);
  $('#c-name').value = 'Ana LÃ³pez';
  $('#c-phone').value = '9619876543';
  $('#c-save').checked = true;
  opened = null;
  $('#quoteForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  $('#quoteForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  check('CotizaciÃ³n se envÃ­a por WhatsApp', opened && opened.includes('wa.me'));
  check('Guarda los datos del cliente', window.localStorage.getItem('mdc_v1_account')?.includes('Ana LÃ³pez'));
  check('Etiqueta del header muestra el nombre', $('#acctLabel').textContent === 'Ana');

  // â”€â”€ Seguridad del PIN â”€â”€
  const st = JSON.parse(window.localStorage.getItem('mdc_v1_settings') || '{}');
  check('El PIN NO se guarda en claro', !('pin' in st) && !JSON.stringify(st).includes('2580'));
  check('El PIN se guarda hasheado', typeof st.pinHash === 'string' && /^(sha256|fnv):/.test(st.pinHash),
        st.pinHash ? st.pinHash.slice(0, 18) + 'â€¦' : 'sin hash');

  $('#adminEntry').click();
  check('Panel admin pide PIN', $('#pinInput') !== null);
  for (let i = 0; i < 5; i++) { $('#pinInput').value = '0000'; $('#pinBtn').click() }

  setTimeout(() => {
    check('Bloquea tras 5 intentos fallidos', $('#pinInput').disabled === true,
          $('#pinErr').textContent);

    console.log('\n' + results.join('\n'));
    const failed = results.filter(r => r.startsWith('FALLA')).length;
    console.log(`\n${results.length - failed}/${results.length} pruebas pasaron`);
    if (errors.length) console.log('\nERRORES EN CONSOLA:\n' + errors.join('\n'));
    process.exit(failed || errors.length ? 1 : 0);
  }, 300);
}, 400);

