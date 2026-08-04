/**
 * admin.js — Panel de administración: CRUD de equipos, imágenes, marca y respaldos.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 */
'use strict';

/* ══════════════════════════════════════════════════════════
   PANEL DE ADMINISTRACIÓN
   ══════════════════════════════════════════════════════════ */
let adminTab = 'products';
let adminQuery = '';
let editingId = null;   // null = listado, 0 = nuevo, n = editando ese id
let draftImg;           // undefined = sin cambios, null = borrada, string = nueva

/** Redimensiona y comprime una imagen a data URI. Los SVG se leen tal cual. */
async function fileToDataURL(file, maxW = 1000, quality = 0.82){
  if(!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen.');
  if(file.type === 'image/svg+xml'){
    if(file.size > 200*1024) throw new Error('El SVG es muy pesado (máx. 200 KB).');
    return await new Promise((res,rej)=>{
      const r = new FileReader();
      r.onload = ()=>res(r.result);
      r.onerror = ()=>rej(new Error('No se pudo leer el archivo.'));
      r.readAsDataURL(file);
    });
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width*scale));
  const h = Math.max(1, Math.round(bitmap.height*scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const keepAlpha = file.type === 'image/png' || file.type === 'image/webp';
  if(!keepAlpha){ ctx.fillStyle = '#fff'; ctx.fillRect(0,0,w,h) }
  ctx.drawImage(bitmap, 0, 0, w, h);
  if(bitmap.close) bitmap.close();
  return c.toDataURL(keepAlpha ? 'image/webp' : 'image/jpeg', quality);
}

const dataUriBytes = uri => uri ? Math.round((uri.length - (uri.indexOf(',')+1)) * 0.75) : 0;

function openAdmin(tab){
  if(isAdmin){ adminTab = tab || adminTab }
  closeAll();
  lastFocused = document.activeElement;
  if(isAdmin) renderAdmin(); else renderLogin();
  $('#adminOverlay').classList.add('open');
  lockScroll(true);
  openPanel = $('#adminPanel');
  const f = $('#adminBody').querySelector(FOCUSABLE) || $('#adminClose');
  f.focus();
}

function renderLogin(){
  $('#adminTabs').hidden = true;
  $('#adminBody').innerHTML = `
    <div class="login-box">
      <div class="dz-icon">🔒</div>
      <h3>Acceso de administrador</h3>
      <p>Ingresa tu PIN para editar el catálogo, las imágenes y el logo.</p>
      <label class="sr-only" for="pinInput">PIN</label>
      <input id="pinInput" type="password" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="••••">
      <div class="err" id="pinErr"></div>
      <button class="btn-primary" type="button" id="pinBtn" style="width:100%;margin-top:10px;padding:12px">Entrar</button>
      <p style="margin-top:14px;font-size:11px">PIN inicial: <strong>${FIRST_PIN}</strong> — cámbialo en la pestaña Respaldo.</p>
    </div>`;

  const input = $('#pinInput'), btn = $('#pinBtn'), err = $('#pinErr');

  const refreshLock = ()=>{
    const left = pinLockedFor();
    if(left > 0){
      input.disabled = btn.disabled = true;
      err.textContent = `Demasiados intentos. Espera ${Math.ceil(left/1000)} s.`;
      setTimeout(refreshLock, 1000);
    } else if(input.disabled){
      input.disabled = btn.disabled = false;
      err.textContent = '';
      input.focus();
    }
  };
  refreshLock();

  const submit = async ()=>{
    if(pinLockedFor() > 0) return;
    await ensurePinHash();          // por si el hash aún no se había calculado
    const attempt = await hashPin(input.value);
    if(attempt === settings.pinHash){
      sessionStorage.setItem('mdc_pin_tries','0');
      isAdmin = true;
      sessionStorage.setItem('mdc_admin','1');
      document.body.classList.add('is-admin');
      adminTab = 'products';
      renderAdmin(); render();
      showToast('Modo administrador activado');
    } else {
      const left = registerPinFailure();
      input.value = '';
      if(left === 0) refreshLock();
      else { err.textContent = `PIN incorrecto. Te quedan ${left} intentos.`; input.focus() }
    }
  };
  btn.addEventListener('click', submit);
  input.addEventListener('keydown', e=>{ if(e.key==='Enter') submit() });
}

/** Dibuja el panel y reconecta los widgets que necesitan listeners propios. */
function renderAdmin(){
  $('#adminTabs').hidden = false;
  $$('#adminTabs .admin-tab').forEach(b=>b.setAttribute('aria-selected', String(b.dataset.tab===adminTab)));

  const body = $('#adminBody');
  if(editingId !== null) body.innerHTML = productFormHTML();
  else if(adminTab==='products') body.innerHTML = productListHTML();
  else if(adminTab==='brand') body.innerHTML = brandHTML();
  else if(adminTab==='site') body.innerHTML = siteHTML();
  else body.innerHTML = backupHTML();

  wireDropzone('dz','imgInput','product');
  wireDropzone('dzLogo','logoInput','logo');
  wireDropzone('dzHero','heroInput','hero');

  const s = $('#admSearch');
  if(s) s.addEventListener('input', e=>{
    adminQuery = e.target.value;
    renderAdmin();
    const again = $('#admSearch');
    again.focus();
    again.setSelectionRange(again.value.length, again.value.length);
  });

  const form = $('#pForm');
  if(form) form.addEventListener('submit', e=>{ e.preventDefault(); saveProductForm() });
}

/* ── Listado de equipos ── */
function productListHTML(){
  const q = adminQuery.toLowerCase();
  const list = products.filter(p=>!q || `${p.name} ${p.brand} ${p.cat} ${p.location}`.toLowerCase().includes(q));
  return `
    <div class="adm-toolbar">
      <input class="adm-search" type="search" id="admSearch" placeholder="Buscar por nombre, marca, categoría…" value="${esc(adminQuery)}">
      <button class="btn-primary" type="button" data-action="admin-new">+ Nuevo equipo</button>
    </div>
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
            <div style="font-size:11px;color:var(--light)">${esc(p.brand)} · ${p.year}${p.hot?' · 🔥 destacado':''}${p.img?'':' · sin foto'}</div>
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
                  shipping:true,location:'',year:new Date().getFullYear(),specs:[],desc:'',svgKey:'excavadora',img:null,hot:false};
  const img = draftImg === undefined ? v.img : draftImg;

  return `
    <div class="adm-toolbar">
      <button class="btn-ghost" type="button" data-action="admin-cancel">← Volver al listado</button>
      <strong style="font-size:15px">${nuevo?'Nuevo equipo':'Editar: '+esc(v.name)}</strong>
    </div>
    <form id="pForm" novalidate>
      <div class="adm-section">
        <h3>Foto del equipo</h3>
        <p class="sub">Se redimensiona a 1000 px y se comprime automáticamente. Si no subes foto se usa un ícono ilustrativo.</p>
        ${img ? `
          <div class="img-preview">
            <img src="${esc(img)}" alt="Vista previa">
            <button class="rm" type="button" data-action="img-remove">✕ Quitar foto</button>
            <div class="img-meta">Peso aproximado: ${fmtKB(dataUriBytes(img))}</div>
          </div>` : `
          <div class="dropzone" id="dz" tabindex="0" role="button" aria-label="Subir foto del equipo">
            <div class="dz-icon">📷</div>
            <p><strong>Haz clic o arrastra una imagen aquí</strong></p>
            <p>JPG, PNG o WebP</p>
          </div>`}
        <input type="file" id="imgInput" accept="image/*" hidden>
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

      <div class="form-actions">
        ${!nuevo?`<button class="btn-danger" type="button" data-delp="${v.id}">Eliminar equipo</button>`:''}
        <button class="btn-ghost" type="button" data-action="admin-cancel">Cancelar</button>
        <button class="btn-primary" type="submit">${nuevo?'Publicar equipo':'Guardar cambios'}</button>
      </div>
    </form>`;
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
    svgKey: val('f-svg')
  };
}

function saveProductForm(){
  const data = readForm();
  let ok = true;
  $$('#pForm .field').forEach(f=>f.classList.remove('err'));
  if(!data.name){ $('[data-f="name"]').classList.add('err'); ok = false }
  if(data.price === null || data.price < 0){ $('[data-f="price"]').classList.add('err'); ok = false }
  if(!ok){ showToast('Revisa los campos marcados', true); return }

  // Un "precio anterior" que no sea mayor no representa un descuento.
  if(data.original !== null && data.original <= data.price) data.original = null;

  const prev = editingId ? products.find(p=>p.id===editingId) : null;
  const img = draftImg === undefined ? (prev ? prev.img : null) : draftImg;
  const snapshot = prev ? {...prev} : null;

  if(prev) Object.assign(prev, data, {img});
  else {
    const nextId = products.reduce((m,p)=>Math.max(m,p.id), 0) + 1;
    products.unshift({id: nextId, ...data, img});
  }

  if(!saveProducts()){
    // Sin espacio: revertimos para que la pantalla no mienta sobre lo guardado.
    if(prev) Object.assign(prev, snapshot); else products.shift();
    return;
  }

  showToast(prev ? 'Equipo actualizado' : 'Equipo publicado');
  editingId = null; draftImg = undefined;
  navSignature = '';
  renderAdmin(); render(); renderCart();
}

function deleteProduct(id){
  const p = products.find(x=>x.id===id);
  if(!p) return;
  if(!confirm(`¿Eliminar "${p.name}"?\n\nEsta acción no se puede deshacer.`)) return;
  products = products.filter(x=>x.id!==id);
  cart = cart.filter(x=>x.id!==id);
  favorites.delete(id);
  saveProducts(); saveCart(); saveFavs();
  editingId = null; draftImg = undefined;
  navSignature = '';
  renderAdmin(); render(); renderCart();
  showToast('Equipo eliminado');
}

function duplicateProduct(id){
  const p = products.find(x=>x.id===id);
  if(!p) return;
  const nextId = products.reduce((m,x)=>Math.max(m,x.id), 0) + 1;
  products.splice(products.indexOf(p)+1, 0, {...p, id: nextId, name: p.name + ' (copia)', hot: false});
  saveProducts(); renderAdmin(); render();
  showToast('Equipo duplicado');
}

/* ── Logo y marca ── */
function brandHTML(){
  return `
    <div class="adm-section">
      <h3>Logotipo</h3>
      <p class="sub">Se muestra en el encabezado. Recomendado: PNG o SVG con fondo transparente, alto ~80 px.</p>
      ${settings.logo ? `
        <div class="img-preview" style="background:#1A1A1A;max-width:340px">
          <img src="${esc(settings.logo)}" alt="Logo actual" style="max-height:110px;padding:14px">
          <button class="rm" type="button" data-action="logo-remove">✕ Quitar logo</button>
          <div class="img-meta">Peso: ${fmtKB(dataUriBytes(settings.logo))}</div>
        </div>` : `
        <div class="dropzone" id="dzLogo" tabindex="0" role="button" aria-label="Subir logotipo" style="max-width:340px">
          <div class="dz-icon">🖼️</div>
          <p><strong>Haz clic o arrastra tu logo</strong></p>
          <p>PNG, SVG o WebP · fondo transparente</p>
        </div>`}
      <input type="file" id="logoInput" accept="image/*" hidden>
    </div>

    <div class="adm-section">
      <h3>Logo de texto</h3>
      <p class="sub">Se usa cuando no hay imagen de logo. La segunda parte toma el color de acento.</p>
      <div class="form-grid">
        <div class="field">
          <label for="s-brandMain">Texto principal</label>
          <input type="text" id="s-brandMain" data-set="brandMain" maxlength="12" value="${esc(settings.brandMain)}">
        </div>
        <div class="field">
          <label for="s-brandAccent">Texto en color</label>
          <input type="text" id="s-brandAccent" data-set="brandAccent" maxlength="12" value="${esc(settings.brandAccent)}">
        </div>
        <div class="field full">
          <label for="s-brandFull">Nombre completo</label>
          <input type="text" id="s-brandFull" data-set="brandFull" value="${esc(settings.brandFull)}">
        </div>
        <div class="field">
          <label for="s-accent">Color de acento</label>
          <input type="color" id="s-accent" data-set="accent" value="${esc(settings.accent)}" style="height:42px;padding:4px;border:1px solid var(--border2);border-radius:6px;width:100%;cursor:pointer">
        </div>
        <div class="field" style="justify-content:flex-end">
          <button class="btn-ghost" type="button" data-action="accent-reset">Restaurar amarillo original</button>
        </div>
      </div>
    </div>

    <div class="adm-section">
      <h3>Imagen del banner principal</h3>
      <p class="sub">Aparece a la derecha del texto del banner. Si la dejas vacía se usa la ilustración por defecto.</p>
      ${settings.heroImage ? `
        <div class="img-preview" style="max-width:420px">
          <img src="${esc(settings.heroImage)}" alt="Imagen del banner">
          <button class="rm" type="button" data-action="hero-remove">✕ Quitar imagen</button>
          <div class="img-meta">Peso: ${fmtKB(dataUriBytes(settings.heroImage))}</div>
        </div>` : `
        <div class="dropzone" id="dzHero" tabindex="0" role="button" aria-label="Subir imagen del banner" style="max-width:420px">
          <div class="dz-icon">🏗️</div>
          <p><strong>Haz clic o arrastra una foto</strong></p>
          <p>Ideal: horizontal, 800×500 px</p>
        </div>`}
      <input type="file" id="heroInput" accept="image/*" hidden>
    </div>`;
}

/* ── Textos del sitio ── */
function siteHTML(){
  const f = (id,label,hint) => `
    <div class="field${['heroText','footerAbout','topbarMsg'].includes(id)?' full':''}">
      <label for="s-${id}">${label}${hint?` <span class="hint">${hint}</span>`:''}</label>
      ${['heroText','footerAbout'].includes(id)
        ? `<textarea id="s-${id}" data-set="${id}">${esc(settings[id])}</textarea>`
        : `<input type="text" id="s-${id}" data-set="${id}" value="${esc(settings[id])}">`}
    </div>`;
  return `
    <p class="adm-note">Los cambios se guardan al salir de cada campo y se ven en la página al instante.</p>
    <div class="adm-section">
      <h3>Encabezado y banner</h3>
      <div class="form-grid">
        ${f('topbarMsg','Mensaje de la barra superior')}
        ${f('heroTag','Etiqueta del banner')}
        ${f('heroTitle','Título del banner')}
        ${f('heroHighlight','Título resaltado','(en color de acento)')}
        ${f('heroText','Texto del banner')}
      </div>
    </div>
    <div class="adm-section">
      <h3>Datos de contacto</h3>
      <div class="form-grid">
        ${f('sellerName','Nombre del vendedor','(en la ficha del equipo)')}
        ${f('phone','Teléfono')}
        ${f('whatsapp','WhatsApp','(con lada país, ej. 5219611234567)')}
        ${f('email','Correo')}
        ${f('address','Dirección / ciudad')}
        ${f('hours','Horario')}
        ${f('footerAbout','Descripción del pie de página')}
      </div>
    </div>
    <div class="adm-section">
      <h3>Sucursales</h3>
      <p class="sub">Aparecen en la página «Sucursales». El botón «Cómo llegar» se arma solo con la dirección que escribas.</p>
      ${(settings.branches||[]).map((b,i)=>`
        <div class="branch" style="margin-bottom:14px">
          <div class="form-grid">
            <div class="field"><label>Nombre</label>
              <input type="text" data-branch="${i}" data-bfield="name" value="${esc(b.name)}"></div>
            <div class="field"><label>Teléfono</label>
              <input type="text" data-branch="${i}" data-bfield="phone" value="${esc(b.phone)}"></div>
            <div class="field full"><label>Dirección</label>
              <input type="text" data-branch="${i}" data-bfield="address" value="${esc(b.address)}"></div>
            <div class="field full"><label>Horario</label>
              <input type="text" data-branch="${i}" data-bfield="hours" value="${esc(b.hours)}"></div>
          </div>
          <div class="links" style="margin-top:12px">
            <button class="btn-danger" type="button" data-branch-del="${i}">Eliminar sucursal</button>
          </div>
        </div>`).join('')}
      <button class="btn-primary" type="button" data-action="branch-add">+ Agregar sucursal</button>
    </div>`;
}

/* ── Respaldo ── */
function backupHTML(){
  const used = store.usedBytes(), limit = 5*1024*1024, pct = Math.min(100, used/limit*100);
  const cls = pct>85 ? 'full' : pct>60 ? 'warn' : '';
  return `
    <p class="adm-note">
      <strong>Importante:</strong> todo lo que editas se guarda en el <em>localStorage de este navegador</em>, en esta
      computadora. Tus visitantes <strong>no verán estos cambios</strong>, y se pierden si limpias los datos del navegador
      o cambias de equipo. Exporta un respaldo con frecuencia. Para que el catálogo sea el mismo para todo el mundo
      hace falta un servidor con base de datos.
    </p>

    <div class="adm-section">
      <h3>Espacio utilizado</h3>
      <p class="sub">Límite aproximado del navegador: 5 MB. Las fotos son lo que más ocupa.</p>
      <div class="storage-bar ${cls}"><div style="width:${pct.toFixed(1)}%"></div></div>
      <p style="font-size:12px;color:var(--muted)">${fmtKB(used)} de ~5 MB (${pct.toFixed(1)}%) · ${products.filter(p=>p.img).length} de ${products.length} equipos con foto</p>
    </div>

    <div class="adm-section">
      <h3>Exportar / importar</h3>
      <p class="sub">El archivo JSON incluye equipos, imágenes, logo y configuración. Sirve como respaldo y para pasar todo a otra computadora.</p>
      <div class="adm-toolbar">
        <button class="btn-primary" type="button" data-action="export">⬇ Descargar respaldo (.json)</button>
        <button class="btn-ghost" type="button" data-action="import">⬆ Importar respaldo</button>
        <input type="file" id="importInput" accept="application/json,.json" hidden>
      </div>
    </div>

    <div class="adm-section">
      <h3>PIN de acceso</h3>
      <p class="sub">Se guarda hasheado, así que no aparece en claro ni en el navegador ni en tus respaldos,
        y se bloquea 60 segundos tras 5 intentos fallidos. Aun así, <strong>no es seguridad real:</strong>
        la comprobación ocurre en el navegador del visitante. La protección de verdad llega con el servidor.</p>
      <form id="pinChangeForm" class="form-grid" novalidate>
        <div class="field">
          <label for="p-new">Nuevo PIN <span class="hint">(4 a 8 dígitos)</span></label>
          <input type="password" id="p-new" maxlength="8" inputmode="numeric" autocomplete="new-password">
          <span class="errmsg">Usa entre 4 y 8 dígitos.</span>
        </div>
        <div class="field">
          <label for="p-confirm">Confirmar</label>
          <input type="password" id="p-confirm" maxlength="8" inputmode="numeric" autocomplete="new-password">
          <span class="errmsg">No coincide.</span>
        </div>
        <div class="field full">
          <button class="btn-primary" type="submit" style="justify-self:start">Cambiar PIN</button>
        </div>
      </form>
    </div>

    <div class="adm-section">
      <h3>Restablecer</h3>
      <p class="sub">Borra todo lo que has editado y vuelve al catálogo de ejemplo. Descarga un respaldo antes.</p>
      <button class="btn-danger" type="button" data-action="reset">⚠ Restablecer todo a valores de fábrica</button>
    </div>`;
}

function exportBackup(){
  const blob = new Blob([JSON.stringify({version:1, exported:new Date().toISOString(), settings, products}, null, 2)],
                        {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mdc-respaldo-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  showToast('Respaldo descargado');
}

async function importBackup(file){
  try{
    const data = JSON.parse(await file.text());
    if(!data || !Array.isArray(data.products)) throw new Error('formato');
    if(!confirm(`Se reemplazará el catálogo actual (${products.length} equipos) por el del respaldo (${data.products.length} equipos).\n\n¿Continuar?`)) return;
    products = normalizeProducts(data.products);
    settings = Object.assign({}, DEFAULT_SETTINGS, data.settings || {});
    cart = cart.filter(c=>products.some(p=>p.id===c.id));
    favorites = new Set([...favorites].filter(id=>products.some(p=>p.id===id)));
    saveProducts(); saveSettings(); saveCart(); saveFavs();
    navSignature = '';
    await ensurePinHash();   // un respaldo viejo puede no traer el PIN hasheado
    applyBranding(); renderAdmin(); render(); renderCart();
    showToast(`Respaldo importado: ${products.length} equipos`);
  }catch{
    showToast('El archivo no es un respaldo válido', true);
  }
}

async function resetAll(){
  if(!confirm('Se borrarán TODOS tus equipos, fotos y ajustes, y se volverá al catálogo de ejemplo.\n\n¿Seguro que quieres continuar?')) return;
  if(!confirm('Última confirmación: esta acción no se puede deshacer.')) return;
  products = normalizeProducts(DEFAULT_PRODUCTS);
  settings = {...DEFAULT_SETTINGS, branches: DEFAULT_SETTINGS.branches.map(b=>({...b}))};
  cart = []; favorites = new Set();
  saveProducts(); saveSettings(); saveCart(); saveFavs();
  navSignature = '';
  await ensurePinHash();   // vuelve a dejar el PIN en 2580, ya hasheado
  applyBranding(); renderAdmin(); render(); renderCart();
  showToast('Todo restablecido · el PIN volvió a ser '+FIRST_PIN);
}

/* ── Carga de imágenes ── */
async function handleImageFile(file, target){
  if(!file) return;
  try{
    showToast('Procesando imagen…');
    if(target==='product'){
      draftImg = await fileToDataURL(file, 1000, .82);
    } else if(target==='logo'){
      const prev = settings.logo;
      settings.logo = await fileToDataURL(file, 400, .9);
      if(!saveSettings()){ settings.logo = prev; return }
      applyBranding();
    } else {
      const prev = settings.heroImage;
      settings.heroImage = await fileToDataURL(file, 900, .82);
      if(!saveSettings()){ settings.heroImage = prev; return }
      applyBranding();
    }
    renderAdmin();
    showToast('Imagen lista');
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
    handleImageFile(e.dataTransfer.files[0], target);
  });
  input.addEventListener('change', ()=>handleImageFile(input.files[0], target));
}

function logoutAdmin(){
  isAdmin = false;
  sessionStorage.removeItem('mdc_admin');
  document.body.classList.remove('is-admin');
  editingId = null; draftImg = undefined;
  closeAll(); render();
  showToast('Sesión de administrador cerrada');
}
