/* Kizuna staff workspace. Permissions and every operation are checked by the server. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const clean = (value, max = 280) => String(value ?? '').trim().slice(0, max);
  const tiers = ['Rare','Épique','Légendaire','Mythique'];
  const tierColors = {'Commun':'#afc1d7','Peu commune':'#74dfbd','Rare':'#7bbfff','Épique':'#c4a4ff','Légendaire':'#f5d18a','Mythique':'#ff91b2'};
  const roleName = role => role === 'admin' ? 'Administrateur' : role === 'moderator' ? 'Modérateur' : 'Joueur';
  const date = value => {
    const parsed = new Date(value);
    return value && Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(parsed) : '—';
  };
  const uuid = () => window.crypto.randomUUID();
  const icon = name => ({
    shield:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></svg>',
    people:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 3 5v3"/></svg>',
    cards:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="7" y="3" width="13" height="17" rx="2"/><path d="M4 7H3v14h13M11 8h5M11 12h5M11 16h3"/></svg>',
    box:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 2 9 5v10l-9 5-9-5V7l9-5ZM3 7l9 5 9-5M12 12v10M8 4l9 5"/></svg>',
    gift:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 8h18v5H3V8ZM5 13v9h14v-9M12 8v14"/><path d="M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z"/></svg>'
  }[name] || '');
  let root, navigation, observer, accountAPI, unsubscribe, epoch = 0, accountKey = '', blockedKey = '';
  const state = {
    role:null, tab:'registrations', busy:false, message:'', kind:'', players:[], page:1, hasNext:false, search:'', loadedPlayers:false,
    boosters:[], loadedBoosters:false, editingId:null, selected:new Set(), poolSearch:'', poolLimit:60, grantIntent:null
  };

  function snapshot() { try {return window.KizunaAccount?.getSnapshot?.() || {};} catch {return {};} }
  function currentRole() {
    const value = snapshot();
    return value.user?.id && !value.loading && ['admin','moderator'].includes(value.staffRole) ? value.staffRole : null;
  }
  function isAllowed() {return !!root && currentRole() === state.role && accountKey === String(snapshot().user?.id || '') + ':' + state.role && blockedKey !== accountKey;}
  function cards() {try {return window.KizunaGame?.getSnapshot?.().cards || [];} catch {return [];} }
  function clearState() {
    Object.assign(state,{role:null,tab:'registrations',busy:false,message:'',kind:'',players:[],page:1,hasNext:false,search:'',loadedPlayers:false,boosters:[],loadedBoosters:false,editingId:null,poolSearch:'',poolLimit:60,grantIntent:null});
    state.selected.clear();
  }
  function unmount(navigate = false) {
    epoch++;
    observer?.disconnect(); observer = null;
    navigation?.remove(); navigation = null;
    root?.remove(); root = null;
    clearState();
    if (navigate && document.body.dataset.tab === 'staff') window.KizunaGame?.showTab?.('profile');
  }
  function outsideNotice(message) {
    let notice = document.getElementById('ksGlobalNotice');
    if (!notice) {notice=document.createElement('div');notice.id='ksGlobalNotice';notice.className='ks-global-notice';notice.setAttribute('role','alert');document.body.append(notice);}
    notice.replaceChildren(document.createTextNode(message));
    const close=document.createElement('button');close.type='button';close.setAttribute('aria-label','Fermer le message');close.textContent='×';close.addEventListener('click',()=>notice.remove());notice.append(close);
  }
  function message(value, kind = '') {
    state.message=value;state.kind=kind;
    const node=root?.querySelector('#ksStatus');
    if(node){node.textContent=value;node.dataset.kind=kind;}
  }
  function syncControls() {
    if(!root)return;
    root.setAttribute('aria-busy',String(state.busy));
    // The adopted AniList tool owns its loading, pagination and import states.
    root.querySelectorAll('button,input,textarea,select').forEach(node=>{if(!node.closest('#ksAniListHost,#ks-nexus-admin'))node.disabled=state.busy;});
    root.querySelector('[data-ks="previous"]').disabled=state.busy || state.page<=1;
    root.querySelector('[data-ks="next"]').disabled=state.busy || !state.hasNext;
    const publish=root.querySelector('[data-ks="publish-booster"]');
    if(publish)publish.disabled=state.busy || missingTiers().length>0;
    root.querySelectorAll('[data-ks-card]').forEach(node=>{node.disabled=state.busy || (!node.checked&&state.selected.size>=500);});
    root.querySelectorAll('[data-ks="staff-role"]').forEach(button=>{const select=button.closest('.ks-team-row')?.querySelector('[data-ks-grade]');button.disabled=state.busy||!select||select.value===select.dataset.currentRole;});
  }
  async function request(payload, success) {
    if(!isAllowed() || state.busy)return;
    const requestEpoch=epoch, requestKey=accountKey;
    state.busy=true;message('Chargement…');syncControls();
    try{
      const result=await window.KizunaAccount.staffRequest(payload);
      if(requestEpoch!==epoch || requestKey!==accountKey || !isAllowed())return;
      await success(result || {});
    }catch(error){
      if(requestEpoch!==epoch || requestKey!==accountKey)return;
      if(Number(error?.status)===403&&error?.code==='SELF_ROLE_PROTECTED'){message(error?.message||'Tu ne peux pas modifier ton propre grade.','error');return;}
      if([401,403].includes(Number(error?.status))){
        blockedKey=accountKey;unmount(true);outsideNotice('Ton accès staff a changé. Reconnecte-toi avec un compte autorisé.');return;
      }
      message(error?.message || 'Le service staff est indisponible. Réessaie dans un instant.','error');
    }finally{
      if(requestEpoch===epoch && requestKey===accountKey){state.busy=false;syncControls();}
    }
  }
  function adoptCatalogue() {
    const host=root?.querySelector('#ksAniListHost'), catalogue=document.getElementById('kizunaAniListCatalogue');
    if(!host || state.role!=='admin')return;
    if(catalogue && catalogue.parentElement!==host)host.append(catalogue);
    const fallback=root.querySelector('#ksAniListFallback');if(fallback)fallback.hidden=!!catalogue;
  }
  function mount(role) {
    if(root)return;
    state.role=role;
    const admin=role==='admin';
    root=document.createElement('section');root.id='staffPage';root.className='ks-workspace';root.setAttribute('aria-labelledby','ksTitle');
    root.innerHTML=`<div class="wrap ks-wrap"><div class="ks-breadcrumb"><a href="#profile" data-ks="profile">Mon profil</a><span>/</span><span>Espace staff</span></div>
      <header class="ks-hero"><span class="ks-hero-icon">${icon('shield')}</span><div><span class="ks-kicker">KIZUNA · ÉQUIPE</span><h1 id="ksTitle">Le lien, côté coulisses.</h1><p>${admin?'Anime le catalogue, compose les boosters et accompagne les joueurs.':'Bienvenue dans ton espace de suivi des nouveaux collectionneurs.'}</p></div><span class="ks-role ks-role-${role}">${roleName(role)}</span></header>
      <nav class="ks-tabs" aria-label="Outils staff">${[['registrations','people','Inscriptions'],...(admin?[['cards','cards','Cartes AniList'],['boosters','box','Boosters'],['rewards','gift','Récompenses'],['moderators','shield','Équipe']]:[])].map(([id,symbol,label])=>`<button type="button" data-ks-tab="${id}" aria-controls="ks-${id}" class="${id==='registrations'?'is-active':''}" aria-pressed="${id==='registrations'}">${icon(symbol)}${label}</button>`).join('')}</nav>
      <p id="ksStatus" class="ks-status" role="status" aria-live="polite"></p>
      <section id="ks-registrations" class="ks-panel" aria-labelledby="ksRegistrationsTitle"><div class="ks-panel-head"><div><span class="ks-kicker">ACCUEILLIR & SUIVRE</span><h2 id="ksRegistrationsTitle">Les inscriptions</h2><p>Les profils Kizuna, du plus récent au plus ancien.</p></div><button type="button" class="ks-button ks-secondary" data-ks="refresh-players">Actualiser</button></div><form id="ksPlayerSearch" class="ks-search" role="search"><label for="ksPlayerQuery">Rechercher un pseudo</label><div><input id="ksPlayerQuery" name="search" type="search" maxlength="100" placeholder="Pseudo du joueur…" autocomplete="off"><button type="submit" class="ks-button">Rechercher</button></div></form><div id="ksPlayers"></div><nav class="ks-pagination" aria-label="Pages des inscriptions"><button type="button" class="ks-button ks-secondary" data-ks="previous" disabled>← Précédente</button><span id="ksPageLabel">Page 1</span><button type="button" class="ks-button ks-secondary" data-ks="next" disabled>Suivante →</button></nav><div id="ksReviewHost"></div><p class="ks-note">${admin?'Les grades se gèrent dans l’onglet Équipe.':'Ton rôle permet de consulter les inscriptions et de marquer les profils vérifiés.'} Les e-mails et les collections restent privés.</p></section>
      ${admin?`<section id="ks-cards" class="ks-panel" aria-label="Ajout de cartes AniList" hidden><div id="ksAniListHost"><p id="ksAniListFallback" class="ks-empty">Les outils AniList se préparent. Réessaie après le chargement du compte.</p></div></section>
      <section id="ks-boosters" class="ks-panel" aria-labelledby="ksBoostersTitle" hidden><div class="ks-panel-head"><div><span class="ks-kicker">UNE SÉLECTION, UN UNIVERS</span><h2 id="ksBoostersTitle">Composer les boosters</h2><p>Choisis les cartes disponibles, puis publie ta sélection.</p></div><button type="button" class="ks-button" data-ks="new-booster">+ Nouveau booster</button></div><div id="ksBoosterList" class="ks-booster-list"></div><form id="ksBoosterForm" class="ks-builder"><div class="ks-builder-heading"><h3 id="ksBuilderTitle">Nouveau booster</h3><span class="ks-chip">5 cartes · 1 roll</span></div><div class="ks-form-grid"><label>Nom du booster<input name="name" minlength="3" maxlength="60" required placeholder="Les liens de Konoha"></label><label class="ks-wide">Description<textarea name="description" maxlength="300" rows="2" placeholder="Présente l’univers de ce booster…"></textarea></label></div><div class="ks-pool-toolbar"><label for="ksCardQuery">Chercher dans le catalogue Kizuna<input id="ksCardQuery" type="search" maxlength="100" placeholder="Personnage, anime ou rareté…" autocomplete="off"></label><button type="button" class="ks-text-button" data-ks="clear-pool">Vider la sélection</button></div><div id="ksPoolSummary"></div><div id="ksCardPool" class="ks-card-pool"></div><div class="ks-pool-footer"><span id="ksPoolCount"></span><button type="button" class="ks-button ks-secondary" data-ks="more-cards">Afficher plus de cartes</button></div><div class="ks-builder-actions"><button type="submit" class="ks-button ks-secondary" data-ks="draft-booster">Enregistrer le brouillon</button><button type="button" class="ks-button" data-ks="publish-booster">Publier le booster</button></div><p class="ks-note">Les probabilités et garanties Kizuna s’appliquent. Pour publier, inclus au moins une Rare, une Épique, une Légendaire et une Mythique. Un brouillon peut rester incomplet.</p></form></section>
      <section id="ks-rewards" class="ks-panel" aria-labelledby="ksRewardsTitle" hidden><div class="ks-panel-head"><div><span class="ks-kicker">LES PETITES ATTENTIONS COMPTENT</span><h2 id="ksRewardsTitle">Offrir des rerolls et du Chakra</h2><p>Des ouvertures de booster offertes et du Chakra, pour le joueur de ton choix.</p></div><span class="ks-hero-icon ks-small-icon">${icon('gift')}</span></div><form id="ksRewardPlayerSearch" class="ks-search" role="search"><label for="ksRewardQuery">Trouver le joueur</label><div><input id="ksRewardQuery" type="search" maxlength="100" placeholder="Rechercher son pseudo…" autocomplete="off"><button type="submit" class="ks-button ks-secondary">Rechercher</button></div></form><form id="ksRewardForm" class="ks-reward-form"><label>Joueur<select name="userId" id="ksRewardTarget" required><option value="">Choisir un joueur</option></select></label><div class="ks-form-grid"><label>Rerolls gratuits à offrir<input name="rolls" type="number" min="0" max="1000" step="1" value="0" inputmode="numeric" required><small>1 reroll gratuit = 1 ouverture de booster offerte.</small></label><label>Chakra à offrir<input name="chakra" type="number" min="0" max="1000000" step="1" value="0" inputmode="numeric" required></label></div><label>Motif<textarea name="reason" minlength="2" maxlength="280" rows="3" placeholder="Récompense d’événement, aide à un joueur…" required></textarea></label><div class="ks-reward-bottom"><p>Les récompenses sont enregistrées et ajoutées au compte du joueur sans remplacer sa collection.</p><button type="submit" class="ks-button">Offrir la récompense ${icon('gift')}</button></div></form></section>
      <section id="ks-moderators" class="ks-panel" aria-labelledby="ksModeratorsTitle" hidden><div class="ks-panel-head"><div><span class="ks-kicker">UNE ÉQUIPE POUR LA COMMUNAUTÉ</span><h2 id="ksModeratorsTitle">Gérer l’équipe</h2><p>Choisis le grade des membres et offre des récompenses aux joueurs.</p></div></div><form id="ksModeratorSearch" class="ks-search" role="search"><label for="ksModeratorQuery">Trouver un joueur</label><div><input id="ksModeratorQuery" type="search" maxlength="100" placeholder="Rechercher son pseudo…" autocomplete="off"><button type="submit" class="ks-button ks-secondary">Rechercher</button></div></form><div id="ksModerators"></div><p class="ks-note">Administrateur : cartes, boosters, récompenses et gestion de l’équipe. Modérateur : suivi des inscriptions. Joueur : pas d’accès staff. Tu ne peux pas modifier ton propre grade.</p></section>`:''}
      </div>`;
    document.querySelector('main')?.append(root);
    navigation=document.createElement('a');navigation.id='staffNav';navigation.href='#staff';navigation.dataset.tab='staff';navigation.className='ks-nav';navigation.textContent='Staff';navigation.setAttribute('aria-label','Ouvrir le panel staff');
    navigation.addEventListener('click',event=>{event.preventDefault();open();});document.querySelector('.nav')?.append(navigation);
    root.addEventListener('click',click);
    root.addEventListener('change',event=>{if(event.target.matches('[data-ks-grade]'))syncControls();});
    root.querySelector('#ksPlayerSearch').addEventListener('submit',event=>{event.preventDefault();loadPlayers(clean(event.currentTarget.elements.search.value,100),1);});
    if(admin){
      root.querySelector('#ksRewardPlayerSearch').addEventListener('submit',event=>{event.preventDefault();loadPlayers(clean(root.querySelector('#ksRewardQuery').value,100),1);});
      root.querySelector('#ksModeratorSearch').addEventListener('submit',event=>{event.preventDefault();loadPlayers(clean(root.querySelector('#ksModeratorQuery').value,100),1);});
      root.querySelector('#ksBoosterForm').addEventListener('submit',event=>{event.preventDefault();saveBooster(false);});
      root.querySelector('#ksRewardForm').addEventListener('submit',grantRewards);
      root.querySelector('#ksRewardForm').addEventListener('input',()=>{state.grantIntent=null;});
      root.querySelector('#ksRewardForm').addEventListener('change',()=>{state.grantIntent=null;});
      root.querySelector('#ksCardQuery').addEventListener('input',event=>{state.poolSearch=event.currentTarget.value;state.poolLimit=60;renderPool();});
      root.querySelector('#ksCardPool').addEventListener('change',event=>{const box=event.target.closest('[data-ks-card]');if(!box||state.busy)return;const id=box.dataset.ksCard;if(box.checked&&state.selected.size<500)state.selected.add(id);else state.selected.delete(id);renderPool();[...root.querySelectorAll('[data-ks-card]')].find(node=>node.dataset.ksCard===id)?.focus();});
      observer=new MutationObserver(adoptCatalogue);observer.observe(document.body,{childList:true,subtree:true});adoptCatalogue();renderPool();
    }
    renderPlayers();
    if(document.body.dataset.tab==='staff')activate('registrations');
  }
  function syncAccount() {
    const api=window.KizunaAccount;
    if(api!==accountAPI){unsubscribe?.();accountAPI=api;unsubscribe=typeof api?.subscribe==='function'?api.subscribe(syncAccount):null;}
    const account=snapshot(),role=currentRole(),nextKey=role?String(account.user.id)+':'+role:'';
    if(nextKey!==accountKey){unmount(!account.loading);accountKey=nextKey;blockedKey='';}
    if(role && blockedKey!==nextKey)mount(role);
    else if(root)unmount(!account.loading);
    if(!role && !account.loading && document.body.dataset.tab==='staff'){
      window.KizunaGame?.showTab?.('profile');
      outsideNotice('L’espace staff est réservé aux administrateurs et aux modérateurs.');
    }
  }
  function open(tab) {if(!isAllowed())return;if(typeof tab==='string')state.tab=tab;window.KizunaGame?.showTab?.('staff');activate(state.tab);}
  function activate(tab) {
    if(!isAllowed())return;
    const allowed=state.role==='admin'?['registrations','cards','boosters','rewards','moderators','adventure','market','studio','anomalies','nexus-admin']:['registrations'];
    state.tab=allowed.includes(tab)?tab:'registrations';
    root.querySelectorAll('.ks-tabs button').forEach(button=>{const active=button.dataset.ksTab===state.tab;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));});
    root.querySelectorAll('.ks-panel').forEach(panel=>{panel.hidden=panel.id!=='ks-'+state.tab;});
    message('');
    if(state.tab==='cards')adoptCatalogue();
    if(['registrations','rewards','moderators'].includes(state.tab) && !state.loadedPlayers)loadPlayers('',1);
    if(state.tab==='boosters' && !state.loadedBoosters)loadBoosters();
  }
  function click(event) {
    if(!isAllowed())return;
    const tab=event.target.closest('[data-ks-tab]');if(tab){activate(tab.dataset.ksTab);return;}
    const target=event.target.closest('[data-ks]');if(!target)return;
    const action=target.dataset.ks;
    if(action==='profile'){event.preventDefault();window.KizunaGame?.showTab?.('profile');}
    else if(action==='refresh-players')loadPlayers(state.search,state.page);
    else if(action==='previous')loadPlayers(state.search,state.page-1);
    else if(action==='next')loadPlayers(state.search,state.page+1);
    else if(action==='review')openReview(target.dataset.userId);
    else if(action==='cancel-review')root.querySelector('#ksReviewHost').replaceChildren();
    else if(action==='staff-role')setStaffRole(target.dataset.userId,target.closest('.ks-team-row')?.querySelector('[data-ks-grade]')?.value);
    else if(action==='reward-player')offerReward(target.dataset.userId);
    else if(action==='new-booster')resetBuilder();
    else if(action==='edit-booster')editBooster(target.dataset.boosterId);
    else if(action==='publish-booster')saveBooster(true);
    else if(action==='clear-pool'){state.selected.clear();renderPool();}
    else if(action==='more-cards'){state.poolLimit+=60;renderPool();}
    else if(action==='remove-card'){state.selected.delete(target.dataset.cardId);renderPool();}
  }
  async function loadPlayers(search=state.search,page=1) {
    return request({action:'list_players',search,page},result=>{
      if(!Array.isArray(result.players))throw new Error('La liste des inscriptions n’a pas pu être chargée.');
      state.players=result.players.slice(0,25).filter(player=>player && typeof player.id==='string' && typeof player.username==='string');
      state.page=Number(result.page)||page;state.search=search;state.hasNext=result.hasNext===true;state.loadedPlayers=true;renderPlayers();
      message(state.players.length?`${state.players.length} profil${state.players.length>1?'s':''} affiché${state.players.length>1?'s':''}.`:'Aucun profil ne correspond à cette recherche.');
    });
  }
  function renderPlayers() {
    if(!root)return;
    const host=root.querySelector('#ksPlayers');
    host.innerHTML=state.players.length?`<div class="ks-table-scroll"><table class="ks-table"><thead><tr><th>Collectionneur</th><th>Inscription</th><th>Dernière connexion</th><th>Suivi</th><th><span class="ks-sr-only">Actions</span></th></tr></thead><tbody>${state.players.map(player=>`<tr><td><span class="ks-player"><span class="ks-player-avatar" aria-hidden="true">${esc(player.username.slice(0,1).toUpperCase())}</span><span><strong>${esc(player.username)}</strong><small>${esc(roleName(player.staff_role))} · ${player.provider==='discord'?'Discord':'Compte Kizuna'}</small></span></span></td><td><time>${esc(date(player.created_at))}</time></td><td><time>${esc(date(player.last_sign_in_at))}</time></td><td><span class="ks-review-badge ${player.review_status==='reviewed'?'is-reviewed':''}">${player.review_status==='reviewed'?'Vérifié':'À vérifier'}</span></td><td><button type="button" class="ks-text-button" data-ks="review" data-user-id="${esc(player.id)}" aria-label="Voir le suivi de ${esc(player.username)}">Voir le suivi →</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="ks-empty">${state.loadedPlayers?'Aucun profil à afficher. Essaie un autre pseudo.':'Les nouvelles inscriptions apparaîtront ici.'}</div>`;
    root.querySelector('#ksPageLabel').textContent='Page '+state.page;
    root.querySelector('#ksReviewHost').replaceChildren();
    if(state.role==='admin'){
      const target=root.querySelector('#ksRewardTarget'),selected=target.value;
      target.innerHTML='<option value="">Choisir un joueur</option>'+state.players.map(player=>`<option value="${esc(player.id)}">${esc(player.username)}</option>`).join('');
      if(state.players.some(player=>player.id===selected))target.value=selected;
      const moderators=root.querySelector('#ksModerators');
      moderators.innerHTML=state.players.length?`<div class="ks-staff-list">${state.players.map(teamRow).join('')}</div>`:'<div class="ks-empty">Recherche le pseudo du joueur pour gérer son grade ou lui offrir une récompense.</div>';
    }
    syncControls();
  }
  function teamRow(player) {
    const own=player.id===String(snapshot().user?.id||''),current=['admin','moderator'].includes(player.staff_role)?player.staff_role:'player';
    return `<article class="ks-staff-row ks-team-row" data-ks-team-user="${esc(player.id)}"><span class="ks-player"><span class="ks-player-avatar" aria-hidden="true">${esc(player.username.slice(0,1).toUpperCase())}</span><span><strong>${esc(player.username)}</strong><small>${esc(roleName(player.staff_role))}</small></span></span><div class="ks-team-actions">${own?`<div class="ks-team-self"><span class="ks-chip">${esc(roleName(state.role))}</span><small>Ton compte</small></div>`:`<div class="ks-grade-controls"><label>Grade<select data-ks-grade data-user-id="${esc(player.id)}" data-current-role="${current}" aria-label="Grade de ${esc(player.username)}"><option value="player"${current==='player'?' selected':''}>Joueur</option><option value="moderator"${current==='moderator'?' selected':''}>Modérateur</option><option value="admin"${current==='admin'?' selected':''}>Administrateur</option></select></label><button type="button" class="ks-button ks-small-button" data-ks="staff-role" data-user-id="${esc(player.id)}" disabled>Enregistrer le grade</button></div>`}<button type="button" class="ks-button ks-secondary ks-small-button" data-ks="reward-player" data-user-id="${esc(player.id)}">${icon('gift')}Offrir une récompense</button></div></article>`;
  }
  function openReview(userId) {
    const player=state.players.find(value=>value.id===userId);if(!player)return;
    const host=root.querySelector('#ksReviewHost');
    host.innerHTML=`<form class="ks-review-form"><div class="ks-panel-head"><div><span class="ks-kicker">SUIVI D’INSCRIPTION</span><h3>${esc(player.username)}</h3></div><button type="button" class="ks-text-button" data-ks="cancel-review">Fermer ×</button></div><label>État du suivi<select name="status"><option value="pending"${player.review_status!=='reviewed'?' selected':''}>À vérifier</option><option value="reviewed"${player.review_status==='reviewed'?' selected':''}>Vérifié</option></select></label><label>Note interne<textarea name="note" maxlength="500" rows="3" placeholder="Une observation utile à l’équipe…">${esc(player.review_note||'')}</textarea></label>${player.reviewed_at?`<p class="ks-note">Dernière vérification : ${esc(date(player.reviewed_at))}</p>`:''}<button type="submit" class="ks-button">Enregistrer le suivi</button></form>`;
    host.querySelector('form').addEventListener('submit',event=>{
      event.preventDefault();const data=new FormData(event.currentTarget),status=String(data.get('status')),note=clean(data.get('note'),500);
      request({action:'review_player',userId,status,note},()=>{
        player.review_status=status;player.review_note=note;player.reviewed_at=status==='reviewed'?new Date().toISOString():null;renderPlayers();message('Le suivi de '+player.username+' a été enregistré.','success');
      });
    });
    host.querySelector('select').focus();
  }
  function setStaffRole(userId,value) {
    if(state.role!=='admin'||state.busy||!['player','moderator','admin'].includes(value))return;
    const player=state.players.find(entry=>entry.id===userId),role=value==='player'?null:value;
    if(!player)return;
    if(userId===String(snapshot().user?.id||'')){message('Tu ne peux pas modifier ton propre grade.','error');return;}
    if((player.staff_role||null)===role)return;
    request({action:'set_staff_role',userId,role},result=>{
      if(result.ok!==true||result.role!==role)throw new Error('Le serveur n’a pas confirmé ce changement de grade.');
      player.staff_role=role;renderPlayers();message('Le grade de '+player.username+' est maintenant '+roleName(role)+'.','success');
    });
  }
  function offerReward(userId) {
    if(state.role!=='admin'||state.busy||!state.players.some(player=>player.id===userId))return;
    activate('rewards');
    const form=root.querySelector('#ksRewardForm');
    if(form.elements.userId.value!==userId){form.reset();state.grantIntent=null;}
    form.elements.userId.value=userId;
    form.elements.rolls.focus();
  }
  async function loadBoosters() {
    if(state.role!=='admin')return;
    return request({action:'list_boosters'},result=>{if(!Array.isArray(result.boosters))throw new Error('Les boosters n’ont pas pu être chargés.');state.boosters=result.boosters;state.loadedBoosters=true;renderBoosters();message('');});
  }
  function renderBoosters() {
    if(!root || state.role!=='admin')return;
    root.querySelector('#ksBoosterList').innerHTML=state.boosters.length?state.boosters.map(booster=>`<article class="ks-booster-tile"><span class="ks-booster-emblem">${icon('box')}</span><div><span class="ks-chip ${booster.published?'is-live':''}">${booster.published?'Publié':'Brouillon'}</span><h3>${esc(booster.name)}</h3><p>${esc(booster.description||'Une sélection de cartes Kizuna.')}</p><small>${Array.isArray(booster.card_ids)?booster.card_ids.length:0} cartes dans la sélection · 5 cartes par ouverture</small></div><button type="button" class="ks-text-button" data-ks="edit-booster" data-booster-id="${esc(booster.id)}">Modifier →</button></article>`).join(''):'<div class="ks-empty">Ton premier booster personnalisé commence ici. Sélectionne les cartes qui lui donneront son identité.</div>';
  }
  function resetBuilder() {
    if(!root || state.role!=='admin')return;
    state.editingId=null;state.selected.clear();state.poolSearch='';state.poolLimit=60;
    root.querySelector('#ksBoosterForm').reset();root.querySelector('#ksBuilderTitle').textContent='Nouveau booster';root.querySelector('#ksCardQuery').value='';renderPool();message('Un nouveau booster est prêt à être composé.');root.querySelector('#ksBoosterForm [name="name"]').focus();
  }
  function editBooster(id) {
    const booster=state.boosters.find(value=>value.id===id);if(!booster)return;
    state.editingId=booster.id;state.selected=new Set(Array.isArray(booster.card_ids)?booster.card_ids:[]);state.poolSearch='';state.poolLimit=60;
    const form=root.querySelector('#ksBoosterForm');form.elements.name.value=booster.name||'';form.elements.description.value=booster.description||'';root.querySelector('#ksBuilderTitle').textContent='Modifier le booster';root.querySelector('#ksCardQuery').value='';renderPool();message(booster.published?'Cette version est publiée. Enregistrer en brouillon la retirera des ouvertures.':'Ce booster est en brouillon.');form.elements.name.focus();
  }
  function missingTiers() {
    const selected=cards().filter(card=>state.selected.has(String(card.id)));
    return tiers.filter(tier=>!selected.some(card=>card.rarity===tier));
  }
  function renderPool() {
    if(!root || state.role!=='admin')return;
    const catalogue=cards(),byId=new Map(catalogue.map(card=>[String(card.id),card])),query=state.poolSearch.trim().toLocaleLowerCase();
    const filtered=catalogue.filter(card=>!query || [card.name,card.series,card.rarity,card.id].some(value=>String(value||'').toLocaleLowerCase().includes(query)));
    const visible=filtered.slice(0,state.poolLimit),missing=missingTiers();
    const counts=Object.fromEntries(tiers.map(tier=>[tier,catalogue.filter(card=>state.selected.has(String(card.id))&&card.rarity===tier).length]));
    root.querySelector('#ksPoolSummary').innerHTML=`<div class="ks-pool-summary"><strong>${state.selected.size} / 500 cartes sélectionnées</strong><div>${tiers.map(tier=>`<span class="ks-tier-chip${counts[tier]?' is-present':''}" style="--ks-tier:${tierColors[tier]}">${tier} <b>${counts[tier]}</b></span>`).join('')}</div></div>${missing.length?`<p class="ks-pool-warning">Avant publication, ajoute : ${missing.map(esc).join(', ')}.</p>`:'<p class="ks-pool-ready">Les quatre raretés nécessaires aux garanties sont présentes.</p>'}<div class="ks-selected-chips">${[...state.selected].slice(0,24).map(id=>`<button type="button" data-ks="remove-card" data-card-id="${esc(id)}" aria-label="Retirer ${esc(byId.get(id)?.name||id)}">${esc(byId.get(id)?.name||id)} <span aria-hidden="true">×</span></button>`).join('')}${state.selected.size>24?`<span>+ ${state.selected.size-24} autres</span>`:''}</div>`;
    root.querySelector('#ksCardPool').innerHTML=visible.length?visible.map(card=>`<label class="ks-pool-card${state.selected.has(String(card.id))?' is-selected':''}" style="--ks-tier:${tierColors[card.rarity]||'#a9bdd6'}"><input type="checkbox" data-ks-card="${esc(card.id)}"${state.selected.has(String(card.id))?' checked':''}><span class="ks-pool-check" aria-hidden="true">✓</span><span><strong>${esc(card.name)}</strong><small>${esc(card.series)}</small><span class="ks-pool-rarity">${esc(card.rarity)}</span></span></label>`).join(''):'<div class="ks-empty">Aucune carte ne correspond à cette recherche. Ajoute des personnages depuis l’onglet Cartes AniList.</div>';
    root.querySelector('#ksPoolCount').textContent=visible.length+' / '+filtered.length+' cartes affichées';root.querySelector('[data-ks="more-cards"]').hidden=visible.length>=filtered.length;syncControls();
  }
  function saveBooster(published) {
    if(state.role!=='admin' || !root)return;
    const form=root.querySelector('#ksBoosterForm'),name=clean(form.elements.name.value,60),description=clean(form.elements.description.value,300);
    if(name.length<3){message('Choisis un nom de 3 à 60 caractères pour ce booster.','error');form.elements.name.focus();return;}
    if(published && missingTiers().length){message('Ajoute une carte de chaque rareté nécessaire avant de publier.','error');return;}
    const booster={...(state.editingId?{id:state.editingId}:{}),name,description,card_ids:[...state.selected],published},saveEpoch=epoch,saveKey=accountKey;
    request({action:'save_booster',booster},async result=>{
      if(!result.booster?.id)throw new Error('Le serveur n’a pas confirmé l’enregistrement du booster.');
      const saved=result.booster,index=state.boosters.findIndex(value=>value.id===saved.id);if(index<0)state.boosters.unshift(saved);else state.boosters[index]=saved;
      state.editingId=saved.id;renderBoosters();
      let refreshed=true;
      try{await window.KizunaBackend?.refreshBoosters?.();}catch{refreshed=false;}
      if(saveEpoch!==epoch || saveKey!==accountKey || !isAllowed())return;
      message(refreshed?(published?'Le booster est publié et disponible pour les joueurs.':'Le brouillon du booster a été enregistré.'):'Le booster est enregistré. Recharge la page pour actualiser les boosters disponibles.','success');window.dispatchEvent(new CustomEvent('kizuna:boosters-updated'));
    });
  }
  function grantRewards(event) {
    event.preventDefault();if(state.role!=='admin' || state.busy)return;
    const form=event.currentTarget,userId=String(form.elements.userId.value),rolls=Number(form.elements.rolls.value),chakra=Number(form.elements.chakra.value),reason=clean(form.elements.reason.value,280);
    if(!state.players.some(player=>player.id===userId)){message('Choisis un joueur dans les résultats de recherche.','error');return;}
    if(!Number.isInteger(rolls)||rolls<0||rolls>1000||!Number.isInteger(chakra)||chakra<0||chakra>1000000||rolls+chakra<=0){message('Offre de 1 à 1 000 rerolls gratuits ou de 1 à 1 000 000 Chakra, en nombres entiers.','error');return;}
    if(reason.length<2){message('Ajoute un motif de 2 à 280 caractères.','error');form.elements.reason.focus();return;}
    const signature=JSON.stringify([userId,rolls,chakra,reason]);
    if(state.grantIntent?.signature!==signature)state.grantIntent={signature,id:uuid()};
    const requestId=state.grantIntent.id,player=state.players.find(value=>value.id===userId);
    request({action:'grant_rewards',userId,rolls,chakra,reason,requestId},()=>{state.grantIntent=null;form.elements.rolls.value='0';form.elements.chakra.value='0';form.elements.reason.value='';message(`Récompense enregistrée pour ${player.username} : ${rolls} reroll${rolls>1?'s':''} gratuit${rolls>1?'s':''} et ${new Intl.NumberFormat('fr-FR').format(chakra)} Chakra.`,'success');window.dispatchEvent(new CustomEvent('kizuna:rewards-updated'));});
  }
  window.addEventListener('kizuna:tab-change',event=>{if(event.detail?.tab==='staff' && isAllowed())activate(state.tab);});
  window.addEventListener('kizuna:game-change',()=>{if(root && state.role==='admin')renderPool();});
  document.addEventListener('kizuna:account-change',syncAccount);
  window.KizunaStaff={open,refresh:syncAccount};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',syncAccount,{once:true});else syncAccount();
})();
