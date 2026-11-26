/**
 * remoto.js — Lee y escribe el catálogo en la base de datos.
 *
 * Sustituye al localStorage como lugar donde vive el catálogo. La diferencia
 * de fondo: antes cada quien editaba su propia copia y creía estar cambiando
 * el sitio. Ahora hay una sola copia y todos la ven.
 *
 * La base es el SQL Server de la oficina; aquí se habla con la API que la
 * envuelve (servidor/Mdc.Api, rutas /api/admin/…). Las filas van y vienen con
 * los nombres de columna de la base, así que las funciones de traducción de
 * abajo no saben ni les importa qué motor hay detrás.
 *
 * ── Quién lee qué ──
 *
 * El VISITANTE no usa nada de este archivo. Sigue recibiendo el catálogo
 * escrito dentro del sitio (catalogo-datos.js), generado al desplegar. Por eso
 * la página carga igual de rápido y no se cae si el servidor se cae.
 *
 * El ADMINISTRADOR sí: al entrar al panel se trae lo que hay en la base, para
 * no editar sobre una copia vieja. Es la diferencia entre "lo que se publicó"
 * y "lo que hay ahora mismo", y son cosas distintas entre un cambio y el
 * siguiente despliegue.
 *
 * ── Pesos y centavos ──
 *
 * La base guarda centavos enteros; la aplicación trabaja en pesos. La
 * conversión ocurre AQUÍ y sólo aquí. Repartirla por el código es como
 * terminan apareciendo pantallas con precios distintos para el mismo equipo.
 */
'use strict';

/* Redondear al convertir no es un adorno: 2850000 * 100 en punto flotante da
   284999999.99999994, y la base, que espera un entero, perdería ese centavo. */
const aCentavos = pesos => Math.round(Number(pesos || 0) * 100);
const aPesos = centavos => (centavos === null || centavos === undefined) ? null : Number(centavos) / 100;

/**
 * Petición autenticada al panel de la API. Lanza con un mensaje entendible.
 *
 * Los mensajes ya vienen redactados por el servidor ("El precio anterior debe
 * ser mayor que el actual", "Ya hay un equipo con esa dirección"): la API
 * traduce cada restricción de la base al campo que falló. Aquí sólo se
 * cubren los casos en que el servidor no llegó a contestar algo útil.
 */
async function apiRemota(ruta, opciones = {}) {
  if (!BACKEND) throw new Error('Este sitio se compiló sin conexión al servidor.');

  const token = await tokenValido();
  if (!token) throw new Error('Tu sesión terminó. Vuelve a entrar.');

  let r;
  try {
    r = await fetch(`${BACKEND.url}/api/admin/${ruta}`, {
      ...opciones,
      headers: {
        Authorization: `Bearer ${token}`,
        // Con FormData el navegador pone su propio Content-Type (con el boundary).
        ...(opciones.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(opciones.headers || {}),
      },
      signal: AbortSignal.timeout(opciones.plazo || 20000),
    });
  } catch {
    /* Sin respuesta: o no hay internet aquí, o el servidor de la oficina está
       apagado o sin conexión. Decirlo así ahorra buscar el problema en el
       lugar equivocado. */
    throw new Error('No hay conexión con el servidor. Revisa tu internet o que la computadora de la oficina esté encendida.');
  }

  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error('Tu sesión terminó. Vuelve a entrar.');
    if (r.status === 403) throw new Error(d.error || 'Tu cuenta no tiene acceso al panel.');
    if (r.status === 502 || r.status === 503 || r.status === 530) {
      // 530 es el de Cloudflare cuando el túnel no encuentra el servidor.
      throw new Error(d.error || 'El servidor de la oficina no responde. ¿Está encendido?');
    }
    throw new Error(d.error || `Error ${r.status}`);
  }

  return r.status === 204 ? null : r.json();
}

/* ── Traducción entre la base y la aplicación ──────────────────────────── */

/** Fila de la base → objeto que entiende el resto del sitio. */
function equipoDesdeFila(f) {
  return {
    id: f.id,
    slug: f.slug,
    name: f.nombre,
    brand: f.marca,
    cat: f.categoria,
    cond: f.condicion,
    price: aPesos(f.precio_cents),
    original: aPesos(f.precio_anterior_cents),
    finance: f.financiamiento,
    leasing: f.arrendamiento,
    shipping: f.envio_incluido,
    location: f.ubicacion,
    year: f.anio,
    specs: f.especificaciones || [],
    desc: f.descripcion || '',
    svgKey: f.icono,
    img: f.imagen_url,
    imgs: Array.isArray(f.imagenes) && f.imagenes.length
      ? f.imagenes
      : (f.imagen_url ? [f.imagen_url] : []),
    hot: f.destacado,
    publicado: f.publicado,
    disponibilidad: f.disponibilidad || 'disponible',
    video: f.video_url || null,
    atributos: f.atributos || {},
  };
}

