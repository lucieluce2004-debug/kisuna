/* Presentation routes and real account notifications. No economic operations. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id), routes={home:'home',boosters:'boosts',collection:'col',universes:'universes',marketPage:'market',encyclopedia:'wiki',ranking:'rank',community:'community',profile:'profile',staff:'staff',nexus:'nexus'};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let pending=false,albumSignature='',dialog,lastFocus,universeFilter='all';
  const fold=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
  const format=n=>Number(n||0).toLocaleString('fr-FR');
  function routeHash(){const tab=routes[location.hash.slice(1)];if(tab&&tab!==document.body.dataset.tab)window.KizunaGame?.showTab(tab);}
  function navigation(){
    const active={wiki:'universes',rank:'community',adventure:'universes'}[document.body.dataset.tab]||document.body.dataset.tab;
    document.querySelectorAll('.kz-shell-nav a').forEach(link=>{const selected=link.dataset.tab===active;link.classList.toggle('active',selected);if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    schedule();
  }
  function renderUniverses(){
    if(!$('kzUniverseGrid'))return;
    const query=fold(($('kzUniverseSearch')?.value||'').trim());
    const loading=window.KizunaAccount?.getSnapshot?.().loading;
    setupUniverseTools();
    if(loading)universeFilter='all';
    const all=window.KizunaGame?.getAlbums?.()||[];
    const albums=all.filter(a=>fold(a.name).includes(query)&&(universeFilter==='all'||universeFilter==='started'&&a.owned>0&&a.owned<a.total||universeFilter==='complete'&&a.total>0&&a.owned>=a.total||universeFilter==='new'&&a.owned===0));
    document.querySelectorAll('[data-kz-universe-filter]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.kzUniverseFilter===universeFilter));b.disabled=!!loading&&b.dataset.kzUniverseFilter!=='all';});
    const signature=JSON.stringify([loading,query,universeFilter,all.map(a=>[a.key,a.name,a.owned,a.total,a.cover])]);
    if(signature===albumSignature)return;albumSignature=signature;
    const resume=!loading&&all.filter(a=>a.owned>0&&a.owned<a.total).sort((a,b)=>b.owned/b.total-a.owned/a.total)[0];
    $('kzUniverseResume').innerHTML=resume?'<span><small>LE PROCHAIN LIEN T’ATTEND</small><strong>'+esc(resume.name)+'</strong><span>'+format(resume.total-resume.owned)+' cartes à découvrir pour compléter cet album.</span></span><button class="soft-btn" type="button" data-kz-resume="'+esc(resume.key)+'">Reprendre cet album ↗</button>':'';
    $('kzUniverseResume').hidden=!resume;
    $('kzUniverseCount').textContent=albums.length+' univers · ordre alphabétique';
    $('kzUniverseGrid').innerHTML=albums.map((a,i)=>'<button class="kz-universe-tile" data-kz-album="'+esc(a.key)+'" type="button"><span class="kad-universe-number" aria-hidden="true">'+String(i+1).padStart(2,'0')+'</span><img src="'+esc(a.cover)+'" alt="" width="300" height="180" loading="lazy" decoding="async"><span class="kz-universe-name">'+esc(a.name)+'</span><span class="kz-universe-count">'+(loading?'Chargement…':format(a.owned)+' / '+format(a.total)+' cartes')+'</span><span class="kad-universe-progress" aria-hidden="true"><i style="width:'+(loading?0:Math.min(100,a.owned/Math.max(1,a.total)*100))+'%"></i></span><span class="kz-universe-link">Ouvrir l’album <span aria-hidden="true">↗</span></span></button>').join('')||'<div class="kz-empty"><h2>Aucun monde sur cet horizon.</h2><p>Essaie un autre nom ou retrouve tous les univers.</p><button type="button" class="soft-btn" data-kz-universe-reset>Afficher tous les univers</button></div>';
  }
  function setupUniverseTools(){
    if($('kzUniverseFilters'))return;
    const grid=$('kzUniverseGrid'),filters=document.createElement('div');
    filters.id='kzUniverseFilters';filters.className='kad-universe-filters';filters.setAttribute('role','group');filters.setAttribute('aria-label','Progression des albums');
    filters.innerHTML=[['all','Tous les mondes'],['started','En cours'],['complete','Complétés'],['new','À découvrir']].map(([key,label])=>'<button class="soft-btn" type="button" data-kz-universe-filter="'+key+'" aria-pressed="false">'+label+'</button>').join('');
    const resume=document.createElement('aside');resume.id='kzUniverseResume';resume.className='kad-universe-resume';resume.hidden=true;
    grid.before(resume,filters);
    filters.addEventListener('click',event=>{const b=event.target.closest('[data-kz-universe-filter]');if(b){universeFilter=b.dataset.kzUniverseFilter;renderUniverses();}});
    resume.addEventListener('click',event=>{const b=event.target.closest('[data-kz-resume]');if(b)window.KizunaGame?.openAlbumKey(b.dataset.kzResume);});
    $('kzUniverseSearch')?.setAttribute('aria-controls','kzUniverseGrid');
  }
  function renderNotifications(){
    if(!dialog?.open)return;
    const account=window.KizunaAccount?.getSnapshot?.()||{},game=window.KizunaGame?.getSnapshot?.()||{};
    const status=account.loading?'Chargement de ton compte…':account.error||(!account.user?'Mode invité. Connecte-toi avec Discord pour synchroniser ta collection.':account.status==='synced'?'Ta collection est synchronisée.':'Synchronisation de ta progression en cours.');
    dialog.querySelector('[data-kz-notice-status]').textContent=status;
    const pulls=account.loading?[]:(game.pulls||[]).filter(p=>['Légendaire','Mythique'].includes(p.rarity)).slice(0,3);
    dialog.querySelector('[data-kz-notice-list]').innerHTML=pulls.length?pulls.map(p=>'<li><strong>'+esc(p.name)+'</strong><span>'+esc(p.rarity)+' · '+esc(new Date(p.at).toLocaleDateString('fr-FR'))+'</span></li>').join(''):'<li>Aucune découverte exceptionnelle enregistrée pour le moment.</li>';
  }
  function refresh(){pending=false;const active={wiki:'universes',rank:'community',adventure:'universes'}[document.body.dataset.tab]||document.body.dataset.tab;document.querySelectorAll('.kz-shell-nav a').forEach(link=>link.classList.toggle('active',link.dataset.tab===active));const account=window.KizunaAccount?.getSnapshot?.();$('kzHeaderChakra').textContent=account?.loading?'—':format(window.KizunaGame?.getSnapshot?.().chakra);if(document.body.dataset.tab==='universes')renderUniverses();renderNotifications();}
  function schedule(){if(pending)return;pending=true;(window.requestAnimationFrame||window.setTimeout)(refresh);}
  function openNotifications(){
    const account=window.KizunaAccount?.getSnapshot?.();
    if(account?.user&&!account.loading&&window.KizunaMarketInbox){window.KizunaMarketInbox.open();return;}
    if(!dialog){dialog=document.createElement('dialog');dialog.className='kz-notice-dialog';dialog.id='kzNoticeDialog';dialog.setAttribute('aria-labelledby','kzNoticeTitle');dialog.innerHTML='<header><h2 id="kzNoticeTitle">Ton carnet</h2><button class="soft-btn" type="button" data-kz-close aria-label="Fermer les notifications">Fermer</button></header><p data-kz-notice-status role="status"></p><h3>Tes dernières découvertes</h3><ul class="kz-notice-list" data-kz-notice-list></ul>';document.body.append(dialog);dialog.querySelector('[data-kz-close]').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>lastFocus?.focus());dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});}
    lastFocus=document.activeElement;dialog.showModal();renderNotifications();
  }
  $('kzNotifications')?.addEventListener('click',openNotifications);
  $('kzUniverseSearch')?.addEventListener('input',renderUniverses);
  $('kzUniverseGrid')?.addEventListener('click',event=>{const tile=event.target.closest('[data-kz-album]');if(tile)window.KizunaGame?.openAlbumKey(tile.dataset.kzAlbum);if(event.target.closest('[data-kz-universe-reset]')){universeFilter='all';$('kzUniverseSearch').value='';renderUniverses();$('kzUniverseSearch').focus();}});
  window.addEventListener('hashchange',routeHash);window.addEventListener('kizuna:tab-change',navigation);
  for(const type of ['kizuna:game-change','kizuna:albums-change','kizuna:ready'])window.addEventListener(type,schedule);
  document.addEventListener('kizuna:account-change',schedule);
  window.KizunaShell=Object.freeze({navigate:tab=>window.KizunaGame?.showTab(tab),refresh:schedule});
  routeHash();navigation();
})();
