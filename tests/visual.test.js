/**
 * visual.test.js — Abre el sitio en un navegador de verdad, lo mira y lo mide.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 *
 * Se corre con:  npm run test:visual
 *
 * ── Por qué existe ──
 *
 * smoke.test.js levanta el sitio en jsdom, que ejecuta el JavaScript pero NO
 * dibuja nada: no tiene motor de estilos ni de composición. Ahí una tarjeta
 * invisible, un texto que se sale de la pantalla o una animación que esconde
 * contenido para siempre pasan las 174 pruebas sin despeinarse.
 *
 * Esto llena ese hueco: un Chromium real, con estilos aplicados, midiendo
 * cajas y sacando fotos que se comparan con las de la última vez.
 *
 * ── Por qué NO está en `npm test` ──
 *
 * Usa el Edge que ya viene con Windows en lugar de descargar un navegador de
 * 150 MB (por eso la dependencia es `playwright-core` y no `playwright`). Eso
 * lo hace gratis aquí y NO reproducible en el CI de GitHub, que corre Ubuntu
 * sin Edge. Así que va aparte: el CI sigue con las pruebas que sí puede
 * garantizar, y ésta se corre antes de un cambio visual.
 *
 * ── Las capturas ──
 *
 * tests/capturas/  son la referencia y SÍ se versionan: son el "así se veía
 * cuando estaba bien". Si un cambio las mueve, la prueba avisa con cuánto se
 * movió y escribe la nueva al lado para mirarlas. Cuando el cambio es
 * intencional, se aceptan con:  npm run test:visual -- --aceptar
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright-core');
const { comparar } = require('./lib/png');

const ROOT = path.join(__dirname, '..');
const CAPTURAS = path.join(__dirname, 'capturas');
const ACEPTAR = process.argv.includes('--aceptar');

/* Cuánto puede cambiar una captura sin considerarse regresión. Medio por
   ciento de los pixeles: absorbe el antialias del texto, no absorbe un bloque
   que se movió de sitio. */
const TOLERANCIA = 0.005;

/* Presupuesto de rendimiento. No son cifras de catálogo: son lo que aguanta un
   teléfono de gama media con la señal de una obra. Si se pasan, algo entró que
   no debía — una fuente, una foto sin optimizar, otro script. */
const PRESUPUESTO = {
  peticiones: 30,          // el navegador abre esto al cargar la portada
  transferido: 900 * 1024, // bytes que bajan por la red la primera vez
  fcp: 2000,               // ms hasta el primer texto pintado
  dcl: 3000,               // ms hasta que el HTML y sus scripts están listos
};

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => fs.existsSync(p));

const resultados = [];
const check = (nombre, ok, extra = '') =>
  resultados.push(`${ok ? 'PASA ' : 'FALLA'}  ${nombre}${extra ? ' — ' + extra : ''}`);

/* ── Servidor de archivos, para no depender de Python ni de nada externo ── */
const TIPOS = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.json':'application/json', '.png':'image/png',
  '.svg':'image/svg+xml', '.xml':'application/xml', '.webmanifest':'application/manifest+json' };

function servir(puerto, raiz = ROOT) {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const archivo = path.join(raiz, rel);
    // Nadie sale de la carpeta servida, ni con ../../
    if (!archivo.startsWith(raiz)) { res.writeHead(403).end(); return }
    fs.readFile(archivo, (err, datos) => {
      if (err) { res.writeHead(404).end('no está'); return }
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
      res.end(datos);
    });
  });
  return new Promise(ok => server.listen(puerto, () => ok(server)));
}

/**
 * Guarda una captura y la compara con la referencia.
 *
 * La primera vez no hay con qué comparar: se escribe la referencia y se avisa.
 * No se marca como fallo — nadie puede tener una referencia antes de la
 * primera ejecución, y hacerlo fallar sólo enseña a ignorar el rojo.
 */
async function capturar(objetivo, nombre, opciones = {}) {
  // `objetivo` puede ser la página entera o un elemento concreto. Acotar la
  // captura a lo que se está probando es lo que la mantiene estable.
  fs.mkdirSync(CAPTURAS, { recursive: true });
  const referencia = path.join(CAPTURAS, `${nombre}.png`);
  const nueva = await objetivo.screenshot({ animations: 'disabled', ...opciones });

  if (!fs.existsSync(referencia) || ACEPTAR) {
    fs.writeFileSync(referencia, nueva);
    check(`Captura "${nombre}"`, true, ACEPTAR ? 'referencia aceptada' : 'referencia creada');
    return;
  }

  const d = comparar(fs.readFileSync(referencia), nueva);
  const ok = d.fraccion <= TOLERANCIA;
  if (!ok) fs.writeFileSync(path.join(CAPTURAS, `${nombre}.nueva.png`), nueva);
  check(`Captura "${nombre}" sin cambios`, ok,
    d.motivo || `${(d.fraccion * 100).toFixed(2)}% de pixeles distintos${ok ? '' : ` — mira ${nombre}.nueva.png`}`);
}