/** Objeto de la aplicación → fila para la base. */
function filaDesdeEquipo(p) {
  return {
    slug: p.slug,
    nombre: p.name,
    marca: p.brand || 'Sin marca',
    categoria: p.cat || 'General',
    condicion: p.cond,
    precio_cents: aCentavos(p.price),
    // La base exige que el precio anterior sea MAYOR al actual: un "antes"
    // más barato que el "ahora" es un descuento negativo. Se manda null en
    // vez de dejar que el servidor rechace el guardado entero.
    precio_anterior_cents: (p.original && p.original > p.price) ? aCentavos(p.original) : null,
    financiamiento: p.finance || null,
    arrendamiento: !!p.leasing,
    envio_incluido: !!p.shipping,
    ubicacion: p.location,
    anio: Number(p.year),
    especificaciones: (p.specs || []).slice(0, 12),
    descripcion: (p.desc || '').slice(0, 4000),
    /* Sólo fotos del propio servidor (ORIGEN_FOTOS, en storage.js). Las
       incrustadas (data:) que quedaron del localStorage viejo no caben en una
       columna de texto ni deben: para eso están las fotos en /fotos/.

       `imagen_url` no se manda: lo pone la base a partir de imagenes[0]. Que
       lo calcule el servidor es lo que impide que portada y galería acaben
       diciendo cosas distintas. */
    imagenes: (Array.isArray(p.imgs) ? p.imgs : [])
      .filter(u => typeof u === 'string' && ORIGEN_FOTOS !== null && u.startsWith(ORIGEN_FOTOS))
      .slice(0, 8),
    icono: p.svgKey || 'excavadora',
    destacado: !!p.hot,
    publicado: p.publicado !== false,
    disponibilidad: ['disponible','apartado','vendido'].includes(p.disponibilidad) ? p.disponibilidad : 'disponible',
    /* La base sólo acepta 11 caracteres alfanuméricos, así que mandar la
       dirección completa la haría rechazar el guardado ENTERO del equipo —
       precio incluido— por un campo secundario. Se normaliza aquí. */
    video_url: videoId(p.video),
    atributos: limpiarAtributos(p.atributos),
  };
}

const ajustesDesdeFila = a => ({
  logo: a.logo_url,
  brandMain: a.marca_principal,
  brandAccent: a.marca_acento,
  brandFull: a.marca_completa,
  accent: a.color_acento,
  topbarMsg: a.barra_superior,
  heroTag: a.hero_etiqueta,
  heroTitle: a.hero_titulo,
  heroHighlight: a.hero_resaltado,
  heroText: a.hero_texto,
  heroImage: a.hero_imagen,
  sellerName: a.vendedor,
  phone: a.telefono,
  whatsapp: a.whatsapp,
  email: a.correo,
  hours: a.horario,
  address: a.direccion,
  footerAbout: a.pie_descripcion,
});

const filaDesdeAjustes = s => ({
  marca_principal: s.brandMain,
  marca_acento: s.brandAccent,
  marca_completa: s.brandFull,
  color_acento: s.accent,
  logo_url: (typeof s.logo === 'string' && s.logo.startsWith('https://')) ? s.logo : null,
  barra_superior: s.topbarMsg || '',
  hero_etiqueta: s.heroTag || '',
  hero_titulo: s.heroTitle || '',
  hero_resaltado: s.heroHighlight || '',
  hero_texto: s.heroText || '',
  hero_imagen: (typeof s.heroImage === 'string' && s.heroImage.startsWith('https://')) ? s.heroImage : null,
  vendedor: s.sellerName || '',
  telefono: s.phone || '',
  // La base exige sólo dígitos: un "+52 961..." escrito a mano rompería el
  // guardado de TODOS los ajustes, no sólo de este campo.
  whatsapp: String(s.whatsapp || '').replace(/\D/g, ''),
  correo: s.email || '',
  direccion: s.address || '',
  horario: s.hours || '',
  pie_descripcion: s.footerAbout || '',
});

/* ── Operaciones ───────────────────────────────────────────────────────── */

/**
 * Trae el catálogo completo, incluidos los borradores sin publicar.
 * Se llama al abrir el panel: editar sobre datos viejos es cómo se pisan dos
 * personas los cambios sin darse cuenta.
 */
