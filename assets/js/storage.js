/**
 * storage.js — Persistencia en localStorage, con normalización de los datos que entran
 * (un respaldo importado puede traer cualquier cosa) y aviso si se agota el espacio.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 */
'use strict';

/* ══════════════════ ALMACENAMIENTO ══════════════════ */
const store = {
  read(key,fallback){ try{const v=localStorage.getItem(key);return v?JSON.parse(v):fallback}catch{return fallback} },
  write(key,value){
    try{ localStorage.setItem(key,JSON.stringify(value)); return true }
    catch(err){
      const full = err && (err.name==='QuotaExceededError' || err.code===22);
      showToast(full
        ? 'Sin espacio: las imágenes ocupan demasiado. Quita alguna foto o exporta un respaldo.'
        : 'No se pudo guardar en este navegador.', true);
      return false;
    }
  },
  usedBytes(){
    let n=0;
    try{ for(const k of Object.values(K)){ const v=localStorage.getItem(k); if(v) n+=v.length*2 } }catch{}
    return n;
  }
};

/* Una imagen sólo puede ser una foto incrustada o un archivo del propio sitio.
   Todo lo demás se descarta: una URL "javascript:" o de otro dominio en un
   respaldo importado sería código o rastreo ajeno corriendo en la página. */
const imgOk = s => typeof s==='string' &&
  (s.startsWith('data:image') || (s.startsWith('/') && !s.startsWith('//')));

/** Devuelve la galería de un equipo, acepte el formato nuevo (imgs) o el viejo (img). */
function normalizeImgs(p){
  const crudas = Array.isArray(p.imgs) ? p.imgs : (p.img ? [p.img] : []);
  return crudas.filter(imgOk).slice(0, MAX_FOTOS);
}

function normalizeProducts(list){
  if(!Array.isArray(list)) return DEFAULT_PRODUCTS.map(p=>({...p}));
  return list.filter(p=>p && typeof p==='object' && p.name).map((p,i)=>{
  const imgs = normalizeImgs(p);
  return {
    id: Number.isFinite(p.id) ? p.id : i+1,
    // Dirección de su página estática, generada por npm run build.
    slug: typeof p.slug==='string' && /^[a-z0-9-]+$/.test(p.slug) ? p.slug : null,
    name: String(p.name),
    brand: String(p.brand||'Sin marca'),
    cat: String(p.cat||'General'),
    cond: CONDS.includes(p.cond) ? p.cond : 'Nuevo',
    price: Number(p.price)||0,
    original: Number(p.original)||null,
    finance: p.finance || null,
    leasing: !!p.leasing,
    shipping: !!p.shipping,
    location: String(p.location||'Tuxtla Gutiérrez'),
    year: Number(p.year)||new Date().getFullYear(),
    specs: Array.isArray(p.specs) ? p.specs.map(String).filter(Boolean) : [],
    desc: String(p.desc||''),
    svgKey: svgs[p.svgKey] ? p.svgKey : 'excavadora',
    imgs,
    // Portada. Se deriva de imgs para que no puedan contradecirse entre sí.
    img: imgs[0] || null,
    hot: !!p.hot,
    // Un valor desconocido se trata como disponible: mas vale que una etiqueta
    // no aparezca a que un equipo se marque "vendido" por un dato raro.
    disponibilidad: ['apartado','vendido'].includes(p.disponibilidad) ? p.disponibilidad : 'disponible'
  }});
}

/* ══════════════════ DE DÓNDE SALEN LOS DATOS ══════════════════

   El catálogo y los ajustes vienen SIEMPRE del sitio publicado, nunca del
   localStorage de quien mira.

   Esto arregla un fallo de los que asustan: dos personas abrían la misma
   dirección y veían páginas distintas. Quien alguna vez editó con el panel
   viejo se había quedado con SU catálogo guardado en el navegador, y ese
   ganaba sobre el publicado. El sitio se veía con otros equipos, otras fotos
   y otro logo, sólo para esa persona.

   Y era peor de lo que parece: quien administra veía su versión local y
   creía que ése era el sitio. Podía revisar un precio, darlo por bueno, y en
   realidad los clientes estaban viendo otro.

   La fuente es CATALOGO, que build.js escribe al desplegar desde la base de
   datos. Una sola, igual para todos. Del localStorage sólo sobrevive lo que
   de verdad es de cada dispositivo: el carrito, los favoritos y los datos de
   contacto de quien cotiza. */
let products = normalizeProducts(DEFAULT_PRODUCTS);
let settings = Object.assign({}, DEFAULT_SETTINGS);

/* Se borran los restos del panel viejo.

   Sin esto seguirían ocupando espacio y, sobre todo, seguirían ahí el día que
   alguien reviviera un `store.read` por descuido. Lo que ya no manda, se va. */
try{
  localStorage.removeItem(K.products);
  localStorage.removeItem(K.settings);
}catch{}
let cart = store.read(K.cart, []);
let favorites = new Set(store.read(K.favs, []));
/* Arranca SIEMPRE en falso, y sólo lo levanta restaurarSesion() tras
   comprobar contra el servidor que hay una sesión de administrador.

   Antes esto salía de una marca en sessionStorage. Era el resto del PIN, y
   estaba mal por lo obvio: una marca que pone el propio navegador la puede
   poner cualquiera desde las herramientas de desarrollador, y el panel se
   abría sin contraseña.

   Que las escrituras igual las rechazara el servidor no lo justifica. Un
   panel que se abre y deja tocarlo todo, para luego fallar al guardar, es
   una trampa: parece que funciona. */
let isAdmin = false;

/* saveProducts y saveSettings ya no existen: escribir el catálogo en el
   navegador es exactamente lo que causaba que cada quien viera un sitio
   distinto. El catálogo se guarda en la base (ver remoto.js) y llega al
   sitio al publicar. */
const saveCart = () => store.write(K.cart, cart);
const saveFavs = () => store.write(K.favs, [...favorites]);
