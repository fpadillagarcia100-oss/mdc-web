/**
 * e2e-servidor.test.js — El sitio y el servidor de verdad, juntos, en Edge.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 *
 * Las otras pruebas miran cada lado por separado: smoke.test.js el navegador
 * con la red simulada, servidor/Mdc.Api.Pruebas la API contra una base
 * desechable. Ésta comprueba que se entienden entre ellos: CORS, tokens,
 * formatos de fila, fotos de ida y vuelta. Es lo que se rompe cuando un lado
 * cambia un nombre de campo y el otro no.
 *
 * Necesita, en esta máquina:
 *   1. La API en desarrollo (base MdcMaquinaria_Dev, puerto 5080):
 *        cd servidor && set DOTNET_ENVIRONMENT=Development && dotnet run --project Mdc.Api
 *   2. Datos en esa base:
 *        dotnet run --project Mdc.Api -- importar --desde-json <ruta>/data/catalogo.json
 *   3. El sitio compilado apuntando a ella:  API_URL=http://localhost:5080 npm run build
 *
 *   npm run test:e2e
 *
 * Escribe en MdcMaquinaria_Dev (cambia un precio, sube una foto, deja una
 * cotización y una pregunta). Nunca en la base de verdad: lo comprueba antes
 * de empezar.
 */
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const API = 'http://localhost:5080';
const BASE = 'MdcMaquinaria_Dev';
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => fs.existsSync(p));

const resultados = [];
const check = (nombre, ok, extra = '') =>
  resultados.push(`${ok ? 'PASA ' : 'FALLA'}  ${nombre}${extra ? ' — ' + extra : ''}`);

/** Una consulta a la base de desarrollo, con la cuenta de Windows. */
const sql = q => execFileSync('sqlcmd', ['-S', '.\\SQLEXPRESS', '-E', '-d', BASE, '-h', '-1', '-y', '8000', '-Q', `SET NOCOUNT ON; ${q}`],
  { encoding: 'utf8' }).trim();

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2',
  '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.webmanifest': 'application/json' };

function servirSitio() {
  return http.createServer((q, r) => {
    let p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
    if (!p.startsWith(ROOT)) { r.writeHead(403); return r.end(); }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(r);
  }).listen(8000);
}

