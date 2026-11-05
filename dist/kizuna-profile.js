/* Kizuna collector profile. All collection figures come from the current player. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const format = value => new Intl.NumberFormat('fr-FR').format(Number(value) || 0);
  const tiers = [
    {name:'Mythique', level:6, color:'#ff6681'},
    {name:'Légendaire', level:5, color:'#f7d37e'},
    {name:'Épique', level:4, color:'#c4a0ff'},
    {name:'Rare', level:3, color:'#79baff'},
    {name:'Peu commune', level:2, color:'#63e3bd'},
    {name:'Commun', level:1, color:'#aebdd2'}
  ];
  const icon = name => ({
    cards:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="7" y="3" width="13" height="17" rx="2"/><path d="M4 6H3v14a2 2 0 0 0 2 2h11M11 8h5M11 12h5M11 16h3"/></svg>',
    gem:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 4-3 6 10 11 10-11-3-6H5ZM2 10h20M8 4l-2 6 6 11 6-11-2-6"/></svg>',
    spark:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 2 3.1 6.2L22 9.3l-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3 1.2-6.9-5-4.9 6.9-1.1L12 2Z"/></svg>',
    chakra:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z"/></svg>',
    edit:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 5 5 5M4 20l5-1 12-12a2.1 2.1 0 0 0-5-5L4 14l-1 7 1-1Z"/></svg>',
    arrow:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    lock:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10" width="14" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 15v3"/></svg>',
    check:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>'
  }[name] || '');
  const safeImage = value => {
    try {
      const url = new URL(String(value || ''), location.href);
      return ['https:','http:'].includes(url.protocol) || String(value).startsWith('data:image/') ? value : '';
    } catch { return ''; }
  };
  const state = {editOpen:false, saving:false, editorOwner:null, editorEpoch:0, message:'', error:false, subscribedGame:null, subscribedAccount:null};
  let root;
  let dialog;
  let lastFocus;
  let frame;

  function snapshots() {
    const game = window.KizunaGame?.getSnapshot?.() || {};
    const account = window.KizunaAccount?.getSnapshot?.() || {};
    const cards = Array.isArray(game.cards) ? game.cards : [];
    const owned = !account.loading && Array.isArray(game.owned) ? game.owned : [];
    const byId = new Map(cards.map(card => [String(card.id), card]));
    const counts = new Map();
    const collection = [];
    for (const copy of owned) {
      const id = String(copy.id || '');
      counts.set(id, (counts.get(id) || 0) + 1);
      const card = byId.get(id);
      if (card) collection.push({...card, rarity:copy.rarity || card.rarity, level:copy.level || card.level || tiers.find(t => t.name === card.rarity)?.level || 1});
      else if (copy.name) collection.push(copy);
    }
    const unique = [...new Map(collection.map(card => [String(card.id), card])).values()];
    const profile = account.loading ? {} : account.profile || {};
    const username = account.loading ? 'Chargement…' : profile.username || account.user?.user_metadata?.username || game.username || 'Invité';
    return {game, account, cards, owned, byId, counts, collection, unique, profile, username};
  }

  function cardTile(card, count, featured = false) {
    const tier = tiers.find(value => value.name === card.rarity) || tiers[5];
    const src = safeImage(card.image);
    return `<button class="kp-showcase-card${featured?' is-favorite':''}" type="button" data-kp-card="${esc(card.id)}" style="--kp-card-color:${tier.color}" aria-label="Voir ${esc(card.name)}${count>1?', '+count+' exemplaires':''}">
      <span class="kp-showcase-art">${src?`<img src="${esc(src)}" alt="" loading="lazy" decoding="async">`:'<span class="kp-card-no-image">K</span>'}<span class="kp-showcase-rarity">${esc(card.rarity)}</span>${featured?'<span class="kp-showcase-favorite" title="Carte favorite">♥</span>':''}${count>1?`<span class="kp-showcase-count">×${format(count)}</span>`:''}</span>
      <span class="kp-showcase-name">${esc(card.name)}</span><span class="kp-showcase-series">${esc(card.series || 'Personnage')}</span>
    </button>`;
  }

  function render() {
    if (!root || state.editOpen) return;
    const focusAction=root.contains(document.activeElement)?document.activeElement.getAttribute('data-kp-action'):null;
    const numbersOpen=root.querySelector('.kad-player-numbers')?.open;
    const s = snapshots();
    const unavailable = s.account.status === 'unavailable';
    const user = unavailable ? null : s.account.user;
    const signedIn = !!user;
    const favorite = s.unique.find(card => String(card.id) === String(s.profile.avatar_card_id)) || null;
    const initials = s.username.trim().split(/\s+/).slice(0,2).map(word => [...word][0] || '').join('').toLocaleUpperCase().slice(0,2) || 'K';
    const rareCount = s.collection.filter(card => (tiers.find(tier => tier.name === card.rarity)?.level || card.level || 0) >= 5).length;
    const progress = s.cards.length ? Math.min(100, s.unique.length / s.cards.length * 100) : 0;
    const showcase = s.unique.slice().sort((a,b) => (tiers.find(tier => tier.name === b.rarity)?.level || b.level || 0)-(tiers.find(tier => tier.name === a.rarity)?.level || a.level || 0));
    if (favorite) { const index=showcase.findIndex(card => card.id === favorite.id); if(index>=0)showcase.splice(index,1);showcase.unshift(favorite); }
    const topCards = showcase.slice(0,6);
    const recent = (s.account.loading?[]:Array.isArray(s.game.pulls)?s.game.pulls:[]).slice().sort((a,b)=>(Number(b.at)||0)-(Number(a.at)||0)).slice(0,4);
    let joined = '';
    if (user?.created_at && Number.isFinite(new Date(user.created_at).getTime())) joined = new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(new Date(user.created_at));
    const accountStatuses = {loading:'Chargement du compte…',pending:'Synchronisation en attente',saving:'Enregistrement…',synced:'Collection synchronisée',error:'Synchronisation à vérifier',conflict:'Conflit de sauvegarde'};
    const accountStatus = unavailable ? 'Profil invité' : signedIn ? (accountStatuses[s.account.status] || 'Compte connecté') : s.account.loading || s.account.status === 'loading' ? 'Chargement du compte…' : 'Profil invité';
    const favoriteSrc = safeImage(favorite?.image);
    const headliner = s.account.loading ? null : favorite || topCards[0];
    const albums = (window.KizunaGame?.getAlbums?.() || []).filter(a => a.owned > 0).sort((a,b) => b.owned / Math.max(1,b.total) - a.owned / Math.max(1,a.total) || b.owned-a.owned).slice(0,3);
    root.innerHTML = `<div class="wrap kp-profile-wrap">
      <div class="kp-breadcrumb"><a href="#home" data-kp-nav="home">Accueil</a><span>/</span><span>Mon profil</span></div>
      <section class="kp-profile-hero" aria-labelledby="kpProfileName">
        <div class="kp-banner kad-player-scene"><div class="kad-player-sigil" aria-hidden="true">絆</div><div class="kp-banner-message"><span>TA COLLECTION. TON HISTOIRE.</span><strong>Chaque lien<br>porte ta signature.</strong><p>${headliner?esc(headliner.name)+' · '+esc(headliner.series):'La prochaine rencontre commence avec toi.'}</p><button type="button" class="kp-button kp-button-primary" data-kp-sanctuary>Entrer dans mon Sanctuaire ${icon('arrow')}</button></div>${headliner?`<button type="button" class="kad-player-favorite" data-kp-card="${esc(headliner.id)}" aria-label="Voir ${esc(headliner.name)}"><img src="${esc(safeImage(headliner.image))}" alt="" decoding="async"><span>${favorite?'PERSONNAGE FAVORI':'À LA UNE'}</span><strong>${esc(headliner.name)}</strong></button>`:'<div class="kad-player-empty" aria-hidden="true"><i>✦</i><span>KIZUNA</span></div>'}<span class="kp-collector-label">${icon('gem')} ESPACE COLLECTIONNEUR</span></div>
        <div class="kp-profile-identity"><div class="kp-avatar-wrap"><div class="kp-profile-avatar">${favoriteSrc?`<img src="${esc(favoriteSrc)}" alt="Avatar : ${esc(favorite.name)}">`:`<span>${esc(initials)}</span>`}</div><span class="kp-avatar-status${signedIn?' is-connected':''}" role="img" aria-label="${signedIn?'Connecté':'Invité'}"></span></div>
          <div class="kp-identity-copy"><div class="kp-identity-title"><h1 id="kpProfileName">${esc(s.username)}</h1><span class="kp-identity-badge">${icon('spark')} ${s.unique.length>=50?'Collectionneur confirmé':s.unique.length>=10?'Collectionneur':'Nouveau collectionneur'}</span></div><p class="kp-bio">${esc(s.profile.bio || 'Un univers à découvrir, une collection à construire.')}</p><div class="kp-identity-meta"><span class="kp-status"><i></i>${esc(accountStatus)}</span>${joined?`<span>Membre depuis ${esc(joined)}</span>`:''}<span>${format(s.unique.length)} personnage${s.unique.length>1?'s':''} collectionné${s.unique.length>1?'s':''}</span></div></div>
          <div class="kp-identity-actions">${signedIn?`<button type="button" class="kp-button kp-button-secondary" data-kp-action="edit">${icon('edit')} Modifier mon profil</button>`:`<button type="button" class="kp-button kp-button-primary" data-kp-action="login">Continuer avec Discord ${icon('arrow')}</button>`}<button type="button" class="kp-button kp-button-quiet" data-kp-nav="col">Voir ma collection</button></div>
        </div>
        <div class="kp-profile-tabs"><span class="active">Vue d’ensemble</span><button type="button" data-kp-nav="col">Collection <b>${format(s.unique.length)}</b></button><button type="button" data-kp-action="account">Mon compte</button></div>
      </section>
      <details class="kad-player-numbers"><summary>Les chiffres de ma collection <span>Cartes, raretés et Chakra</span></summary><div class="kp-stats-grid">
        ${[{label:'Cartes en collection',value:s.owned.length,icon:'cards',sub:'Tous les exemplaires'},{label:'Personnages uniques',value:s.unique.length,icon:'gem',sub:'Ta collection personnelle'},{label:'Légendaires & mythiques',value:rareCount,icon:'spark',sub:'Les plus rares de ta collection'},{label:'Chakra disponibles',value:s.game.chakra || 0,icon:'chakra',sub:'Pour tes prochains échanges'}].map(stat=>`<article class="kp-stat"><div class="kp-stat-icon">${icon(stat.icon)}</div><div><span>${stat.label}</span><strong data-kg-number="${stat.icon}" data-kg-value="${Number(stat.value)||0}">${s.account.loading?'—':format(stat.value)}</strong><small>${stat.sub}</small></div></article>`).join('')}
      </div></details>
      ${s.account.loading?'':`<div class="kg-trophy-shelf" role="group" aria-label="Repères du collectionneur">${[{name:'Premier lien',detail:'Un personnage collectionné',done:s.unique.length>0,mark:'✦'},{name:'Premier album',detail:'Un album entièrement rempli',done:(window.KizunaGame?.getAlbums?.()||[]).some(a=>a.total>0&&a.owned===a.total),mark:'▥'},{name:'Une légende',detail:'Une Légendaire ou une Mythique',done:rareCount>0,mark:'♛'}].map(t=>`<div class="kg-trophy${t.done?'':' is-locked'}"><span aria-hidden="true">${t.done?t.mark:'◇'}</span><div><strong>${t.name}${t.done?' · ✓':''}</strong><small>${t.done?'Accompli':'À accomplir'} · ${t.detail}</small></div></div>`).join('')}</div>`}
      <div data-kn-profile></div>
      <div class="kp-profile-columns"><div class="kp-profile-main">
        ${!s.account.loading&&albums.length?`<section class="kad-main-albums"><div class="kp-panel-heading"><div><span class="kp-kicker">TES UNIVERS DE CŒUR</span><h2>Les albums qui grandissent.</h2></div></div><div>${albums.map(a=>`<button type="button" data-kp-album="${esc(a.key)}" style="--kad-album-progress:${Math.min(100,a.owned/Math.max(1,a.total)*100)}%"><img src="${esc(safeImage(a.cover))}" alt="" loading="lazy" decoding="async"><span><strong>${esc(a.name)}</strong><small>${format(a.owned)} / ${format(a.total)} cartes</small><i aria-hidden="true"></i></span><b aria-hidden="true">↗</b></button>`).join('')}</div></section>`:''}
        <section class="kp-panel kp-showcase"><div class="kp-panel-heading"><div><span class="kp-kicker">LES PIÈCES DE TA COLLECTION</span><h2>Ta vitrine</h2></div>${signedIn&&s.unique.length?`<button class="kp-text-button" type="button" data-kp-action="edit">Choisir ma favorite ${icon('edit')}</button>`:''}</div>
          ${topCards.length?`<div class="kp-showcase-grid">${topCards.map(card=>cardTile(card,s.counts.get(String(card.id))||1,card.id===favorite?.id)).join('')}</div>`:`<div class="kp-empty-showcase"><span class="kp-empty-cards" aria-hidden="true"><i>K</i><i>K</i><i>K</i></span><h3>Ta première carte t’attend.</h3><p>Ouvre un booster et retrouve tes plus belles cartes ici.</p><button type="button" class="kp-button kp-button-primary" data-kp-nav="home">Ouvrir des boosters ${icon('arrow')}</button></div>`}
        </section>
        <section class="kp-panel"><div class="kp-panel-heading"><div><span class="kp-kicker">LES DERNIÈRES DÉCOUVERTES</span><h2>Tes gros tirages</h2></div><span class="kp-panel-caption">Légendaires et mythiques</span></div>${recent.length?`<div class="kp-recent-list">${recent.map(pull=>{const card=s.byId.get(String(pull.id))||pull,tier=tiers.find(t=>t.name===(pull.rarity||card.rarity))||tiers[5],src=safeImage(card.image),date=new Date(Number(pull.at));return `<button type="button" class="kp-recent" data-kp-card="${esc(card.id)}" style="--kp-card-color:${tier.color}"><span class="kp-recent-image">${src?`<img src="${esc(src)}" alt="" loading="lazy">`:'K'}</span><span><strong>${esc(card.name||pull.name)}</strong><small>${esc(card.series||pull.series||'Personnage')}</small></span><span class="kp-recent-rarity">${esc(pull.rarity||card.rarity)}</span><time${Number.isFinite(date.getTime())?` datetime="${date.toISOString()}"`:''}>${Number.isFinite(date.getTime())?new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short'}).format(date):'—'}</time>${icon('arrow')}</button>`;}).join('')}</div>`:'<p class="kp-empty-text">Tes prochains tirages légendaires et mythiques apparaîtront ici.</p>'}</section>
      </div><aside class="kp-profile-aside">
        <section class="kp-panel kp-progress-panel"><span class="kp-kicker">CHAQUE CARTE COMPTE</span><h2>Ta progression</h2><div class="kp-progress-circle" style="--kp-progress:${progress.toFixed(2)}"><div><strong>${progress.toLocaleString('fr-FR',{maximumFractionDigits:1})}<small>%</small></strong><span>du catalogue chargé</span></div></div><p><b>${format(s.unique.length)}</b> / ${format(s.cards.length)} personnages</p><span class="kp-progress-note">La progression évolue avec le catalogue disponible.</span></section>
        <section class="kp-panel kp-rarity-panel"><div class="kp-panel-heading"><div><span class="kp-kicker">EN UN COUP D’ŒIL</span><h2>Tes raretés</h2></div></div><div class="kp-rarity-list">${tiers.map(tier=>{const count=s.collection.filter(card=>card.rarity===tier.name).length;const percent=s.owned.length?count/s.owned.length*100:0;return `<div class="kp-rarity-row" style="--kp-card-color:${tier.color}"><div><span><i></i>${tier.name==='Commun'?'Commune':tier.name}</span><b>${format(count)}</b></div><span class="kp-rarity-track"><i style="width:${percent.toFixed(2)}%"></i></span></div>`;}).join('')}</div></section>
        <section class="kp-panel kp-objectives"><span class="kp-kicker">PROCHAINES ÉTAPES</span><h2>Objectifs de collection</h2>${[{label:'Premier lien',detail:'Collectionner un personnage',value:s.unique.length,target:1},{label:'Une équipe complète',detail:'10 personnages uniques',value:s.unique.length,target:10},{label:'Le début d’une légende',detail:'Obtenir une légendaire ou une mythique',value:rareCount,target:1}].map(goal=>`<div class="kp-objective${goal.value>=goal.target?' is-done':''}"><span class="kp-objective-mark">${goal.value>=goal.target?icon('check'):icon('spark')}</span><span><strong>${goal.label}</strong><small>${goal.detail}</small></span><b>${Math.min(goal.value,goal.target)}/${goal.target}</b></div>`).join('')}</section>
        <section class="kp-account-card"><span>${icon('lock')}</span><h2>${signedIn?'Ton espace personnel':'Emporte ta collection'}</h2><p${unavailable?' class="kp-account-activation"':''}>${signedIn?'Ton compte réunit ton profil et ta collection.':'Connecte-toi avec Discord pour retrouver ton profil et tes cartes sur tes appareils. Ton profil Kizuna est créé à ta première connexion.'}</p>${signedIn?`<button type="button" class="kp-text-button" data-kp-action="account">Gérer mon compte ${icon('arrow')}</button><button type="button" class="kp-signout" data-kp-action="signout">Se déconnecter</button>`:`<button type="button" class="kp-button kp-button-primary" data-kp-action="login">Continuer avec Discord</button>`}</section>
      </aside></div><div class="kp-profile-notice${state.error?' is-error':''}" role="status" aria-live="polite">${esc(state.message)}</div>
    </div>`;
    if(numbersOpen)root.querySelector('.kad-player-numbers').open=true;
    if(focusAction)[...root.querySelectorAll('[data-kp-action]')].find(button=>button.dataset.kpAction===focusAction)?.focus({preventScroll:true});
    bindSources();window.KizunaExperience?.animateNumbers(root);window.KizunaNexus?.decorateProfile?.();
  }

  function queueRender() {
    const account=window.KizunaAccount?.getSnapshot?.()||{};
    if(state.editOpen&&(account.loading||account.user?.id!==state.editorOwner)){
      ++state.editorEpoch;dialog?.close();dialog?.remove();dialog=null;
      state.editOpen=false;state.saving=false;state.editorOwner=null;state.message='';
    }
    if(document.body.dataset.tab!=='profile')return;cancelAnimationFrame(frame);frame=requestAnimationFrame(render);
  }
  function notify(message, error=false) { state.message=message;state.error=error;queueRender(); }
  function openAccount(mode='login') {
    if(window.KizunaAccount?.open)window.KizunaAccount.open(mode);
    else notify('La connexion est en cours de chargement. Réessaie dans un instant.',true);
  }
  function navigate(tab) { if(window.KizunaGame?.showTab)window.KizunaGame.showTab(tab);else document.body.dataset.tab=tab; }
  function openEditor() {
    const s=snapshots();
    if(!s.account.user||s.account.loading){openAccount('login');return;}
    state.editorOwner=s.account.user.id;++state.editorEpoch;
    lastFocus=document.activeElement;
    dialog=document.createElement('dialog');dialog.className='kp-edit-dialog';dialog.setAttribute('aria-labelledby','kpEditTitle');
    dialog.innerHTML=`<form class="kp-edit-form"><button type="button" class="kp-dialog-close" data-kp-close aria-label="Fermer">×</button><span class="kp-kicker">FAIS DE LA PLACE À TON STYLE</span><h2 id="kpEditTitle">Modifier mon profil</h2><p>Un pseudo, quelques mots et ta carte favorite.</p><label>Pseudo<input name="username" type="text" value="${esc(s.username)}" minlength="2" maxlength="20" autocomplete="nickname" pattern="[A-Za-z0-9_.-]{2,20}" title="2 à 20 lettres, chiffres, points, tirets ou tirets bas" required></label><label>Bio<textarea name="bio" maxlength="240" rows="3" placeholder="Ton anime préféré, ton objectif de collection…">${esc(s.profile.bio||'')}</textarea><small>240 caractères maximum</small></label><label>Carte favorite<select name="avatar_card_id"><option value="">Mes initiales</option>${s.unique.slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'','fr')).map(card=>`<option value="${esc(card.id)}"${String(card.id)===String(s.profile.avatar_card_id)?' selected':''}>${esc(card.name)} · ${esc(card.rarity)}</option>`).join('')}</select><small>La carte choisie devient ton avatar et passe en tête de ta vitrine.</small></label><p class="kp-edit-status" role="status" aria-live="polite"></p><div class="kp-edit-actions"><button type="button" class="kp-button kp-button-secondary" data-kp-close>Annuler</button><button type="submit" class="kp-button kp-button-primary">Enregistrer ${icon('check')}</button></div></form>`;
    document.body.append(dialog);state.editOpen=true;
    dialog.querySelectorAll('[data-kp-close]').forEach(button=>button.addEventListener('click',closeEditor));
    dialog.addEventListener('cancel',event=>{event.preventDefault();if(!state.saving)closeEditor();});
    dialog.addEventListener('click',event=>{if(event.target!==dialog||state.saving)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeEditor();});
    dialog.querySelector('form').addEventListener('submit',saveProfile);
    dialog.showModal();dialog.querySelector('input').focus();
  }
  function closeEditor() { if(state.saving)return;++state.editorEpoch;dialog?.close();dialog?.remove();dialog=null;state.editOpen=false;state.editorOwner=null;lastFocus?.focus?.();queueRender(); }
  async function saveProfile(event) {
    event.preventDefault();if(state.saving)return;
    const form=event.currentTarget,data=new FormData(form),username=String(data.get('username')||'').trim(),bio=String(data.get('bio')||'').trim();
    const message=form.querySelector('.kp-edit-status');
    if(username.length<2){message.textContent='Choisis un pseudo de 2 à 20 caractères.';return;}
    const token=state.editorEpoch,owner=state.editorOwner;
    state.saving=true;form.querySelectorAll('button').forEach(button=>button.disabled=true);message.textContent='Enregistrement…';
    try {
      await window.KizunaAccount.updateProfile({username,bio,avatar_card_id:String(data.get('avatar_card_id')||'')||null});
      if(token!==state.editorEpoch||owner!==window.KizunaAccount.getSnapshot()?.user?.id)return;
      state.saving=false;closeEditor();notify('Ton profil a été mis à jour.');
    } catch(error) {
      if(token!==state.editorEpoch||owner!==window.KizunaAccount.getSnapshot()?.user?.id)return;
      message.textContent=error?.message||'Impossible d’enregistrer le profil. Réessaie.';
      message.classList.add('is-error');state.saving=false;form.querySelectorAll('button').forEach(button=>button.disabled=false);
    }
  }
  function bindSources() {
    if(window.KizunaGame?.subscribe&&state.subscribedGame!==window.KizunaGame){window.KizunaGame.subscribe(queueRender);state.subscribedGame=window.KizunaGame;}
    if(window.KizunaAccount?.subscribe&&state.subscribedAccount!==window.KizunaAccount){window.KizunaAccount.subscribe(queueRender);state.subscribedAccount=window.KizunaAccount;}
  }
  function init() {
    const main=document.querySelector('main');if(!main)return;
    root=document.createElement('section');root.id='profilePage';root.className='kp-profile-page';main.append(root);
    root.addEventListener('click',async event=>{
      const button=event.target.closest('[data-kp-action],[data-kp-nav],[data-kp-card],[data-kp-sanctuary],[data-kp-album]');if(!button)return;
      event.preventDefault();
      if(button.hasAttribute('data-kp-sanctuary')){window.KizunaAdventure?.navigate('sanctuary');return;}
      if(button.hasAttribute('data-kp-album')){window.KizunaGame?.openAlbumKey?.(button.dataset.kpAlbum);return;}
      if(button.dataset.kpNav){navigate(button.dataset.kpNav);return;}
      if(button.dataset.kpCard){window.KizunaGame?.openCard?.(button.dataset.kpCard);return;}
      const action=button.dataset.kpAction;
      if(action==='edit')openEditor();
      else if(action==='signout'){
        button.disabled=true;
        try{await window.KizunaAccount?.signOut?.();notify('Tu es déconnecté.');}catch(error){notify(error?.message||'La déconnexion a échoué.',true);}finally{button.disabled=false;}
      }else openAccount(action==='signup'?'signup':action==='account'&&snapshots().account.user?'account':'login');
    });
    for(const name of ['kizuna:game-change','kizuna:account-change','kizuna:ready','kizuna:tab-change'])window.addEventListener(name,queueRender);
    document.addEventListener('kizuna:account-change',queueRender);
    new MutationObserver(()=>{if(document.body.dataset.tab==='profile')queueRender();}).observe(document.body,{attributes:true,attributeFilter:['data-tab']});
    render();
    window.KizunaProfile={refresh:queueRender,open:()=>{navigate('profile');queueRender();},edit:openEditor};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
