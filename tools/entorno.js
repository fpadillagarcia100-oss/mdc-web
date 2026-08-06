/**
 * entorno.js — Lee las credenciales del archivo .env.
 *
 * Existe porque tres herramientas necesitaban lo mismo y cada una traía su
 * copia. Tres copias de ocho líneas no duelen hasta que una se corrige y las
 * otras dos no: entonces el build lee el .env, las pruebas no, y nadie
 * entiende por qué una funciona y la otra no.
 *
 * En Netlify no hace nada: allá las variables ya vienen en el entorno. Sirve
 * para que en tu máquina no tengas que escribirlas en cada comando.
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
    // El entorno real gana sobre el archivo: así se puede probar contra otra
    // base sin editar nada, con SUPABASE_URL=... npm run build.
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

/**
 * Devuelve las credenciales de Supabase, ya validadas.
 *
 * @returns {{url: string, llave: string} | null} null si no hay credenciales.
 * @throws si la llave es de servicio — ésa se salta todo el RLS y no debe
 *         acabar ni en el navegador ni en un archivo generado.
 */
function credenciales() {
  cargarEnv();
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const llave = process.env.SUPABASE_ANON_KEY || '';

  if (!url || !llave) return null;

  if (llave.includes('service_role') || llave.startsWith('sb_secret_')) {
    throw new Error(
      'SUPABASE_ANON_KEY contiene una llave de SERVICIO. Esa llave ignora todas ' +
      'las políticas de seguridad. Usa la pública (anon / sb_publishable_…).'
    );
  }
  return { url, llave };
}

module.exports = { cargarEnv, credenciales };
