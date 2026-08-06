/**
 * security.js — Todo lo relacionado con seguridad, en un solo lugar:
 *   · escapado de salida contra inyección de HTML
 *   · validación de teléfono y correo
 *   · filtro anti-spam sin servidor (trampa oculta + tiempo mínimo)
 *   · hash y bloqueo por intentos del PIN de administrador
 *
 * LÍMITE IMPORTANTE: todo esto corre en el navegador del visitante, así que
 * protege contra errores y bots, NO contra un atacante decidido. Ver SECURITY.md.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 */
'use strict';

/* ══════════════════ ESCAPADO DE SALIDA ══════════════════ */
/* Todo texto que provenga de datos guardados pasa por aquí antes de
   inyectarse en el DOM. Es la defensa contra HTML malicioso en un nombre
   de equipo, un respaldo importado o un campo del panel. */
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ── Validación ── */
const PHONE_RE = /^\d{10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * Lee y valida un conjunto de campos. Marca en rojo los inválidos.
 * @returns {object|null} valores si todo pasó, null si hubo errores.
 */
function readAndValidate(defs){
  const out = {};
  let ok = true, firstBad = null;
  defs.forEach(d=>{
    const el = $('#'+d.id);
    if(!el) return;
    const wrap = el.closest('.field');
    if(wrap) wrap.classList.remove('err');
    const v = el.value.trim();
    let bad = false;
    if(d.required && !v) bad = true;
    else if(v && d.type==='tel' && !PHONE_RE.test(v.replace(/\D/g,''))) bad = true;
    else if(v && d.type==='email' && !EMAIL_RE.test(v)) bad = true;
    if(bad){ ok = false; if(wrap) wrap.classList.add('err'); if(!firstBad) firstBad = el }
    out[d.id] = v;
  });
  if(!ok){ showToast('Revisa los campos marcados en rojo', true); if(firstBad) firstBad.focus() }
  return ok ? out : null;
}

/** Filtro anti-spam sin depender de un servidor: trampa oculta + tiempo mínimo. */
function botCheck(){
  const hp = $('#hp_empresa');
  if(hp && hp.value){
    // Un bot llenó el campo invisible. Fingimos éxito para no darle pistas.
    showToast('Solicitud enviada');
    closeAll();
    return 'bot';
  }
  // formOpenedAt en 0 significa "ya reintentó": no volvemos a medir el tiempo.
  if(formOpenedAt && performance.now() - formOpenedAt < 1000){
    formOpenedAt = 0;
    showToast('Verifica tus datos y vuelve a enviar', true);
    return 'fast';
  }
  return 'ok';
}

const HP = `<input class="hp-field" type="text" id="hp_empresa" name="empresa" tabindex="-1" autocomplete="off" aria-hidden="true">`;
/* ── El PIN ya no existe ──────────────────────────────────
   Aquí vivían el hasheo del PIN y el bloqueo por intentos fallidos. Se
   retiran porque la comparación ocurría EN EL NAVEGADOR: cualquiera con las
   herramientas de desarrollador la saltaba, y el bloqueo por intentos se
   limpiaba borrando una entrada de sessionStorage.

   Lo sustituye una cuenta de Supabase, con la comprobación en el servidor.
   Ver auth.js. */