/** Nada debe salirse por el costado. El scroll horizontal es siempre un error. */
const desbordaX = pagina => pagina.evaluate(() =>
  document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

(async () => {
  if (!EDGE) {
    console.error('\nNo encontré Microsoft Edge. Esta prueba necesita un navegador real.');
    console.error('En Windows viene instalado; en otro sistema, ajusta la ruta arriba.\n');
    process.exit(1);
  }

  const server = await servir(8123);
  const base = 'http://localhost:8123';
  const navegador = await chromium.launch({ executablePath: EDGE });

  try {
    /* ══ ESCRITORIO ══ */
    const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
    const pagina = await ctx.newPage();

    await pagina.goto(base + '/', { waitUntil: 'networkidle' });
    await pagina.waitForSelector('.pcard');

    check('La portada dibuja las tarjetas', await pagina.locator('.pcard').count() === 9,
      `${await pagina.locator('.pcard').count()} tarjetas`);
    check('La portada no se desborda a lo ancho', !(await desbordaX(pagina)));

    // Que el hero exista no basta: tiene que verse y ocupar sitio.
    const hero = await pagina.locator('.hero-h').boundingBox();
    check('El titular del hero es visible y tiene tamaño', hero && hero.width > 200 && hero.height > 20,
      hero ? `${Math.round(hero.width)}×${Math.round(hero.height)}` : 'no existe');

    /* El riesgo de la aparición al hacer scroll: una tarjeta arranca en
       opacity 0 y se queda ahí para siempre. Se comprueba en dos tiempos.

       Primero, que lo que YA está en pantalla se vea. Las de más abajo tienen
       que estar transparentes —para eso es el efecto—, así que exigirles
       opacidad aquí sería exigir que el efecto no funcione. */
    const ocultasArriba = await pagina.evaluate(() =>
      [...document.querySelectorAll('.pcard')].filter(c => {
        const r = c.getBoundingClientRect();
        const enPantalla = r.top < innerHeight * .8 && r.bottom > 0;
        return enPantalla && (Number(getComputedStyle(c).opacity) < .5 || r.width < 10 || r.height < 10);
      }).length);
    check('Lo que está en pantalla se ve', ocultasArriba === 0, `${ocultasArriba} tarjetas ocultas`);

    // Y después, que al llegar abajo no quede ninguna escondida. Éste es el
    // que detectaría el fallo de verdad: contenido que nunca aparece.
    await pagina.evaluate(() => scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
    await pagina.waitForTimeout(700);
    const ocultasAbajo = await pagina.evaluate(() =>
      [...document.querySelectorAll('.pcard')].filter(c => Number(getComputedStyle(c).opacity) < .9).length);
    check('Tras recorrer la página, ninguna tarjeta sigue escondida', ocultasAbajo === 0,
      `${ocultasAbajo} de ${await pagina.locator('.pcard').count()}`);
    await pagina.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await pagina.waitForTimeout(400);

    await capturar(pagina, 'portada', { fullPage: false });

    /* ── La ficha ── */
    await pagina.locator('.pcard-name').first().click();
    await pagina.waitForSelector('#modalOverlay.open');
    const precio = await pagina.locator('.modal-price').first().textContent();
    check('La ficha abre con precio', /\d/.test(precio || ''), (precio || '').trim());
    check('La ficha no desborda', !(await desbordaX(pagina)));
    await capturar(pagina, 'ficha');
    await pagina.locator('#modalClose').click();

    /* ── Rentar o comprar ── */
    const conRvc = await pagina.evaluate(() => {
      const id = products.find(p => p.cond !== 'Renta' &&
        products.some(r => r.cond === 'Renta' && r.cat === p.cat));
      if (!id) return null;
      openModal(id.id);
      const b = document.querySelector('.rvc');
      return b ? b.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) : null;
    });
    check('El bloque de rentar o comprar se pinta', !!conRvc, conRvc || 'no salió');
    await pagina.evaluate(() => closeAll());

    /* ── El panel de administración ──
       Lo que llevo tres cambios sin poder ver con mis propios ojos. */
    await pagina.locator('#adminEntry').click();
    await pagina.waitForSelector('.login-shell');
    const escena = await pagina.locator('.login-hero svg').boundingBox();
    check('La escena de la obra se dibuja y ocupa sitio',
      escena && escena.width > 100 && escena.height > 150,
      escena ? `${Math.round(escena.width)}×${Math.round(escena.height)}` : 'no se ve');

    const campo = await pagina.locator('#mailInput').boundingBox();
    check('El campo de correo tiene tamaño usable', campo && campo.height >= 40 && campo.width > 200,
      campo ? `${Math.round(campo.width)}×${Math.round(campo.height)}` : 'no se ve');

    // El fallo original: el espaciado del PIN volvía ilegible un correo.
    const espaciado = await pagina.evaluate(() => getComputedStyle(document.querySelector('#mailInput')).letterSpacing);
    check('El correo se escribe con espaciado normal', espaciado === 'normal', espaciado);

    await pagina.locator('#mailInput').fill('prueba@ejemplo.com');
    await capturar(pagina, 'panel-login');
    await pagina.locator('#adminClose').click();

    /* ── La cotización ── */
    await pagina.locator('.btn-add').first().click();
    await pagina.locator('#cartToggle').click();
    await pagina.waitForSelector('.cart-drawer.open');
    check('La cotización lista lo agregado', await pagina.locator('.cart-item').count() >= 1);
    /* Esperar a que el cajón TERMINE de deslizarse. Sin esto se fotografiaba a
       mitad del recorrido: como está desplazado con transform, la captura del
       elemento salía recortada y con media pantalla en blanco, distinta en
       cada ejecución. `animations: 'disabled'` congela las animaciones CSS,
       pero esto es una transición, que es otra cosa. */
    await pagina.waitForFunction(() => {
      const d = document.querySelector('.cart-drawer');
      return d && Math.abs(d.getBoundingClientRect().right - innerWidth) < 1;
    });
    /* Se fotografía SÓLO el cajón, no la pantalla entera.
       La captura de pantalla completa incluía el catálogo de fondo y el aviso
       de "agregado a la cotización", que tiene temporizador propio: dos cosas
       que esta prueba no está evaluando y que la hacían fallar por dónde
       estaba el scroll o por unos milisegundos de más. Una prueba que falla
       por motivos que no le importan se acaba ignorando. */
    await capturar(pagina.locator('.cart-drawer'), 'cotizacion');
    await pagina.locator('[data-close-cart]').click();

    /* ── La página de categoría, que es la que ve Google ── */
    await pagina.goto(base + '/maquinaria/excavacion/', { waitUntil: 'networkidle' });
    check('La categoría no desborda', !(await desbordaX(pagina)));
    const guia = await pagina.locator('.cat-guia').boundingBox();
    check('La guía de compra se pinta', guia && guia.height > 300,
      guia ? `${Math.round(guia.height)} px de alto` : 'no está');
    const medida = await pagina.evaluate(() => {
      const p = document.querySelector('.cat-guia-bloque p');
      return p ? Math.round(p.getBoundingClientRect().width) : 0;
    });
    // Un párrafo de 1200 px de ancho no se lee: el ojo pierde el renglón.
    check('El texto largo tiene medida legible', medida > 300 && medida < 800, `${medida} px de ancho`);
    await capturar(pagina, 'categoria', { fullPage: false });
    await pagina.goto(base + '/', { waitUntil: 'networkidle' });

    /* ══ MÓVIL ══ */
    const movil = await navegador.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    });
    const pm = await movil.newPage();
    await pm.goto(base + '/', { waitUntil: 'networkidle' });
    await pm.waitForSelector('.pcard');

    check('En móvil tampoco se desborda', !(await desbordaX(pm)));
    const anchoTarjeta = (await pm.locator('.pcard').first().boundingBox()).width;
    check('La tarjeta ocupa el ancho del móvil', anchoTarjeta > 300, `${Math.round(anchoTarjeta)} px de 390`);
    await capturar(pm, 'movil-portada');

    await pm.locator('#adminEntry').click();
    await pm.waitForSelector('.login-shell');
    const columnas = await pm.evaluate(() =>
      getComputedStyle(document.querySelector('.login-shell')).gridTemplateColumns.split(' ').length);
    check('El panel se apila en una columna en móvil', columnas === 1, `${columnas} columna(s)`);
    await capturar(pm, 'movil-panel');
    await movil.close();

    /* ══ MENOS ANIMACIÓN ══
       La promesa que más fácil se rompe sin darse cuenta. */
    const quieto = await navegador.newContext({
      viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce',
    });
    const pq = await quieto.newPage();
    await pq.goto(base + '/', { waitUntil: 'networkidle' });
    await pq.waitForSelector('.pcard');

    const duraciones = await pq.evaluate(() =>
      [...document.querySelectorAll('.hero-h, .pcard, .wa-float')]
        .map(e => parseFloat(getComputedStyle(e).animationDuration) || 0));
    check('Con menos animación, nada se mueve', duraciones.every(d => d < .05),
      `la más larga: ${Math.max(0, ...duraciones)}s`);

    const visibles = await pq.evaluate(() =>
      [...document.querySelectorAll('.pcard')].every(c => Number(getComputedStyle(c).opacity) > .9));
    check('Y el contenido sigue estando ahí', visibles, 'ninguna tarjeta escondida');
    await quieto.close();

    /* ══ RENDIMIENTO ══ */
    const marcas = await pagina.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      return {
        dcl: Math.round(nav.domContentLoadedEventEnd || 0),
        carga: Math.round(nav.loadEventEnd || 0),
        fcp: Math.round(fcp ? fcp.startTime : 0),
        recursos: performance.getEntriesByType('resource').length,
        peso: performance.getEntriesByType('resource')
                .reduce((s, r) => s + (r.encodedBodySize || 0), 0),
      };
    });

    const kb = n => `${(n / 1024).toFixed(0)} kB`;
    check('Peticiones dentro del presupuesto', marcas.recursos <= PRESUPUESTO.peticiones,
      `${marcas.recursos} de ${PRESUPUESTO.peticiones}`);
    check('Peso descargado dentro del presupuesto', marcas.peso <= PRESUPUESTO.transferido,
      `${kb(marcas.peso)} de ${kb(PRESUPUESTO.transferido)}`);
    check('Primer texto pintado a tiempo', marcas.fcp <= PRESUPUESTO.fcp,
      `${marcas.fcp} ms de ${PRESUPUESTO.fcp}`);
    check('HTML y scripts listos a tiempo', marcas.dcl <= PRESUPUESTO.dcl,
      `${marcas.dcl} ms de ${PRESUPUESTO.dcl}`);

    /* ══ EL SITIO PUBLICADO ══
       Lo de arriba mide el repositorio, con sus 21 scripts sueltos. Lo que
       reciben los clientes es dist/, con esos 21 unidos en uno. Se comprueban
       las dos cosas por separado, porque un empaquetado que se rompe en el
       último paso no lo ve nadie hasta que ya está publicado. */
    if (fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
      const servidorDist = await servir(8124, path.join(ROOT, 'dist'));
      const cd = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
      const pd = await cd.newPage();
      const rotos = [];
      pd.on('pageerror', e => rotos.push(e.message));

      await pd.goto('http://localhost:8124/', { waitUntil: 'networkidle' });
      await pd.waitForSelector('.pcard', { timeout: 10000 });

      check('El sitio publicado arranca sin errores', rotos.length === 0, rotos[0] || 'ninguno');
      check('Y dibuja el catálogo igual', await pd.locator('.pcard').count() === 9);

      const dm = await pd.evaluate(() => {
          const fcp = performance.getEntriesByName('first-contentful-paint')[0];
        return {
          recursos: performance.getEntriesByType('resource').length,
          js: performance.getEntriesByType('resource').filter(r => r.name.endsWith('.js') || r.name.includes('.js?')).length,
          fcp: Math.round(fcp ? fcp.startTime : 0),
        };
      });
      check('Un solo archivo de JavaScript en producción', dm.js === 1,
        `${dm.js} · ${marcas.recursos} peticiones → ${dm.recursos}`);
      check('Y sigue pintando a tiempo', dm.fcp <= PRESUPUESTO.fcp, `${dm.fcp} ms`);

      await cd.close();
      servidorDist.close();
    }

    await ctx.close();
  } finally {
    await navegador.close();
    server.close();
  }

  console.log('\n' + resultados.join('\n'));
  const fallidas = resultados.filter(r => r.startsWith('FALLA')).length;
  console.log(`\n${resultados.length - fallidas}/${resultados.length} pruebas visuales pasaron`);
  console.log(`Capturas en tests/capturas/`);
  process.exit(fallidas ? 1 : 0);
})().catch(err => {
  /* Lo que ya se comprobó se imprime igual. Un fallo a mitad del recorrido no
     puede tragarse el resultado de las veinte pruebas anteriores: sin ellas no
     se sabe si el problema es nuevo o venía de antes. */
  if (resultados.length) console.log('\n' + resultados.join('\n'));
  console.error('\nLa prueba visual se detuvo aquí:\n  ' + err.message.split('\n')[0] + '\n');
  process.exit(1);
});
