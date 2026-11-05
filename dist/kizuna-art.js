/* Art direction shell. Presentation only: routes use the existing game APIs. */
(() => {
  'use strict';
  const root=document.body,nav=document.querySelector('.kz-shell-nav');
  if(!nav)return;
  root.classList.add('kz-art');
  const destinations=[
    ['home','Accueil','Le sanctuaire des liens','home'],
    ['boosts','Invocation','Choisir et ouvrir un booster','boosters'],
    ['col','Mes albums','Retrouver tes personnages','collection'],
    ['universes','Univers','Explorer les séries','universes'],
    ['nexus','Nexus','Tracer ta progression','nexus'],
    ['missions','Missions','Consulter le carnet',''],
    ['constellations','Constellations','Relier tes découvertes',''],
    ['journey','Voyage','Parcourir les univers',''],
    ['awakening','Éveils','Transformer tes Mythiques',''],
    ['sanctuary','Sanctuaire','Composer ton espace personnel',''],
    ['events','Anomalies','Voir les événements disponibles',''],
    ['market','Marché','Échanger et collectionner','marketPage'],
    ['community','Communauté','Rencontrer les collectionneurs','community'],
    ['rank','Classement','Consulter les scores réels','ranking'],
    ['wiki','Encyclopédie','Explorer le catalogue','encyclopedia'],
    ['profile','Mon profil','Ton identité de collectionneur','profile'],
    ['staff','Staff','Administrer Kizuna','staff']
  ];
  const glyph={home:'⌂',boosts:'✦',col:'▤',universes:'◎',nexus:'✧',missions:'☷',constellations:'✳',journey:'⌁',awakening:'✺',sanctuary:'❖',events:'ϟ',market:'◇',community:'♧',rank:'♜',wiki:'▥',profile:'◉',staff:'⚑'};
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const menuButton=document.createElement('button');
  menuButton.type='button';menuButton.className='kza-menu-button';menuButton.id='kzaMenuButton';
  menuButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg><span>Tout</span>';
  menuButton.setAttribute('aria-label','Ouvrir toutes les destinations');menuButton.setAttribute('aria-haspopup','dialog');menuButton.setAttribute('aria-controls','kzaNavigation');nav.append(menuButton);
  const dialog=document.createElement('dialog');dialog.id='kzaNavigation';dialog.className='kza-navigation';dialog.setAttribute('aria-labelledby','kzaNavigationTitle');
  dialog.innerHTML='<header><div><p class="kza-eyebrow">KIZUNA · TON VOYAGE</p><h2 id="kzaNavigationTitle">Où allons-nous ?</h2></div><button type="button" class="kza-close" aria-label="Fermer les destinations">×</button></header><div class="kza-destinations"></div><p class="kza-menu-note">Chaque lien continue ton aventure dans Kizuna.</p>';
  document.body.append(dialog);
  let lastFocus=null;
  const active=()=>root.dataset.tab==='adventure'?(location.hash.match(/^#adventure\/([^/]+)/)?.[1]||'constellations'):root.dataset.tab;
  const hasStaff=()=>{const link=document.getElementById('staffNav');return !!link&&!link.hidden&&link.style.display!=='none';};
  function renderMenu(){
    dialog.querySelector('.kza-destinations').innerHTML=destinations.filter(d=>d[0]!=='staff'||hasStaff()).map(([key,label,detail,hash])=>'<button type="button" data-kza-destination="'+key+'"'+(active()===key?' aria-current="page"':'')+'><i aria-hidden="true">'+glyph[key]+'</i><span><strong>'+esc(label)+'</strong><small>'+esc(detail)+'</small></span><b aria-hidden="true">↗</b></button>').join('');
  }
  function sync(){
    const current=destinations.find(d=>d[0]===active());
    root.dataset.artSection=active();
    document.querySelectorAll('.kz-shell-nav a[data-tab]').forEach(a=>{
      const primary=['home','boosts','col','universes'].includes(a.dataset.tab);a.classList.toggle('kza-primary-destination',primary);
      a.title=destinations.find(d=>d[0]===a.dataset.tab)?.[1]||a.textContent.trim();
    });
    menuButton.classList.toggle('active',!['home','boosts','col','universes'].includes(active()));
    menuButton.setAttribute('aria-expanded',String(dialog.open));
    const context=document.getElementById('kzaHeaderContext');if(context)context.textContent=current?.[1]||'Kizuna';
  }
  const context=document.createElement('span');context.id='kzaHeaderContext';context.className='kza-header-context';context.setAttribute('aria-hidden','true');document.querySelector('.brand-logo')?.after(context);
  menuButton.addEventListener('click',()=>{lastFocus=document.activeElement;renderMenu();dialog.showModal();sync();});
  dialog.querySelector('.kza-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{sync();if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});});
  dialog.addEventListener('click',event=>{
    const button=event.target.closest('[data-kza-destination]');if(!button)return;
    const key=button.dataset.kzaDestination;dialog.close();
    if(['missions','constellations','journey','awakening','sanctuary'].includes(key))window.KizunaAdventure?.navigate(key);
    else if(key==='events')window.KizunaAnomalies?.open();
    else window.KizunaGame?.showTab(key);
    sync();
  });
  const observer=new MutationObserver(sync);observer.observe(nav,{childList:true});
  window.addEventListener('kizuna:tab-change',sync);window.addEventListener('kizuna:adventure-view-change',sync);document.addEventListener('kizuna:account-change',()=>{if(dialog.open)renderMenu();sync();});
  window.KizunaArt=Object.freeze({version:1,refresh:sync});sync();
})();