(async () => {
  /* ── Antes de tocar nada: ¿es la base de desarrollo, y está todo arriba? ── */
  const salud = await fetch(`${API}/salud`).then(r => r.ok, () => false);
  if (!salud) throw new Error(`La API no contesta en ${API}. Arráncala en Development (ver cabecera).`);
  if (!fs.readFileSync(path.join(ROOT, 'assets/js/catalogo-datos.js'), 'utf8').includes(`"url": "${API}"`))
    throw new Error(`El sitio no está compilado contra ${API}: API_URL=${API} npm run build`);
  if (sql("SELECT DB_NAME()") !== BASE) throw new Error('No es la base de desarrollo. No se sigue.');

  // Una invitación nueva en cada corrida: el enlace es de un solo uso.
  const salida = execFileSync('dotnet', ['run', '--project', path.join(ROOT, 'servidor/Mdc.Api'), '--no-build', '-v', 'q', '--',
    'invitar-admin', 'e2e@mdc.local', 'Prueba E2E'], { encoding: 'utf8', env: { ...process.env, DOTNET_ENVIRONMENT: 'Development' } });
  const enlace = (salida.match(/http:\/\/localhost:8000\/\?invitacion=[A-Za-z0-9_-]+/) || [])[0];
  if (!enlace) throw new Error('No salió el enlace de invitación:\n' + salida);

  const servidor = servirSitio();
  const navegador = await chromium.launch({ executablePath: EDGE });
  /* bypassCSP: el meta CSP de index.html sólo deja conectar con
     api.mdcmaquinaria.com, que es lo correcto en producción. Aquí la API está
     en localhost; se relaja SÓLO en esta prueba, no en el sitio. */
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
  const pagina = await ctx.newPage();
  const errores = [];
  pagina.on('pageerror', e => errores.push(e.message));

  try {
    /* ── 1. La invitación: elegir contraseña y quedar dentro del panel ── */
    await pagina.goto(enlace, { waitUntil: 'networkidle' });
    await pagina.waitForSelector('#mailInput', { timeout: 15000 });
    check('El enlace de invitación abre "Crea tu contraseña"',
      /contraseña/i.test(await pagina.locator('.login-form h3').innerText()));
    check('Y el token desaparece de la barra de direcciones', !pagina.url().includes('invitacion'), pagina.url());

    await pagina.fill('#mailInput', 'clave-de-prueba-e2e-123');
    await pagina.fill('#passInput', 'clave-de-prueba-e2e-123');
    await pagina.click('#pinBtn');
    await pagina.waitForSelector('.adm-table', { timeout: 15000 });
    check('Con la contraseña elegida se entra al panel', true);

    /* ── 2. Editar un equipo: precio y una foto nueva ── */
    const id = sql("SELECT TOP 1 id FROM dbo.equipos ORDER BY id");
    await pagina.click(`#adminBody [data-edit="${id}"]`);
    await pagina.waitForSelector('#pForm');
    await pagina.fill('#f-price', '2999999');
    await pagina.setInputFiles('#imgInput', path.join(ROOT, 'assets/img/og.png'));
    // La foto se comprime a WebP en el navegador y se sube: aparece en la galería del formulario.
    await pagina.waitForFunction(() => Array.isArray(draftImgs) && draftImgs.some(u => u.includes('/fotos/')), null, { timeout: 30000 });
    await pagina.click('#pForm button[type="submit"]');
    await pagina.waitForFunction(() => editingId === null, null, { timeout: 15000 });

    const [precio, imagenes] = sql(`SELECT CONCAT(precio_cents, '|', imagenes) FROM dbo.equipos WHERE id = ${id}`).split('|');
    check('El precio nuevo llegó a SQL Server', precio === '299999900', precio);
    const foto = JSON.parse(imagenes).find(u => u.includes('/fotos/equipos/'));
    check('La foto quedó en la galería, servida por la API', !!foto, imagenes.slice(0, 120));
    const archivo = foto && await fetch(foto);
    check('Y la API la sirve como WebP, en sus dos tamaños',
      archivo?.ok && archivo.headers.get('content-type') === 'image/webp' &&
      (await fetch(foto.replace('-w1400', '-w700'))).ok);
    const autor = sql(`SELECT TOP 1 u.correo FROM dbo.bitacora b JOIN dbo.usuarios u ON u.id = b.actor
                       WHERE b.tabla = 'equipos' AND b.registro = ${id} ORDER BY b.id DESC`);
    check('La bitácora sabe que fue esta cuenta', autor === 'e2e@mdc.local', autor);

    /* ── 3. Lo que hace un visitante: una pregunta y una cotización ── */
    await pagina.click('#adminClose');   // Salir está en la barra de admin, detrás del panel abierto
    // Salir recarga la página a propósito: quien salió no debe seguir viendo borradores.
    await Promise.all([pagina.waitForEvent('load'), pagina.click('#adminLogout')]);
    await pagina.waitForSelector('.pcard');
    const slug = sql(`SELECT slug FROM dbo.equipos WHERE id = ${id}`);
    await pagina.evaluate(s => openModal(products.find(p => p.slug === s).id), slug);
    await pagina.waitForSelector('#qaForm');
    await pagina.fill('#qa-nombre', 'Visitante E2E');
    await pagina.fill('#qa-texto', '¿Cuántas horas de uso tiene? (prueba e2e)');
    await pagina.locator('#qaForm button[type="submit"]').click();
    await pagina.waitForSelector('.qa-ok', { timeout: 15000 });
    check('Una pregunta del público llega a la base sin publicar',
      sql("SELECT COUNT(*) FROM dbo.preguntas WHERE nombre = N'Visitante E2E' AND publicada = 0") !== '0');

    const tel = '96' + String(Date.now()).slice(-8);
    const ok = await pagina.evaluate(t => registrarSolicitud({
      tipo: 'cotizacion', nombre: 'Cliente E2E', telefono: t, mensaje: 'prueba e2e',
      carrito: [{ slug: 'x', nombre: 'Excavadora', precio: 100, cantidad: 1 }],
    }), tel);
    check('Una cotización llega a la base', ok && sql(`SELECT COUNT(*) FROM dbo.solicitudes WHERE telefono = '${tel}'`) === '1');

    check('Sin errores de JavaScript en todo el recorrido', errores.length === 0, errores[0] || 'ninguno');
  } finally {
    await navegador.close();
    servidor.close();
  }

  console.log('\n' + resultados.join('\n'));
  const fallidas = resultados.filter(r => r.startsWith('FALLA')).length;
  console.log(`\n${resultados.length - fallidas}/${resultados.length} pruebas de punta a punta pasaron`);
  process.exit(fallidas ? 1 : 0);
})().catch(err => {
  console.error('\nLa prueba no pudo completarse:\n  ' + err.message);
  process.exit(1);
});
