/**
 * png.js — Leer y escribir PNG sin dependencias.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 *
 * Estaba en dos sitios: el codificador dentro de make-icons.js y el
 * decodificador dentro de tests/lib/png.js. Al necesitar los dos juntos para
 * armar los mapas de las sucursales, se juntan aquí. Dos copias de un formato
 * binario es exactamente la clase de duplicado que acaba divergiendo en el
 * caso raro —una paleta, un canal alfa— y nadie sabe cuál de las dos arreglar.
 *
 * ¿Por qué a mano y no una librería? Porque `zlib` viene con Node y esto es
 * todo lo que hace falta: leer lo que sirve un servidor de mapas y escribir lo
 * que dibujamos nosotros. Una dependencia de imágenes trae su propio árbol
 * para hacer mil cosas más que no vamos a usar nunca.
 *
 * Un PNG es firma, cabecera (IHDR), datos comprimidos (IDAT) y fin (IEND).
 * Lo único con miga es el desfiltrado: las filas no se guardan tal cual, sino
 * como diferencias contra la de arriba o la de la izquierda, porque comprimen
 * mucho mejor. Para leerlas hay que deshacerlo.
 */
'use strict';

const zlib = require('zlib');

/* ── ESCRIBIR ─────────────────────────────────────────────────────────────── */

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

/** Aplica un filtro fijo a toda la imagen y devuelve el flujo listo para comprimir. */
function conFiltro(tipo, ancho, alto, rgba) {
  const bpp = 4, anchoFila = ancho * bpp;
  const bruto = Buffer.alloc(alto * (1 + anchoFila));
  let previa = Buffer.alloc(anchoFila);

  for (let y = 0; y < alto; y++) {
    const fila = rgba.subarray(y * anchoFila, (y + 1) * anchoFila);
    const destino = y * (1 + anchoFila);
    bruto[destino] = tipo;
    for (let x = 0; x < anchoFila; x++) {
      const a = x >= bpp ? fila[x - bpp] : 0;
      const b = previa[x];
      const c = x >= bpp ? previa[x - bpp] : 0;
      let v;
      switch (tipo) {
        case 0: v = fila[x]; break;
        case 1: v = fila[x] - a; break;
        case 2: v = fila[x] - b; break;
        case 3: v = fila[x] - ((a + b) >> 1); break;
        default: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = fila[x] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        }
      }
      bruto[destino + 1 + x] = v & 0xFF;
    }
    previa = fila;
  }
  return bruto;
}

function codificar(ancho, alto, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;   // bits por canal
  ihdr[9] = 6;   // RGBA

  /* Se prueban los cinco filtros de verdad y se queda el que MENOS ocupa una
     vez comprimido.

     El primer intento eligió filtro por fila con la heurística que recomienda
     la especificación —la suma de valores absolutos— y salió PEOR: 170 kB
     pasaron a 319. En un mapa hay superficies enormes del mismo color, y ahí
     la tirada de bytes idénticos que ve el compresor vale más que la
     diferencia pequeña que busca la heurística. Cambiar de filtro cada fila
     rompía esas tiradas.

     Cinco compresiones de una imagen de este tamaño son milisegundos, y esto
     no corre en el navegador de nadie: corre una vez, aquí, al compilar. Medir
     sale más barato que acertar. */
  let bruto = null, mejor = Infinity;
  for (let tipo = 0; tipo <= 4; tipo++) {
    const intento = zlib.deflateSync(conFiltro(tipo, ancho, alto, rgba), { level: 9 });
    if (intento.length < mejor) { mejor = intento.length; bruto = intento }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    bloque('IHDR', ihdr),
    bloque('IDAT', bruto),
    bloque('IEND', Buffer.alloc(0)),
  ]);
}

/* ── PALETA ───────────────────────────────────────────────────────────────── */

/**
 * Reduce la imagen a 256 colores y la escribe con paleta.
 *
 * Un mapa es el caso perfecto: verdes de parque, grises de calle, blanco de
 * edificio. Guardarlo con cuatro bytes por pixel es pagar por una precisión
 * que no hay. Con paleta, cada pixel es UN byte —el número de color— y la
 * lista de colores va aparte, una sola vez.
 *
 * El método es corte por la mediana: se mete todo en una caja, se parte por el
 * canal donde más se estiran los colores, y se repite con las mitades hasta
 * tener 256 cajas. El color de cada caja es el promedio de lo que cayó dentro.
 * Divide donde hay variedad y no donde no la hay, que es justo lo que se
 * quiere: un mapa con mucho verde y poco rojo gasta sus cajas en los verdes.
 *
 * Es CON pérdida, a diferencia de todo lo demás de este archivo. En una
 * fotografía se notaría; en un mapa de calles no, y ahorra tres cuartas partes
 * del peso. Por eso hay que pedirlo a propósito y no es lo que se hace por
 * omisión.
 */
