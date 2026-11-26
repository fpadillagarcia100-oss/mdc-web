/**
 * entorno.js — Lee la configuración del archivo .env.
 *
 * Existe porque varias herramientas necesitaban lo mismo y cada una traía su
 * copia. Tres copias de ocho líneas no duelen hasta que una se corrige y las
 * otras dos no: entonces el build lee el .env, las pruebas no, y nadie
 * entiende por qué una funciona y la otra no.
 *
 * En Cloudflare no hace nada: allá las variables ya vienen en el entorno.
 * Sirve para que en tu máquina no tengas que escribirlas en cada comando.
 */
'use strict';

const fs = require('fs');
const path = require('path');

/** Carga .env en process.env. Lo que ya esté definido en el entorno manda. */
function cargarEnv(raiz = path.join(__dirname, '..')) {
  const archivo = path.join(raiz, '.env');
  if (!fs.existsSync(archivo)) return;

  for (const linea of fs.readFileSync(archivo, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    // El entorno real gana sobre el archivo: así se puede compilar contra otro
    // servidor sin editar nada, con API_URL=... npm run build.
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

/**
 * La dirección pública del servidor (servidor/Mdc.Api), ya validada.
 *
 * No es un secreto: viaja en catalogo-datos.js a cada visitante, porque su
 * navegador la necesita para mandar una cotización. Lo que la protege no es
 * esconderla, es que sin sesión la API sólo sabe recibir cotizaciones,
 * preguntas y vistas.
 *
 * @returns {{url: string} | null} null si no está configurada.
 * @throws si no es https (o http://localhost, para desarrollo): una API en
 *         http plano mandaría las contraseñas del panel en claro.
 */
function servidor() {
  cargarEnv();
  const url = (process.env.API_URL || '').trim().replace(/\/+$/, '');
  if (!url) return null;

  if (!/^https:\/\/[^/]+$/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
    throw new Error(
      `API_URL debe ser https://dominio, sin ruta (o http://localhost para desarrollo). Vale: ${url}`
    );
  }
  return { url };
}

module.exports = { cargarEnv, servidor };
