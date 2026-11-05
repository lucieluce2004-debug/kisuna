/* KIZUNA · home presentation. No draw, wallet, inventory or cloud writes. */
(() => {
  'use strict';
  const RESUME_PREFIX = 'kizuna_journey_v1_';
  const FAVOURITE_PREFIX = 'kizuna_lobby_favourite_v1_';
  const $ = id => document.getElementById(id);
  const number = value => Number(value || 0).toLocaleString('fr-FR');
  const percent = value => Number(value || 0).toLocaleString('fr-FR', {maximumFractionDigits:1}) + ' %';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const rendered = new Map();
  let queued = false, current = null, resumeKey = '', stopped = false;
  let favouriteScope = null, favourite = {id:'',enabled:true,reactions:true}, favouriteDialog = null, favouriteFocus = null, favouriteQuery = '', favouriteLimit = 48;
  let previousOwned = null, previousAwakenings = null, pendingReaction = null, reactionTimer = 0;
  const openingReceipts = new Set();
  const rarityAccent = {'Commune':'#bfccd9','Rare':'#70b9ff','Épique':'#bc95ff','Légendaire':'#ffcf63','Mythique':'#ff7185'};
  const reduced = () => window.KizunaExperience?.reduced?.() || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const searchText = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
  function mountLobby() {
    const root=$('kzHome'), layout=root?.querySelector('.kg-lobby-layout');
    if(!layout||root.querySelector('.ka-lobby-scene'))return;
    const featured=layout.querySelector('.kz-featured-booster'),progress=layout.querySelector('.kz-home-progress'),activities=layout.querySelector('.kg-activity-map');
    if(!featured||!progress||!activities)return;
    const scene=document.createElement('div');scene.className='ka-lobby-scene';
    scene.innerHTML='<header class="ka-lobby-intro"><p class="ka-lobby-eyebrow"><span aria-hidden="true">✦</span> L’OBSERVATOIRE DES LIENS</p><h1>Ta prochaine<br><em>rencontre.</em></h1><span class="ka-lobby-coordinate" aria-hidden="true">絆 / KIZUNA CARD CLUB</span></header><aside class="ka-lobby-companion" aria-label="Mon personnage favori"><div class="ka-companion-label"><span>MON PERSONNAGE</span><button id="kaFavouriteSettings" type="button" aria-haspopup="dialog">Personnaliser <span aria-hidden="true">↗</span></button></div><div id="kaFavouriteStage"></div><p id="kaFavouriteReaction" class="ka-favourite-reaction" role="status" hidden></p></aside><div class="ka-lobby-invocation"></div><aside class="ka-lobby-hud"></aside><div class="ka-lobby-orbit" aria-hidden="true"><i></i><i></i><i></i></div>';
    layout.before(scene);scene.querySelector('.ka-lobby-invocation').append(featured);scene.querySelector('.ka-lobby-hud').append(progress);
    const title=progress.querySelector('h2');if(title)title.textContent='Ton carnet de liens';
    const overline=progress.querySelector('.kz-overline');if(overline)overline.textContent='LA COLLECTION CONTINUE';
    const trail=document.createElement('section');trail.className='ka-lobby-journeys';trail.setAttribute('aria-labelledby','kaJourneysTitle');
    trail.innerHTML='<header><span class="ka-section-index" aria-hidden="true">02 /</span><h2 id="kaJourneysTitle">À toi de jouer</h2><span class="ka-section-line" aria-hidden="true"></span></header>';
    activities.classList.add('ka-activity-trail');trail.append(activities);scene.after(trail);layout.remove();
    featured.querySelector('.kg-lobby-seal').textContent='INVOCATION · BOOSTER VEDETTE';
    const featuredButton=$('kzFeaturedOpen');if(featuredButton)featuredButton.innerHTML='Invoquer mes cartes <span aria-hidden="true">↗</span>';
    const sourceNote=featured.querySelector('.kg-preview-note');if(sourceNote)sourceNote.textContent='Aperçus du catalogue · illustrations d’Éveil';
    const news=$('kzNewsTitle');if(news)news.textContent='Des visages. Des univers. Tes liens.';
  }
  function ownCards(snapshot=window.KizunaGame?.getSnapshot?.()) {
    const owned=new Set((snapshot?.owned||[]).map(copy=>String(copy.id)));
    return (snapshot?.cards||[]).filter(card=>owned.has(String(card.id))).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
  }
  function ensureFavouriteScope() {
    const key=scope();if(key===favouriteScope)return key;
    favouriteScope=key;previousOwned=null;previousAwakenings=null;pendingReaction=null;openingReceipts.clear();clearTimeout(reactionTimer);
    favourite={id:'',enabled:true,reactions:true};favouriteQuery='';favouriteLimit=48;
    if(favouriteDialog?.open)favouriteDialog.close();
    if($('kaFavouriteReaction'))$('kaFavouriteReaction').hidden=true;
    $('kaFavouriteStage')?.removeAttribute('data-reaction');
    if(key)try{const saved=JSON.parse(localStorage.getItem(FAVOURITE_PREFIX+key)||'null');if(saved?.version===1)favourite={id:typeof saved.id==='string'?saved.id.slice(0,100):'',enabled:saved.enabled!==false,reactions:saved.reactions!==false};}catch{}
    return key;
  }
  function saveFavourite(next) {
    if(!ensureFavouriteScope())return false;
    const changed=next.id!==undefined&&next.id!==favourite.id;
    favourite={...favourite,...next};
    try{localStorage.setItem(FAVOURITE_PREFIX+favouriteScope,JSON.stringify({version:1,...favourite}));}catch{}
    if(changed||!favourite.enabled||!favourite.reactions){pendingReaction=null;clearTimeout(reactionTimer);if($('kaFavouriteReaction'))$('kaFavouriteReaction').hidden=true;$('kaFavouriteStage')?.removeAttribute('data-reaction');}
    renderFavourite();return true;
  }
  function favouriteArtwork(card) {
    const m=window.KizunaMythic?.getSnapshot?.(),owner=account()?.user?.id||'guest';
    const state=m?.progress?.[card.id],selected=Number(state?.selected)||0;
    const level=m?.loaded&&m.owner===owner&&card.rarity==='Mythique'&&Number.isInteger(selected)&&selected<=Number(state?.unlocked)?selected:0;
    return level>0?window.KizunaMythicArt?.get(card.id)?.levels?.[level-1]?.illustration?.image||card.image:card.image;
  }
  function renderFavourite(snapshot) {
    const key=ensureFavouriteScope(),cards=key?ownCards(snapshot):[],selected=cards.find(card=>String(card.id)===favourite.id);
    const stage=$('kaFavouriteStage');if(!stage)return;
    stage.style.setProperty('--ka-companion-accent',rarityAccent[selected?.rarity]||'#65ead7');
    stage.dataset.state=!key?'loading':!favourite.enabled?'disabled':selected?'selected':'empty';
    let html;
    if(!key)html='<div class="ka-companion-empty"><span aria-hidden="true">◇</span><strong>Retrouver tes liens…</strong></div>';
    else if(!favourite.enabled)html='<div class="ka-companion-empty ka-companion-off"><span aria-hidden="true">◇</span><strong>La scène est à toi.</strong><button type="button" data-ka-favourite-enable>Afficher mon personnage</button></div>';
    else if(selected)html='<button type="button" class="ka-companion-card" data-kz-home-card="'+esc(selected.id)+'" aria-label="Voir ma carte '+esc(selected.name)+'"><img src="'+esc(favouriteArtwork(selected))+'" width="280" height="420" alt="" decoding="async"><span class="ka-companion-edge" aria-hidden="true"></span><span class="ka-companion-name"><small>'+esc(selected.series)+'</small><strong>'+esc(selected.name)+'</strong><em>'+esc(selected.rarity)+' · Dans ma collection</em></span></button><button type="button" class="ka-companion-change" data-ka-favourite-open>Changer mon favori <span aria-hidden="true">↗</span></button>';
    else html='<div class="ka-companion-empty"><span class="ka-companion-crest" aria-hidden="true">絆</span><strong>Ton favori,<br>ta signature.</strong><p>'+(!cards.length?'Ta première carte ouvrira cette vitrine.':'Un personnage de ta collection, à tes côtés.')+'</p><button type="button" data-ka-favourite-open>'+(!cards.length?'Ma vitrine personnelle':'Choisir mon personnage')+' <span aria-hidden="true">↗</span></button></div>';
    markup('kaFavouriteStage',html);
    const settings=$('kaFavouriteSettings');if(settings)settings.disabled=!key;
    if(favouriteDialog?.open)renderFavouritePicker();
  }
  function renderFavouritePicker() {
    if(!favouriteDialog)return;
    const cards=ownCards(),query=searchText(favouriteQuery),matches=cards.filter(card=>searchText(card.name+' '+card.series).includes(query)),visible=matches.slice(0,favouriteLimit);
    const status=favouriteDialog.querySelector('[data-ka-picker-status]');status.textContent=matches.length?number(matches.length)+' personnage'+(matches.length>1?'s':'')+' de ta collection':cards.length?'Aucun personnage ne correspond à ta recherche.':'Obtiens une carte pour choisir ton personnage favori.';
    const list=favouriteDialog.querySelector('[data-ka-picker-list]'),html=visible.map(card=>'<button type="button" data-ka-favourite-pick="'+esc(card.id)+'" aria-pressed="'+(favourite.id===String(card.id))+'"><img src="'+esc(card.image)+'" alt="" width="80" height="108" loading="lazy" decoding="async"><span><strong>'+esc(card.name)+'</strong><small>'+esc(card.series)+'</small></span><b aria-hidden="true">'+(favourite.id===String(card.id)?'✓':'+')+'</b></button>').join('');
    if(list.innerHTML!==html)list.innerHTML=html;
    const more=favouriteDialog.querySelector('[data-ka-favourite-more]');more.hidden=matches.length<=favouriteLimit;
    favouriteDialog.querySelector('[data-ka-favourite-display]').setAttribute('aria-pressed',String(favourite.enabled));favouriteDialog.querySelector('[data-ka-favourite-display] b').textContent=favourite.enabled?'Activé':'Désactivé';
    const reactions=favouriteDialog.querySelector('[data-ka-favourite-reactions]');reactions.disabled=!favourite.enabled;reactions.setAttribute('aria-pressed',String(favourite.reactions));reactions.querySelector('b').textContent=favourite.reactions?'Activées':'Désactivées';
    favouriteDialog.querySelector('[data-ka-favourite-clear]').hidden=!favourite.id;
  }
  function openFavouritePicker() {
    if(!ensureFavouriteScope())return;
    if(!favouriteDialog){
      favouriteDialog=document.createElement('dialog');favouriteDialog.className='ka-favourite-dialog';favouriteDialog.id='kaFavouriteDialog';favouriteDialog.setAttribute('aria-labelledby','kaFavouriteTitle');
      favouriteDialog.innerHTML='<header><div><small>TA SIGNATURE DANS LE LOBBY</small><h2 id="kaFavouriteTitle">Choisis ton personnage</h2></div><button type="button" data-ka-favourite-close aria-label="Fermer le choix du favori">×</button></header><p>Une carte que tu possèdes. Un choix enregistré sur cet appareil pour ton compte.</p><label for="kaFavouriteSearch">Chercher dans ma collection<input type="search" id="kaFavouriteSearch" placeholder="Personnage ou anime…" autocomplete="off"></label><p data-ka-picker-status role="status"></p><div data-ka-picker-list class="ka-favourite-options"></div><button type="button" data-ka-favourite-more hidden>Afficher plus de personnages</button><div class="ka-favourite-preferences"><button type="button" data-ka-favourite-display aria-pressed="true">Personnage dans le lobby <b>Activé</b></button><button type="button" data-ka-favourite-reactions aria-pressed="true">Réactions aux découvertes <b>Activées</b></button><button type="button" data-ka-favourite-clear>Retirer mon favori</button></div>';
      document.body.append(favouriteDialog);favouriteDialog.addEventListener('close',()=>favouriteFocus?.isConnected&&favouriteFocus.focus({preventScroll:true}));
      favouriteDialog.addEventListener('input',event=>{if(event.target.id==='kaFavouriteSearch'){favouriteQuery=event.target.value;favouriteLimit=48;renderFavouritePicker();}});
      favouriteDialog.addEventListener('click',event=>{if(event.target===favouriteDialog){const r=favouriteDialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)favouriteDialog.close();}});
    }
    favouriteFocus=document.activeElement;favouriteQuery='';favouriteLimit=48;$('kaFavouriteSearch').value='';renderFavouritePicker();if(!favouriteDialog.open)favouriteDialog.showModal();$('kaFavouriteSearch').focus({preventScroll:true});
  }
  function queueReaction(kind,label) {
    const key=ensureFavouriteScope();if(!key||!favourite.enabled||!favourite.reactions||!ownCards().some(card=>String(card.id)===favourite.id))return;
    const priority={open:1,reward:2,new:3,mythic:4,awakening:5};
    if(!pendingReaction||priority[kind]>=priority[pendingReaction.kind]||Date.now()-pendingReaction.at>90000)pendingReaction={kind,label,scope:key,at:Date.now()};
    flushReaction();
  }
  function flushReaction() {
    const reaction=pendingReaction;if(!reaction||reaction.scope!==scope()||Date.now()-reaction.at>90000){pendingReaction=null;return;}
    if(document.body.dataset.tab!=='home'||$('revealBackdrop')?.classList.contains('open'))return;
    pendingReaction=null;const stage=$('kaFavouriteStage'),label=$('kaFavouriteReaction');if(!stage||!label)return;
    clearTimeout(reactionTimer);stage.dataset.reaction=reaction.kind;stage.classList.toggle('ka-react-static',Boolean(reduced()));label.textContent=reaction.label;label.hidden=false;
    reactionTimer=setTimeout(()=>{stage.removeAttribute('data-reaction');label.hidden=true;},3600);
  }
  function trackDiscoveries(snapshot) {
    ensureFavouriteScope();if(!favouriteScope)return;
    const cards=new Map((snapshot.cards||[]).map(card=>[String(card.id),card])),owned=new Set((snapshot.owned||[]).map(copy=>String(copy.id)));
    if(previousOwned){const discoveries=[...owned].filter(id=>!previousOwned.has(id));if(discoveries.length)queueReaction(discoveries.some(id=>cards.get(id)?.rarity==='Mythique')?'mythic':'new',discoveries.some(id=>cards.get(id)?.rarity==='Mythique')?'Une Mythique rejoint tes liens !':'Nouvelle carte dans ta collection !');}
    previousOwned=owned;
    const mythic=window.KizunaMythic?.getSnapshot?.();
    if(mythic?.loaded&&mythic.owner===(account()?.user?.id||'guest')){
      const awakenings=new Map(Object.entries(mythic.progress||{}).map(([id,state])=>[id,Number(state.unlocked)||0]));
      if(previousAwakenings&&[...awakenings].some(([id,level])=>level>(previousAwakenings.get(id)||0)))queueReaction('awakening','Un nouvel Éveil est débloqué !');
      previousAwakenings=awakenings;
    }
  }
  function openingResult(event) {
    ensureFavouriteScope();const detail=event.detail||{},owner=account()?.user?.id||'guest';if(!favouriteScope||detail.owner!==owner||detail.replayed===true||!Number.isFinite(Number(detail.count))||Number(detail.count)<1)return;
    if(detail.receiptKey){if(openingReceipts.has(String(detail.receiptKey)))return;openingReceipts.add(String(detail.receiptKey));if(openingReceipts.size>100)openingReceipts.delete(openingReceipts.values().next().value);}
    if(detail.awakeningCount>0)queueReaction('awakening','Un nouvel Éveil est débloqué !');else if(detail.mythicCount>0)queueReaction('mythic','Une Mythique rejoint tes liens !');else if(detail.newCount>0)queueReaction('new','Nouvelle carte dans ta collection !');else queueReaction('open','Tes liens s’enrichissent !');
  }
  function rewardResult(event){if(event.detail?.owner&&event.detail.owner!==(account()?.user?.id||'guest'))return;queueReaction('reward','Récompense récupérée !');}
  function account() {return window.KizunaAccount?.getSnapshot?.() || null;}
  function scope() {
    const value = account();
    if (value?.loading) return null;
    return value?.user?.id ? 'user_' + encodeURIComponent(value.user.id) : 'guest';
  }
  function readResume() {
    const key = scope();
    if (!key) return '';
    try {
      const value = JSON.parse(localStorage.getItem(RESUME_PREFIX + key) || 'null');
      return value?.version === 1 && typeof value.albumKey === 'string' ? value.albumKey.slice(0,180) : '';
    } catch {return '';}
  }
  function rememberAlbum(event) {
    const key = scope(), albumKey = event.detail?.key;
    if (!key || typeof albumKey !== 'string' || !window.KizunaGame?.getAlbums?.().some(album => album.key === albumKey)) return;
    try {localStorage.setItem(RESUME_PREFIX + key, JSON.stringify({version:1,albumKey,visitedAt:Date.now()}));}
    catch { /* Optional navigation memory never prevents opening an album. */ }
    schedule();
  }
  function text(id, value) {const node = $(id);if (node) {if(node.textContent!==String(value))node.textContent=String(value);if(id==='kzHomeError')node.hidden=!value;}}
  function markup(id, value) {const node=$(id);if(node&&rendered.get(id)!==value){node.innerHTML=value;rendered.set(id,value);}}
  function renderResume(summary) {
    const saved = readResume(), album = summary.albums.find(item => item.key === saved);
    resumeKey = album?.key || '';
    text('kzResumeLabel', album ? 'Reprendre : ' + album.name : 'Commencer mon premier album');
    const button = $('kzResume');
    if (button) {button.disabled = false;button.setAttribute('aria-label', album ? 'Reprendre mon aventure dans l’album ' + album.name : 'Découvrir les albums disponibles');}
  }
  function renderProgress(summary) {
    text('kzHomeOwned', number(summary.owned));text('kzHomeTotal', number(summary.total));text('kzHomePercent', percent(summary.percent));
    text('kzHomeCopies', number(summary.copies));text('kzHomeCompleted', number(summary.completedAlbums));
    const progress = $('kzHomeProgress');
    if (progress) {progress.max=100;progress.value=summary.percent;progress.setAttribute('aria-label','Collection complétée à '+percent(summary.percent));}
    markup('kzHomeUniverses',summary.favourites.length ? summary.favourites.map(album =>
      '<button class="kz-universe-progress" type="button" data-kz-home-album="'+esc(album.key)+'"><span>'+esc(album.name)+'</span><small>'+number(album.owned)+' / '+number(album.total)+'</small><progress max="100" value="'+album.percent+'" aria-label="'+esc(album.name)+' : '+percent(album.percent)+'"></progress><span class="kz-universe-arrow" aria-hidden="true">↗</span></button>'
    ).join('') : '<p class="kz-empty">Tes premières cartes feront apparaître ici les univers que tu collectionnes le plus.</p>');
  }
  function renderFeatured(summary) {
    const featured = summary.featured;
    const button = $('kzFeaturedOpen');
    if (!featured) {text('kzFeaturedName','Aucun booster disponible');if(button)button.disabled=true;return;}
    text('kzFeaturedName',featured.name);text('kzFeaturedDescription',featured.description);
    text('kgPackLabel',featured.name);
    const previews=summary.discoveries.filter(card=>window.KizunaMythicArt?.get(card.id)).slice(0,2);
    const artwork=(card,level=3)=>window.KizunaMythicArt?.get(card.id)?.levels[level-1]?.illustration?.image||card.image;
    markup('kgLobbyFan',previews.map(card=>'<button type="button" data-kz-home-card="'+esc(card.id)+'" aria-label="Découvrir '+esc(card.name)+' et ses Éveils"><img src="'+esc(artwork(card))+'" alt="" width="150" height="225" loading="lazy" decoding="async"><span>'+esc(card.name)+'</span></button>').join(''));
    const art=$('kgFeaturedArt'),preview=previews[0]||summary.discoveries[0];if(art&&preview){const src=artwork(preview,2);if(art.getAttribute('src')!==src)art.src=src;}
    const logo = $('kzFeaturedLogo');if (logo && featured.logo && logo.getAttribute('src') !== featured.logo) logo.src=featured.logo;
    text('kzFeaturedCost',featured.stock ? '1 booster de ton stock · '+number(featured.stock)+' disponible'+(featured.stock>1?'s':'') : 'Stock épuisé · recharge et boutique dans Boosters');
    text('kzFeaturedRarities',featured.rarities.join(' · '));
    text('kzFeaturedGuarantees','Légendaire ou mieux sous '+number(featured.legendaryRemaining)+' ouvertures · Mythique sous '+number(featured.mythicRemaining));
    if (button) {button.disabled=false;button.dataset.booster=featured.id;}
  }
  function renderDiscoveries(summary) {
    markup('kzNewsCards',summary.discoveries.map(card => '<button class="kz-discovery-card" type="button" data-kz-home-card="'+esc(card.id)+'" aria-label="Découvrir '+esc(card.name)+'"><img src="'+esc(card.image)+'" alt="" loading="lazy" decoding="async" width="180" height="240"><span><small>'+esc(card.series)+'</small><strong>'+esc(card.name)+'</strong><em>'+esc(card.rarity)+'</em></span></button>').join('') || '<p class="kz-empty">Le catalogue est en cours de chargement.</p>');
  }
  function refresh() {
    queued=false;if(stopped)return;
    mountLobby();ensureFavouriteScope();
    const game=window.KizunaGame;if(!game?.getHomeSummary)return;
    const status=account();
    if(status?.loading){
      current=null;resumeKey='';
      for(const id of ['kzHomeOwned','kzHomeTotal','kzHomePercent','kzHomeCopies','kzHomeCompleted'])text(id,'—');
      if($('kzHomeProgress'))$('kzHomeProgress').value=0;
      markup('kzHomeUniverses','');
      text('kzFeaturedCost','Chargement de ton stock…');text('kzFeaturedGuarantees','');
      if($('activityGrid'))$('activityGrid').hidden=true;
      text('kzResumeLabel','Chargement de ta progression…');
      text('kzHomeReady','Chargement de ta progression…');
      for(const id of ['kzResume','kzFeaturedOpen'])if($(id))$(id).disabled=true;
      renderFavourite({cards:[],owned:[]});
      return;
    }
    try{
      current=game.getHomeSummary();renderProgress(current);renderResume(current);renderFeatured(current);renderDiscoveries(current);
      const snapshot=game.getSnapshot();renderFavourite(snapshot);trackDiscoveries(snapshot);flushReaction();
      if($('activityGrid'))$('activityGrid').hidden=false;
      text('kzHomeReady',status?.user ? (status.status==='synced'?'Ta progression est synchronisée.':status.error||'Ta progression est disponible sur cet appareil.') : 'Joue en invité ou connecte-toi pour retrouver ta collection sur tes appareils.');
      text('kzHomeError','');
    }catch{
      text('kzHomeError','L’aperçu de ta progression est indisponible. Ta collection reste accessible.');
    }
  }
  function schedule(){if(queued||stopped)return;queued=true;(window.requestAnimationFrame||window.setTimeout)(refresh);}
  function click(event){
    const target=event.target instanceof Element?event.target:null;if(!target)return;
    (window.requestAnimationFrame||window.setTimeout)(flushReaction);
    if(target.closest('#kaFavouriteSettings,[data-ka-favourite-open]')){openFavouritePicker();return;}
    if(target.closest('[data-ka-favourite-close]')){favouriteDialog?.close();return;}
    const pick=target.closest('[data-ka-favourite-pick]');
    if(pick){if(ensureFavouriteScope()&&ownCards().some(card=>String(card.id)===pick.dataset.kaFavouritePick)){saveFavourite({id:pick.dataset.kaFavouritePick,enabled:true});favouriteDialog?.close();}return;}
    if(target.closest('[data-ka-favourite-enable]')){saveFavourite({enabled:true});return;}
    if(target.closest('[data-ka-favourite-display]')){saveFavourite({enabled:!favourite.enabled});return;}
    if(target.closest('[data-ka-favourite-reactions]')){if(favourite.enabled)saveFavourite({reactions:!favourite.reactions});return;}
    if(target.closest('[data-ka-favourite-clear]')){saveFavourite({id:''});return;}
    if(target.closest('[data-ka-favourite-more]')){favouriteLimit+=48;renderFavouritePicker();return;}
    const album=target.closest('[data-kz-home-album]');if(album){window.KizunaGame?.openAlbumKey(album.dataset.kzHomeAlbum);return;}
    const card=target.closest('[data-kz-home-card]');if(card){window.KizunaGame?.openCard(card.dataset.kzHomeCard);return;}
    if(target.closest('#kzResume')){
      if(resumeKey&&window.KizunaGame?.openAlbumKey(resumeKey))return;
      window.KizunaGame?.showAlbums();return;
    }
    const featured=target.closest('#kzFeaturedOpen');if(featured&&!featured.disabled)window.KizunaGame?.openBoosterSelection(featured.dataset.booster||'mix',1);
    if(target.closest('[data-kz-featured-trigger]'))$('kzFeaturedOpen')?.click();
  }
  const windowEvents=['kizuna:ready','kizuna:game-change','kizuna:albums-change','kizuna:boosters-change','kizuna:tab-change','kizuna:mythic-change'];
  windowEvents.forEach(type=>window.addEventListener(type,schedule));
  document.addEventListener('kizuna:account-change',schedule);
  window.addEventListener('kizuna:album-open',rememberAlbum);
  window.addEventListener('kizuna:opening-result',openingResult);
  window.addEventListener('kizuna:reward',rewardResult);
  document.addEventListener('click',click);
  window.KizunaHome=Object.freeze({refresh:schedule,destroy(){stopped=true;clearTimeout(reactionTimer);favouriteDialog?.remove();windowEvents.forEach(type=>window.removeEventListener(type,schedule));document.removeEventListener('kizuna:account-change',schedule);window.removeEventListener('kizuna:album-open',rememberAlbum);window.removeEventListener('kizuna:opening-result',openingResult);window.removeEventListener('kizuna:reward',rewardResult);document.removeEventListener('click',click);}});
  schedule();
})();
