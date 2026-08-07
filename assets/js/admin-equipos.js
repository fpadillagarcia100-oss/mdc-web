/**
 * admin-equipos.js — Alta, baja y edición de equipos, con su ficha técnica y sus fotos.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 */
'use strict';

/* ── Listado de equipos ── */
function productListHTML(){
  const q = adminQuery.toLowerCase();
  const list = products.filter(p=>!q || `${p.name} ${p.brand} ${p.cat} ${p.location}`.toLowerCase().includes(q));
  return `
    <div class="adm-toolbar">
      <input class="adm-search" type="search" id="admSearch" placeholder="Buscar por nombre, marca, categoría…" value="${esc(adminQuery)}">
      <button class="btn-primary" type="button" data-action="admin-new">+ Nuevo equipo</button>
    </div>
    ${publicarHTML()}
    ${metricasHTML()}
    ${!list.length ? `<div class="empty-state" style="border:none;background:#FAFAFA">
        <div class="icon">📦</div><h3>${products.length?'Sin coincidencias':'Catálogo vacío'}</h3>
        <p>${products.length?'Prueba con otra búsqueda.':'Publica tu primer equipo para que aparezca en la tienda.'}</p></div>` : `
    <table class="adm-table">
      <thead><tr>
        <th style="width:60px">Foto</th><th>Equipo</th>
        <th class="hide-sm">Categoría</th><th class="hide-sm">Ubicación</th>
        <th>Precio</th><th>Estado</th><th></th>
      </tr></thead>
      <tbody>
        ${list.map(p=>`<tr>
          <td><div class="adm-thumb-wrap">${p.img?`<img class="adm-thumb" src="${esc(p.img)}" alt="">`:(svgs[p.svgKey]||'')}</div></td>
          <td>
            <div style="font-weight:600">${esc(p.name)}</div>
            <div style="font-size:11px;color:var(--light)">${esc(p.brand)} · ${p.year}${p.hot?' · 🔥 destacado':''}${p.imgs.length?` · 📷 ${p.imgs.length} foto${p.imgs.length>1?'s':''}`:' · sin fotos'}</div>
          </td>
          <td class="hide-sm">${esc(p.cat)}</td>
          <td class="hide-sm">${esc(p.location)}</td>
          <td style="white-space:nowrap">${fmtCompact(p.price)}${p.cond==='Renta'?'<small>/mes</small>':''}</td>
          <td><span class="pill ${p.cond.toLowerCase()}">${esc(COND_LABELS[p.cond])}</span></td>
          <td><div class="adm-row-actions">
            <button class="icon-btn" type="button" data-edit="${p.id}" title="Editar" aria-label="Editar ${esc(p.name)}">✎</button>
            <button class="icon-btn" type="button" data-dup="${p.id}" title="Duplicar" aria-label="Duplicar ${esc(p.name)}">⧉</button>
            <button class="icon-btn del" type="button" data-delp="${p.id}" title="Eliminar" aria-label="Eliminar ${esc(p.name)}">🗑</button>
          </div></td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p style="font-size:12px;color:var(--light);margin-top:14px">${list.length} de ${products.length} equipos · almacenamiento usado: ${fmtKB(store.usedBytes())}</p>`}`;
}

/* ── Formulario de equipo ── */
function productFormHTML(){
  const p = editingId ? products.find(x=>x.id===editingId) : null;
  const nuevo = !p;
  const v = p || {name:'',brand:'',cat:'',cond:'Nuevo',price:'',original:'',finance:'',leasing:false,
                  shipping:true,location:'',year:new Date().getFullYear(),specs:[],desc:'',svgKey:'excavadora',imgs:[],hot:false};
  const fotos = draftImgs === undefined ? (v.imgs || []) : draftImgs;

  return `
    <div class="adm-toolbar">
      <button class="btn-ghost" type="button" data-action="admin-cancel">← Volver al listado</button>
      <strong style="font-size:15px">${nuevo?'Nuevo equipo':'Editar: '+esc(v.name)}</strong>
    </div>
    <form id="pForm" novalidate>
      <div class="adm-section">
        <h3>Fotos del equipo <span class="hint">(hasta ${MAX_FOTOS})</span></h3>
        <p class="sub">Cada una se redimensiona a 1000 px y se comprime automáticamente.
          La <strong>primera es la portada</strong>: es la que sale en el catálogo y al compartir el enlace.
          Sin fotos se usa un ícono ilustrativo.</p>
        ${fotos.length ? `
          <div class="fotos-grid">
            ${fotos.map((f,n)=>`
              <figure class="foto-item${n===0?' portada':''}">
                <img src="${esc(f)}" alt="Foto ${n+1}">
                ${n===0?'<figcaption class="foto-tag">Portada</figcaption>':''}
                <div class="foto-tools">
                  <button type="button" data-foto-mov="${n}" data-paso="-1" ${n===0?'disabled':''} title="Mover antes" aria-label="Mover la foto ${n+1} antes">◀</button>
                  <button type="button" data-foto-mov="${n}" data-paso="1" ${n===fotos.length-1?'disabled':''} title="Mover después" aria-label="Mover la foto ${n+1} después">▶</button>
                  <button type="button" class="rm" data-foto-quita="${n}" title="Quitar" aria-label="Quitar la foto ${n+1}">✕</button>
                </div>
                <figcaption class="foto-peso">${fmtKB(dataUriBytes(f))}</figcaption>
              </figure>`).join('')}
          </div>
          <p class="sub" style="margin-top:8px">Total de las ${fotos.length} fotos: ${fmtKB(fotos.reduce((s,f)=>s+dataUriBytes(f),0))}</p>` : ''}
        ${fotos.length < MAX_FOTOS ? `
          <div class="dropzone${fotos.length?' compacta':''}" id="dz" tabindex="0" role="button" aria-label="Agregar fotos del equipo">
            <div class="dz-icon">📷</div>
            <p><strong>Haz clic o arrastra ${fotos.length?'más fotos':'imágenes'} aquí</strong></p>
            <p>JPG, PNG o WebP · puedes elegir varias a la vez</p>
          </div>` : `<p class="sub">Llegaste al máximo de ${MAX_FOTOS} fotos. Quita alguna para agregar otra.</p>`}
        <input type="file" id="imgInput" accept="image/*" multiple hidden>
      </div>

      <div class="form-grid">
        <div class="field full" data-f="name">
          <label for="f-name">Nombre del equipo *</label>
          <input type="text" id="f-name" value="${esc(v.name)}" placeholder="Excavadora CAT 320 GC">
          <span class="errmsg">Escribe un nombre.</span>
        </div>

        <div class="field">
          <label for="f-brand">Marca</label>
          <input type="text" id="f-brand" list="dl-brands" value="${esc(v.brand)}" placeholder="CAT">
          <datalist id="dl-brands">${brands().map(b=>`<option value="${esc(b)}">`).join('')}</datalist>
        </div>
        <div class="field">
          <label for="f-cat">Categoría <span class="hint">(escribe una nueva para crearla)</span></label>
          <input type="text" id="f-cat" list="dl-cats" value="${esc(v.cat)}" placeholder="Excavación">
          <datalist id="dl-cats">${baseCats().map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
        </div>

        <div class="field">
          <label for="f-cond">Condición</label>
          <select id="f-cond">${CONDS.map(c=>`<option value="${c}"${v.cond===c?' selected':''}>${COND_LABELS[c]}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="f-disp">Disponibilidad</label>
          <select id="f-disp">
            <option value="disponible"${(v.disponibilidad||'disponible')==='disponible'?' selected':''}>Disponible</option>
            <option value="apartado"${v.disponibilidad==='apartado'?' selected':''}>Apartado</option>
            <option value="vendido"${v.disponibilidad==='vendido'?' selected':''}>Vendido</option>
          </select>
        </div>
        <div class="field">
          <label for="f-location">Ubicación</label>
          <input type="text" id="f-location" list="dl-locs" value="${esc(v.location)}" placeholder="Tuxtla Gutiérrez">
          <datalist id="dl-locs">${locations().map(l=>`<option value="${esc(l)}">`).join('')}</datalist>
        </div>

        <div class="field" data-f="price">
          <label for="f-price">Precio en MXN * <span class="hint">(si es renta, el costo mensual)</span></label>
          <input type="number" id="f-price" min="0" step="100" value="${v.price}">
          <span class="errmsg">Escribe un precio válido.</span>
        </div>
        <div class="field">
          <label for="f-original">Precio anterior <span class="hint">(para mostrar descuento)</span></label>
          <input type="number" id="f-original" min="0" step="100" value="${v.original ?? ''}">
        </div>

        <div class="field">
          <label for="f-finance">Meses sin intereses <span class="hint">(ej. "18 MSI"; vacío = sin MSI)</span></label>
          <input type="text" id="f-finance" value="${esc(v.finance ?? '')}" placeholder="18 MSI">
        </div>
        <div class="field">
          <label for="f-year">Año</label>
          <input type="number" id="f-year" min="1980" max="2100" value="${v.year}">
        </div>

        <div class="field full">
          <label for="f-specs">Especificaciones <span class="hint">(separadas por coma; se muestran las 3 primeras)</span></label>
          <input type="text" id="f-specs" value="${esc(v.specs.join(', '))}" placeholder="20 ton, 148 HP, 6.5 m alcance">
        </div>

        <div class="field full">
          <label for="f-desc">Descripción</label>
          <textarea id="f-desc" placeholder="Describe el equipo, su estado y qué incluye…">${esc(v.desc)}</textarea>
        </div>

        <div class="field full">
          <label for="f-video">Video de YouTube <span class="hint">(pega el enlace; opcional)</span></label>
          <input type="text" id="f-video" value="${esc(v.video ? videoPagina(v.video) : '')}"
                 placeholder="https://www.youtube.com/watch?v=…">
          <span class="hint">Un video de 30 segundos con el motor encendido vende más que ocho fotos.
            Se guarda sólo el identificador y se reproduce sin cookies hasta que el cliente le da al play.</span>
        </div>

        <div class="field">
          <label for="f-svg">Ícono de respaldo <span class="hint">(si no hay foto)</span></label>
          <select id="f-svg">${Object.keys(svgs).map(k=>`<option value="${k}"${v.svgKey===k?' selected':''}>${SVG_LABELS[k]}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>Opciones</label>
          <div class="checks">
            <label class="check"><input type="checkbox" id="f-shipping"${v.shipping?' checked':''}> Envío incluido</label>
            <label class="check"><input type="checkbox" id="f-leasing"${v.leasing?' checked':''}> Arrendamiento</label>
            <label class="check"><input type="checkbox" id="f-hot"${v.hot?' checked':''}> Destacado 🔥</label>
          </div>
        </div>
      </div>

      <div class="adm-section" id="atributosBox" data-cat="${esc(v.cat || '')}">
        ${atributosCamposHTML(v.cat, v.atributos || {})}
      </div>

      <div class="form-actions">
        ${!nuevo?`<button class="btn-danger" type="button" data-delp="${v.id}">Eliminar equipo</button>`:''}
        <button class="btn-ghost" type="button" data-action="admin-cancel">Cancelar</button>
        <button class="btn-primary" type="submit">${nuevo?'Publicar equipo':'Guardar cambios'}</button>
      </div>
    </form>`;
}

/* ── Ficha técnica ──
   Los campos dependen de la categoría: una grúa torre no tiene profundidad de
   excavación y una excavadora no tiene longitud de pluma. Enseñarlos todos
   sería pedir treinta datos para capturar cinco. */
function atributosCamposHTML(cat, valores){
  const campos = camposDe(cat);
  const v = valores || {};

  const control = c => {
    if(c.tipo === 'opcion') return `
      <select id="at-${c.k}" data-at="${c.k}">
        <option value="">—</option>
        ${c.opciones.map(o=>`<option value="${esc(o)}"${v[c.k]===o?' selected':''}>${esc(o)}</option>`).join('')}
      </select>`;
    if(c.tipo === 'num') return `
      <input type="number" id="at-${c.k}" data-at="${c.k}" min="0" step="any"
             value="${v[c.k] ?? ''}" placeholder="${esc(c.unidad||'')}">`;
    return `<input type="text" id="at-${c.k}" data-at="${c.k}" maxlength="60" value="${esc(v[c.k] ?? '')}">`;
  };

  return `
    <h3>Ficha técnica <span class="hint">(${esc(cat || 'sin categoría')})</span></h3>
    <p class="sub">Esto es lo que se puede filtrar y comparar; las «especificaciones» de arriba
      son sólo el resumen que sale en la tarjeta. <strong>Las horas son el dato que más
      se busca</strong> en maquinaria usada: sin capturarlas, el equipo desaparece de ese
      filtro. Deja vacío lo que no apliqué.</p>
    <div class="form-grid">
      ${campos.map(c=>`
        <div class="field">
          <label for="at-${c.k}">${esc(c.etq)}${c.unidad?` <span class="hint">(${esc(c.unidad)})</span>`:''}</label>
          ${control(c)}
        </div>`).join('')}
    </div>
    <p class="sub">Los campos cambian según la categoría. Si la cambias, se conservan
      sólo los datos que sigan aplicando.</p>`;
}

/**
 * Redibuja los campos técnicos al cambiar de categoría.
 *
 * Se toca SÓLO ese bloque, no el formulario entero: renderAdmin() lo
 * reconstruye desde `products` y se llevaría por delante todo lo que se haya
 * escrito y no esté guardado — precio, descripción, fotos recién subidas.
 */
function refrescarAtributos(){
  const box = $('#atributosBox');
  const cat = $('#f-cat');
  if(!box || !cat) return;
  if(box.dataset.cat === cat.value.trim()) return;   // nada que rehacer
  box.dataset.cat = cat.value.trim();
  box.innerHTML = atributosCamposHTML(cat.value.trim(), leerAtributosForm());
}

/** Lee los campos técnicos que estén en pantalla ahora mismo. */
function leerAtributosForm(){
  const crudo = {};
  $$('#pForm [data-at]').forEach(el => { crudo[el.dataset.at] = el.value });
  return limpiarAtributos(crudo);
}

function readForm(){
  const val = id => $('#'+id).value.trim();
  const num = id => { const raw = $('#'+id).value; if(raw==='') return null; const n = Number(raw); return Number.isFinite(n) ? n : null };
  return {
    name: val('f-name'),
    brand: val('f-brand') || 'Sin marca',
    cat: val('f-cat') || 'General',
    cond: val('f-cond'),
    price: num('f-price'),
    original: num('f-original'),
    finance: val('f-finance') || null,
    leasing: $('#f-leasing').checked,
    shipping: $('#f-shipping').checked,
    hot: $('#f-hot').checked,
    location: val('f-location') || 'Tuxtla Gutiérrez',
    year: num('f-year') || new Date().getFullYear(),
    specs: val('f-specs').split(',').map(s=>s.trim()).filter(Boolean),
    desc: val('f-desc'),
    svgKey: val('f-svg'),
    disponibilidad: val('f-disp') || 'disponible',
    /* videoId() devuelve null si lo pegado no es un enlace de YouTube
       reconocible. Eso se avisa en saveProductForm: guardar en silencio un
       equipo sin el video que se acaba de pegar es el fallo que parece que
       funcionó. */
    video: videoId(val('f-video')),
    videoCrudo: val('f-video'),
    atributos: leerAtributosForm()
  };
}

/* ── Carga de imágenes ── */

/** Fotos del equipo en edición, sean las guardadas o las que ya se tocaron. */
function fotosEnEdicion(){
  if(draftImgs !== undefined) return draftImgs;
  const p = editingId ? products.find(x=>x.id===editingId) : null;
  return p ? [...p.imgs] : [];
}

function moverFoto(n, paso){
  const fotos = fotosEnEdicion();
  const destino = n + paso;
  if(destino < 0 || destino >= fotos.length) return;
  [fotos[n], fotos[destino]] = [fotos[destino], fotos[n]];
  draftImgs = fotos;
  renderAdmin();
}

function quitarFoto(n){
  const fotos = fotosEnEdicion();
  fotos.splice(n, 1);
  draftImgs = fotos;
  renderAdmin();
}

/** Procesa varias imágenes a la vez, respetando el tope. */
async function handleImageFiles(files, target){
  const lista = [...(files || [])];
  if(!lista.length) return;
  if(target !== 'product'){ await handleImageFile(lista[0], target); return }

  const fotos = fotosEnEdicion();
  const espacio = MAX_FOTOS - fotos.length;
  if(espacio <= 0){ showToast(`Máximo ${MAX_FOTOS} fotos por equipo`, true); return }

  const aceptadas = lista.slice(0, espacio);
  showToast(aceptadas.length>1 ? `Subiendo ${aceptadas.length} fotos…` : 'Subiendo foto…');

  /* Se comprime ANTES de subir, no después.

     Una foto de celular ronda los 4-8 MB y el servidor rechaza cualquier cosa
     por encima de 3. Comprimiendo aquí a 1400 px se queda en unos cientos de
     KB: sube en segundos incluso con mala señal, y en pantalla se ve igual.
     Subir el original sería tardar diez veces más para que el visitante
     descargue una foto que su pantalla no puede aprovechar. */
  const prev = editingId ? products.find(p=>p.id===editingId) : null;
  const slug = prev?.slug || (($('#f-name')?.value || 'equipo').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''));

  const fallidas = [];
  for(const file of aceptadas){
    try{
      const grande = await fileToBlob(file, 1400, .82);
      // La chica se genera bajo demanda: si la grande falla, no se gasta
      // tiempo comprimiendo una miniatura que nadie va a usar.
      fotos.push(await remotoSubirFoto(grande, slug, () => fileToBlob(file, 700, .78)));
    }catch(err){
      fallidas.push(`${file.name || 'una imagen'} (${err.message})`);
    }
  }
  draftImgs = fotos;
  renderAdmin();

  if(fallidas.length) showToast('No se subieron: ' + fallidas.join(' · '), true);
  else if(lista.length > espacio) showToast(`Se subieron ${aceptadas.length}; el tope es ${MAX_FOTOS} fotos`, true);
  else showToast(aceptadas.length>1 ? `${aceptadas.length} fotos subidas` : 'Foto subida');
}

/**
 * Comprime una imagen y la devuelve como Blob, listo para subir.
 *
 * Es fileToDataURL pero sin convertir a texto. La conversión a data URI infla
 * el tamaño un 33% y sólo servía para meter la foto en el localStorage — que
 * es justamente lo que dejamos de hacer.
 */
async function fileToBlob(file, maxW = 1400, quality = 0.82){
  /* Un video arrastrado a la zona de fotos es el error MÁS probable aquí, y
     "no es una imagen" no le dice a nadie qué hacer con él. La respuesta —que
     el video va por su propio campo, como enlace— cabe en el mismo aviso. */
  if(file.type.startsWith('video/')){
    throw new Error('los videos no se suben aquí: súbelo a YouTube y pega el enlace en el campo «Video de YouTube»');
  }
  if(!file.type.startsWith('image/')) throw new Error('no es una imagen');

  // Los SVG no se rasterizan: son vectores y pesan poco. Van tal cual.
  if(file.type === 'image/svg+xml'){
    if(file.size > 200*1024) throw new Error('el SVG pesa más de 200 KB');
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, maxW / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width*escala));
  const h = Math.max(1, Math.round(bitmap.height*escala));

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  // Sin fondo blanco, un JPEG con transparencia sale con manchas negras.
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,w,h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  if(bitmap.close) bitmap.close();

  const blob = await new Promise(res => c.toBlob(res, 'image/webp', quality));
  if(!blob) throw new Error('no se pudo comprimir');
  if(blob.size > 3*1024*1024) throw new Error('sigue pesando más de 3 MB');
  return blob;
}

async function handleImageFile(file, target){
  if(!file) return;
  try{
    showToast('Procesando imagen…');
    /* Subir imágenes desde aquí está desactivado a propósito.

       La imagen se convertía en texto incrustado y se guardaba en el
       navegador. Ahora el catálogo vive en la base, y una foto así no cabe
       en una columna de texto ni debe: para eso está el almacenamiento de
       Supabase, con su CDN y su límite por archivo.

       Lo importante es que NO se quede a medias. Si aceptáramos la imagen y
       la pintáramos sin guardarla, se vería el logo nuevo hasta recargar y
       luego desaparecería, y nadie entendería por qué. Vale más decir que
       todavía no se puede. */
    showToast('Las imágenes aún no se pueden subir desde aquí. Se conectarán al almacenamiento de Supabase.', true);
    return;
  }catch(err){
    showToast(err.message || 'No se pudo procesar la imagen', true);
  }
}

function wireDropzone(zoneId, inputId, target){
  const zone = $('#'+zoneId), input = $('#'+inputId);
  if(!zone || !input) return;
  const pick = ()=>input.click();
  zone.addEventListener('click', pick);
  zone.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); pick() } });
  zone.addEventListener('dragover', e=>{ e.preventDefault(); zone.classList.add('drag') });
  zone.addEventListener('dragleave', ()=>zone.classList.remove('drag'));
  zone.addEventListener('drop', e=>{
    e.preventDefault(); zone.classList.remove('drag');
    handleImageFiles(e.dataTransfer.files, target);
  });
  input.addEventListener('change', ()=>handleImageFiles(input.files, target));
}

