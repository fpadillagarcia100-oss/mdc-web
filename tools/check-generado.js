/**
 * check-generado.js — Verifica que lo generado corresponda a los datos actuales.
 *
 * El riesgo que cubre: editas data/catalogo.json, se te olvida ejecutar
 * "npm run build", y publicas. El sitio se ve bien —con los datos viejos— y no
 * hay ningún error que te avise. Ese silencio es el problema.
 *
 * Compara la huella de data/catalogo.json contra la que quedó grabada al
 * generar, y comprueba que cada equipo tenga su página.
 *
 * Se corre con:  npm run test:generado
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const problemas = [];

const fuente = path.join(ROOT, 'data', 'catalogo.json');
const datos = path.join(ROOT, 'assets', 'js', 'catalogo-datos.js');

if (!fs.existsSync(datos)) {
  console.error('Falta assets/js/catalogo-datos.js. Ejecuta: npm run build');
  process.exit(1);
}

/* 1. ¿Coincide la huella? */
const esperada = crypto.createHash('sha256')
  .update(fs.readFileSync(fuente)).digest('hex').slice(0, 16);

const generado = fs.readFileSync(datos, 'utf8');
const encontrada = (/CATALOGO_HUELLA = '([a-f0-9]+)'/.exec(generado) || [])[1];

if (encontrada !== esperada) {
  problemas.push(
    'data/catalogo.json cambió pero no se regeneró el sitio.\n' +
    `    huella del archivo : ${esperada}\n` +
    `    huella de lo generado: ${encontrada || 'ninguna'}\n` +
    '    Solución: npm run build');
}

/* 2. ¿Tiene cada equipo su página? */
const catalogo = JSON.parse(fs.readFileSync(fuente, 'utf8'));
const sinPagina = catalogo.equipos.filter(
  eq => !fs.existsSync(path.join(ROOT, 'equipos', eq.slug, 'index.html')));

if (sinPagina.length) {
  problemas.push(`${sinPagina.length} equipos sin página estática: ` +
    sinPagina.slice(0, 3).map(e => e.slug).join(', ') +
    (sinPagina.length > 3 ? '…' : ''));
}

/* 3. ¿Quedaron páginas de equipos ya dados de baja? */
const dirFichas = path.join(ROOT, 'equipos');
if (fs.existsSync(dirFichas)) {
  const vigentes = new Set(catalogo.equipos.map(e => e.slug));
  const huerfanas = fs.readdirSync(dirFichas).filter(d => !vigentes.has(d));
  if (huerfanas.length) {
    problemas.push(`${huerfanas.length} páginas de equipos que ya no existen: ` +
      huerfanas.slice(0, 3).join(', ') + '. Quedarían publicadas y indexadas.');
  }
}

/* 4. ¿El sitemap lista todo? */
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const faltanEnSitemap = catalogo.equipos.filter(
  eq => !sitemap.includes(`/equipos/${eq.slug}/`));
if (faltanEnSitemap.length) {
  problemas.push(`${faltanEnSitemap.length} equipos no aparecen en sitemap.xml. Google no los encontrará.`);
}

if (problemas.length) {
  console.error('El sitio generado no corresponde a los datos:\n');
  problemas.forEach(p => console.error('  · ' + p));
  process.exit(1);
}

console.log(`Sitio generado al día: ${catalogo.equipos.length} equipos con página y en el sitemap.`);