async function remotoCargarTodo() {
  const d = await apiRemota('todo');
  return {
    equipos: d.equipos.map(equipoDesdeFila),
    ajustes: d.ajustes ? ajustesDesdeFila(d.ajustes) : null,
    sucursales: d.sucursales.map(s => ({ name: s.nombre, address: s.direccion, phone: s.telefono, hours: s.horario })),
  };
}

/** Da de alta o actualiza un equipo. Devuelve el equipo tal como quedó guardado. */
async function remotoGuardarEquipo(p) {
  const fila = filaDesdeEquipo(p);

  const guardado = p.id
    ? await apiRemota(`equipos/${encodeURIComponent(p.id)}`, { method: 'PUT', body: JSON.stringify(fila) })
    : await apiRemota('equipos', { method: 'POST', body: JSON.stringify(fila) });

  if (!guardado) throw new Error('No se guardó: el servidor no devolvió el equipo.');

  /* Se comprueba que lo devuelto sea lo enviado.

     Que el servidor responda "200 OK" con una fila sólo dice que la petición
     llegó. Si por lo que sea guardó otra cosa —un disparador, una columna que
     no se mandó, un renglón distinto—, el panel diría "Equipo actualizado"
     y el precio seguiría siendo el viejo.

     Ése es el peor modo de fallo posible: silencioso y con cara de éxito.
     Quien administra se va tranquilo y el error aparece días después, en el
     sitio, delante de un cliente. Vale mucho más una alerta molesta. */
  const discrepan = ['precio_cents', 'nombre', 'anio', 'condicion', 'ubicacion']
    .filter(campo => String(guardado[campo]) !== String(fila[campo]));

  if (discrepan.length) {
    console.warn('[MDC] La base guardó algo distinto a lo enviado:',
      discrepan.map(c => `${c}: enviado ${fila[c]} → guardado ${guardado[c]}`));
    throw new Error(
      'La base guardó algo distinto a lo que enviaste (' + discrepan.join(', ') + '). ' +
      'Vuelve a abrir el equipo y revisa antes de intentarlo de nuevo.'
    );
  }

  return equipoDesdeFila(guardado);
}

async function remotoBorrarEquipo(id) {
  await apiRemota(`equipos/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Guarda los ajustes del sitio (una sola fila). */
async function remotoGuardarAjustes(s) {
  return ajustesDesdeFila(await apiRemota('ajustes', { method: 'PUT', body: JSON.stringify(filaDesdeAjustes(s)) }));
}

/**
 * Reemplaza la lista de sucursales.
 *
 * Se reemplaza entera en vez de ir comparando una por una: son tres o cuatro
 * filas sin clave estable propia, y el código para reconciliarlas sería más
 * largo que esto y con más formas de equivocarse. El servidor lo hace en una
 * transacción: o queda la lista nueva completa o se queda la de antes. (Con
 * Supabase eran dos peticiones sueltas, y si fallaba la segunda la empresa se
 * quedaba sin sucursales.)
 *
 * Devuelve lo que quedó guardado, no lo que se mandó.
 */
async function remotoGuardarSucursales(lista) {
  const filas = await apiRemota('sucursales', {
    method: 'PUT',
    body: JSON.stringify(lista.map(b => ({
      nombre: b.name, direccion: b.address,
      telefono: String(b.phone || '').slice(0, 20),
      horario: b.hours || '',
    }))),
  });
  return filas.map(s => ({ name: s.nombre, address: s.direccion, phone: s.telefono, hours: s.horario }));
}

/**
 * Pide a Cloudflare que reconstruya y publique el sitio.
 *
 * Los cambios se guardan al instante en la base y otro administrador los ve de
 * inmediato, pero el sitio público es HTML escrito de antemano: hasta que no
 * se reconstruye, el visitante sigue viendo lo anterior.
 *
 * La dirección que dispara la reconstrucción NO va en este archivo. Cualquiera
 * que la lea podría lanzar despliegues sin parar hasta agotar la cuota del
 * mes. La guarda el servidor, que primero comprueba que quien pide sea
 * administrador.
 */
async function remotoPublicar() {
  return apiRemota('publicar', { method: 'POST' });
}


/* ── Solicitudes ────────────────────────────────────────────────────────────
   La bandeja de cotizaciones. Sólo la ve el personal: el servidor rechaza
   esta consulta a cualquiera sin sesión de administrador, y eso está
   comprobado en servidor/Mdc.Api.Pruebas. */

/** Trae las solicitudes, las más recientes primero. */
async function remotoSolicitudes(estado = null) {
  return apiRemota('solicitudes' + (estado ? `?estado=${encodeURIComponent(estado)}` : ''));
}

/**
 * Cambia el estado de una solicitud.
 *
 * No hay forma de borrarlas, ni siquiera siendo admin: son registro comercial
 * y evidencia del consentimiento con que se dieron los datos. Se cierran o se
 * marcan como spam, pero se quedan.
 */
async function remotoEstadoSolicitud(id, estado) {
  await apiRemota(`solicitudes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ estado }) });
  return { id, estado };
}

