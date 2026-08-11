/**
 * make-icons.js — Genera los iconos PNG de la aplicación instalable.
 *
 * Se corre con:  npm run icons
 *
 * El PNG lo escribe tools/png.js, sin dependencias: zlib viene con Node y el
 * formato, para lo que hace falta aquí, es sencillo de verdad.
 *
 * El icono es la marca: fondo oscuro como el encabezado del sitio, las letras
 * MDC en amarillo y una franja de obra abajo.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SALIDA = path.join(__dirname, '..', 'assets', 'img');

/* El PNG lo escribe tools/png.js, compartido con los mapas de las sucursales.
   Tener dos codificadores del mismo formato binario es garantizar que un dia
   discrepen en el caso raro y nadie sepa cual arreglar. */
const { codificar: png } = require('./png');

/* ── DIBUJO ─────────────────────────────────────────────────────────────── */

/* Las letras, en rejilla de 5×7. Un 1 es pixel encendido. Tres glifos bastan:
   no hace falta una tipografía entera para escribir MDC. */
const GLIFOS = {
  M: ['10001', '11011', '10101', '10001', '10001', '10001', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
};

const FONDO   = [0x1A, 0x1A, 0x1A, 0xFF];
const AMARILLO = [0xF5, 0xC4, 0x00, 0xFF];

/**
 * Dibuja el icono.
 *
 * `margen` es la fracción del lado que se deja libre alrededor. Para el icono
 * "maskable" tiene que ser generosa: Android recorta el icono con la forma que
 * tenga el sistema —círculo, gota, cuadrado redondeado— y todo lo que quede
 * fuera del 80% central se puede perder.
 */
function dibujar(lado, { redondeado = true, margen = 0.14 } = {}) {
  const px = Buffer.alloc(lado * lado * 4);
  const radio = redondeado ? Math.round(lado * 0.18) : 0;

  const pon = (x, y, c) => {
    const i = (y * lado + x) * 4;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3];
  };

  // Fondo, recortando las esquinas si toca.
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      if (radio) {
        const cx = x < radio ? radio : x > lado - radio ? lado - radio : x;
        const cy = y < radio ? radio : y > lado - radio ? lado - radio : y;
        if ((x - cx) ** 2 + (y - cy) ** 2 > radio * radio) continue;   // fuera: transparente
      }
      pon(x, y, FONDO);
    }
  }

  /* Las letras y la franja se centran como un solo bloque, no cada una por su
     lado: separadas, el hueco de abajo salía del doble que el de arriba y el
     icono se veía caído. */
  const texto = 'MDC';
  const cols = texto.length * 5 + (texto.length - 1);   // 5+1+5+1+5 = 17
  const util = lado * (1 - margen * 2);
  const escala = Math.max(1, Math.floor(Math.min(util / cols, util * 0.55 / 7)));

  const franjaAlto = Math.max(2, Math.round(lado * 0.05));
  const hueco = Math.round(lado * 0.10);
  const alto = 7 * escala + hueco + franjaAlto;

  const x0 = Math.round((lado - cols * escala) / 2);
  const y0 = Math.round((lado - alto) / 2);

  // Franja de obra bajo las letras, del mismo ancho que ellas.
  const franjaY = y0 + 7 * escala + hueco;
  for (let y = franjaY; y < franjaY + franjaAlto; y++) {
    for (let x = x0; x < x0 + cols * escala; x++) pon(x, y, AMARILLO);
  }

  texto.split('').forEach((letra, n) => {
    const g = GLIFOS[letra];
    const desplaza = n * 6 * escala;
    g.forEach((fila, fy) => {
      fila.split('').forEach((bit, fx) => {
        if (bit !== '1') return;
        for (let dy = 0; dy < escala; dy++) {
          for (let dx = 0; dx < escala; dx++) {
            pon(x0 + desplaza + fx * escala + dx, y0 + fy * escala + dy, AMARILLO);
          }
        }
      });
    });
  });

  return png(lado, lado, px);
}

/* ── SALIDA ─────────────────────────────────────────────────────────────── */

const iconos = [
  ['icon-192.png',          dibujar(192)],
  ['icon-512.png',          dibujar(512)],
  ['icon-180.png',          dibujar(180)],                                    // iOS
  ['icon-maskable.png',     dibujar(512, { redondeado: false, margen: 0.22 })],
];

fs.mkdirSync(SALIDA, { recursive: true });
for (const [nombre, datos] of iconos) {
  fs.writeFileSync(path.join(SALIDA, nombre), datos);
  console.log(`${nombre} — ${(datos.length / 1024).toFixed(1)} kB`);
}
console.log(`\n${iconos.length} iconos escritos en assets/img/`);
