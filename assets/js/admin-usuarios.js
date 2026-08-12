/**
 * admin-usuarios.js — Quién puede entrar al panel y editar el catálogo.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 *
 * ── Los dos roles, y por qué sólo hay dos ──
 *
 * `admin` puede todo: alta y baja de equipos, precios, fotos, marca, publicar.
 * `staff` hoy NO puede entrar al panel — las políticas de la base sólo abren
 * el catálogo a un admin.
 *
 * Podría parecer que `staff` sobra. No sobra: es cómo se le quita el acceso a
 * alguien sin borrarle la cuenta. Eliminar a una persona borra su rastro y no
 * siempre es lo que se quiere; bajarla a `staff` la deja fuera hoy y permite
 * devolverle el acceso mañana con un clic.
 *
 * ── Todo pasa por el servidor ──
 *
 * Este archivo no habla con Supabase: habla con /api/usuarios, que comprueba
 * la sesión y usa la llave de servicio. Esa llave puede saltarse cada política
 * de la base, así que no puede estar en un archivo que descarga cualquiera.
 * Aquí sólo hay pantalla.
 */
'use strict';

let usuarios = null;          // null = no se ha pedido todavía
let pidiendoUsuarios = false;
let errorUsuarios = '';

/** Llama a /api/usuarios con la sesión de quien está en el panel. */
async function apiUsuarios(metodo, cuerpo){
  const s = auth.sesion();
  if(!s) throw new Error('Tu sesión expiró. Vuelve a entrar.');

  const r = await fetch('/api/usuarios', {
    method: metodo,
    headers: {
      Authorization: `Bearer ${s.access_token}`,
      ...(cuerpo ? {'Content-Type':'application/json'} : {}),
    },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
  });

  const d = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.error || 'No se pudo completar la operación.');
  return d;
}

async function cargarUsuarios(forzar){
  if(pidiendoUsuarios || (usuarios !== null && !forzar)) return;
  pidiendoUsuarios = true;
  try{
    usuarios = (await apiUsuarios('GET')).usuarios || [];
    errorUsuarios = '';
  }catch(e){
    usuarios = [];
    errorUsuarios = e.message;
  }finally{
    pidiendoUsuarios = false;
    if(isAdmin && adminTab === 'usuarios') renderAdmin();
  }
}

function usuariosHTML(){
  if(usuarios === null){
    cargarUsuarios();
    return '<p class="adm-note">Cargando el personal…</p>';
  }

  const filas = usuarios.map(u => `
    <tr>
      <td>
        <div style="font-weight:600">${esc(u.correo)}</div>
        <div style="font-size:11px;color:var(--light)">${esc(u.nombre)}${
          u.confirmado ? '' : ' · <span style="color:#B26A00">invitación sin aceptar</span>'}</div>
      </td>
      <td><span class="pill ${u.rol === 'admin' ? 'nuevo' : ''}">${
        u.rol === 'admin' ? 'Administrador' : 'Sin acceso'}</span></td>
      <td><div class="adm-row-actions">
        <button class="icon-btn" type="button" data-usuario-rol="${esc(u.id)}"
                data-rol="${u.rol === 'admin' ? 'staff' : 'admin'}"
                title="${u.rol === 'admin' ? 'Quitar el acceso' : 'Dar acceso de administrador'}"
                aria-label="${u.rol === 'admin' ? 'Quitar el acceso a' : 'Dar acceso a'} ${esc(u.correo)}">${
                  u.rol === 'admin' ? '↓' : '↑'}</button>
        <button class="icon-btn del" type="button" data-usuario-del="${esc(u.id)}"
                title="Eliminar la cuenta" aria-label="Eliminar la cuenta de ${esc(u.correo)}">🗑</button>
      </div></td>
    </tr>`).join('');

  return `
    ${errorUsuarios ? `<p class="adm-note"><strong>No se pudo cargar:</strong> ${esc(errorUsuarios)}</p>` : ''}

    <div class="adm-section">
      <h3>Invitar a alguien</h3>
      <p class="sub">Le llega un correo con un enlace para poner su propia contraseña.
         Nunca escribes tú la contraseña de otra persona: así no pasa por WhatsApp
         ni se queda en la cabeza de nadie.</p>
      <div class="form-grid">
        <div class="field">
          <label for="uNombre">Nombre</label>
          <input id="uNombre" type="text" placeholder="Nombre y apellido" autocomplete="off">
        </div>
        <div class="field">
          <label for="uCorreo">Correo</label>
          <input id="uCorreo" type="email" placeholder="persona@empresa.com" autocomplete="off">
        </div>
        <div class="field">
          <label for="uRol">Puede</label>
          <select id="uRol">
            <option value="admin">Editar el catálogo (administrador)</option>
            <option value="staff">Nada por ahora (sin acceso)</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn-primary" type="button" id="uInvitar">Enviar invitación</button>
      </div>
    </div>

    <div class="adm-section">
      <h3>Personal (${usuarios.length})</h3>
      <p class="sub">«Sin acceso» no borra la cuenta: la deja fuera del panel y se le puede
         devolver el acceso con un clic. Eliminar sí es definitivo.</p>
      ${usuarios.length ? `
        <table class="adm-table">
          <thead><tr><th>Cuenta</th><th>Permiso</th><th></th></tr></thead>
          <tbody>${filas}</tbody>
        </table>` : '<p class="sub">Todavía no hay nadie más.</p>'}
    </div>

    <p class="adm-note">
      No puedes cambiarte el rol a ti mismo ni eliminar tu propia cuenta, y el sistema no deja
      quitar al <strong>último administrador</strong>: sin esos candados, un clic distraído deja
      a la empresa fuera de su propio panel.
    </p>`;
}

async function invitarUsuario(){
  const nombre = $('#uNombre').value.trim();
  const correo = $('#uCorreo').value.trim();
  const rol = $('#uRol').value;
  const btn = $('#uInvitar');

  if(!nombre || !correo){ showToast('Escribe el nombre y el correo.', true); return }

  btn.disabled = true;
  btn.textContent = 'Enviando…';
  try{
    const d = await apiUsuarios('POST', {nombre, correo, rol});
    showToast(d.mensaje || 'Invitación enviada');
    $('#uNombre').value = ''; $('#uCorreo').value = '';
    await cargarUsuarios(true);
    renderAdmin();
  }catch(e){
    showToast(e.message, true);
  }finally{
    btn.disabled = false;
    btn.textContent = 'Enviar invitación';
  }
}

async function cambiarRolUsuario(id, rol){
  try{
    await apiUsuarios('PATCH', {id, rol});
    showToast(rol === 'admin' ? 'Ahora puede editar el catálogo' : 'Acceso retirado');
    await cargarUsuarios(true);
    renderAdmin();
  }catch(e){ showToast(e.message, true) }
}

async function eliminarUsuario(id){
  const u = (usuarios || []).find(x => x.id === id);
  if(!confirm(`¿Eliminar la cuenta de ${u ? u.correo : 'esta persona'}?\n\nEs definitivo: tendrá que ser invitada otra vez.`)) return;
  try{
    await apiUsuarios('DELETE', {id});
    showToast('Cuenta eliminada');
    await cargarUsuarios(true);
    renderAdmin();
  }catch(e){ showToast(e.message, true) }
}
