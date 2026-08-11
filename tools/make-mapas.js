/**
 * make-mapas.js — Dibuja el mapa real de cada sucursal, una vez, en la compilación.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 *
 * Se corre con:  npm run mapas
 *
 * ── Qué problema resuelve ──
 *
 * La página de sucursales enseñaba un dibujo abstracto de calles: no decía
 * nada, porque no eran TUS calles. Y la alternativa —incrustar tres iframes de
 * Google— carga medio megabyte y pone cookies a todo el que abra la página,
 * mire el mapa o no.
 *
 * Esto saca lo mejor de las dos: un mapa DE VERDAD, con las calles reales de
 * cada dirección, servido desde tu propio dominio y pesando unos 40 kB. Al
 * pulsarlo entra el mapa interactivo de Google, que es cuando el visitante ya
 * dijo que le interesa.
 *
 * ── Cómo ──
 *
 * 1. Nominatim convierte la dirección en coordenadas.
 * 2. Se bajan los cuadros del mapa que rodean ese punto (OpenStreetMap).
 * 3. Se pegan en una sola imagen, se recorta y se le dibuja el pin encima.
 *
 * Todo pasa AQUÍ, una vez, no en el navegador de nadie.
 *
 * ── Trato con OpenStreetMap ──
 *
 * Sus cuadros son gratis y de uso público, con dos condiciones que se cumplen:
 * identificarse con un User-Agent propio y no descargar en masa. Son seis
 * cuadros por sucursal, una vez, y el resultado se guarda en el repositorio —
 * las siguientes compilaciones no vuelven a pedir nada.
 *
 * La atribución es obligatoria y va escrita en la propia imagen, para que no
 * se pueda separar del mapa por accidente.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { codificarPaleta, decodificar } = require('./png');

const ROOT = path.join(__dirname, '..');
const SALIDA = path.join(ROOT, 'assets', 'img');
const CACHE = path.join(ROOT, 'data', 'coordenadas.json');

const AGENTE = 'MDC-Maquinaria/1.0 (https://mdcmaquinaria.com)';
const ZOOM = 15;             // barrio: se ven las calles con nombre reconocible
const TILE = 256;
const COLS = 3, FILAS = 2;   // 768×512 antes de recortar
const ANCHO = 640, ALTO = 320;

const esperar = ms => new Promise(r => setTimeout(r, ms));

/* ── Coordenadas ── */

const aTileX = (lon, z) => (lon + 180) / 360 * Math.pow(2, z);
const aTileY = (lat, z) => {
  const r = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z);
};

async function preguntar(consulta) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
              encodeURIComponent(consulta);
  const r = await fetch(url, { headers: { 'User-Agent': AGENTE } });
  if (!r.ok) throw new Error(`Nominatim respondió ${r.status}`);
  const d = await r.json();
  return d.length ? { lat: Number(d[0].lat), lon: Number(d[0].lon) } : null;
}

/**
 * Busca la dirección; si no aparece, se queda con la ciudad.
 *
 * "Carretera Costera km 4" no existe en ningún callejero: un kilómetro de
 * carretera no es un domicilio con número. Antes eso dejaba a esa sucursal sin
 * mapa, que es lo peor de las tres opciones. Un mapa de la ciudad sí sitúa a
 * quien no conoce la zona, y el enlace de "Cómo llegar" sigue llevando a la
 * dirección literal, que es la que sabe interpretar la app de mapas.
 *
 * Devuelve también `exacta` para poder decir en pantalla cuál de las dos es —
 * enseñar el centro de una ciudad como si fuera el patio sería mentir.
 */
async function geocodificar(direccion) {
  const exacto = await preguntar(direccion);
  if (exacto) return { ...exacto, exacta: true };

  // Se queda con lo que va después del último número: normalmente la ciudad.
  const partes = direccion.split(',').map(s => s.trim()).filter(Boolean);
  const ciudad = partes.slice(-2).join(', ');
  await esperar(1100);
  const aprox = await preguntar(`${ciudad}, México`);
  if (aprox) return { ...aprox, exacta: false };

  throw new Error('ni la dirección ni la ciudad aparecen en el mapa');
}

/* ── Dibujo ── */

