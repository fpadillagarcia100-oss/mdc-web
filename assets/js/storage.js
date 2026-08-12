/**
 * storage.js — Persistencia en localStorage, con normalización de los datos que entran
 * (un respaldo importado puede traer cualquier cosa) y aviso si se agota el espacio.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 */
'use strict';

/* ══════════════════ ALMACENAMIENTO ══════════════════
 *
 * ESTE SITIO NO ESCRIBE NADA EN EL NAVEGADOR. Ni localStorage, ni
 * sessionStorage, ni cookies.
 *
 * Todo lo del negocio —catálogo, precios, ajustes, cotizaciones, preguntas—
 * vive en la base de datos y llega igual a todo el mundo. Y lo del visitante
 * —su carrito, sus favoritos, lo que estaba mirando— vive aquí, en memoria,
 * mientras la pestaña esté abierta. Al recargar, empieza limpio.
 *
 * ── Qué se gana y qué se paga ──
 *
 * Se gana que la página no deja rastro: nada que consentir, nada que borrar,
 * nada que se quede en una computadora prestada. El token del panel muere al
 * recargar, así que una sesión olvidada en la máquina de la obra deja de ser
 * un problema.
 *
 * Se paga que el carrito se vacía al recargar, que hay que volver a entrar al
 * panel cada vez, y —esto es lo importante— que una cotización llenada sin
 * señal sólo se reintenta mientras la pestaña siga abierta. Si se cierra
 * antes de que vuelva la red, se pierde. Se decidió a sabiendas.
 *
 * La interfaz `store` se mantiene igual a propósito: los veinte sitios que
 * llaman a `store.read` y `store.write` no distinguen dónde acaban los datos,
 * y así el cambio no se filtra por todo el código.
 */
const memoria = new Map();

const store = {
  read(key, fallback){
    return memoria.has(key) ? memoria.get(key) : fallback;
  },
  write(key, value){
    /* Se guarda una copia y no la referencia. Sin esto, quien llamó seguiría
       teniendo en la mano el mismo objeto que hay "guardado", y modificarlo
       después cambiaría lo almacenado sin pasar por aquí — que es justo el
       tipo de fallo que localStorage no permitía, porque serializa. */
    try{ memoria.set(key, JSON.parse(JSON.stringify(value))); return true }
    catch{ memoria.set(key, value); return true }
  },
  usedBytes(){
    let n = 0;
    for(const v of memoria.values()){
      try{ n += JSON.stringify(v).length * 2 }catch{}
    }
    return n;
  }
};

/* De dónde puede venir una imagen: del propio sitio, incrustada, o del
   almacenamiento de Supabase — y de ningún otro lado.

   La lista es cerrada a propósito. Un respaldo importado puede traer una URL
   "javascript:" o una imagen de un dominio ajeno, que serviría para ejecutar
   código o para rastrear a quien visita tu página desde fuera.

   Se compara contra la dirección exacta del proyecto, no contra "cualquier
   https". Aceptar cualquier dominio seguro seguiría dejando pasar rastreo de
   terceros, que es la mitad del motivo por el que existe esta comprobación. */
const ORIGEN_FOTOS = (typeof BACKEND_CONFIG !== 'undefined' && BACKEND_CONFIG)
  ? BACKEND_CONFIG.url + '/storage/v1/object/public/'
  : null;

const imgOk = s => typeof s==='string' && (
  s.startsWith('data:image') ||
  (s.startsWith('/') && !s.startsWith('//')) ||
  (ORIGEN_FOTOS !== null && s.startsWith(ORIGEN_FOTOS))
);

/** Devuelve la galería de un equipo, acepte el formato nuevo (imgs) o el viejo (img). */
function normalizeImgs(p){
  const crudas = Array.isArray(p.imgs) ? p.imgs : (p.img ? [p.img] : []);
  return crudas.filter(imgOk).slice(0, MAX_FOTOS);
}

