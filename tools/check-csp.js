/**
 * check-csp.js — Vigila que ninguna página recupere JavaScript en línea.
 *
 * El CSP del sitio usa `script-src 'self'` SIN 'unsafe-inline'. Esa es la
 * protección que impide ejecutar código inyectado, y sólo funciona mientras
 * todo el JavaScript viva en archivos aparte.
 *
 * El problema es que si alguien agrega un <script> con código dentro del HTML,
 * el navegador simplemente lo ignora: la página se ve bien, la función nueva
 * no sirve, y nadie entiende por qué. Este verificador convierte ese silencio
 * en un error claro.
 *
 * Revisa index.html y todas las fichas generadas, que desde el simulador de
 * financiamiento también cargan un script.
 *
 * Se corre con:  npm run test:csp
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** Páginas a revisar: la aplicación y cada ficha estática. */
function paginas() {
  // Acepta una ruta como argumento para poder probar el verificador mismo.
  if (process.argv[2]) return [process.argv[2]];

  const lista = [path.join(ROOT, 'index.html')];
  const dir = path.join(ROOT, 'equipos');
  if (fs.existsSync(dir)) {
    for (const slug of fs.readdirSync(dir)) {
      const ficha = path.join(dir, slug, 'index.html');
      if (fs.existsSync(ficha)) lista.push(ficha);
    }
  }
  return lista;
}

function revisar(file) {
  const html = fs.readFileSync(file, 'utf8');
  const donde = path.relative(ROOT, file).replace(/\\/g, '/');
  const problems = [];

  /* 1. Scripts en línea con contenido ejecutable.
        Se permiten los bloques de datos (application/ld+json), que el navegador
        no ejecuta y que el CSP tampoco bloquea. */
  const scriptTag = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptTag.exec(html)) !== null) {
    const [, attrs, body] = m;
    const isData = /type\s*=\s*["']application\/(ld\+json|json)["']/i.test(attrs);
    if (!isData && body.trim()) {
      const line = html.slice(0, m.index).split('\n').length;
      problems.push(`${donde}:${line} — <script> con código dentro del HTML. Muévelo a assets/js/.`);
    }
  }

  /* 2. Manejadores en atributos (onclick, onerror…), que también requieren
        'unsafe-inline'. El sitio usa delegación de eventos justamente para
        no necesitarlos. */
  const handler = /\son[a-z]+\s*=\s*["'][^"']+["']/gi;
  while ((m = handler.exec(html)) !== null) {
    const line = html.slice(0, m.index).split('\n').length;
    problems.push(`${donde}:${line} — manejador en línea "${m[0].trim().split('=')[0]}". Usa addEventListener en assets/js/.`);
  }

  /* 3. Que nadie haya relajado la política. */
  const csp = /script-src[^;"]*/i.exec(html);
  if (!csp) {
    problems.push(`${donde} — perdió la directiva script-src del CSP.`);
  } else if (/unsafe-inline|unsafe-eval/i.test(csp[0])) {
    problems.push(`${donde} — el CSP volvió a permitir código en línea: "${csp[0].trim()}"`);
  }

  return problems;
}

const lista = paginas();
const problems = lista.flatMap(revisar);

if (problems.length) {
  console.error('El CSP quedaría inservible:\n');
  problems.forEach(p => console.error('  · ' + p));
  console.error('\nVer SECURITY.md para el porqué.');
  process.exit(1);
}

console.log(`CSP intacto: no hay JavaScript en línea en ${lista.length} páginas.`);
