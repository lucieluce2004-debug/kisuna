/* Shared finishing layer. No persistence and no economic actions. */
(() => {
  'use strict';
  const main=document.getElementById('mainContent');
  if(!main)return;
  const status=document.createElement('p');
  status.className='kze-sr-only';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
  document.body.append(status);
  let frame;
  function announce(){
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      const context=document.getElementById('kzaHeaderContext')?.textContent||'KIZUNA';
      document.title=context+' · KIZUNA';
      status.textContent='Destination : '+context;
    });
  }
  window.addEventListener('kizuna:tab-change',announce);
  window.addEventListener('kizuna:adventure-view-change',announce);
  // A failed remote portrait keeps its frame and readable character name.
  document.addEventListener('error',event=>{
    const img=event.target;
    if(img instanceof HTMLImageElement&&img.closest('#profilePage,#encyclopedia,#universes,#ranking,#community,#marketPage,.ka-sanctuary')){
      img.classList.add('kze-image-unavailable');img.parentElement.classList.add('kze-art-unavailable');
    }
  },true);
  announce();
})();
