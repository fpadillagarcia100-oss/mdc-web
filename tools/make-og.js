/**
 * make-og.js — Regenera assets/img/og.png a partir de tools/og-image.html.
 *
 * Es la imagen que se ve al compartir el sitio en WhatsApp o Facebook. Se
 * genera con el navegador que ya tienes instalado (Edge o Chrome en modo sin
 * ventana), así que no hace falta ninguna dependencia extra.
 *
 * Se corre con:  npm run og
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const browser = CANDIDATES.find(p => fs.existsSync(p));
if (!browser) {
  console.error('No encontré Edge ni Chrome. Instala uno o genera la imagen a mano a 1200×630.');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'assets', 'img');
fs.mkdirSync(outDir, { recursive: true });

const source = 'file:///' + path.join(__dirname, 'og-image.html').replace(/\\/g, '/');

// El navegador escribe la captura en el directorio de trabajo, así que lo
// ponemos donde queremos el archivo en lugar de pasar una ruta absoluta.
execFileSync(browser, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1200,630', '--screenshot=og.png', source,
], { cwd: outDir, stdio: 'ignore' });

const out = path.join(outDir, 'og.png');
if (!fs.existsSync(out)) {
  console.error('El navegador no generó la imagen.');
  process.exit(1);
}
console.log(`assets/img/og.png regenerada — ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
