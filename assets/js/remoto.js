/**
 * remoto.js — Lee y escribe el catálogo en la base de datos.
 *
 * Sustituye al localStorage como lugar donde vive el catálogo. La diferencia
 * de fondo: antes cada quien editaba su propia copia y creía estar cambiando
 * el sitio. Ahora hay una sola copia y todos la ven.
 *
 * ── Quién lee qué ──
 *
 * El VISITANTE no usa nada de este archivo. Sigue recibiendo el catálogo
 * escrito dentro del sitio (catalogo-datos.js), generado al desplegar. Por eso
 * la página carga igual de rápido y no se cae si Supabase se cae.
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

/** Petición autenticada a la base. Lanza con un mensaje entendible. */
async function apiRemota(recurso, opciones = {}) {
  if (!BACKEND) throw new Error('Este sitio se compiló sin conexión a la base de datos.');

  const token = await tokenValido();
  if (!token && opciones.method && opciones.method !== 'GET') {
    throw new Error('Tu sesión terminó. Vuelve a entrar.');
  }

  const r = await fetch(`${BACKEND.url}/rest/v1/${recurso}`, {
    ...opciones,
    headers: {
      apikey: BACKEND.llave,
      Authorization: `Bearer ${token || BACKEND.llave}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opciones.headers || {}),
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!r.ok) {
    const detalle = await r.text();
    /* Traducir los errores que se van a ver de verdad. "new row violates
       row-level security policy" no le dice nada a quien administra un
       catálogo de maquinaria, y lo manda a buscar en el lugar equivocado. */
    if (r.status === 401 || r.status === 403 || /row-level security/.test(detalle)) {
      throw new Error('No tienes permiso para esto. ¿Sigue abierta tu sesión?');
    }
    if (/duplicate key.*slug/.test(detalle)) {
      throw new Error('Ya existe un equipo con esa dirección web. Cambia el nombre.');
    }
    if (/violates check constraint/.test(detalle)) {
      throw new Error('Algún dato no es válido. Revisa precios, año y textos.');
    }
    throw new Error(detalle.slice(0, 200) || `Error ${r.status}`);
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
    /* Sólo direcciones https. Las fotos incrustadas (data:) que quedaron del
       localStorage viejo no caben en una columna de texto ni deben: para eso
       está el almacenamiento de Supabase.

       `imagen_url` no se manda: lo pone la base a partir de imagenes[1]. Que
       lo calcule el servidor es lo que impide que portada y galería acaben
       diciendo cosas distintas. */
    imagenes: (Array.isArray(p.imgs) ? p.imgs : [])
      .filter(u => typeof u === 'string' && u.startsWith('https://'))
      .slice(0, 8),
    icono: p.svgKey || 'excavadora',
    destacado: !!p.hot,
    publicado: p.publicado !== false,
    disponibilidad: ['disponible','apartado','vendido'].includes(p.disponibilidad) ? p.disponibilidad : 'disponible',
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
  const [equipos, ajustes, sucursales] = await Promise.all([
    apiRemota('equipos?select=*&order=id.asc'),
    apiRemota('ajustes?select=*&limit=1'),
    apiRemota('sucursales?select=*&order=orden.asc'),
  ]);

  return {
    equipos: equipos.map(equipoDesdeFila),
    ajustes: ajustes.length ? ajustesDesdeFila(ajustes[0]) : null,
    sucursales: sucursales.map(s => ({
      name: s.nombre, address: s.direccion, phone: s.telefono, hours: s.horario,
    })),
  };
}

/** Da de alta o actualiza un equipo. Devuelve el equipo tal como quedó guardado. */
async function remotoGuardarEquipo(p) {
  const fila = filaDesdeEquipo(p);

  const filas = p.id
    ? await apiRemota(`equipos?id=eq.${encodeURIComponent(p.id)}`, {
        method: 'PATCH', body: JSON.stringify(fila),
      })
    : await apiRemota('equipos', { method: 'POST', body: JSON.stringify(fila) });

  if (!filas || !filas.length) {
    /* Un PATCH que no devuelve filas significa que el RLS no dejó ver ni tocar
       ese renglón — no que se haya guardado en silencio. Confundirlo con éxito
       sería peor que fallar: el administrador se iría creyendo que cambió un
       precio que sigue igual. */
    throw new Error('No se guardó: la base no reconoció ese equipo o no tienes permiso.');
  }

  /* Se comprueba que lo devuelto sea lo enviado.

     Que la base responda "200 OK" con una fila sólo dice que la petición
     llegó. Si por lo que sea guardó otra cosa —un trigger, una columna que
     no se mandó, un renglón distinto—, el panel diría "Equipo actualizado"
     y el precio seguiría siendo el viejo.

     Ése es el peor modo de fallo posible: silencioso y con cara de éxito.
     Quien administra se va tranquilo y el error aparece días después, en el
     sitio, delante de un cliente. Vale mucho más una alerta molesta. */
  const guardado = filas[0];
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
  await apiRemota(`equipos?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Guarda los ajustes del sitio. La tabla tiene una sola fila, con id = true. */
async function remotoGuardarAjustes(s) {
  const filas = await apiRemota('ajustes?id=eq.true', {
    method: 'PATCH', body: JSON.stringify(filaDesdeAjustes(s)),
  });
  if (!filas || !filas.length) throw new Error('No se guardaron los ajustes. ¿Sigue abierta tu sesión?');
  return ajustesDesdeFila(filas[0]);
}

/**
 * Reemplaza la lista de sucursales.
 *
 * Se borra y se vuelve a escribir en vez de ir comparando una por una: son
 * tres o cuatro filas sin clave estable propia, y el código para reconciliarlas
 * sería más largo que esto y con más formas de equivocarse.
 *
 * El riesgo asumido: si falla el alta después del borrado, quedan cero
 * sucursales. Por eso se vuelven a leer al terminar — así el panel enseña lo
 * que realmente hay, no lo que se esperaba que hubiera.
 */
async function remotoGuardarSucursales(lista) {
  await apiRemota('sucursales?id=gt.0', { method: 'DELETE' });

  if (lista.length) {
    await apiRemota('sucursales', {
      method: 'POST',
      body: JSON.stringify(lista.map((b, i) => ({
        nombre: b.name, direccion: b.address,
        telefono: String(b.phone || '').slice(0, 20),
        horario: b.hours || '', orden: i,
      }))),
    });
  }

  const filas = await apiRemota('sucursales?select=*&order=orden.asc');
  return filas.map(s => ({ name: s.nombre, address: s.direccion, phone: s.telefono, hours: s.horario }));
}

/**
 * Pide a Netlify que reconstruya y publique el sitio.
 *
 * Los cambios se guardan al instante en la base y otro administrador los ve de
 * inmediato, pero el sitio público es HTML escrito de antemano: hasta que no
 * se reconstruye, el visitante sigue viendo lo anterior.
 *
 * La dirección que dispara la reconstrucción NO va en este archivo. Cualquiera
 * que la lea podría lanzar despliegues sin parar hasta agotar la cuota del
 * mes. Va en una función del servidor que primero comprueba que quien pide sea
 * administrador.
 */
async function remotoPublicar() {
  const token = await tokenValido();
  if (!token) throw new Error('Tu sesión terminó. Vuelve a entrar.');

  const r = await fetch('/api/publicar', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20000),
  });

  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `No se pudo publicar (${r.status}).`);
  return d;
}


/* ── Solicitudes ────────────────────────────────────────────────────────────
   La bandeja de cotizaciones. Sólo la ve el personal: la política de la base
   rechaza esta consulta a cualquiera sin sesión de administrador, y eso está
   comprobado en tests/seguridad.test.js. */

/** Trae las solicitudes, las más recientes primero. */
async function remotoSolicitudes(estado = null) {
  const filtro = estado ? `&estado=eq.${encodeURIComponent(estado)}` : '';
  return apiRemota(`solicitudes?select=*&order=creado_en.desc&limit=200${filtro}`);
}

/**
 * Cambia el estado de una solicitud.
 *
 * No hay forma de borrarlas, ni siquiera siendo admin: son registro comercial
 * y evidencia del consentimiento con que se dieron los datos. Se cierran o se
 * marcan como spam, pero se quedan.
 */
async function remotoEstadoSolicitud(id, estado) {
  const filas = await apiRemota(`solicitudes?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({ estado }),
  });
  if (!filas || !filas.length) throw new Error('No se pudo actualizar. ¿Sigue abierta tu sesión?');
  return filas[0];
}

/* ── Fotos ──────────────────────────────────────────────────────────────────
   Van al almacenamiento de Supabase, no incrustadas en la base.

   El sistema viejo las guardaba como texto dentro del navegador de quien las
   subía: ocupaban el límite de 5 MB del localStorage, no las veía nadie más y
   se perdían al limpiar el navegador. Aquí quedan en un CDN, con dirección
   permanente, y las ve todo el mundo. */

/**
 * Sube una foto y devuelve su dirección pública.
 *
 * @param {Blob} archivo   ya redimensionado y comprimido por el panel
 * @param {string} slug    para agrupar las fotos por equipo
 */
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
 * Si falla cualquiera de las dos subidas, no se guarda ninguna. Media foto
 * subida es una imagen rota esperando a que alguien la mire.
 */
async function remotoSubirFoto(archivo, slug, hacerPequena) {
  const token = await tokenValido();
  if (!token) throw new Error('Tu sesión terminó. Vuelve a entrar.');

  const base = `${slug || 'equipo'}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const subir = async (blob, sufijo) => {
    const r = await fetch(`${BACKEND.url}/storage/v1/object/equipos/${base}${sufijo}.webp`, {
      method: 'POST',
      headers: {
        apikey: BACKEND.llave,
        Authorization: `Bearer ${token}`,
        'Content-Type': blob.type || 'image/webp',
      },
      body: blob,
      signal: AbortSignal.timeout(60000),
    });

    if (!r.ok) {
      const detalle = await r.text();
      if (/exceeded the maximum allowed size/i.test(detalle)) {
        throw new Error('la foto pesa más de 3 MB');
      }
      if (r.status === 401 || r.status === 403) {
        throw new Error('sin permiso, ¿sigue abierta tu sesión?');
      }
      throw new Error(detalle.slice(0, 120));
    }
    return `${BACKEND.url}/storage/v1/object/public/equipos/${base}${sufijo}.webp`;
  };

  /* La pequeña primero. Si va a fallar algo —cuota, permisos, red— que falle
     con el archivo ligero, no después de haber subido el pesado. */
  if (typeof hacerPequena === 'function') {
    await subir(await hacerPequena(), '-w700');
  }
  return subir(archivo, '-w1400');
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
  return apiRemota('metricas?select=*&order=vistas.desc');
}