/* ── Fotos ──────────────────────────────────────────────────────────────────
   Van al disco del servidor, no incrustadas en la base.

   El sistema viejo las guardaba como texto dentro del navegador de quien las
   subía: ocupaban el límite de 5 MB del localStorage, no las veía nadie más y
   se perdían al limpiar el navegador. Aquí quedan con dirección permanente,
   detrás de la caché de Cloudflare, y las ve todo el mundo. */

/**
 * Sube una foto en dos tamaños y devuelve la dirección de la grande.
 *
 * ── Por qué dos ──
 *
 * La tarjeta del catálogo enseña la foto a unos 380 px de ancho. Mandarle una
 * de 1400 es hacer que el cliente descargue cuatro veces más de lo que su
 * pantalla puede aprovechar. Con nueve tarjetas eso es más de un megabyte de
 * más, y en una obra con señal de celular son varios segundos mirando huecos
 * grises.
 *
 * ── Cómo se relacionan ──
 *
 * Los nombres terminan en `-w1400` y `-w700`. Sólo se guarda la grande; la
 * pequeña se deduce cambiando el sufijo.
 *
 * El sufijo NO es decorativo: es lo que permite distinguir las fotos nuevas de
 * las que se subieron antes de esto. Sin él habría que adivinar si existe la
 * versión pequeña, y adivinar mal significa una imagen rota.
 *
 * Van las dos en la misma petición: o se guardan ambas o ninguna. Media foto
 * subida es una imagen rota esperando a que alguien la mire.
 */
async function remotoSubirFoto(archivo, slug, hacerPequena) {
  const form = new FormData();
  form.append('slug', slug || 'equipo');
  form.append('w1400', archivo, 'w1400.webp');
  form.append('w700', typeof hacerPequena === 'function' ? await hacerPequena() : archivo, 'w700.webp');

  const d = await apiRemota('fotos', { method: 'POST', body: form, plazo: 60000 });
  return d.url;
}

/**
 * Construye el `srcset` de una foto, si tiene versión pequeña.
 *
 * Devuelve cadena vacía para las fotos anteriores a este cambio: no tienen
 * `-w1400` en el nombre, así que no existe la pequeña y anunciarla sería
 * prometer un archivo que da 404.
 */
function fotoSrcset(url) {
  if (typeof url !== 'string' || !url.includes('-w1400.webp')) return '';
  return `${url.replace('-w1400.webp', '-w700.webp')} 700w, ${url} 1400w`;
}


/** Contadores por equipo. Sólo los ve un administrador. */
async function remotoMetricas() {
  return apiRemota('metricas');
}


/* ── Preguntas del público ─────────────────────────────────────────────────
   Con sesión de administrador se ven TODAS, incluidas las que aún no tienen
   respuesta. Al público sólo le llegan las contestadas y publicadas, dentro
   del sitio, cuando se compila. */

/** Todas las preguntas, las más nuevas primero. */
async function remotoPreguntas() {
  return apiRemota('preguntas');
}

/**
 * Contesta una pregunta y decide si se enseña en la ficha.
 *
 * Son dos cosas separadas a propósito. A veces se contesta algo que no
 * conviene publicar —un descuento, un dato de un cliente— y hace falta poder
 * cerrarla sin que salga en la página.
 *
 * `respondida_en` la pone el servidor, y sólo la primera vez: es cuándo se
 * atendió, no cuándo se corrigió una errata tres semanas después.
 */
async function remotoResponderPregunta(id, respuesta, publicada) {
  return apiRemota(`preguntas/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      respuesta: respuesta ? String(respuesta).slice(0, 1000) : null,
      publicada: !!publicada,
    }),
  });
}

/**
 * Borra una pregunta.
 *
 * Aquí SÍ se puede borrar, al revés que en las solicitudes: una pregunta de
 * spam no es registro comercial de nada, y dejarla sólo sirve para tener que
 * volver a mirarla cada vez que se abre la bandeja.
 */
async function remotoBorrarPregunta(id) {
  await apiRemota(`preguntas/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