/** Pega un cuadro del mapa dentro del lienzo grande. */
function pegar(lienzo, anchoLienzo, tile, dx, dy) {
  for (let y = 0; y < tile.alto; y++) {
    const destinoY = dy + y;
    if (destinoY < 0) continue;
    for (let x = 0; x < tile.ancho; x++) {
      const destinoX = dx + x;
      if (destinoX < 0 || destinoX >= anchoLienzo) continue;
      const o = (destinoY * anchoLienzo + destinoX) * 4;
      if (o + 3 >= lienzo.length) continue;
      const s = (y * tile.ancho + x) * 4;
      lienzo[o] = tile.px[s]; lienzo[o+1] = tile.px[s+1];
      lienzo[o+2] = tile.px[s+2]; lienzo[o+3] = 255;
    }
  }
}

/** El pin, dibujado a mano: círculo con cola y punto blanco al centro. */
function pin(px, ancho, alto, cx, cy) {
  const ROJO = [0xD3, 0x2F, 0x2F];
  const R = 15;

  // Sombra difusa bajo el pin, para que no parezca pegado.
  for (let y = cy + 20; y < cy + 30; y++) {
    for (let x = cx - 16; x < cx + 16; x++) {
      if (x < 0 || y < 0 || x >= ancho || y >= alto) continue;
      const d = Math.hypot((x - cx) / 16, (y - (cy + 25)) / 5);
      if (d > 1) continue;
      const o = (y * ancho + x) * 4;
      const k = 0.28 * (1 - d);
      px[o] = Math.round(px[o] * (1 - k));
      px[o+1] = Math.round(px[o+1] * (1 - k));
      px[o+2] = Math.round(px[o+2] * (1 - k));
    }
  }

  for (let y = cy - R - 6; y <= cy + 26; y++) {
    for (let x = cx - R - 6; x <= cx + R + 6; x++) {
      if (x < 0 || y < 0 || x >= ancho || y >= alto) continue;
      const dx = x - cx, dy = y - cy;

      const enCabeza = dx * dx + dy * dy <= R * R;
      /* La cola: un triángulo que se estrecha hacia abajo. Se calcula en vez
         de dibujarse punto por punto para que el borde quede limpio. */
      const enCola = dy > 0 && dy <= 26 && Math.abs(dx) <= R * (1 - dy / 27);

      if (!enCabeza && !enCola) continue;
      const o = (y * ancho + x) * 4;

      // Borde blanco: sobre un mapa claro, el rojo solo se pierde.
      const borde = (enCabeza && dx * dx + dy * dy > (R - 3) * (R - 3)) ||
                    (enCola && Math.abs(dx) > R * (1 - dy / 27) - 2.2);
      if (borde) { px[o] = 255; px[o+1] = 255; px[o+2] = 255; px[o+3] = 255; continue }

      // El punto blanco del centro.
      if (dx * dx + (dy + 2) * (dy + 2) <= 25) {
        px[o] = 255; px[o+1] = 255; px[o+2] = 255; px[o+3] = 255; continue;
      }
      px[o] = ROJO[0]; px[o+1] = ROJO[1]; px[o+2] = ROJO[2]; px[o+3] = 255;
    }
  }
}

/** La atribución, en letras de 3×5 pixeles. Obligatoria y va dentro del mapa. */
const LETRAS = {
  A:['010','101','111','101','101'], B:['110','101','110','101','110'], C:['011','100','100','100','011'],
  D:['110','101','101','101','110'], E:['111','100','110','100','111'], G:['011','100','101','101','011'],
  H:['101','101','111','101','101'], I:['111','010','010','010','111'], K:['101','101','110','101','101'],
  L:['100','100','100','100','111'], M:['101','111','111','101','101'], N:['101','111','111','111','101'],
  O:['010','101','101','101','010'], P:['110','101','110','100','100'], R:['110','101','110','101','101'],
  S:['011','100','010','001','110'], T:['111','010','010','010','010'], U:['101','101','101','101','010'],
  W:['101','101','111','111','101'], Y:['101','101','010','010','010'], '©':['011','100','100','100','011'],
  ' ':['000','000','000','000','000'], '.':['000','000','000','000','010'],
};

function texto(px, ancho, alto, cadena, x0, y0, escala) {
  let x = x0;
  for (const ch of cadena.toUpperCase()) {
    const g = LETRAS[ch];
    if (!g) { x += 4 * escala; continue }
    g.forEach((fila, fy) => {
      fila.split('').forEach((bit, fx) => {
        if (bit !== '1') return;
        for (let dy = 0; dy < escala; dy++) {
          for (let dx = 0; dx < escala; dx++) {
            const px_ = x + fx * escala + dx, py = y0 + fy * escala + dy;
            if (px_ < 0 || py < 0 || px_ >= ancho || py >= alto) continue;
            const o = (py * ancho + px_) * 4;
            px[o] = 60; px[o+1] = 60; px[o+2] = 60; px[o+3] = 255;
          }
        }
      });
    });
    x += 4 * escala;
  }
}

