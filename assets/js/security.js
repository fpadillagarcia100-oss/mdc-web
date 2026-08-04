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

/* ── PIN ──────────────────────────────────────────────────
   Guardar el PIN hasheado evita que se lea en claro desde localStorage o desde
   un respaldo exportado. NO convierte esto en seguridad real: la comparación
   sigue ocurriendo en el navegador del visitante, así que quien sepa lo que hace
   puede saltársela. La protección de verdad llega cuando exista un servidor.   */
async function hashPin(pin){
  try{
    if(window.crypto && crypto.subtle){
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mdc:'+pin));
      return 'sha256:'+[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
    }
  }catch{/* contexto sin crypto.subtle: usamos el respaldo de abajo */}
  let h = 2166136261;
  for(let i=0;i<pin.length;i++){ h ^= pin.charCodeAt(i); h = Math.imul(h, 16777619) }
  return 'fnv:'+(h>>>0).toString(16);
}

async function ensurePinHash(){
  if(settings.pin){                       // migración desde versiones que lo guardaban en claro
    settings.pinHash = await hashPin(settings.pin);
    delete settings.pin;
    saveSettings();
  } else if(!settings.pinHash){
    settings.pinHash = await hashPin(FIRST_PIN);
    saveSettings();
  }
}

const LOCK_MS = 60000, MAX_TRIES = 5;
const pinLockedFor = () => Math.max(0, Number(sessionStorage.getItem('mdc_pin_lock')||0) - Date.now());

function registerPinFailure(){
  const tries = Number(sessionStorage.getItem('mdc_pin_tries')||0) + 1;
  if(tries >= MAX_TRIES){
    sessionStorage.setItem('mdc_pin_lock', String(Date.now()+LOCK_MS));
    sessionStorage.setItem('mdc_pin_tries','0');
    return 0;
  }
  sessionStorage.setItem('mdc_pin_tries', String(tries));
  return MAX_TRIES - tries;
}
