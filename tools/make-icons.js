/**
 * make-icons.js — Genera los iconos PNG de la aplicación instalable.
 *
 * Se corre con:  npm run icons
 *
 * ¿Por qué escribir un PNG a mano en lugar de usar una librería? Porque el
 * proyecto no tiene ninguna de imagen, y meter una dependencia con árbol
 * propio para dibujar tres cuadrados amarillos sale peor que estas ochenta
 * líneas: `zlib` viene con Node y el formato PNG, para un color por pixel sin
 * transparencia progresiva, es sencillo de verdad.
 *
 * Un PNG es: firma, cabecera (IHDR), datos comprimidos (IDAT) y fin (IEND).
 * Cada bloque lleva su longitud, su tipo, su contenido y un CRC32. Los datos
 * son las filas de pixeles, cada una precedida de un byte que dice qué filtro
 * usa; aquí siempre 0 —"sin filtro"—, que comprime peor pero se lee de un
 * vistazo.
 *
 * El icono es la marca: fondo oscuro como el encabezado del sitio, las letras
 * MDC en amarillo y una franja de obra abajo.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SALIDA = path.join(__dirname, '..', 'assets', 'img');

/* ── PNG ────────────────────────────────────────────────────────────────── */

const TABLA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function bloque(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

/** rgba: Buffer de ancho*alto*4 bytes. */
function png(ancho, alto, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;    // 8 bits por canal
  ihdr[9] = 6;    // color tipo 6: RGBA
  // ihdr[10..12] quedan en 0: compresión, filtro e interlazado estándar

  const bruto = Buffer.alloc(alto * (1 + ancho * 4));
  for (let y = 0; y < alto; y++) {
    const destino = y * (1 + ancho * 4);
    bruto[destino] = 0;   // filtro "ninguno" para esta fila
    rgba.copy(bruto, destino + 1, y * ancho * 4, (y + 1) * ancho * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    bloque('IHDR', ihdr),
    bloque('IDAT', zlib.deflateSync(bruto, { level: 9 })),
    bloque('IEND', Buffer.alloc(0)),
  ]);
}

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