/**
 * Preguntas ya contestadas de un equipo, tal como vienen del sitio publicado.
 *
 * Se filtra por "tiene respuesta" aquí ADEMÁS de en la base. No es duplicar
 * por gusto: un respaldo importado a mano no pasa por ninguna política, y una
 * pregunta sin contestar pintada en la ficha se lee como si la empresa la
 * hubiera ignorado.
 */
function normalizeQA(p){
  if(!Array.isArray(p.qa)) return [];
  return p.qa
    .filter(q => q && typeof q==='object' && q.pregunta && q.respuesta)
    .slice(0, 40)
    .map(q => ({
      nombre: String(q.nombre || 'Cliente').slice(0, 60),
      pregunta: String(q.pregunta).slice(0, 300),
      respuesta: String(q.respuesta).slice(0, 1000),
      fecha: typeof q.fecha === 'string' ? q.fecha : null
    }));
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
    disponibilidad: ['apartado','vendido'].includes(p.disponibilidad) ? p.disponibilidad : 'disponible',
    /* Sólo el identificador de YouTube. videoId() devuelve null ante cualquier
       otra cosa, así que una dirección ajena colada en un respaldo no llega a
       convertirse en un iframe dentro de la ficha. */
    video: videoId(p.video),
    // Se filtran las claves desconocidas: ver limpiarAtributos en atributos.js.
    atributos: limpiarAtributos(p.atributos),
    qa: normalizeQA(p)
  }});
}

/* ══════════════════ DE DÓNDE SALEN LOS DATOS ══════════════════

   El catálogo y los ajustes vienen SIEMPRE del sitio publicado, nunca del
   navegador de quien mira.

   Esto arregla un fallo de los que asustan: dos personas abrían la misma
   dirección y veían páginas distintas. Quien alguna vez editó con el panel
   viejo se había quedado con SU catálogo guardado en el navegador, y ese
   ganaba sobre el publicado. El sitio se veía con otros equipos, otras fotos
   y otro logo, sólo para esa persona.

   Y era peor de lo que parece: quien administra veía su versión local y
   creía que ése era el sitio. Podía revisar un precio, darlo por bueno, y en
   realidad los clientes estaban viendo otro.

   La fuente es CATALOGO, que build.js escribe al desplegar desde la base de
   datos. Una sola, igual para todos. En memoria sólo queda lo que de verdad es
   de quien está mirando: su carrito, sus favoritos y sus datos de contacto —y
   sólo mientras la pestaña siga abierta. */
let products = normalizeProducts(DEFAULT_PRODUCTS);
let settings = Object.assign({}, DEFAULT_SETTINGS);

/* Se borra TODO lo que versiones anteriores dejaron en el navegador.

   No es limpieza cosmética. Miles de visitantes ya tienen ahí su carrito, sus
   favoritos y —los que administraron— un token de sesión. Si el sitio deja de
   escribir pero no borra, esos datos se quedan olvidados para siempre en la
   máquina de cada quien, incluida la de la obra que usan cinco personas.

   Se barre por prefijo y no por lista: así también se van las claves de
   versiones que ya nadie recuerda. Y `mdc_sesion`, que no lleva el prefijo,
   se nombra aparte — un token es lo que más urge que desaparezca. */
try{
  for(let i = localStorage.length - 1; i >= 0; i--){
    const clave = localStorage.key(i);
    if(clave && (clave.startsWith('mdc_v1_') || clave === 'mdc_sesion')) localStorage.removeItem(clave);
  }
}catch{ /* navegador sin almacenamiento o en modo privado: nada que borrar */ }
let cart = store.read(K.cart, []);
let favorites = new Set(store.read(K.favs, []));
/* Historial de fichas abiertas, de la más reciente a la más vieja. Sólo ids:
   si el equipo se vende y desaparece del catálogo, el historial se limpia solo
   al no encontrarlo, en vez de guardar una copia que envejece. */
let vistos = (store.read(K.vistos, []) || []).filter(n => Number.isInteger(n)).slice(0, MAX_VISTOS);
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
const saveVistos = () => store.write(K.vistos, vistos);