/* ── Programa ── */

(async () => {
  const catalogo = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/catalogo.json'), 'utf8'));
  const sucursales = catalogo.sucursales || [];
  if (!sucursales.length) { console.log('No hay sucursales que dibujar.'); return }

  /* Las coordenadas se guardan. Volver a preguntarle a Nominatim en cada
     compilación sería abusar de un servicio gratuito para averiguar algo que
     no cambia — y dejaría la compilación dependiendo de que su servidor esté
     en pie. */
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')) } catch { /* primera vez */ }

  fs.mkdirSync(SALIDA, { recursive: true });
  let nuevos = 0;

  for (const [i, b] of sucursales.entries()) {
    const nombre = `mapa-${i}.png`;
    const destino = path.join(SALIDA, nombre);

    if (!cache[b.address]) {
      if (nuevos) await esperar(1100);   // Nominatim pide máximo uno por segundo
      try {
        cache[b.address] = await geocodificar(b.address);
        nuevos++;
        console.log(`  geocodificada: ${b.name}`);
      } catch (e) {
        console.log(`  ✗ ${b.name}: ${e.message} — se conserva el mapa anterior si lo hay`);
        continue;
      }
    }

    const { lat, lon } = cache[b.address];
    const tx = aTileX(lon, ZOOM), ty = aTileY(lat, ZOOM);
    const centroX = Math.floor(tx), centroY = Math.floor(ty);

    const anchoLienzo = COLS * TILE, altoLienzo = FILAS * TILE;
    const lienzo = Buffer.alloc(anchoLienzo * altoLienzo * 4, 0xEE);

    for (let cx = 0; cx < COLS; cx++) {
      for (let cy = 0; cy < FILAS; cy++) {
        const X = centroX + cx - 1, Y = centroY + cy - 1;
        const url = `https://tile.openstreetmap.org/${ZOOM}/${X}/${Y}.png`;
        const r = await fetch(url, { headers: { 'User-Agent': AGENTE } });
        if (!r.ok) continue;
        const tile = decodificar(Buffer.from(await r.arrayBuffer()));
        pegar(lienzo, anchoLienzo, tile, cx * TILE, cy * TILE);
        await esperar(120);
      }
    }

    /* Dónde cae la dirección exacta dentro del lienzo: la parte decimal de la
       coordenada del cuadro dice en qué punto de él está. */
    const puntoX = (tx - (centroX - 1)) * TILE;
    const puntoY = (ty - (centroY - 1)) * TILE;

    // Recorte centrado en la dirección, no en el cuadro.
    const x0 = Math.max(0, Math.min(anchoLienzo - ANCHO, Math.round(puntoX - ANCHO / 2)));
    const y0 = Math.max(0, Math.min(altoLienzo - ALTO, Math.round(puntoY - ALTO / 2)));

    const final = Buffer.alloc(ANCHO * ALTO * 4);
    for (let y = 0; y < ALTO; y++) {
      lienzo.copy(final, y * ANCHO * 4,
        ((y0 + y) * anchoLienzo + x0) * 4,
        ((y0 + y) * anchoLienzo + x0 + ANCHO) * 4);
    }

    pin(final, ANCHO, ALTO, Math.round(puntoX - x0), Math.round(puntoY - y0));
    texto(final, ANCHO, ALTO, '© OPENSTREETMAP', 8, ALTO - 12, 1);

    fs.writeFileSync(destino, codificarPaleta(ANCHO, ALTO, final));
    /* Se anota qué archivo le tocó y si el punto es exacto. Lo lee build.js
       para que la página sepa cuál enseñar sin adivinar por posición: si
       mañana se reordenan las sucursales, los mapas siguen cuadrando. */
    cache[b.address].archivo = '/assets/img/' + nombre;
    console.log(`  ${nombre} — ${b.name} (${(fs.statSync(destino).size / 1024).toFixed(0)} kB)`);
  }

  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2) + '\n', 'utf8');
  console.log(`\n${sucursales.length} mapas en assets/img/ · coordenadas guardadas en data/coordenadas.json\n`);
})();