function codificarPaleta(ancho, alto, rgba) {
  const total = ancho * alto;

  // Una caja: los colores que contiene y sus límites por canal.
  const caja = indices => {
    let rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0;
    for (const i of indices) {
      const o = i * 4;
      if (rgba[o] < rmin) rmin = rgba[o];       if (rgba[o] > rmax) rmax = rgba[o];
      if (rgba[o+1] < gmin) gmin = rgba[o+1];   if (rgba[o+1] > gmax) gmax = rgba[o+1];
      if (rgba[o+2] < bmin) bmin = rgba[o+2];   if (rgba[o+2] > bmax) bmax = rgba[o+2];
    }
    return { indices, r: rmax - rmin, g: gmax - gmin, b: bmax - bmin };
  };

  let cajas = [caja(Array.from({ length: total }, (_, i) => i))];

  while (cajas.length < 256) {
    // Se parte la caja donde los colores estén más estirados. Partir una donde
    // ya son casi iguales gastaría un color de la paleta en nada.
    let peor = -1, mejorRango = 0;
    cajas.forEach((c, i) => {
      const rango = Math.max(c.r, c.g, c.b);
      if (rango > mejorRango && c.indices.length > 1) { mejorRango = rango; peor = i }
    });
    if (peor < 0) break;

    const c = cajas[peor];
    const canal = c.r >= c.g && c.r >= c.b ? 0 : c.g >= c.b ? 1 : 2;
    const orden = [...c.indices].sort((x, y) => rgba[x * 4 + canal] - rgba[y * 4 + canal]);
    const mitad = orden.length >> 1;
    cajas.splice(peor, 1, caja(orden.slice(0, mitad)), caja(orden.slice(mitad)));
  }

  // El color de cada caja: el promedio de lo que hay dentro.
  const paleta = cajas.map(c => {
    let r = 0, g = 0, b = 0;
    for (const i of c.indices) { r += rgba[i*4]; g += rgba[i*4+1]; b += rgba[i*4+2] }
    const n = c.indices.length || 1;
    return [Math.round(r/n), Math.round(g/n), Math.round(b/n)];
  });

  const indice = new Uint8Array(total);
  cajas.forEach((c, n) => { for (const i of c.indices) indice[i] = n });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;   // con paleta

  const plte = Buffer.alloc(paleta.length * 3);
  paleta.forEach((c, i) => { plte[i*3] = c[0]; plte[i*3+1] = c[1]; plte[i*3+2] = c[2] });

  /* Con un byte por pixel, el filtro que gana casi siempre es "ninguno": los
     índices no tienen relación numérica entre sí —el color 7 no se parece al
     8— así que restarlos no acerca nada. Se prueban igual los cinco, que es
     más barato que suponerlo. */
  let mejor = Infinity, datos = null;
  for (let tipo = 0; tipo <= 4; tipo++) {
    const bruto = Buffer.alloc(alto * (1 + ancho));
    let previa = new Uint8Array(ancho);
    for (let y = 0; y < alto; y++) {
      const destino = y * (1 + ancho);
      bruto[destino] = tipo;
      for (let x = 0; x < ancho; x++) {
        const v = indice[y * ancho + x];
        const a = x >= 1 ? indice[y * ancho + x - 1] : 0;
        const b = previa[x];
        const c2 = x >= 1 ? previa[x - 1] : 0;
        let s;
        switch (tipo) {
          case 0: s = v; break;
          case 1: s = v - a; break;
          case 2: s = v - b; break;
          case 3: s = v - ((a + b) >> 1); break;
          default: {
            const p = a + b - c2;
            const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c2);
            s = v - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c2);
          }
        }
        bruto[destino + 1 + x] = s & 0xFF;
      }
      previa = indice.subarray(y * ancho, (y + 1) * ancho);
    }
    const comprimido = zlib.deflateSync(bruto, { level: 9 });
    if (comprimido.length < mejor) { mejor = comprimido.length; datos = comprimido }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    bloque('IHDR', ihdr),
    bloque('PLTE', plte),
    bloque('IDAT', datos),
    bloque('IEND', Buffer.alloc(0)),
  ]);
}

/* ── LEER ─────────────────────────────────────────────────────────────────── */

const CANALES = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Decodifica un PNG a {ancho, alto, px} con px en RGBA de 8 bits.
 *
 * Soporta los cuatro tipos que aparecen en la práctica, PALETA INCLUIDA: los
 * servidores de mapas sirven casi todo en paleta porque un mapa tiene pocos
 * colores y así pesa la mitad. La primera versión sólo leía color directo y
 * rechazaba justo lo que veníamos a leer.
 */
