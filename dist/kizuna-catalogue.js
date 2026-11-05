/* Admin catalogue tools. Every search and import is authorized by the server. */
(() => {
  'use strict';
  const CACHE_LIMIT = 12;
  const cache = new Map();
  const state = { mode:'character', page:0, search:null, entries:[], anime:[], selectedAnime:null, animeResults:null, albumId:'', creatingAlbum:false, hasNext:false, loading:false, cooldownUntil:0, message:'', kind:'', pendingImports:new Set(), imported:new Set() };
  let root, form, input, grid, status, previous, next, pageLabel, popular, breadcrumb, retryTimer;
  let accountAPI, unsubscribe, accountId = '', blockedAccountId = null, epoch = 0, queryVersion = 0;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);
  const imageURL = value => {
    try {
      const url = new URL(String(value));
      return url.protocol === 'https:' && (url.hostname === 'anilist.co' || url.hostname.endsWith('.anilist.co')) && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  };
  function entryFrom(entry) {
    const sourceId = String(entry?.sourceId ?? ''), name = text(entry?.name, 150);
    if (!/^\d+$/.test(sourceId) || !name) return null;
    const allowed = new Set(['shonen','seinen','shojo','isekai','sport','mecha']);
    const fav = Number(entry.fav);
    return { sourceId, name, native: text(entry.native,150), series: text(entry.series,200), image: imageURL(entry.image), fav: Number.isFinite(fav) ? Math.max(0,fav) : 0, g: ['F','M'].includes(entry.g) ? entry.g : '', cats: (Array.isArray(entry.cats) ? entry.cats : []).filter(cat => allowed.has(cat)) };
  }
  function animeFrom(value) {
    const id=String(value?.id??''),title=text(value?.title,200);
    if(!/^\d{1,10}$/.test(id)||Number(id)<=0||!title)return null;
    const integer=number=>Number.isSafeInteger(Number(number))&&Number(number)>0?Number(number):null;
    return {id,title,titleRomaji:text(value.titleRomaji,200),titleNative:text(value.titleNative,200),coverImage:imageURL(value.coverImage),format:text(value.format,30),season:text(value.season,20),seasonYear:integer(value.seasonYear),episodes:integer(value.episodes),status:text(value.status,30)};
  }
  function animeMetadata(anime) {
    const format={TV:'Série TV',TV_SHORT:'Format court',MOVIE:'Film',SPECIAL:'Spécial',OVA:'OVA',ONA:'ONA',MUSIC:'Clip musical'}[anime.format]||anime.format;
    const season={WINTER:'Hiver',SPRING:'Printemps',SUMMER:'Été',FALL:'Automne'}[anime.season]||'';
    return [format,[season,anime.seasonYear].filter(Boolean).join(' '),anime.episodes?anime.episodes+' épisode'+(anime.episodes>1?'s':''):'',anime.status==='NOT_YET_RELEASED'?'À venir':''].filter(Boolean).join(' · ') || 'Fiche anime AniList';
  }
  function albums() {
    try {const values=window.KizunaAlbums?.getAlbums?.();return Array.isArray(values)?values.filter(album=>album&&typeof album.id==='string'&&typeof album.name==='string'&&Array.isArray(album.card_ids)):[];}catch{return [];}
  }
  function selectedAlbum() {return albums().find(album=>album.id===state.albumId)||null;}
  function canonicalCard(sourceId) {try{return window.KizunaGame?.getSnapshot?.().cards?.find(card=>String(card.sourceId)===String(sourceId))||null;}catch{return null;}}
  async function refreshAlbums() {try{if(typeof window.KizunaAlbums?.refresh!=='function')return false;await window.KizunaAlbums.refresh();return true;}catch{return false;}}
  function adminSnapshot() {
    try { return window.KizunaAccount?.getSnapshot() || {}; } catch { return {}; }
  }
  function canAdmin() {
    const snapshot = adminSnapshot();
    return snapshot.isAdmin === true && snapshot.loading !== true && blockedAccountId !== accountId;
  }
  function unmount() {
    if (root) { root.hidden = true; root.inert = true; root.remove(); }
    root = null;
    epoch++;queryVersion++;
    clearInterval(retryTimer);
    cache.clear();
    state.mode='character';state.entries=[];state.anime=[];state.selectedAnime=null;state.animeResults=null;state.albumId='';state.creatingAlbum=false;state.page=0;state.search=null;state.hasNext=false;
    state.loading = false; state.cooldownUntil = 0;
    state.pendingImports.clear(); state.imported.clear();
  }
  function denied() {
    blockedAccountId = accountId;
    unmount();
    const parent = document.querySelector('#encyclopedia .wrap');
    if (!parent || document.getElementById('kacProtectedNotice')) return;
    const notice = document.createElement('p');
    notice.id = 'kacProtectedNotice'; notice.className = 'kac-protected-notice'; notice.setAttribute('role','status');
    notice.textContent = 'Accès au catalogue administrateur refusé. Reconnecte-toi avec un compte autorisé.';
    parent.prepend(notice);
  }
  function handleError(error) {
    const code = Number(error?.status || error?.statusCode || error?.context?.status);
    if (code === 401 || code === 403) { denied(); return; }
    if (!root || !canAdmin()) return;
    if (code === 429) { cooldown(error?.retryAfter || error?.retry_after || error?.context?.headers?.get?.('Retry-After') || '60'); return; }
    setMessage(error?.message || 'Le catalogue administrateur est indisponible. Réessaie dans un instant.', 'error');
  }
  function syncAccount() {
    const nextAPI = window.KizunaAccount;
    if (nextAPI !== accountAPI) {
      unsubscribe?.(); accountAPI = nextAPI;
      unsubscribe = typeof accountAPI?.subscribe === 'function' ? accountAPI.subscribe(syncAccount) : null;
    }
    const snapshot = adminSnapshot(), nextId = String(snapshot.user?.id || '');
    if (nextId !== accountId) {
      unmount(); accountId = nextId; blockedAccountId = null;
      document.getElementById('kacProtectedNotice')?.remove();
    }
    if (canAdmin()) mount(); else if (root) unmount();
  }
  function knownIds() {
    const known = new Set(state.imported);
    try {
      for (const card of window.KizunaGame?.getSnapshot()?.cards || []) if (card?.sourceId) known.add(String(card.sourceId));
    } catch { /* The game can still be finishing its initial load. */ }
    return known;
  }
  function setMessage(message, kind = '') {
    state.message = message;
    state.kind = kind;
    if (root) { status.textContent = message; status.dataset.kind = kind; }
  }
  function controls() {
    if (!root) return;
    const cooling = Date.now() < state.cooldownUntil;
    form.querySelector('button').disabled = state.loading || cooling;
    popular.disabled = state.loading || cooling;
    root.querySelectorAll('[data-kac-anime]').forEach(button=>{button.disabled=state.loading||cooling;});
    root.querySelectorAll('[data-kac-import]').forEach(button=>{button.disabled=cooling||button.dataset.kacUnavailable==='true';});
    const create=root.querySelector('.kac-create-album');if(create)create.disabled=cooling||state.creatingAlbum||albums().some(album=>String(album.anime_id)===state.selectedAnime?.id);
    previous.disabled = state.loading || cooling || state.page <= 1;
    next.disabled = state.loading || cooling || !state.hasNext;
    const animeResults=state.mode==='anime'&&!state.selectedAnime,count=animeResults?state.anime.length:state.entries.length,label=animeResults?'anime':'personnage';
    pageLabel.textContent = state.page ? `Page ${state.page} · ${count} ${label}${count>1?'s':''}` : '24 résultats maximum par page';
    root.querySelectorAll('[data-kac-mode]').forEach(button=>{const active=button.dataset.kacMode===state.mode;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));});
    form.querySelector('label').textContent=state.mode==='anime'?'Titre de l’anime':'Nom du personnage';
    input.placeholder=state.mode==='anime'?'Bleach, Naruto, Demon Slayer…':'Naruto, Frieren, Ichigo…';
    popular.textContent=state.mode==='anime'?'Animes populaires':'Personnages populaires';
    previous.parentElement.setAttribute('aria-label',animeResults?'Pages des animes AniList':'Pages des personnages AniList');
    root.setAttribute('aria-busy', String(state.loading));
  }
  function render() {
    if (!root || !canAdmin()) return;
    const animeResults=state.mode==='anime'&&!state.selectedAnime;
    grid.classList.toggle('kac-anime-grid',animeResults);
    if(state.selectedAnime){
      const anime=state.selectedAnime;
      breadcrumb.hidden=false;
      const destinations=albums(),exists=destinations.some(album=>String(album.anime_id)===anime.id);
      breadcrumb.innerHTML=`<button type="button" class="kac-back-anime">← Résultats d’animes</button><div><span class="kac-kicker">PERSONNAGES DE L’ANIME</span><h4>${escape(anime.title)}</h4><p>${escape(animeMetadata(anime))}</p></div><a href="https://anilist.co/anime/${anime.id}" target="_blank" rel="noopener noreferrer" aria-label="${escape(anime.title)} sur AniList (nouvel onglet)">Fiche AniList ↗</a><div class="kac-anime-actions"><label for="kacAlbumDestination">Album de destination<select id="kacAlbumDestination" class="kac-album-select"><option value="">Catalogue uniquement</option>${destinations.map(album=>`<option value="${escape(album.id)}"${album.id===state.albumId?' selected':''}>${escape(album.name)}</option>`).join('')}</select></label><button type="button" class="kac-create-album" ${exists||state.creatingAlbum?'disabled':''}>${state.creatingAlbum?'Création de l’album…':exists?'✓ Album de cet anime créé':'Créer l’album de cet anime'}</button><p>${exists?'Ajoute les personnages à l’album choisi. Les cartes déjà au catalogue peuvent aussi le rejoindre.':'Crée un album avec les personnages les plus populaires de cet anime, puis complète-le avec les cartes de ton choix.'}</p></div>`;
    }else{breadcrumb.hidden=true;breadcrumb.replaceChildren();}
    const known = knownIds();
    if(animeResults && state.anime.length){
      grid.innerHTML=state.anime.map(anime=>`<article class="kac-anime-card"><button type="button" class="kac-anime-open" data-kac-anime="${anime.id}" aria-label="Afficher les personnages de ${escape(anime.title)}, ${escape(animeMetadata(anime))}"><span class="kac-anime-art">${anime.coverImage?`<img src="${escape(anime.coverImage)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:'<span class="kac-no-art" aria-hidden="true">絆</span>'}<span class="kac-anime-format">${escape({TV:'TV',TV_SHORT:'Court',MOVIE:'Film'}[anime.format]||anime.format||'Anime')}</span></span><span class="kac-anime-copy"><strong>${escape(anime.title)}</strong>${anime.titleRomaji&&anime.titleRomaji!==anime.title?`<span class="kac-anime-alternate">${escape(anime.titleRomaji)}</span>`:''}<span class="kac-anime-meta">${escape(animeMetadata(anime))}</span><span class="kac-anime-cta">Voir les personnages <span aria-hidden="true">↗</span></span></span></button></article>`).join('');
    }else if (!animeResults && state.entries.length) {
      grid.innerHTML = state.entries.map(card => {
        const added=known.has(card.sourceId),pending=state.pendingImports.has(card.sourceId),album=selectedAlbum(),canonical=canonicalCard(card.sourceId),inAlbum=!!album&&!!canonical&&album.card_ids.includes(String(canonical.id));
        const unavailable=pending||inAlbum||(added&&(!album||!canonical));
        const label=pending?'Ajout en cours…':inAlbum?'✓ Dans l’album':added?(album&&canonical?'+ Ajouter à l’album':'✓ Déjà au catalogue'):album?'+ Importer dans l’album':'+ Ajouter au catalogue';
        return `<article class="kac-card"><a class="kac-art" href="https://anilist.co/character/${card.sourceId}" target="_blank" rel="noopener noreferrer" aria-label="${escape(card.name)} sur AniList (nouvel onglet)">${card.image ? `<img src="${escape(card.image)}" alt="${escape(card.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<span class="kac-no-art" aria-hidden="true">✦</span>'}<span class="kac-source">AniList ↗</span></a><div class="kac-card-copy"><h4>${escape(card.name)}</h4><p title="${escape(card.series)}">${escape(card.series)}</p><button type="button" class="kac-import" data-kac-import="${card.sourceId}" data-kac-unavailable="${unavailable}" ${unavailable?'disabled':''} aria-label="${escape(label+' : '+card.name)}">${label}</button></div></article>`;
      }).join('');
    } else {
      const title=state.loading?'Recherche en cours…':animeResults?(state.page?'Aucun anime sur cette page':'Quel anime veux-tu explorer ?'):(state.page?'Aucun personnage à afficher sur cette page':'Quel personnage rejoindra ton univers ?');
      const detail=animeResults?(state.page?'Essaie un autre titre ou une autre page.':'Recherche un titre, puis choisis la série, la saison ou le film exact pour afficher ses personnages.'):state.selectedAnime?'Les personnages de cet anime s’affichent par pages de 24. Essaie la page suivante, si disponible.':state.page?'Seuls les personnages associés à un anime hors contenu adulte sont présentés. Essaie une autre recherche ou la page suivante, si disponible.':'Recherche un nom ou explore les personnages populaires. Tu choisis lesquels ajouter au catalogue Kizuna.';
      grid.innerHTML=`<div class="kac-empty"><span aria-hidden="true">✦</span><strong>${title}</strong><p>${detail}</p></div>`;
    }
    controls();
  }
  function remember(key, result) {
    if (cache.has(key)) cache.delete(key);
    cache.set(key, result);
    while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  }
  function cooldown(value) {
    const seconds = Number(value);
    const delay = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : Date.parse(value) - Date.now();
    state.cooldownUntil = Date.now() + Math.max(1000, Number.isFinite(delay) ? delay : 60000);
    clearInterval(retryTimer);
    const update = () => {
      const remaining = Math.max(0, Math.ceil((state.cooldownUntil - Date.now()) / 1000));
      setMessage(remaining ? `AniList reçoit trop de requêtes. Tu pourras réessayer dans ${remaining} s.` : 'Tu peux maintenant relancer ta recherche.', remaining ? 'error' : '');
      controls();
      if (!remaining) clearInterval(retryTimer);
    };
    update();
    retryTimer = setInterval(update, 1000);
  }
  async function search(searchText, page = 1) {
    if (!root || !canAdmin() || state.loading || Date.now() < state.cooldownUntil) return;
    if (typeof window.KizunaAccount?.catalogueRequest !== 'function') { setMessage('Le service administrateur n’est pas encore disponible. Réessaie dans un instant.', 'error'); return; }
    const term = searchText === null ? null : text(searchText, 100);
    if (term !== null && term.length < 2) {
      setMessage('Écris au moins 2 caractères pour lancer une recherche.', 'error');
      input.focus();
      return;
    }
    const mode=state.mode,requestEpoch=epoch,version=++queryVersion;
    state.loading=true;state.selectedAnime=null;state.albumId='';state.entries=[];state.anime=[];state.page=0;state.hasNext=false;
    if(mode==='anime')state.animeResults=null;
    render();
    setMessage(mode==='anime'?'Recherche des animes sur AniList…':'Recherche des personnages sur AniList…');
    const key=JSON.stringify([mode,null,page,term?.toLocaleLowerCase()??null]);
    try {
      let result = cache.get(key);
      if (!result) {
        const response=await window.KizunaAccount.catalogueRequest({action:mode==='anime'?'search_anime':'search',search:term,page});
        if(requestEpoch!==epoch||version!==queryVersion||!root||!canAdmin())return;
        if(!Array.isArray(mode==='anime'?response?.anime:response?.entries))throw new Error('Le service catalogue n’a pas pu répondre à cette recherche. Réessaie plus tard.');
        result=mode==='anime'?{anime:response.anime.slice(0,24).map(animeFrom).filter(Boolean),hasNext:response.hasNext===true}:{entries:response.entries.slice(0,24).map(entryFrom).filter(Boolean),hasNext:response.hasNext===true};
        remember(key, result);
      } else {
        remember(key, result);
      }
      if(requestEpoch!==epoch||version!==queryVersion||!root||!canAdmin())return;
      state.entries=result.entries||[];state.anime=result.anime||[];state.page=page;state.search=term;state.hasNext=result.hasNext;
      if(mode==='anime')state.animeResults={anime:state.anime.slice(),page,search:term,hasNext:result.hasNext};
      render();
      const count=mode==='anime'?state.anime.length:state.entries.length,label=mode==='anime'?'anime':'personnage';
      setMessage(`${count} ${label}${count>1?'s':''} affiché${count>1?'s':''}${term?` pour « ${term} »`:' parmi les plus populaires'}. ${mode==='anime'?'Choisis la série, la saison ou le film à explorer.':'Ajoute une fiche au catalogue pour la rendre disponible dans les boosters.'}`);
    } catch (error) {
      if(requestEpoch===epoch&&version===queryVersion)handleError(error);
    } finally {
      if(requestEpoch===epoch&&version===queryVersion){state.loading=false;render();}
    }
  }
  function selectMode(mode) {
    if(!root||!canAdmin()||!['character','anime'].includes(mode)||mode===state.mode)return;
    queryVersion++;state.mode=mode;state.loading=false;state.entries=[];state.anime=[];state.selectedAnime=null;state.animeResults=null;state.albumId='';state.page=0;state.search=null;state.hasNext=false;input.value='';
    render();setMessage(mode==='anime'?'Recherche le titre d’un anime pour choisir sa série, sa saison ou son film.':'Recherche un personnage ou explore les plus populaires.');
  }
  async function animeCharacters(anime,page=1) {
    if(!root||!canAdmin()||state.mode!=='anime'||state.loading||Date.now()<state.cooldownUntil||!anime)return;
    if(!state.selectedAnime)state.animeResults={anime:state.anime.slice(),page:state.page,search:state.search,hasNext:state.hasNext};
    const requestEpoch=epoch,version=++queryVersion,key=JSON.stringify(['anime-characters',anime.id,page,state.search?.toLocaleLowerCase()??null]);
    if(state.selectedAnime?.id!==anime.id)state.albumId=albums().find(album=>String(album.anime_id)===anime.id)?.id||'';
    state.selectedAnime=anime;state.entries=[];state.page=0;state.hasNext=false;state.loading=true;render();setMessage('Chargement des personnages de '+anime.title+'…');
    try{
      let result=cache.get(key);
      if(!result){
        const response=await window.KizunaAccount.catalogueRequest({action:'anime_characters',animeId:anime.id,page});
        if(requestEpoch!==epoch||version!==queryVersion||!root||!canAdmin())return;
        const actualAnime=animeFrom(response?.anime);
        if(!actualAnime||actualAnime.id!==anime.id||!Array.isArray(response?.entries))throw new Error('Les personnages de cet anime n’ont pas pu être chargés. Réessaie.');
        result={anime:actualAnime,entries:response.entries.slice(0,24).map(entryFrom).filter(Boolean),hasNext:response.hasNext===true};remember(key,result);
      }else remember(key,result);
      if(requestEpoch!==epoch||version!==queryVersion||!root||!canAdmin())return;
      state.selectedAnime=result.anime;state.entries=result.entries;state.page=page;state.hasNext=result.hasNext;render();
      setMessage(`${state.entries.length} personnage${state.entries.length>1?'s':''} affiché${state.entries.length>1?'s':''} pour « ${state.selectedAnime.title} ». Choisis les cartes à ajouter au catalogue.`);
    }catch(error){if(requestEpoch===epoch&&version===queryVersion)handleError(error);}
    finally{if(requestEpoch===epoch&&version===queryVersion){state.loading=false;render();}}
  }
  function backToAnime() {
    if(!root||!canAdmin()||!state.selectedAnime)return;
    queryVersion++;state.loading=false;state.selectedAnime=null;state.albumId='';state.entries=[];
    const results=state.animeResults||{anime:[],page:0,search:null,hasNext:false};
    state.anime=results.anime.slice();state.page=results.page;state.search=results.search;state.hasNext=results.hasNext;input.value=state.search||'';render();setMessage('Choisis la série, la saison ou le film à explorer.');
  }
  function changePage(delta) {
    const page=state.page+delta;if(page<1)return;
    if(state.mode==='anime'&&state.selectedAnime)animeCharacters(state.selectedAnime,page);else search(state.search,page);
  }
  async function createAlbum() {
    if(!root||!canAdmin()||!state.selectedAnime||state.creatingAlbum||Date.now()<state.cooldownUntil)return;
    const anime=state.selectedAnime,requestEpoch=epoch;
    if(albums().some(album=>String(album.anime_id)===anime.id))return;
    state.creatingAlbum=true;render();setMessage('Création de l’album de '+anime.title+'…');
    try{
      const result=await window.KizunaAccount.catalogueRequest({action:'create_album',animeId:anime.id});
      if(requestEpoch!==epoch||!root||!canAdmin())return;
      if(!result.album?.id)throw new Error('Le serveur n’a pas confirmé la création de l’album.');
      if(state.selectedAnime?.id===anime.id)state.albumId=String(result.album.id);
      const refreshed=await refreshAlbums();
      if(requestEpoch!==epoch||!root||!canAdmin())return;
      setMessage(refreshed?'L’album « '+result.album.name+' » est créé avec ses personnages les plus populaires. Les cartes de ta collection restent inchangées.':'L’album est créé. Recharge la page pour actualiser les albums disponibles.','success');
    }catch(error){if(requestEpoch===epoch)handleError(error);}
    finally{if(requestEpoch===epoch){state.creatingAlbum=false;render();}}
  }
  async function importCard(sourceId) {
    if(!root||!canAdmin()||Date.now()<state.cooldownUntil)return;
    const card=state.entries.find(entry=>entry.sourceId===sourceId),album=selectedAlbum(),known=knownIds().has(sourceId),canonical=canonicalCard(sourceId);
    if(!card||state.pendingImports.has(sourceId)||(known&&(!album||!canonical))||(album&&canonical&&album.card_ids.includes(String(canonical.id))))return;
    if (typeof window.KizunaAccount?.catalogueRequest !== 'function' || typeof window.KizunaGame?.addCatalogueCards !== 'function') { setMessage('Le catalogue administrateur finit de se préparer. Réessaie dans un instant.', 'error'); return; }
    const requestEpoch=epoch,anime=state.mode==='anime'?state.selectedAnime:null,animePage=state.page;
    state.pendingImports.add(sourceId);
    render();
    try {
      const response=await window.KizunaAccount.catalogueRequest(known?{action:'add_album_card',albumId:album.id,cardId:String(canonical.id)}:{action:'import',sourceId,...(anime?{animeId:anime.id,animePage}:{}),...(album?{albumId:album.id}:{})});
      if (requestEpoch !== epoch || !root || !canAdmin()) return;
      if(!known){
        if(!response?.card||String(response.card.sourceId)!==sourceId)throw new Error('Cette fiche n’a pas pu être ajoutée. Réessaie.');
        window.KizunaGame.addCatalogueCards([response.card]);state.imported.add(sourceId);
      }
      if(album&&String(response.album?.id)!==album.id)throw new Error('Le serveur n’a pas confirmé l’ajout à l’album. Réessaie.');
      // An import can rebalance other characters and add real album companions.
      // Refresh canonical metadata even when the destination is catalogue-only.
      const refreshed=await refreshAlbums();
      if(requestEpoch!==epoch||!root||!canAdmin())return;
      setMessage(refreshed?(album?card.name+' rejoint l’album « '+album.name+' ».':`${card.name} rejoint le catalogue Kizuna. Les albums et les raretés ont été actualisés ; aucune carte n’a été donnée à ta collection.`):'La carte est ajoutée. Recharge la page pour actualiser le catalogue et les albums.','success');
    } catch (error) {
      if (requestEpoch === epoch) handleError(error);
    } finally {
      if (requestEpoch === epoch) { state.pendingImports.delete(sourceId); render(); }
    }
  }
  function mount() {
    if (!canAdmin()) return;
    const parent = document.querySelector('#encyclopedia .wrap');
    if (!parent || document.getElementById('kizunaAniListCatalogue')) return;
    root = document.createElement('section');
    root.id = 'kizunaAniListCatalogue';
    root.className = 'kac-panel';
    root.dataset.admin = 'verified';
    root.hidden = true;
    root.inert = true;
    root.setAttribute('aria-labelledby', 'kacTitle');
    root.innerHTML = `<header class="kac-heading"><div><span class="kac-kicker">ADMINISTRATION · ANILIST</span><h3 id="kacTitle">Enrichir le catalogue</h3><p>Recherche un personnage, ou explore les cartes d’un anime en choisissant sa série, sa saison ou son film. Cet espace est réservé aux administrateurs.</p></div><a class="kac-credit" href="https://anilist.co" target="_blank" rel="noopener noreferrer">Données AniList ↗</a></header><div class="kac-modes" role="group" aria-label="Type de recherche AniList"><button type="button" class="is-active" data-kac-mode="character" aria-pressed="true">Personnage</button><button type="button" data-kac-mode="anime" aria-pressed="false">Anime</button></div><form class="kac-search" role="search"><label for="kacSearchInput">Nom du personnage</label><div class="kac-search-row"><input id="kacSearchInput" type="search" name="character" maxlength="100" autocomplete="off" placeholder="Naruto, Frieren, Ichigo…"><button type="submit">Rechercher <span aria-hidden="true">↗</span></button><button type="button" class="kac-popular">Personnages populaires</button></div></form><p class="kac-status" role="status" aria-live="polite"></p><div class="kac-anime-breadcrumb" hidden></div><div class="kac-grid"></div><nav class="kac-pagination" aria-label="Pages des personnages AniList"><button type="button" class="kac-prev" disabled>← Précédente</button><span class="kac-page"></span><button type="button" class="kac-next" disabled>Suivante →</button></nav><p class="kac-note">Ajouter une fiche enrichit le catalogue : cela n’ajoute pas directement une carte à ta collection. Les raretés et statistiques des cartes sont propres à Kizuna.</p>`;
    parent.prepend(root);
    form = root.querySelector('form'); input = root.querySelector('input'); grid = root.querySelector('.kac-grid'); status = root.querySelector('.kac-status'); previous = root.querySelector('.kac-prev'); next = root.querySelector('.kac-next'); pageLabel = root.querySelector('.kac-page'); popular = root.querySelector('.kac-popular');breadcrumb=root.querySelector('.kac-anime-breadcrumb');
    form.addEventListener('submit', event => { event.preventDefault(); search(input.value, 1); });
    popular.addEventListener('click', () => { input.value = ''; search(null, 1); });
    root.querySelectorAll('[data-kac-mode]').forEach(button=>button.addEventListener('click',()=>selectMode(button.dataset.kacMode)));
    previous.addEventListener('click',()=>changePage(-1));
    next.addEventListener('click',()=>changePage(1));
    breadcrumb.addEventListener('click',event=>{if(event.target.closest('.kac-back-anime'))backToAnime();else if(event.target.closest('.kac-create-album'))createAlbum();});
    breadcrumb.addEventListener('change',event=>{if(event.target.matches('.kac-album-select')){state.albumId=albums().some(album=>album.id===event.target.value)?event.target.value:'';render();root.querySelector('.kac-album-select')?.focus();}});
    grid.addEventListener('click',event=>{const button=event.target.closest('[data-kac-import]');if(button){importCard(button.dataset.kacImport);return;}const choice=event.target.closest('[data-kac-anime]');if(choice)animeCharacters(state.anime.find(anime=>anime.id===choice.dataset.kacAnime),1);});
    render();
    root.inert = false;
    root.hidden = false;
  }
  window.addEventListener('kizuna:game-change', render);
  window.addEventListener('kizuna:albums-change',render);
  document.addEventListener('kizuna:account-change', syncAccount);
  window.KizunaCatalogue={openAnimeSearch(){syncAccount();if(!root||!canAdmin())return false;selectMode('anime');input.focus();root.scrollIntoView?.({behavior:'smooth',block:'start'});return true;}};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncAccount, { once: true }); else syncAccount();
})();
