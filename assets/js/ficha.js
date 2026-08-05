/**
 * ficha.js — Simulador de financiamiento y ficha imprimible.
 *
 * Este archivo es AUTÓNOMO a propósito: se carga tanto en la aplicación como en
 * las páginas estáticas /equipos/<slug>/, donde no existe ningún otro módulo.
 * No puede depender de utils.js ni de nada global.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 */
'use strict';

/* ══════════════════ CÁLCULO ══════════════════ */

/* Supuestos por defecto del simulador. Se editan en pantalla: son un punto de
   partida, no la oferta de MDC. Ver el aviso al pie de la calculadora. */
const CALC_DEF = { enganche: 20, plazo: 36, tasa: 16 };
const CALC_PLAZOS = [12, 24, 36, 48, 60];

const pesos = new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
});

/**
 * Mensualidad de un crédito con pagos iguales (sistema francés).
 * A tasa cero la fórmula se indetermina, así que ese caso va aparte.
 */
function mensualidadCredito(monto, tasaAnual, meses) {
  if (!(monto > 0) || !(meses > 0)) return 0;
  const i = tasaAnual / 100 / 12;
  if (i === 0) return monto / meses;
  return (monto * i) / (1 - Math.pow(1 + i, -meses));
}

/** Simula la compra a crédito de un equipo. Devuelve pesos enteros. */
function simularCredito(precio, { enganche, plazo, tasa }) {
  const pagoInicial = Math.round(precio * (enganche / 100));
  const financiado = precio - pagoInicial;
  const exacta = mensualidadCredito(financiado, tasa, plazo);

  /* Los totales salen de la mensualidad EXACTA, no de la redondeada. Multiplicar
     una cifra ya redondeada por el plazo arrastra el error: a tasa cero llegaba
     a decir que pagabas menos que el precio del equipo. Se redondea al final. */
  const totalPagos = Math.round(exacta * plazo);
  return {
    pagoInicial, financiado, plazo,
    mensual: Math.round(exacta),
    total: pagoInicial + totalPagos,
    intereses: totalPagos - financiado,
  };
}

/* ══════════════════ PANTALLA ══════════════════ */

/**
 * Markup de la calculadora. `precio` viaja en el HTML para que la página
 * estática no necesite que nadie se lo pase por JavaScript.
 */
function calculadoraHTML(precio, opts = {}) {
  const msi = opts.msi ? parseInt(opts.msi, 10) : 0;
  return `
<section class="calc" data-calc data-precio="${precio}" aria-labelledby="calcTitulo">
  <h3 id="calcTitulo">🧮 Simula tu financiamiento</h3>

  <div class="calc-campos">
    <div class="calc-campo">
      <label for="calc-enganche">Enganche: <output data-calc-out="enganche">${CALC_DEF.enganche}%</output></label>
      <input type="range" id="calc-enganche" data-calc-in="enganche"
             min="0" max="60" step="5" value="${CALC_DEF.enganche}">
    </div>

    <div class="calc-campo">
      <label for="calc-plazo">Plazo</label>
      <select id="calc-plazo" data-calc-in="plazo">
        ${CALC_PLAZOS.map(m => `<option value="${m}"${m === CALC_DEF.plazo ? ' selected' : ''}>${m} meses</option>`).join('')}
      </select>
    </div>

    <div class="calc-campo">
      <label for="calc-tasa">Tasa anual estimada</label>
      <div class="calc-tasa">
        <input type="number" id="calc-tasa" data-calc-in="tasa" min="0" max="60" step="0.5" value="${CALC_DEF.tasa}">
        <span>%</span>
      </div>
    </div>
  </div>

  <div class="calc-salida" aria-live="polite">
    <div class="calc-mensual">
      <span class="calc-etq">Tu pago mensual</span>
      <strong data-calc-out="mensual">—</strong>
      <span class="calc-plazo-txt" data-calc-out="plazoTxt"></span>
    </div>
    <dl class="calc-desglose">
      <div><dt>Enganche</dt><dd data-calc-out="pagoInicial">—</dd></div>
      <div><dt>A financiar</dt><dd data-calc-out="financiado">—</dd></div>
      <div><dt>Intereses</dt><dd data-calc-out="intereses">—</dd></div>
      <div><dt>Total pagado</dt><dd data-calc-out="total">—</dd></div>
    </dl>
  </div>

  <!-- En papel los controles no se ven, así que la cifra tiene que venir
       acompañada de los supuestos que la produjeron. -->
  <p class="calc-supuestos" data-calc-out="supuestos"></p>

  ${msi ? `<p class="calc-msi">💳 Este equipo también tiene <strong>${msi} meses sin intereses</strong>:
    ${pesos.format(Math.round(precio / msi))} al mes, sin enganche y sin pagar intereses.</p>` : ''}

  <p class="calc-nota">Cálculo estimado con fines informativos. No es una oferta de
    crédito ni incluye seguro, comisión por apertura ni IVA sobre intereses.
    La tasa y el plazo definitivos los determina la institución financiera.</p>
</section>`;
}

/** Recalcula y pinta una calculadora ya presente en el documento. */
function refrescarCalculadora(root) {
  if (!root) return;
  const precio = Number(root.dataset.precio) || 0;
  const leer = (campo, porDefecto) => {
    const el = root.querySelector(`[data-calc-in="${campo}"]`);
    const n = el ? Number(el.value) : NaN;
    return Number.isFinite(n) ? n : porDefecto;
  };

  const datos = {
    enganche: Math.min(100, Math.max(0, leer('enganche', CALC_DEF.enganche))),
    plazo: Math.max(1, leer('plazo', CALC_DEF.plazo)),
    // Una tasa negativa haría que el simulador prometiera pagar menos que el
    // precio: se acota antes de calcular, no después de mostrarlo.
    tasa: Math.min(100, Math.max(0, leer('tasa', CALC_DEF.tasa))),
  };

  const r = simularCredito(precio, datos);
  const pon = (campo, texto) => {
    const el = root.querySelector(`[data-calc-out="${campo}"]`);
    if (el) el.textContent = texto;
  };

  pon('enganche', datos.enganche + '%');
  pon('mensual', pesos.format(r.mensual));
  pon('plazoTxt', `durante ${r.plazo} meses`);
  pon('pagoInicial', pesos.format(r.pagoInicial));
  pon('financiado', pesos.format(r.financiado));
  pon('intereses', pesos.format(r.intereses));
  pon('total', pesos.format(r.total));
  pon('supuestos', `Calculado con ${datos.enganche}% de enganche, ${datos.plazo} meses ` +
    `y una tasa anual estimada de ${datos.tasa}%.`);
}

/* ══════════════════ CABLEADO ══════════════════ */

/* Delegación en el documento: la misma línea sirve para la ficha estática y
   para el modal de la aplicación, que se vuelve a dibujar a cada rato. */
document.addEventListener('input', e => {
  const root = e.target.closest && e.target.closest('[data-calc]');
  if (root) refrescarCalculadora(root);
});
document.addEventListener('change', e => {
  const root = e.target.closest && e.target.closest('[data-calc]');
  if (root) refrescarCalculadora(root);
});

document.addEventListener('click', e => {
  if (e.target.closest && e.target.closest('[data-imprimir]')) window.print();
});

/* Primer pintado en las páginas estáticas. En la aplicación lo dispara
   openModal, porque ahí la calculadora nace después de este evento. */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-calc]').forEach(refrescarCalculadora);
});
