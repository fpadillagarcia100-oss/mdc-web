/**
 * png.js — Lee un PNG y compara dos.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 *
 * Existe para que las pruebas visuales detecten REGRESIONES, no sólo para
 * guardar capturas bonitas. Una captura que nadie compara con nada no prueba
 * absolutamente nada: la miras el día que la generas y no vuelves a abrirla.
 *
 * Se escribe a mano por lo mismo que make-icons.js: `zlib` viene con Node y el
 * PNG que produce un navegador —8 bits por canal, sin entrelazar— se
 * descomprime en sesenta líneas. Meter una dependencia con árbol propio para
 * esto sale más caro de mantener que esto.
 *
 * Lo único con miga es el desfiltrado. Un PNG no guarda los pixeles tal cual:
 * cada fila elige uno de cinco filtros que la expresan como diferencia contra
 * su vecina de arriba o de la izquierda, porque las diferencias comprimen
 * mucho mejor que los valores absolutos. Para leerla hay que deshacerlo.
 */
'use strict';

const zlib = require('zlib');

/** Cuántos bytes ocupa un pixel según el tipo de color del PNG. */
const CANALES = { 0:1, 2:3, 3:1, 4:2, 6:4 };

/**
 * Decodifica un PNG a {ancho, alto, px} donde px es RGBA de 8 bits.
 *
 * Sólo soporta lo que genera un navegador: 8 bits por canal, sin entrelazar y
 * sin paleta. Cualquier otra cosa lanza en vez de devolver algo torcido — un
 * comparador que se equivoca en silencio es peor que ninguno.
 */
function decodificar(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504E47) throw new Error('No es un PNG');

  let ancho = 0, alto = 0, canales = 0, bits = 0, tipo = 0;
  const trozos = [];

  let i = 8;
  while (i < buffer.length) {
    const largo = buffer.readUInt32BE(i);
    const nombre = buffer.toString('ascii', i + 4, i + 8);
    const datos = buffer.subarray(i + 8, i + 8 + largo);

    if (nombre === 'IHDR') {
      ancho = datos.readUInt32BE(0);
      alto  = datos.readUInt32BE(4);
      bits  = datos[8];
      tipo  = datos[9];
      canales = CANALES[tipo];
      if (bits !== 8 || tipo === 3 || datos[12] !== 0) {
        throw new Error(`PNG no soportado (bits ${bits}, tipo ${tipo}, entrelazado ${datos[12]})`);
      }
    } else if (nombre === 'IDAT') {
      trozos.push(datos);
    } else if (nombre === 'IEND') break;

    i += 12 + largo;   // 4 largo + 4 nombre + datos + 4 CRC
  }

  const bruto = zlib.inflateSync(Buffer.concat(trozos));
  const bpp = canales;                       // bytes por pixel (8 bits por canal)
  const anchoFila = ancho * bpp;
  const salida = Buffer.alloc(ancho * alto * 4);

  let previa = Buffer.alloc(anchoFila);      // la fila 0 se filtra contra ceros

  for (let y = 0; y < alto; y++) {
    const desde = y * (anchoFila + 1);
    const filtro = bruto[desde];
    const fila = Buffer.from(bruto.subarray(desde + 1, desde + 1 + anchoFila));

    for (let x = 0; x < anchoFila; x++) {
      const a = x >= bpp ? fila[x - bpp] : 0;      // izquierda
      const b = previa[x];                          // arriba
      const c = x >= bpp ? previa[x - bpp] : 0;     // arriba-izquierda

      switch (filtro) {
        case 0: break;                                            // ninguno
        case 1: fila[x] = (fila[x] + a) & 0xFF; break;            // Sub
        case 2: fila[x] = (fila[x] + b) & 0xFF; break;            // Up
        case 3: fila[x] = (fila[x] + ((a + b) >> 1)) & 0xFF; break;  // Average
        case 4: {                                                 // Paeth
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          fila[x] = (fila[x] + pred) & 0xFF;
          break;
        }
        default: throw new Error(`Filtro PNG desconocido: ${filtro}`);
      }
    }

    // A RGBA, sea cual sea el tipo de origen.
    for (let x = 0; x < ancho; x++) {
      const o = (y * ancho + x) * 4;
      const s = x * bpp;
      if (tipo === 6)      { salida[o]=fila[s]; salida[o+1]=fila[s+1]; salida[o+2]=fila[s+2]; salida[o+3]=fila[s+3] }
      else if (tipo === 2) { salida[o]=fila[s]; salida[o+1]=fila[s+1]; salida[o+2]=fila[s+2]; salida[o+3]=255 }
      else if (tipo === 4) { salida[o]=salida[o+1]=salida[o+2]=fila[s]; salida[o+3]=fila[s+1] }
      else                 { salida[o]=salida[o+1]=salida[o+2]=fila[s]; salida[o+3]=255 }
    }

    previa = fila;
  }

  return { ancho, alto, px: salida };
}

/**
 * Compara dos PNG y devuelve qué fracción de pixeles cambió.
 *
 * `umbral` es cuánto puede moverse un canal sin contar como cambio. No es
 * pereza: el antialias de una tipografía varía un punto entre ejecuciones de
 * la misma versión del navegador, y sin margen toda captura de texto sería una
 * regresión falsa cada vez.
 *
 * Devuelve {distintos, total, fraccion, motivo} — `motivo` sólo cuando ni
 * siquiera se pudieron comparar, como cuando cambió el tamaño.
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
    if (Math.abs(a.px[o]   - b.px[o])   > umbral ||
        Math.abs(a.px[o+1] - b.px[o+1]) > umbral ||
        Math.abs(a.px[o+2] - b.px[o+2]) > umbral) distintos++;
  }
  return { distintos, total, fraccion: distintos / total, motivo: null };
}

module.exports = { decodificar, comparar };
