/**
 * sw.js — El trabajador de servicio: hace que el catálogo funcione sin señal.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 *
 * Para qué. Los equipos se venden en obra, y en obra la señal va y viene. Un
 * vendedor enseñando una excavadora en la sierra no puede quedarse mirando una
 * pantalla en blanco. Con esto, todo lo que ya visitó una vez sigue disponible
 * — fichas, fotos, precios — aunque el teléfono no tenga datos.
 *
 * Va en la raíz a propósito: un trabajador de servicio sólo manda sobre las
 * direcciones que cuelgan de su propia carpeta, y desde /assets/js/ no podría
 * atender la portada ni las fichas.
 *
 * ── Por qué cada cosa se guarda como se guarda ──
 *
 * El código (HTML, CSS, JS) va a la RED PRIMERO. Los archivos no llevan
 * versión en el nombre —es styles.css, no styles.a1b2.css—, así que servir el
 * del caché por costumbre significaría que un despliegue tarda días en llegar
 * a quien ya entró. El caché es aquí la red de seguridad, no el camino normal.
 * Es la misma decisión que ya tomaba _headers con must-revalidate.
 *
 * Las FOTOS van al CACHÉ PRIMERO. Pesan, y no cambian: cuando cambia la foto
 * de un equipo, cambia también su nombre de archivo. Bajarlas una vez y no
 * volver a preguntar es exactamente lo correcto, y es lo que hace que el
 * catálogo se vea instantáneo en la segunda visita.
 */
'use strict';

/* La versión del caché. `empaquetar.js` la reemplaza en cada compilación por
   el hash del código publicado, así que cada despliegue estrena cachés nuevos
   y el `activate` borra los del anterior.

   Estaba fija en 'mdc-v1' y eso era un error con consecuencias reales: al no
   cambiar nunca, un archivo guardado hace semanas podía seguir sirviéndose
   —basta que la red tarde más de cinco segundos una vez— y el visitante veía
   una mezcla de código nuevo con estilos viejos. Eso no se depura: se ve
   "roto" sin ningún error en la consola.

   El literal de abajo es el de desarrollo; en producción nunca sobrevive. */
const VERSION = 'mdc-dev';
const CODIGO = `${VERSION}-codigo`;
const FOTOS  = `${VERSION}-fotos`;

/* Cuántas fotos se conservan. Un catálogo de maquinaria son fotos grandes, y
   el navegador desaloja el sitio ENTERO cuando se pasa de su cuota —no borra
   lo más viejo, borra todo—. Mejor podarlo aquí, con criterio. */
const TOPE_FOTOS = 120;

/* Lo mínimo para que la portada abra sin red desde el primer momento. Se pide
   una por una y los fallos se ignoran: con cache.addAll, un solo archivo que
   falte aborta la instalación entera y el trabajador nunca llega a activarse
   — se pierde el offline completo por un archivo secundario. */
const BASE = [
  '/',
  '/assets/css/styles.css',
  '/assets/js/catalogo-datos.js',
  '/assets/js/config.js',
  '/assets/js/utils.js',
  '/assets/js/state.js',
  '/assets/js/catalog.js',
  '/assets/js/ui.js',
  '/assets/js/main.js',
];

self.addEventListener('install', evento =>{
  evento.waitUntil((async ()=>{
    const cache = await caches.open(CODIGO);
    await Promise.all(BASE.map(u => cache.add(u).catch(()=>{})));
    self.skipWaiting();               // la versión nueva no espera a que cierren las pestañas
  })());
});

self.addEventListener('activate', evento =>{
  evento.waitUntil((async ()=>{
    // Fuera los cachés de versiones anteriores: si no, cada despliegue deja
    // un juego completo de archivos viejos ocupando la cuota para siempre.
    const nombres = await caches.keys();
    await Promise.all(nombres.filter(n => !n.startsWith(VERSION)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

/** Recorta el caché de fotos por orden de llegada. */
async function podar(cache, tope){
  const llaves = await cache.keys();
  if(llaves.length <= tope) return;
  await Promise.all(llaves.slice(0, llaves.length - tope).map(k => cache.delete(k)));
}

/** Red con plazo. Sin esto, "sin señal" es esperar hasta que el sistema se rinda. */
function conPlazo(peticion, ms){
  return new Promise((resolver, rechazar)=>{
    const reloj = setTimeout(()=> rechazar(new Error('plazo agotado')), ms);
    fetch(peticion).then(r =>{ clearTimeout(reloj); resolver(r) },
                         e =>{ clearTimeout(reloj); rechazar(e) });
  });
}

const PAGINA_SIN_RED = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sin conexión · MDC</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#1A1A1A;color:#eee;font-family:system-ui,sans-serif;text-align:center;padding:24px}
h1{font-size:20px;margin:0 0 10px}p{color:#aaa;font-size:14px;line-height:1.6;max-width:32ch;margin:0 auto}
b{color:#F5C400}</style></head><body><div>
<h1>Sin conexión</h1>
<p>Esta página todavía no se había abierto en este teléfono, así que no está guardada.
<b>Lo que ya visitaste sigue disponible.</b></p>
</div></body></html>`;

self.addEventListener('fetch', evento =>{
  const peticion = evento.request;

  // Sólo lecturas. Una cotización que se manda NO se toca aquí: de eso se
  // encarga la cola de backend.js, que sabe cuándo reintentar sin duplicar.
  if(peticion.method !== 'GET') return;
  if(!peticion.url.startsWith('http')) return;

  const url = new URL(peticion.url);
  const propio = url.origin === self.location.origin;

  /* ── Páginas ── */
  if(peticion.mode === 'navigate'){
    evento.respondWith((async ()=>{
      try{
        const red = await conPlazo(peticion, 5000);
        const cache = await caches.open(CODIGO);
        cache.put(peticion, red.clone());
        return red;
      }catch{
        return (await caches.match(peticion))
            || (await caches.match('/'))
            || new Response(PAGINA_SIN_RED, {headers:{'Content-Type':'text/html; charset=utf-8'}});
      }
    })());
    return;
  }

  /* ── Fotos: primero el caché ── */
  if(peticion.destination === 'image'){
    evento.respondWith((async ()=>{
      const cache = await caches.open(FOTOS);
      const guardada = await cache.match(peticion);
      if(guardada) return guardada;
      try{
        const red = await fetch(peticion);
        /* `opaque` son las fotos de Supabase: al venir de otro dominio no se
           puede leer ni su estado, pero sí guardarlas y volver a servirlas. */
        if(red.status === 200 || red.type === 'opaque'){
          await cache.put(peticion, red.clone());
          podar(cache, TOPE_FOTOS);          // sin await: no retrasa la respuesta
        }
        return red;
      }catch{
        return Response.error();
      }
    })());
    return;
  }

  /* ── Código propio: primero la red ── */
  if(propio){
    evento.respondWith((async ()=>{
      try{
        const red = await conPlazo(peticion, 5000);
        if(red.ok){
          const cache = await caches.open(CODIGO);
          cache.put(peticion, red.clone());
        }
        return red;
      }catch{
        const guardada = await caches.match(peticion);
        if(guardada) return guardada;
        throw new Error('sin red y sin copia');
      }
    })());
  }

  // Todo lo demás —la API de Supabase, las tipografías— pasa de largo.
});
