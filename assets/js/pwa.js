/**
 * pwa.js — Registra el trabajador de servicio y ofrece instalar la aplicación.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 *
 * Se separa de sw.js porque son dos programas distintos: aquel corre en su
 * propio hilo, sin DOM y sin acceso a nada de esta página; éste sólo lo
 * enciende y habla con el usuario.
 *
 * Nada de esto es obligatorio. Si el navegador no trae trabajadores de
 * servicio —o el sitio se abre por file://, o desde un http:// sin cifrar—
 * simplemente no pasa nada y el catálogo funciona como siempre.
 */
'use strict';

(function(){
  /* ═══════════ 1. ENCENDER EL TRABAJADOR ═══════════ */
  if('serviceWorker' in navigator && location.protocol === 'https:'){
    // Después de load: registrarlo antes compite por el ancho de banda con las
    // fotos y la hoja de estilos, y retrasa justo lo que el cliente vino a ver.
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('/sw.js').catch(err =>{
        if(window.console) console.warn('[MDC] Sin modo sin conexión:', err.message);
      });
    });
  }

  /* ═══════════ 2. INSTALAR ═══════════
     Chrome avisa cuando el sitio cumple los requisitos y deja aplazar su
     propio cartel para enseñarlo cuando convenga. Se guarda el aviso y se
     ofrece con un botón discreto en la barra superior: el cartel del navegador
     sale a destiempo y la mayoría lo cierra sin leerlo. */
  let aviso = null;

  window.addEventListener('beforeinstallprompt', e =>{
    e.preventDefault();
    aviso = e;
    mostrarBoton();
  });

  function mostrarBoton(){
    if(document.getElementById('instalarApp')) return;
    const barra = document.querySelector('.topbar-links');
    if(!barra) return;

    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'instalarApp';
    b.className = 'instalar';
    b.textContent = '⬇ Instalar app';
    b.title = 'Instálala para consultar el catálogo sin señal';
    b.addEventListener('click', async ()=>{
      if(!aviso) return;
      aviso.prompt();
      const { outcome } = await aviso.userChoice;
      aviso = null;                       // el aviso es de un solo uso
      b.remove();
      if(outcome === 'accepted' && typeof showToast === 'function'){
        showToast('Instalada. Ahora el catálogo abre aunque no haya señal.');
      }
    });
    barra.insertBefore(b, barra.firstChild);
  }

  window.addEventListener('appinstalled', ()=>{
    const b = document.getElementById('instalarApp');
    if(b) b.remove();
  });

  /* ═══════════ 3. AVISO DE QUE NO HAY RED ═══════════
     Sin esto, en obra sin señal el sitio parece roto: las fotos que faltan no
     cargan y nadie sabe por qué. Decirlo convierte un fallo en una condición
     entendible — y de paso explica por qué la cotización aún no salió. */
  const marca = ()=>{
    document.body.classList.toggle('sin-red', navigator.onLine === false);
  };
  window.addEventListener('online', ()=>{
    marca();
    if(typeof showToast === 'function') showToast('Volvió la señal.');
  });
  window.addEventListener('offline', marca);
  marca();
})();
