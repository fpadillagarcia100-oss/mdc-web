/**
 * cart.js — Carrito de cotización: alta, baja, cantidades y totales de compra y renta.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 */
'use strict';

/* ══════════════════ CARRITO ══════════════════ */
function addToCart(id){
  const p = products.find(x=>x.id===id);
  if(!p) return;
  const existing = cart.find(x=>x.id===id);
  if(existing) existing.qty++; else cart.push({id:p.id, qty:1});
  saveCart(); renderCart();
  showToast(`${p.name} agregado a la cotización`);
}
function changeQty(id,delta){
  const item = cart.find(x=>x.id===id);
  if(!item) return;
  item.qty += delta;
  if(item.qty<=0) cart = cart.filter(x=>x.id!==id);
  saveCart(); renderCart();
}
function removeFromCart(id){ cart = cart.filter(x=>x.id!==id); saveCart(); renderCart() }
const cartLines = () => cart.map(i=>{const p=products.find(x=>x.id===i.id); return p?{...p,qty:i.qty}:null}).filter(Boolean);

function renderCart(){
  const lines = cartLines();
  const units = lines.reduce((s,i)=>s+i.qty,0);
  const badge = $('#cartBadge');
  badge.textContent = units; badge.hidden = units===0;
  $('#cartCount').textContent = units;

  if(!lines.length){
    $('#cartItems').innerHTML = `<div class="cart-empty">
      <div class="cart-empty-icon" aria-hidden="true">🏗️</div>
      <p>Tu cotización está vacía.</p>
      <p style="font-size:12px;margin-top:6px">Agrega equipos para solicitar precios.</p></div>`;
    $('#cartSummary').innerHTML = '';
    $('#checkoutBtn').disabled = true;
    $('#waBtn').setAttribute('aria-disabled','true');
    return;
  }
  $('#checkoutBtn').disabled = false;
  $('#waBtn').removeAttribute('aria-disabled');

  $('#cartItems').innerHTML = lines.map(item=>`
    <div class="cart-item">
      <div class="cart-item-img" aria-hidden="true">${productMedia(item,false)}</div>
      <div class="cart-item-info">
        <p class="cart-item-name">${esc(item.name)}</p>
        <p class="cart-item-price">${fmtFull(item.price)}${item.cond==='Renta'?'<small> /mes</small>':''}</p>
        <div class="cart-item-qty">
          <button class="qty-btn" type="button" data-qty="-1" data-id="${item.id}" aria-label="Quitar una unidad de ${esc(item.name)}">−</button>
          <span class="qty-num">${item.qty}</span>
          <button class="qty-btn" type="button" data-qty="1" data-id="${item.id}" aria-label="Agregar una unidad de ${esc(item.name)}">+</button>
        </div>
      </div>
      <button class="cart-item-del" type="button" data-del="${item.id}" aria-label="Eliminar ${esc(item.name)}">🗑</button>
    </div>`).join('');

  const buyLines = lines.filter(i=>i.cond!=='Renta'), rentLines = lines.filter(i=>i.cond==='Renta');
  const buy = buyLines.reduce((s,i)=>s+i.price*i.qty,0);
  const rent = rentLines.reduce((s,i)=>s+i.price*i.qty,0);
  const totalTxt = `${buy?fmtFull(buy):''}${buy&&rent?' + ':''}${rent?fmtFull(rent)+'/mes':''}`;

  $('#cartSummary').innerHTML = `
    ${buy?`<div class="cart-row"><span>Compra (${buyLines.reduce((s,i)=>s+i.qty,0)} equipos)</span><span>${fmtFull(buy)}</span></div>`:''}
    ${rent?`<div class="cart-row"><span>Renta mensual (${rentLines.reduce((s,i)=>s+i.qty,0)} equipos)</span><span>${fmtFull(rent)}/mes</span></div>`:''}
    <div class="cart-row total"><span>Total estimado</span><span>${totalTxt}</span></div>
    <p class="cart-note">Precios de referencia sin IVA. La cotización formal se confirma por un asesor en menos de 24 h.</p>`;

  const msg = `Hola ${settings.brandMain}${settings.brandAccent}, me interesa cotizar:\n` +
    lines.map(i=>`• ${i.qty}× ${i.name} — ${fmtFull(i.price)}${i.cond==='Renta'?'/mes':''}`).join('\n') +
    `\n\nTotal estimado: ${totalTxt}`;
  $('#waBtn').href = `https://wa.me/${settings.whatsapp.replace(/\D/g,'')}?text=` + encodeURIComponent(msg);
}