function decodificar(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504E47) throw new Error('No es un PNG');

  let ancho = 0, alto = 0, bits = 0, tipo = 0, canales = 0;
  let paleta = null, transp = null;
  const trozos = [];

  let i = 8;
  while (i < buffer.length) {
    const largo = buffer.readUInt32BE(i);
    const nombre = buffer.toString('ascii', i + 4, i + 8);
    const datos = buffer.subarray(i + 8, i + 8 + largo);

    if (nombre === 'IHDR') {
      ancho = datos.readUInt32BE(0);
      alto = datos.readUInt32BE(4);
      bits = datos[8];
      tipo = datos[9];
      canales = CANALES[tipo];
      if (bits !== 8 || datos[12] !== 0) {
        throw new Error(`PNG no soportado (bits ${bits}, entrelazado ${datos[12]})`);
      }
    } else if (nombre === 'PLTE') { paleta = Buffer.from(datos) }
    else if (nombre === 'tRNS') { transp = Buffer.from(datos) }
    else if (nombre === 'IDAT') { trozos.push(datos) }
    else if (nombre === 'IEND') break;

    i += 12 + largo;
  }

  if (tipo === 3 && !paleta) throw new Error('PNG con paleta pero sin PLTE');

  const bruto = zlib.inflateSync(Buffer.concat(trozos));
  const bpp = canales;
  const anchoFila = ancho * bpp;
  const salida = Buffer.alloc(ancho * alto * 4);
  let previa = Buffer.alloc(anchoFila);

  for (let y = 0; y < alto; y++) {
    const desde = y * (anchoFila + 1);
    const filtro = bruto[desde];
    const fila = Buffer.from(bruto.subarray(desde + 1, desde + 1 + anchoFila));

    for (let x = 0; x < anchoFila; x++) {
      const a = x >= bpp ? fila[x - bpp] : 0;
      const b = previa[x];
      const c = x >= bpp ? previa[x - bpp] : 0;
      switch (filtro) {
        case 0: break;
        case 1: fila[x] = (fila[x] + a) & 0xFF; break;
        case 2: fila[x] = (fila[x] + b) & 0xFF; break;
        case 3: fila[x] = (fila[x] + ((a + b) >> 1)) & 0xFF; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          fila[x] = (fila[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xFF;
          break;
        }
        default: throw new Error(`Filtro PNG desconocido: ${filtro}`);
      }
    }

    for (let x = 0; x < ancho; x++) {
      const o = (y * ancho + x) * 4;
      const s = x * bpp;
      if (tipo === 6) { salida[o] = fila[s]; salida[o+1] = fila[s+1]; salida[o+2] = fila[s+2]; salida[o+3] = fila[s+3] }
      else if (tipo === 2) { salida[o] = fila[s]; salida[o+1] = fila[s+1]; salida[o+2] = fila[s+2]; salida[o+3] = 255 }
      else if (tipo === 4) { salida[o] = salida[o+1] = salida[o+2] = fila[s]; salida[o+3] = fila[s+1] }
      else if (tipo === 3) {
        const idx = fila[s] * 3;
        salida[o] = paleta[idx]; salida[o+1] = paleta[idx+1]; salida[o+2] = paleta[idx+2];
        salida[o+3] = transp && fila[s] < transp.length ? transp[fila[s]] : 255;
      } else { salida[o] = salida[o+1] = salida[o+2] = fila[s]; salida[o+3] = 255 }
    }

    previa = fila;
  }

  return { ancho, alto, px: salida };
}

/* ── COMPARAR ─────────────────────────────────────────────────────────────── */

/**
 * Qué fracción de pixeles cambió entre dos PNG.
 *
 * `umbral` es cuánto puede moverse un canal sin contar. No es pereza: el
 * antialias de una tipografía varía un punto entre ejecuciones de la misma
 * versión del navegador, y sin margen toda captura con texto sería una
 * regresión falsa cada vez.
 */
function comparar(bufA, bufB, umbral = 12) {
  const a = decodificar(bufA), b = decodificar(bufB);
  if (a.ancho !== b.ancho || a.alto !== b.alto) {
    return { distintos: -1, total: 0, fraccion: 1,
             motivo: `cambió el tamaño: ${a.ancho}×${a.alto} → ${b.ancho}×${b.alto}` };
  }
  let distintos = 0;
  const total = a.ancho * a.alto;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (Math.abs(a.px[o] - b.px[o]) > umbral ||
        Math.abs(a.px[o+1] - b.px[o+1]) > umbral ||
        Math.abs(a.px[o+2] - b.px[o+2]) > umbral) distintos++;
  }
  return { distintos, total, fraccion: distintos / total, motivo: null };
}

module.exports = { codificar, codificarPaleta, decodificar, comparar };
