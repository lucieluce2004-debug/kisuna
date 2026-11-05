(() => {
  'use strict';
  const GUEST_KEY = 'kizuna_guest_snapshot_v1';
  const OWNER_KEY = 'kizuna_workspace_owner_v1';
  const IMPORT_KEY = 'kizuna_guest_imported_v1_';
  const listeners = new Set();
  const emptyStock = () => ({free: 3, freeCapacity:10, nexusWeekly:0, t: Date.now(), inv: 2, pm: 0, pl: 0, day: ''});
  const emptyMarket = () => ({listings:[],credits:{},cards:[],history:[],wishlist:[]});
  const emptyGame = username => ({owned: [], pulls: [], catalogue: [], market:emptyMarket(), chakra: 500, username: username || 'Invité', stock: emptyStock()});
  const account = {user: null, profile: null, isAdmin: false, isModerator: false, staffRole: null, needsUsername: false, userHint: '', status: 'initializing', loading: true, error: '', guestAvailable: false};
  let client, game, currentId = null, epoch = 0, revision = 0, ready = false;
  let loadFlight = null, loadFlightId = null;
  let suppressGame = false, savedSignature = '', pendingSave = false, saveTimer = null, saveFlight = null;
  let guestSnapshot = emptyGame(), dialog, modalMode = 'login', formBusy = false, lastFocus;
  let authCallbackPending = false, legacyImplicit = false;
  let usernameDraft = '', rewardFlight = null, rewardApplying = false;
  const authoritative=()=>window.KIZUNA_CONFIG?.serverEconomy===true;
  let economyFlight=null, serverClock=null;
  const econKey=id=>'kizuna_economy_pending_v1_'+id;

  const text = (value, max = 280) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
  const num = (value, fallback = 0, max = 1000000000) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(max, Number(value))) : fallback;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const read = key => {try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }};
  const write = (key, value) => {try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Cloud errors remain separate from browser cache limitations. */ }};
  const remove = key => {try { localStorage.removeItem(key); } catch {}};
  const signature = value => JSON.stringify(value);
  const discordReady = () => window.KIZUNA_CONFIG?.discordEnabled === true;
  const discordActivationMessage = 'La connexion Discord est en cours d’activation. Tu peux continuer à jouer en invité.';
  const usernamePattern = /^[A-Za-z0-9_.-]{2,20}$/;
  function publicError(message,status=400,code='') {const error=new Error(message);error.publicMessage=message;error.status=status;error.code=code;return error;}
  function safeRecord(value,depth=0) {
    if (depth>8 || value == null) return null;
    if (typeof value==='string') return text(value,2000);
    if (typeof value==='number') return Number.isFinite(value)?value:0;
    if (typeof value==='boolean') return value;
    if (Array.isArray(value)) return value.slice(0,1000).map(entry=>safeRecord(entry,depth+1));
    if (typeof value==='object') return Object.fromEntries(Object.entries(value).slice(0,80).filter(([key])=>!['__proto__','constructor','prototype'].includes(key)).map(([key,entry])=>[text(key,120),safeRecord(entry,depth+1)]));
    return null;
  }
  function marketRecord(value={}) {
    const entries=(key,max)=>(Array.isArray(value[key])?value[key]:[]).slice(-max).map(entry=>safeRecord(entry));
    return {listings:entries('listings',800),cards:entries('cards',300),history:entries('history',80),wishlist:entries('wishlist',5000),credits:Object.fromEntries(Object.entries(value.credits||{}).slice(0,500).filter(([key])=>!['__proto__','constructor','prototype'].includes(key)).map(([key,amount])=>[text(key,120),num(amount)]))};
  }
  function cardRecord(card) {
    if (!card || typeof card !== 'object' || !card.id) return null;
    const record = {id: text(card.id, 120), name: text(card.name, 160), series: text(card.series, 200), image: text(card.image, 1500), rarity: text(card.rarity, 30), sourceId: text(card.sourceId, 120), native: text(card.native, 160), g: text(card.g, 8), cats: Array.isArray(card.cats) ? card.cats.map(c => text(c, 30)).slice(0, 20) : []};
    for (const key of ['rank','level','pow','aura','fav']) if (card[key] != null) record[key] = num(card[key]);
    if (record.image && !/^https:\/\//i.test(record.image) && !/^(?:assets\/|\/assets\/)/.test(record.image)) record.image = '';
    return record;
  }
  function sanitize(snapshot = {}) {
    const stock = snapshot.stock || {};
    return {
      owned: (Array.isArray(snapshot.owned) ? snapshot.owned : []).slice(-5000).filter(c => c && c.id).map(c => ({id: text(c.id,120), at: num(c.at,0,Number.MAX_SAFE_INTEGER), rarity: text(c.rarity,30), level: num(c.level,1,6)})),
      pulls: (Array.isArray(snapshot.pulls) ? snapshot.pulls : []).slice(0,30).filter(c => c && c.id).map(c => ({id:text(c.id,120), name:text(c.name,160), series:text(c.series,200), rarity:text(c.rarity,30), level:num(c.level,1,6), at:num(c.at,0,Number.MAX_SAFE_INTEGER), username:text(c.username,20), pullId:text(c.pullId,160)})),
      catalogue: (Array.isArray(snapshot.catalogue) ? snapshot.catalogue : []).slice(-5000).map(cardRecord).filter(Boolean),
      market: marketRecord(snapshot.market),
      chakra: num(snapshot.chakra,500), username: text(snapshot.username,20) || 'Invité',
      stock: {free:num(stock.free,3,103), freeCapacity:Math.max(10,num(stock.freeCapacity,10,13)), nexusWeekly:num(stock.nexusWeekly,0,1000000), t:num(stock.t,Date.now(),Number.MAX_SAFE_INTEGER), inv:num(stock.inv,2), pm:num(stock.pm,0,250), pl:num(stock.pl,0,50), day:text(stock.day,20)}
    };
  }
  function snapshot() { return clone({...account, economy:authoritative()&&ready&&!!currentId, revision, serverClock, user: account.user ? {id:account.user.id, email:account.user.email, created_at:account.user.created_at, email_confirmed_at:account.user.email_confirmed_at} : null}); }
  function emit() {
    account.guestAvailable = !authoritative() && !!currentId && guestSnapshot.owned.length > 0 && read(IMPORT_KEY + currentId) !== signature(guestSnapshot.owned);
    const value = snapshot();
    listeners.forEach(fn => {try {fn(value);} catch (error) {console.error('Kizuna account subscriber', error);}});
    document.dispatchEvent(new CustomEvent('kizuna:account-change', {detail:value}));
    const button = document.getElementById('accountButton');
    if (button) {button.textContent = account.user ? 'Mon compte' : account.needsUsername ? 'Choisir mon pseudo' : 'Connexion'; button.setAttribute('aria-label', account.user ? 'Ouvrir mon compte Kizuna' : 'Connexion ou création de compte');}
    document.body.classList.toggle('kizuna-account-loading', account.loading);
    if (dialog?.open && modalMode === 'account') renderModal();
  }
  function apply(value,options={}) {
    suppressGame = true;
    try { game?.applySnapshot(clone(value),options); } finally { suppressGame = false; }
  }
  function friendly(error) {
    if (typeof error?.publicMessage==='string') return text(error.publicMessage,300);
    const message = String(error?.message || error || '');
    if (/access_denied|cancelled|canceled|denied.*access/i.test(message)) return 'Connexion Discord annulée. Tu peux réessayer quand tu veux.';
    if (/provider.*(?:disabled|not enabled|unsupported)|unsupported.*provider/i.test(message)) return discordActivationMessage;
    if (/rate limit|too many/i.test(message)) return 'Trop de tentatives. Patiente quelques minutes avant de réessayer.';
    if (/fetch|network|failed to|load failed/i.test(message)) return 'Connexion au serveur impossible. Ta progression reste sur cet appareil ; réessaie dans un instant.';
    if (/expired|invalid.*token|code.verifier|code.*exchange|pkce|flow_state/i.test(message)) return 'Cette connexion a expiré. Relance la connexion Discord depuis cet appareil.';
    return 'L’opération n’a pas abouti. Réessaie dans un instant.';
  }
  function backupUnsaved(id = currentId) {
    if (id && game) write('kizuna_unsynced_v1_' + id, {snapshot:sanitize(game.getSnapshot()), at:Date.now()});
  }
  function fail(error, status = 'error') {account.error = friendly(error); account.status = status; account.loading = false; emit();}
  function saveGuest() {
    if (!currentId && game && !suppressGame) {guestSnapshot = sanitize(game.getSnapshot()); write(GUEST_KEY, guestSnapshot);}
  }
  function restoreGuest() {
    ready = false; pendingSave = false; clearTimeout(saveTimer); remove(OWNER_KEY);
    apply(guestSnapshot); savedSignature = ''; revision = 0;
  }
  async function fetchProfile(id) {
    const result = await client.from('kizuna_profiles').select('*').eq('id',id).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw publicError('Ce compte n’est pas encore inscrit sur Kizuna.',403,'KIZUNA_PROFILE_REQUIRED');
    return result.data;
  }
  async function verifiedProfile(id, username) {
    const sessionResult = await client.auth.getSession();
    const session = sessionResult.data?.session;
    if (sessionResult.error || !session?.access_token || session.user?.id !== id) throw publicError('Ta session a expiré. Reconnecte-toi avec Discord.',401);
    const verified = await client.auth.getUser(session.access_token);
    const user = verified.data?.user;
    if (verified.error || !user?.id || user.id !== id) throw publicError('Ta session n’a pas pu être vérifiée. Reconnecte-toi avec Discord.',401);
    // Identities come from Auth's verified getUser response. Editable metadata
    // never creates a profile or grants an application role.
    if (!user.identities?.some(identity => identity.provider === 'discord')) return {user,profile:await fetchProfile(id)};
    const config = window.KIZUNA_CONFIG || {};
    const endpoint = new URL('/functions/v1/kizuna-discord-profile',config.supabaseUrl);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw publicError('Le service de comptes n’est pas configuré correctement.',503);
    let response;
    try {response = await fetch(endpoint.href,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json',apikey:config.supabaseKey,Authorization:'Bearer '+session.access_token},body:JSON.stringify(username === undefined ? {} : {username})});}
    catch {throw publicError('Connexion au serveur impossible. Réessaie dans un instant.',503);}
    const body = await response.json().catch(()=>({}));
    if (!response.ok) throw publicError(response.status===401 ? 'Ta session a expiré. Reconnecte-toi avec Discord.' : typeof body.error==='string' ? text(body.error,300) : 'Ton profil Discord n’a pas pu être chargé. Réessaie dans un instant.',response.status,body.code);
    if (body.needsUsername === true && username === undefined) return {user,needsUsername:true,userHint:text(body.userHint,20)};
    if (body.profile?.id !== id || !usernamePattern.test(body.profile.username || '')) throw publicError('Le serveur n’a pas confirmé ton profil Kizuna. Réessaie dans un instant.',503);
    return {user,profile:body.profile};
  }
  async function loadUser(user, force = false) {
    if (user?.id&&!force&&loadFlight&&loadFlightId===user.id) return loadFlight;
    const flight=loadUserData(user,force);
    if (!user?.id) {loadFlight=null;loadFlightId=null;return flight;}
    loadFlight=flight;loadFlightId=user.id;
    try {return await flight;} finally {if(loadFlight===flight){loadFlight=null;loadFlightId=null;}}
  }
  async function loadUserData(user, force = false) {
    if (!user?.id) {
      epoch++; if (currentId) backupUnsaved(); currentId = null; account.user = null; account.profile = null; account.isAdmin = false; account.isModerator=false; account.staffRole=null; account.needsUsername=false; account.userHint=''; usernameDraft='';
      restoreGuest(); account.status = 'guest'; account.loading = false; account.error = ''; emit(); return;
    }
    if (!force && currentId === user.id && ready) {account.user = user; emit(); return;}
    const myEpoch = ++epoch;
    ready = false; pendingSave = false; clearTimeout(saveTimer);
    if (!currentId) saveGuest(); else if (currentId !== user.id) backupUnsaved();
    currentId = user.id; account.user = null; account.profile = null; account.isAdmin = false; account.isModerator=false; account.staffRole=null; account.needsUsername=false; account.status = 'loading'; account.loading = true; account.error = ''; emit();
    write(OWNER_KEY, user.id);
    // Never show a previous account's collection while this account is loading.
    apply(emptyGame('Collectionneur'));
    try {
      // Global card metadata must be available before the bridge restores owned
      // IDs; otherwise an unknown imported ID could be dropped and re-saved.
      await window.KizunaBackend?.ensureCatalogue?.();
      if (myEpoch !== epoch) return;
      const verified = await verifiedProfile(user.id), profile = verified.profile;
      if (myEpoch !== epoch) return;
      if (verified.needsUsername) {
        currentId=null; restoreGuest(); account.needsUsername=true; account.userHint=verified.userHint; account.loading=false; account.status='onboarding'; account.error=''; emit(); open('username'); return;
      }
      // This RPC can only claim a pre-issued invitation for a confirmed e-mail.
      // The role itself is always read from the protected table, never metadata.
      let isAdmin = false, isModerator = false;
      try {
        const claim = await client.rpc('claim_kizuna_admin');
        if (!claim.error) {
          const role = await client.from('kizuna_admins').select('user_id').eq('user_id',user.id).maybeSingle();
          isAdmin = !role.error && role.data?.user_id === user.id;
        }
      } catch { /* An unavailable admin service does not prevent normal play. */ }
      if (!isAdmin) {
        try {const role=await client.from('kizuna_moderators').select('user_id').eq('user_id',user.id).maybeSingle();isModerator=!role.error&&role.data?.user_id===user.id;} catch { /* Roles remain denied if the role service is unavailable. */ }
      }
      if (myEpoch !== epoch) return;
      let result;
      if(authoritative()){
        const pending=read(econKey(user.id));
        let response=await client.rpc('kizuna_economy',pending||{p_action:'get',p_payload:{},p_request_id:null});
        if(response.error&&pending&&response.error.code&&!/fetch|network/i.test(response.error.message||'')){remove(econKey(user.id));response=await client.rpc('kizuna_economy',{p_action:'get',p_payload:{},p_request_id:null});}
        if(response.error)throw response.error;
        if(myEpoch!==epoch)return;
        remove(econKey(user.id));serverClock={at:response.data.serverNow,received:performance.now()};
        result={data:response.data};
      }else result = await client.from('kizuna_player_states').select('snapshot,revision').eq('user_id',user.id).maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) {
        result = await client.from('kizuna_player_states').insert({user_id:user.id, snapshot:emptyGame(profile.username), revision:0}).select('snapshot,revision').single();
        if (result.error?.code === '23505') result = await client.from('kizuna_player_states').select('snapshot,revision').eq('user_id',user.id).single();
        if (result.error) throw result.error;
      }
      if (myEpoch !== epoch) return;
      revision = Number(result.data.revision) || 0;
      // Rewards are applied by the server against this exact cloud revision.
      // They are claimed before any gameplay can write a stale local snapshot.
      let claimed;
      try {if(!authoritative())claimed=await authenticatedRequest('kizuna-staff',{action:'claim_rewards',expectedRevision:revision},user.id);} catch {const fresh=await client.from('kizuna_player_states').select('snapshot,revision').eq('user_id',user.id).single();if(fresh.error)throw fresh.error;result=fresh;revision=Number(fresh.data.revision)||0;}
      if (myEpoch !== epoch) return;
      if (claimed?.snapshot) {result={data:{snapshot:claimed.snapshot,revision:claimed.revision}};revision=Number(claimed.revision);}
      const remote = sanitize(result.data.snapshot); remote.username = profile.username;
      account.user = verified.user; account.profile = profile; account.isAdmin = isAdmin; account.isModerator=isModerator; account.staffRole=isAdmin?'admin':isModerator?'moderator':null; apply(remote);
      savedSignature = signature(sanitize(game.getSnapshot())); ready = true; account.status = 'synced'; account.loading = false; account.error = ''; emit();
      if (dialog?.open) {modalMode = 'account'; renderModal();}
    } catch (error) {
      if (myEpoch === epoch) {
        currentId = null; account.user = null; account.profile = null; account.isAdmin = false; account.isModerator=false; account.staffRole=null;
        restoreGuest(); fail(error);
      }
    }
  }
  function scheduleSave() {
    if (suppressGame || !game) return;
    if(authoritative()&&currentId&&ready){
      const next=sanitize(game.getSnapshot());
      if(JSON.stringify(next.market.wishlist)===JSON.stringify(JSON.parse(savedSignature||'{}').market?.wishlist||[]))return;
    }
    if (!currentId) {saveGuest(); return;}
    if (!ready || account.loading || account.status === 'conflict') return;
    if (signature(sanitize(game.getSnapshot())) === savedSignature) return;
    pendingSave = true; account.status = 'pending'; account.error = ''; emit(); clearTimeout(saveTimer);
    saveTimer = setTimeout(() => flush().catch(error => fail(error)),900);
  }
  async function flush() {
    if(rewardApplying)return;
    if(authoritative()&&ready&&currentId){
      if(!pendingSave)return;
      await economyRequest('preferences',{wishlist:sanitize(game.getSnapshot()).market.wishlist});return;
    }
    if (saveFlight) {await saveFlight; if (pendingSave && ready) return flush(); return;}
    if (!ready || !currentId || !pendingSave || account.status === 'conflict') return;
    const id = currentId, myEpoch = epoch, next = sanitize(game.getSnapshot()), base = revision;
    pendingSave = false; account.status = 'saving'; emit();
    saveFlight = (async () => {
      const result = await client.from('kizuna_player_states').update({snapshot:next,revision:base+1,updated_at:new Date().toISOString()}).eq('user_id',id).eq('revision',base).select('revision').maybeSingle();
      if (myEpoch !== epoch) return;
      if (result.error) {pendingSave = true; backupUnsaved(id); throw result.error;}
      if (!result.data) {
        backupUnsaved(id); account.status = 'conflict'; account.error = 'Une autre session a modifié la collection. Recharge sa sauvegarde avant de continuer la synchronisation.'; emit(); return;
      }
      revision = Number(result.data.revision); savedSignature = signature(next);
      pendingSave = signature(sanitize(game.getSnapshot())) !== savedSignature;
      account.status = pendingSave ? 'pending' : 'synced'; account.error = ''; remove('kizuna_unsynced_v1_' + id); emit();
    })();
    try {await saveFlight;} finally {saveFlight = null;}
    if (pendingSave && ready && account.status !== 'conflict') {clearTimeout(saveTimer); saveTimer = setTimeout(() => flush().catch(error => fail(error)),900);}
  }
  async function updateProfile(values) {
    if (!currentId || !ready) throw new Error('Connecte-toi pour modifier ton profil.');
    const id = currentId, myEpoch = epoch;
    const username = String(values.username ?? account.profile?.username ?? '').trim();
    if (!usernamePattern.test(username)) throw new Error('Le pseudo doit contenir de 2 à 20 lettres, chiffres, points, tirets ou tirets bas.');
    const avatarValue = Object.hasOwn(values,'avatar_card_id') ? values.avatar_card_id : account.profile?.avatar_card_id;
    const avatar = avatarValue == null ? null : text(avatarValue,120);
    const next = {username,bio:text(values.bio ?? account.profile?.bio,280),avatar_card_id:avatar,updated_at:new Date().toISOString()};
    const result = await client.from('kizuna_profiles').update(next).eq('id',id).select().single();
    if (result.error?.code==='23505') throw new Error('Ce pseudo est déjà utilisé. Choisis-en un autre.');
    if (result.error) throw new Error(friendly(result.error));
    if (myEpoch !== epoch) return;
    account.profile = result.data;
    const current = sanitize(game.getSnapshot()); current.username = username; apply(current); scheduleSave(); emit();
    return clone(account.profile);
  }
  function mergeGuest(current, guest) {
    const merged = sanitize(current), counts = new Map(), used = new Map();
    const key = c => c.id + '|' + c.at;
    merged.owned.forEach(c => counts.set(key(c),(counts.get(key(c)) || 0)+1));
    guest.owned.forEach(c => {const k = key(c), n = (used.get(k) || 0)+1; used.set(k,n); if (n > (counts.get(k) || 0)) merged.owned.push(c);});
    merged.owned = merged.owned.slice(-5000);
    const pullKeys = new Set(merged.pulls.map(c => c.pullId || key(c)));
    guest.pulls.forEach(c => {const k = c.pullId || key(c); if (!pullKeys.has(k)) {merged.pulls.push(c); pullKeys.add(k);}});
    merged.pulls.sort((a,b) => b.at-a.at); merged.pulls = merged.pulls.slice(0,30);
    const catalogue = new Map(merged.catalogue.map(c => [c.id,c])); guest.catalogue.forEach(c => {if (!catalogue.has(c.id)) catalogue.set(c.id,c);});
    merged.catalogue = [...catalogue.values()].slice(-5000);
    return merged;
  }
  async function importGuest() {
    if(authoritative())throw publicError('Ta collection invitée reste disponible en te déconnectant. Elle ne peut pas être transférée automatiquement vers le marché partagé.');
    if (!currentId || !ready || !account.guestAvailable) return;
    const id = currentId; apply(mergeGuest(game.getSnapshot(),guestSnapshot)); scheduleSave(); await flush();
    if (currentId === id && account.status === 'synced') {write(IMPORT_KEY+id,signature(guestSnapshot.owned)); emit(); setMessage('Cartes et historique invités ajoutés à ton compte.','success');}
  }
  async function signOut() {
    if (!client) return;
    clearTimeout(saveTimer);
    if (currentId) {try {await flush();} catch {backupUnsaved();}}
    const result = await client.auth.signOut({scope:'local'});
    if (result.error) {fail(result.error); throw result.error;}
    await loadUser(null); close();
  }
  async function authenticatedRequest(name,payload,id=currentId) {
    if(!client||!id)throw publicError('Connecte-toi pour continuer.',401);
    const result=await client.auth.getSession(), session=result.data?.session;
    if(result.error||!session?.access_token||session.user?.id!==id)throw publicError('Ta session a expiré. Reconnecte-toi avec Discord.',401);
    const config=window.KIZUNA_CONFIG||{}, endpoint=new URL('/functions/v1/'+name,config.supabaseUrl);
    if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password)throw publicError('Le service est indisponible.',503);
    let response;
    try {response=await fetch(endpoint.href,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json',apikey:config.supabaseKey,Authorization:'Bearer '+session.access_token},body:JSON.stringify(payload)});} catch {throw publicError('Connexion au serveur impossible. Réessaie dans un instant.',503);}
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw publicError(typeof body.error==='string'?text(body.error,300):'La demande n’a pas abouti.',response.status,body.code);
    return body;
  }
  async function staffRequest(payload={}) {
    if(!account.staffRole||!ready)throw publicError('L’accès à cet espace est réservé au staff.',403);
    const id=currentId, myEpoch=epoch;
    try {
      const result=await authenticatedRequest('kizuna-staff',payload,id);
      if(myEpoch!==epoch)throw publicError('Le compte connecté a changé.',401);
      return result;
    }catch(error){
      if(error.status===403&&myEpoch===epoch){
        // A moderator may be refused an admin action without losing their role.
        try {const role=await authenticatedRequest('kizuna-staff',{action:'me'},id);account.staffRole=['admin','moderator'].includes(role.role)?role.role:null;account.isAdmin=account.staffRole==='admin';account.isModerator=account.staffRole==='moderator';emit();}catch{account.staffRole=null;account.isAdmin=false;account.isModerator=false;emit();}
      }
      throw error;
    }
  }
  async function completeUsername(value) {
    if(formBusy||!account.needsUsername)return;
    usernameDraft=String(value||'').trim();
    if(!usernamePattern.test(usernameDraft)){setMessage('Choisis un pseudo de 2 à 20 caractères : lettres A–Z, chiffres, points, tirets ou tirets bas.');return;}
    const myEpoch=epoch;
    formBusy=true; renderModal();
    try {
      const session=await client.auth.getSession(), user=session.data?.session?.user;
      if(session.error||!user?.id)throw publicError('Ta session a expiré. Reconnecte-toi avec Discord.',401);
      await verifiedProfile(user.id,usernameDraft);
      const latest=await client.auth.getSession();
      if(myEpoch!==epoch||latest.data?.session?.user?.id!==user.id)return;
      await loadUser(user,true);
      if(!ready||!account.profile)throw publicError(account.error||'Ton profil n’a pas pu être chargé.',503);
      account.needsUsername=false; usernameDraft=''; close(); game.showTab('profile');
    }catch(error){if(myEpoch===epoch){account.error=friendly(error);setMessage(account.error);}}
    finally{formBusy=false;if(dialog?.open)renderModal();}
  }
  async function claimRewards() {
    if(authoritative()){
      if(!ready||!currentId||account.loading||economyFlight||game?.isBusy?.())return;
      try{const value=await economyRequest('claim_rewards');if(value.result?.rolls||value.result?.chakra)game?.notify?.('Récompense staff reçue : +'+value.result.rolls+' roll(s), +'+value.result.chakra+' Chakra.');}catch{}return;
    }
    if(rewardFlight)return rewardFlight;
    if(!ready||!currentId||account.loading||account.status==='conflict'||game?.isBusy?.())return;
    const id=currentId,myEpoch=epoch;
    rewardFlight=(async()=>{
      await flush();
      if(!ready||id!==currentId||myEpoch!==epoch||account.status==='conflict'||pendingSave||game?.isBusy?.())return;
      const beforeSignature=signature(sanitize(game.getSnapshot()));
      rewardApplying=true;document.body.classList.add('kizuna-rewards-loading');
      try {
        const result=await authenticatedRequest('kizuna-staff',{action:'claim_rewards',expectedRevision:revision},id);
        if(myEpoch!==epoch)return;
        if(result.snapshot){
          if(!Number.isSafeInteger(result.revision)||result.revision<=revision)throw publicError('La sauvegarde reçue est invalide.',503);
          revision=result.revision;const remote=sanitize(result.snapshot);remote.username=account.profile.username;
          const latest=sanitize(game.getSnapshot()),changed=signature(latest)!==beforeSignature;
          if(changed){
            // Keep progression that completed while the request was in flight.
            // The server has already added this exact reward to the old state.
            latest.chakra+=Number(result.chakra)||0;latest.stock.inv+=Number(result.rolls)||0;
            if(latest.chakra>1000000000||latest.stock.inv>1000000)throw publicError('Recharge la sauvegarde pour réconcilier le solde et tes récompenses.',409,'REWARD_MERGE_REQUIRED');
            apply(latest);savedSignature=signature(remote);pendingSave=true;
          }else{apply(remote);savedSignature=signature(sanitize(game.getSnapshot()));pendingSave=false;}
          game?.notify?.('Récompense staff reçue : +'+result.rolls+' roll(s), +'+result.chakra+' Chakra.');
        }
        account.error='';account.status=pendingSave?'pending':'synced';
      }catch(error){if(myEpoch!==epoch)return;if(error.code==='STATE_CONFLICT'||error.code==='REWARD_MERGE_REQUIRED'||error.status>=500){backupUnsaved(id);account.status='conflict';account.error='Recharge la sauvegarde pour vérifier les récompenses et reprendre la synchronisation. Ta progression sur cet appareil a été conservée.';}else{account.error=friendly(error);}}
      finally{rewardApplying=false;document.body.classList.remove('kizuna-rewards-loading');if(myEpoch===epoch){emit();if(pendingSave&&account.status!=='conflict'){clearTimeout(saveTimer);saveTimer=setTimeout(()=>flush().catch(error=>fail(error)),900);}}}
    })();
    try{return await rewardFlight;}finally{rewardFlight=null;}
  }
  async function catalogueRequest(payload = {}) {
    if (!client || !currentId) throw new Error('Connecte-toi avec un compte administrateur pour gérer le catalogue.');
    if (!account.isAdmin || account.loading) throw new Error('L’accès à AniList est réservé aux administrateurs.');
    const id = currentId, myEpoch = epoch;
    const result = await client.auth.getSession();
    const session = result.data?.session;
    if (result.error || !session?.access_token || session.user?.id !== id || myEpoch !== epoch) {
      const error = new Error('Ta session a expiré. Reconnecte-toi pour accéder au catalogue.'); error.status=401; throw error;
    }
    const config = window.KIZUNA_CONFIG || {};
    const endpoint = new URL('/functions/v1/kizuna-catalogue-admin',config.supabaseUrl);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new Error('Le service de catalogue n’est pas configuré correctement.');
    let response;
    try {
      response = await fetch(endpoint.href,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json',apikey:config.supabaseKey,Authorization:'Bearer '+session.access_token},body:JSON.stringify(payload)});
    } catch {throw new Error('Connexion au catalogue impossible. Réessaie dans un instant.');}
    if (myEpoch !== epoch) throw new Error('Le compte connecté a changé. Relance ta demande.');
    const body = await response.json().catch(()=>({}));
    if (!response.ok) {
      if (response.status===403) {account.isAdmin=false; account.staffRole=null; emit();}
      const message = response.status===401 ? 'Ta session a expiré. Reconnecte-toi pour accéder au catalogue.' : response.status===403 ? 'L’accès à AniList est réservé aux administrateurs.' : response.status===429 ? 'Le catalogue reçoit trop de demandes. Patiente un instant avant de réessayer.' : 'Le service de catalogue est momentanément indisponible.';
      const error=new Error(message); error.status=response.status; throw error;
    }
    return body;
  }
  function siteUrl() {
    const url = new URL(window.KIZUNA_CONFIG?.siteUrl || '');
    if (url.protocol !== 'https:' || url.username || url.password) throw publicError('La connexion Discord n’est pas configurée correctement.',503);
    return new URL('/',url);
  }
  async function startDiscord() {
    if (formBusy || !client) return;
    if (!discordReady()) {setMessage(discordActivationMessage); return;}
    formBusy = true; account.error=''; renderModal();
    try {
      const target = siteUrl();
      // The PKCE verifier must be created on the callback's origin. A preview
      // first hands the user to the published site, without sending any tokens.
      if (legacyImplicit || location.origin !== target.origin) {
        target.searchParams.set('auth','discord-start');
        window.location.assign(target.href); return;
      }
      target.searchParams.set('auth','discord');
      const result = await client.auth.signInWithOAuth({provider:'discord',options:{redirectTo:target.href,skipBrowserRedirect:true}});
      if (result.error) throw result.error;
      const authorize = new URL(result.data?.url || ''), backend = new URL(window.KIZUNA_CONFIG.supabaseUrl);
      if (backend.protocol !== 'https:' || authorize.protocol !== 'https:' || authorize.origin !== backend.origin || authorize.pathname !== '/auth/v1/authorize' || authorize.username || authorize.password || authorize.searchParams.get('provider') !== 'discord' || authorize.searchParams.get('redirect_to') !== target.href) throw publicError('La connexion Discord n’a pas pu être démarrée. Réessaie dans un instant.',503);
      window.location.assign(authorize.href);
    } catch (error) {account.error=friendly(error); setMessage(account.error);}
    finally {formBusy=false; if (dialog?.open) renderModal();}
  }
  function clearAuthUrl() {
    const url = new URL(location.href), hash = new URLSearchParams(url.hash.slice(1));
    for (const key of ['auth','code','sb_flow_id','error','error_code','error_description']) url.searchParams.delete(key);
    if (['access_token','refresh_token','error','error_code','error_description'].some(key=>hash.has(key))) url.hash='';
    history.replaceState(null,'',url.pathname+url.search+url.hash);
  }

  function mount() {
    dialog = document.createElement('dialog'); dialog.id = 'kizunaAccountDialog'; dialog.className = 'kza-dialog';
    dialog.setAttribute('aria-labelledby','kzaTitle'); dialog.setAttribute('aria-describedby','kzaIntro'); document.body.append(dialog);
    dialog.addEventListener('click',event => {
      if (event.target === dialog) {close(); return;}
      const action = event.target.closest('[data-kza]')?.dataset.kza;
      if (!action) return;
      if (action === 'close') close();
      else if (action === 'discord') startDiscord();
      else if (action === 'signout') signOut().catch(error => setMessage(friendly(error)));
      else if (action === 'profile') {close(); game?.showTab('profile');}
      else if (action === 'import') {formBusy=true; renderModal(); importGuest().catch(error => fail(error)).finally(() => {formBusy=false; renderModal();});}
      else if (action === 'reload') {if (currentId) backupUnsaved(); client.auth.getSession().then(result=>loadUser(result.data?.session?.user,true)).catch(error=>fail(error));}
      else if(action==='export-legacy'){const backup=read('kizuna_pre_server_v1_'+currentId);if(backup){const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='kizuna-sauvegarde-avant-serveur.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}
      else if (action === 'retry') {if(authoritative())economyRequest('get').catch(error=>fail(error));else{pendingSave=true; flush().catch(error => fail(error));}}
      else if (action === 'claim-rewards') {formBusy=true;renderModal();claimRewards().finally(()=>{formBusy=false;if(dialog?.open)renderModal();});}
    });
    dialog.addEventListener('submit',event=>{if(event.target.matches('[data-kza-username-form]')){event.preventDefault();completeUsername(event.target.elements.username.value);}});
    dialog.addEventListener('input',event=>{if(event.target.matches('[data-kza-username-form] input'))usernameDraft=event.target.value;});
    dialog.addEventListener('close',() => {document.body.classList.remove('kza-modal-open'); if (lastFocus?.isConnected) lastFocus.focus();});
    document.addEventListener('click',event => {if ((account.loading||rewardApplying) && event.target.closest('main') && !event.target.closest('#kizunaAccountDialog')) {event.preventDefault(); event.stopImmediatePropagation();}},true);
  }
  const statusText = () => ({initializing:'Connexion au compte…',loading:'Chargement de ta collection…',synced:'Collection synchronisée',pending:'Modifications à sauvegarder…',saving:'Sauvegarde en cours…',error:'Synchronisation interrompue',conflict:'Une autre session a modifié la collection',guest:'Mode invité'})[account.status] || 'Mon compte';
  function renderModal() {
    if (!dialog) return;
    const signed = modalMode === 'account' && account.user;
    const onboarding = !signed && account.needsUsername;
    const title = signed ? 'Ton espace Kizuna' : onboarding ? 'Comment t’appelles-tu ?' : 'Entre dans le club.';
    const intro = signed ? 'Ton compte, ta collection, sur tous tes appareils.' : onboarding ? 'Discord est connecté. Choisis maintenant ton nom de collectionneur pour créer ton profil Kizuna.' : 'Connecte ton compte Discord pour créer ton profil Kizuna ou retrouver ta collection.';
    const disabled = formBusy || account.loading || !client;
    dialog.innerHTML = `<div class="kza-shell"><button type="button" class="kza-close" data-kza="close" aria-label="Fermer">×</button><div class="kza-emblem" aria-hidden="true">絆</div><p class="kza-kicker">KIZUNA · TON ESPACE</p><h2 id="kzaTitle">${esc(title)}</h2><p id="kzaIntro" class="kza-intro">${esc(intro)}</p>
      ${onboarding ? `<form class="kza-username-form" data-kza-username-form><label for="kzaUsername">Ton nom sur Kizuna</label><input id="kzaUsername" name="username" type="text" autocomplete="nickname" minlength="2" maxlength="20" pattern="[A-Za-z0-9_.-]{2,20}" required value="${esc(usernameDraft)}" placeholder="${esc(account.userHint||'Ton pseudo')}" aria-describedby="kzaUsernameHelp" ${formBusy?'disabled':''}><small id="kzaUsernameHelp">2 à 20 caractères : lettres A–Z, chiffres, points, tirets et tirets bas. Le pseudo doit être disponible.</small><p id="kzaMessage" class="kza-message ${account.error?'is-error':''}" role="status" aria-live="polite">${esc(account.error)}</p><button class="kza-primary" type="submit" ${disabled?'disabled':''}>${formBusy?'Création du profil…':'Créer mon profil'}</button><button class="kza-signout" type="button" data-kza="signout" ${formBusy?'disabled':''}>Changer de compte Discord</button></form>` : signed ? `<div class="kza-account-card"><span class="kza-avatar">${esc((account.profile?.username || 'K').slice(0,1).toUpperCase())}</span><div><strong>${esc(account.profile?.username || 'Collectionneur')}</strong><small>${esc(account.user.email)}</small></div></div><p class="kza-sync ${account.status==='synced'?'is-synced':''}" role="status"><i></i>${esc(statusText())}</p>${account.error?`<p class="kza-message is-error" role="alert">${esc(account.error)}</p>`:''}${account.status==='conflict'||(!ready&&account.status==='error')?'<button class="kza-secondary" type="button" data-kza="reload">Recharger la sauvegarde du compte</button>':account.status==='error'?'<button class="kza-secondary" type="button" data-kza="retry">Réessayer la sauvegarde</button>':''}${authoritative()&&read('kizuna_pre_server_v1_'+currentId)?'<p class="kza-fineprint">Ton ancienne sauvegarde locale est conservée sur cet appareil. Elle ne remplace pas la collection du compte.</p><button type="button" class="kza-secondary" data-kza="export-legacy">Exporter mon ancienne sauvegarde</button>':''}${account.guestAvailable?`<div class="kza-import"><strong>Une collection invitée t’attend</strong><p>${guestSnapshot.owned.length} carte${guestSnapshot.owned.length>1?'s':''} sur cet appareil. Ajoute-les à ce compte si elles t’appartiennent.</p><button type="button" data-kza="import" ${disabled?'disabled':''}>Importer mes cartes invitées</button></div>`:''}<button class="kza-primary" type="button" data-kza="profile">Voir mon profil <span aria-hidden="true">↗</span></button><button class="kza-secondary" type="button" data-kza="claim-rewards" ${disabled?'disabled':''}>Récupérer mes récompenses staff</button><button class="kza-signout" type="button" data-kza="signout" ${formBusy?'disabled':''}>Se déconnecter sur cet appareil</button>` : `
      <div class="kza-discord-panel"><p id="kzaMessage" class="kza-message ${account.error?'is-error':''}" role="status" aria-live="polite">${esc(account.error || (!client?'Le service de comptes n’est pas encore configuré.':!discordReady()?discordActivationMessage:''))}</p><button class="kza-primary kza-discord" type="button" data-kza="discord" ${disabled||!discordReady()?'disabled':''}><svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19.7 5.1a18.6 18.6 0 0 0-4.6-1.4l-.6 1.2a17.2 17.2 0 0 0-5 0l-.6-1.2a18.8 18.8 0 0 0-4.6 1.4C1.4 9.4.6 13.6 1 17.8a18.8 18.8 0 0 0 5.7 2.9l1.2-2a12.4 12.4 0 0 1-1.8-.9l.5-.4a13.7 13.7 0 0 0 10.8 0l.5.4-1.8.9 1.2 2a18.7 18.7 0 0 0 5.7-2.9c.5-4.8-.8-9-3.3-12.7ZM8.5 15.3c-1 0-1.7-.9-1.7-2s.7-2 1.7-2 1.8.9 1.7 2c0 1.1-.7 2-1.7 2Zm7 0c-1 0-1.7-.9-1.7-2s.7-2 1.7-2 1.8.9 1.7 2c0 1.1-.7 2-1.7 2Z"/></svg>${formBusy?'Connexion en cours…':'Continuer avec Discord'}</button>${account.status==='error'?'<button class="kza-secondary" type="button" data-kza="reload">Réessayer le chargement de mon compte</button>':''}<p class="kza-fineprint">Une seule connexion pour rejoindre Kizuna et sauvegarder tes cartes. Tu pourras choisir ton pseudo sur ton profil.</p></div>`}
      <div id="kzaActionMessage" class="kza-message" role="status" aria-live="polite"></div></div>`;
  }
  function setMessage(message,type='error') {
    const node = document.getElementById('kzaMessage') || document.getElementById('kzaActionMessage');
    if (node) {node.textContent=message; node.className='kza-message '+(type==='success'?'is-success':'is-error');}
  }
  function close() {if (dialog?.open) dialog.close();}
  function open(mode='login') {
    if (!dialog) mount();
    modalMode = account.user && account.profile ? 'account' : account.needsUsername ? 'username' : 'login';
    lastFocus = document.activeElement; renderModal();
    if (!dialog.open) dialog.showModal(); document.body.classList.add('kza-modal-open');
    setTimeout(() => (dialog.querySelector('#kzaUsername:not(:disabled)')||dialog.querySelector('button.kza-primary:not(:disabled),button.kza-close'))?.focus(),0);
  }
  async function init() {
    game = window.KizunaGame;
    document.getElementById('accountButton')?.addEventListener('click',()=>open(account.user?'account':'login'));
    guestSnapshot = sanitize(read(GUEST_KEY) || emptyGame());
    const priorOwner = read(OWNER_KEY);
    if (!game?.getSnapshot || !game?.applySnapshot) {account.error='Le jeu n’est pas encore prêt. Recharge la page.'; account.loading=false; account.status='error'; emit(); return;}
    if(priorOwner&&authoritative()&&!read('kizuna_pre_server_v1_'+priorOwner))write('kizuna_pre_server_v1_'+priorOwner,{snapshot:sanitize(game.getSnapshot()),at:Date.now()});
    if (priorOwner) apply(guestSnapshot); else saveGuest();
    game.subscribe(scheduleSave);
    const config = window.KIZUNA_CONFIG || {};
    if (!config.supabaseUrl || !config.supabaseKey || !window.supabase?.createClient) {account.error='Connexion bientôt disponible — le serveur de comptes est en cours de préparation.';account.loading=false;account.status='unavailable';emit();return;}
    try {
      const callback = new URL(location.href), hash = new URLSearchParams(callback.hash.slice(1));
      const code = callback.searchParams.get('code');
      const discordCallback = callback.searchParams.get('auth') === 'discord';
      const callbackError = callback.searchParams.get('error') || callback.searchParams.get('error_code') || hash.get('error') || hash.get('error_code') || callback.searchParams.get('error_description') || hash.get('error_description');
      const callbackDescription = callback.searchParams.get('error_description') || hash.get('error_description') || '';
      const implicit = hash.has('access_token'); legacyImplicit=implicit;
      authCallbackPending = !!code || discordCallback || !!callbackError || implicit;
      // Keep old stored sessions and legacy hash links; new Discord sign-ins
      // always use PKCE and exchange their code explicitly on the same origin.
      client = window.supabase.createClient(config.supabaseUrl,config.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:!code,flowType:implicit?'implicit':'pkce',storageKey:'kizuna_auth_v1'}});
      client.auth.onAuthStateChange((event,session) => {
        if (authCallbackPending) return;
        // Run database requests outside Supabase's synchronous auth callback lock.
        setTimeout(async () => {
          if (event==='SIGNED_OUT') await loadUser(null);
          else if (['SIGNED_IN','INITIAL_SESSION','TOKEN_REFRESHED','USER_UPDATED','PASSWORD_RECOVERY'].includes(event)) await loadUser(session?.user);
        },0);
      });
      if (callbackError) throw publicError(friendly({message:callbackError+' '+callbackDescription}),400);
      if (code) {
        const flowId = callback.searchParams.get('sb_flow_id');
        const exchange = await client.auth.exchangeCodeForSession(code,flowId ? {flowId} : undefined);
        if (exchange.error || !exchange.data?.session) throw exchange.error || publicError('Cette connexion a expiré. Relance la connexion Discord depuis cet appareil.',401);
      }
      const result = await client.auth.getSession(); if (result.error) throw result.error;
      if (discordCallback && !result.data.session) throw publicError('Cette connexion a expiré. Relance la connexion Discord depuis cet appareil.',401);
      await loadUser(result.data.session?.user);
      authCallbackPending = false;
      if (discordCallback || code || implicit || ['confirmed','recovery'].includes(callback.searchParams.get('auth'))) {
        clearAuthUrl();
        if (ready && account.profile) {close(); game.showTab('profile');}
        else if (account.error) open('login');
      }
      if (callback.searchParams.get('auth') === 'discord-start') {clearAuthUrl(); open('login'); await startDiscord();}
    } catch (error) {
      authCallbackPending=false; fail(error);
      const failedUrl = new URL(location.href), failedHash = new URLSearchParams(failedUrl.hash.slice(1));
      if (['auth','code','error','error_code','error_description'].some(key=>failedUrl.searchParams.has(key)) || ['access_token','refresh_token','error','error_code','error_description'].some(key=>failedHash.has(key))) {clearAuthUrl(); open('login');}
    }
  }
  const pollRewards=()=>{if(!document.hidden&&document.body.dataset.tab!=='staff'&&!document.querySelector('dialog[open]'))claimRewards().catch(()=>{});};
  window.addEventListener?.('focus',pollRewards);
  document.addEventListener('visibilitychange',pollRewards);
  window.setInterval?.(pollRewards,60000);
  async function adventureRequest(action,payload={}) {
    if(!client||!ready||!currentId||account.loading)throw new Error('Connecte-toi et attends le chargement de ta collection.');
    const id=currentId,myEpoch=epoch;
    if(!['get','definition_save','private'].includes(action)) {
      if(game?.isBusy?.())throw new Error('Termine l’ouverture ou ferme la fenêtre avant de continuer.');
      await flush();
      if(account.status!=='synced'||pendingSave||rewardApplying)throw new Error('Synchronise ta collection avant de continuer.');
    }
    if(myEpoch!==epoch||id!==currentId)throw new Error('Le compte connecté a changé.');
    const result=await client.rpc('kizuna_adventure',{p_action:action,p_payload:payload});
    if(myEpoch!==epoch||id!==currentId)throw new Error('Le compte connecté a changé.');
    if(result.error)throw result.error;
    return result.data;
  }

  const economyMessages={AUTH_REQUIRED:'Connecte-toi avec Discord.',PROFILE_REQUIRED:'Crée ton profil Kizuna.',INSUFFICIENT_PACKS:'Tu n’as pas assez de boosters.',INSUFFICIENT_CHAKRA:'Ton solde de Chakra est insuffisant.',DAILY_CLAIMED:'Cadeau déjà récupéré aujourd’hui (UTC).',INVENTORY_FULL:'Ta collection a atteint 5 000 exemplaires. Libère de la place avant de continuer.',BOOSTER_UNAVAILABLE:'Ce booster n’est plus disponible.',CARD_UNAVAILABLE:'Cet exemplaire n’est plus disponible.',LISTING_UNAVAILABLE:'Cette annonce est terminée ou n’est plus disponible.',STATE_CONFLICT:'La collection a changé. Actualise-la et confirme à nouveau.',BALANCE_LIMIT:'Cette opération dépasserait la limite du solde.',LISTING_LIMIT:'Tu as déjà 50 annonces actives.',BID_EXISTS:'Une enchère ayant reçu une mise ne peut plus être retirée.',INVALID_BID:'Cette mise est trop basse ou dépasse la limite.',SELF_TRADE:'Tu ne peux pas acheter ta propre annonce.',INVALID_PRICE:'Le prix ne respecte pas les limites de cette rareté.',NOT_OWNER:'Cette annonce appartient à un autre joueur.'};
  async function marketInboxRequest(action,payload={}) {
    if(!client||!ready||!currentId||account.loading)throw publicError('Connecte-toi et attends le chargement de ton compte.');
    const id=currentId,myEpoch=epoch;
    const result=await client.rpc('kizuna_market_inbox',{p_action:action,p_payload:payload});
    if(myEpoch!==epoch||id!==currentId)throw publicError('Le compte connecté a changé.');
    if(result.error)throw publicError(result.error.message==='ADMIN_REQUIRED'?'Cet aperçu est réservé aux administrateurs.':'Le suivi du marché est indisponible. Réessaie dans un instant.');
    return result.data;
  }

  async function progressionRequest(service,action,payload={}) {
    if(!client||!ready||!currentId||account.loading)throw publicError('Connecte-toi et attends le chargement de ton compte.');
    const id=currentId,myEpoch=epoch,result=await client.rpc(service,{p_action:action,p_payload:payload});
    if(myEpoch!==epoch||id!==currentId)throw publicError('Le compte connecté a changé.');
    if(result.error)throw publicError(({AUTH_REQUIRED:'Connecte-toi avec Discord.',ADMIN_REQUIRED:'Cet espace est réservé aux administrateurs.',MYTHIC_ONLY:'Les Éveils sont réservés aux cartes Mythiques.',AWAKENING_LOCKED:'Cette transformation demande davantage de Résonances.',FEATURE_DISABLED:'Cette activité est temporairement désactivée.',REVISION_CONFLICT:'La configuration a changé. Actualise avant de réessayer.',INVALID_THRESHOLDS:'Les trois seuils doivent être des entiers strictement croissants.',EVENT_INACTIVE:'Cette Anomalie n’est pas active.',REQUIREMENTS_NOT_MET:'Le défi n’est pas encore terminé.',REWARD_LOCKED:'Cette récompense n’a pas encore été obtenue.',EVENT_STARTED:'Les défis d’une Anomalie commencée ne peuvent plus être modifiés.'})[result.error.message]||'La demande n’a pas abouti. Vérifie les champs puis réessaie.');
    return result.data;
  }
  const mythicRequest=(action,payload)=>progressionRequest('kizuna_mythic',action,payload);
  const anomalyRequest=(action,payload)=>progressionRequest('kizuna_anomalies',action,payload);
  // Nexus reads never apply an economic snapshot: a read may finish after a purchase.
  const nexusRequest=(action='get',payload={})=>progressionRequest('kizuna_nexus',action,payload);
  Object.assign(economyMessages,{
    NEXUS_CONFIG_CHANGED:'Le prix ou la configuration du Nexus a changé. Actualise puis confirme à nouveau.',
    NEXUS_NODE_UNAVAILABLE:'Ce nœud n’est pas encore disponible.',NEXUS_ALREADY_UNLOCKED:'Ce nœud est déjà débloqué.',
    NEXUS_LEVEL_REQUIRED:'Ton niveau Nexus est encore insuffisant.',NEXUS_PREREQUISITE_REQUIRED:'Débloque d’abord les nœuds précédents.',
    NEXUS_DAILY_LOCKED:'Débloque Invocation I pour recevoir ce booster.',NEXUS_PERIOD_CHANGED:'La période de récupération a changé. Actualise le coffre.',
    NEXUS_DAILY_CLAIMED:'Le booster Nexus a déjà été récupéré aujourd’hui (heure de Paris).',
    NEXUS_PRIORITY_LOCKED:'Débloque Destin I pour utiliser les suivis prioritaires.',NEXUS_PRIORITY_LIMIT:'Tu as atteint le nombre de suivis permis par ton rang Destin.',
    NEXUS_FRAME_LOCKED:'Débloque Prestige I avant d’équiper ce cadre.',
    NEXUS_ARCHIVE_LOCKED:'Débloque Collection II pour enregistrer tes filtres.',NEXUS_AURA_LOCKED:'Obtiens cette aura avant de l’équiper.',
    NEXUS_REWARD_UNAVAILABLE:'Cette récompense n’est pas disponible.',NEXUS_REWARD_LOCKED:'Débloque le rang Nexus correspondant pour récupérer cette récompense.',
    NEXUS_REWARD_CLAIMED:'Cette récompense a déjà été récupérée pour cette période.',NEXUS_ALBUM_INCOMPLETE:'Complète cet album avant de récupérer sa récompense.',
    NEXUS_COSMETIC_UNAVAILABLE:'Débloque Résonance II pour accéder aux auras disponibles.',NEXUS_COSMETIC_OWNED:'Tu possèdes déjà cette aura.',
    INSUFFICIENT_FRAGMENTS:'Tu n’as pas assez de fragments pour cette aura.',
    NEXUS_WEEKLY_UNAVAILABLE:'Le Coffret Nexus est temporairement indisponible.',NEXUS_WEEKLY_REQUIRED:'Ouvre ce coffret depuis ton coffre Nexus.',
    INSUFFICIENT_WEEKLY_PACKS:'Tu n’as pas assez de Coffrets Nexus en réserve.'
  });

  async function studioRequest(action,payload={}) {
    if(!client||!ready||!currentId||account.loading||!account.isAdmin)throw publicError('Cet espace est réservé aux administrateurs.');
    const id=currentId,myEpoch=epoch;
    const result=await client.rpc('kizuna_studio',{p_action:action,p_payload:payload});
    if(myEpoch!==epoch||id!==currentId||!account.isAdmin)throw publicError('Le compte connecté a changé.');
    if(result.error)throw publicError(({REVISION_CONFLICT:'Le brouillon a changé dans une autre session. Actualise avant de réessayer.',ART_APPROVAL_REQUIRED:'Valide les illustrations activées avant de publier.',INVALID_IMAGE_URL:'Utilise une adresse HTTPS directe vers une image PNG, JPG, WebP ou AVIF et indique sa source.',ADMIN_REQUIRED:'Ton compte n’a plus accès à cet espace.'})[result.error.message]||'La configuration n’a pas été enregistrée. Vérifie les champs et réessaie.');
    return result.data;
  }

  async function nexusAdminRequest(action,payload={}) {
    if(!client||!ready||!currentId||account.loading||account.isAdmin!==true)throw publicError('Cet espace est réservé aux administrateurs.');
    const id=currentId,myEpoch=epoch;
    const result=await client.rpc('kizuna_nexus_admin',{p_action:action,p_payload:payload});
    if(myEpoch!==epoch||id!==currentId||account.loading||account.isAdmin!==true)throw publicError('Le compte connecté a changé.');
    if(result.error)throw publicError(({
      ADMIN_REQUIRED:'Ton compte n’a plus accès à cet espace.',AUTH_REQUIRED:'Reconnecte-toi avec Discord.',
      REVISION_CONFLICT:'Le brouillon a changé dans une autre session. Actualise avant de réessayer.',
      NEXUS_CONFIG_CHANGED:'La configuration publiée a changé. Actualise et vérifie un nouvel aperçu.',
      PREVIEW_REQUIRED:'Vérifie l’aperçu du brouillon enregistré avant de publier.',
      PREVIEW_CHANGED:'Le brouillon a changé depuis cet aperçu. Vérifie un nouvel aperçu.',
      NEXUS_ADMIN_PREVIEW_REQUIRED:'Vérifie un nouvel aperçu du brouillon enregistré avant de publier.',
      NEXUS_ADMIN_NO_CHANGES:'Ce brouillon est déjà identique à la version publiée.',
      NEXUS_ADMIN_INVALID_CONFIG:'La configuration est incomplète ou contient un champ inconnu.',
      NEXUS_ADMIN_BOUNDS:'Une valeur dépasse les limites permises ou un bonus avancé est inférieur au précédent.',
      NEXUS_ADMIN_INVALID_NODES:'Vérifie les noms, les prix et les niveaux des 25 améliorations.',
      NEXUS_ADMIN_PREREQUISITES:'Conserve le rang précédent et sélectionne des prérequis valides.',
      NEXUS_ADMIN_LEVEL_ORDER:'Un nœud doit demander un niveau au moins égal à celui de ses prérequis.',
      NEXUS_ADMIN_CYCLE:'Ces prérequis forment une boucle. Retire une dépendance pour rendre la progression possible.',
      NEXUS_ADMIN_WEEKLY_POOL:'Le coffret doit contenir de 6 à 500 personnages distincts et les six raretés.',
      NEXUS_ADMIN_COSMETICS:'Vérifie les noms et les prix des trois auras.',
      NEXUS_ADMIN_ALBUMS:'Vérifie les noms et les récompenses des albums définis.',
      REQUEST_REUSED:'Cette publication a déjà été utilisée avec d’autres paramètres. Actualise le panneau.',
      VERSION_NOT_FOUND:'Cette version n’est plus disponible dans l’historique.',
      INVALID_INPUT:'Vérifie les valeurs saisies et les limites indiquées.',
      INVALID_CONFIG:'Cette configuration ne respecte pas les règles du Nexus.'
    })[result.error.message]||'La configuration n’a pas été enregistrée. Vérifie les valeurs et les prérequis, puis réessaie.',/^(ADMIN_REQUIRED|AUTH_REQUIRED)$/.test(result.error.message)?403:400,result.error.message);
    return result.data;
  }

  async function economyRequest(action,payload={}) {
    if(!authoritative()||!client||!ready||!currentId||account.loading)throw publicError('Connecte-toi et attends le chargement de ta collection.');
    if(economyFlight)throw publicError('Une opération est déjà en cours.');
    const id=currentId,myEpoch=epoch,readonly=['get','browse','history'].includes(action);
    const waiting=read(econKey(id));
    if(waiting&&action!=='recover')throw publicError('Une opération attend sa vérification. Ouvre Mon compte et recharge la sauvegarde pour la retrouver.');
    const request=waiting||{p_action:action,p_payload:payload,p_request_id:readonly?null:crypto.randomUUID()};
    if(!readonly)write(econKey(id),request);
    document.body.classList.add('kizuna-economy-loading');
    economyFlight=(async()=>{
      let response;
      try{
        response=await client.rpc('kizuna_economy',request);
        if(response.error){
          const code=String(response.error.message||'');
          if(response.error.code&&!/fetch|network/i.test(code))remove(econKey(id));
          throw publicError(economyMessages[code]||'L’opération n’a pas été confirmée. Recharge ta sauvegarde depuis Mon compte pour vérifier son résultat.',400,code);
        }
        if(id!==currentId||myEpoch!==epoch)throw publicError('Le compte connecté a changé.');
        const data=response.data;
        if(!data?.snapshot||!Number.isSafeInteger(data.revision)||!Number.isFinite(data.serverNow))throw publicError('La réponse du serveur est invalide.');
        const remote=sanitize(data.snapshot);remote.username=account.profile.username;
        revision=data.revision;serverClock={at:data.serverNow,received:performance.now()};
        apply(remote,{preserveViews:true});savedSignature=signature(sanitize(game.getSnapshot()));pendingSave=false;
        remove(econKey(id));account.status='synced';account.error='';emit();
        window.dispatchEvent(new CustomEvent('kizuna:economy-change',{detail:{action:request.p_action,nexus:data.result?.nexus}}));
        return data;
      }catch(error){
        if(id===currentId&&myEpoch===epoch){account.error=friendly(error);account.status=read(econKey(id))?'conflict':'error';emit();}
        throw error;
      }finally{document.body.classList.remove('kizuna-economy-loading');}
    })();
    try{return await economyFlight;}finally{economyFlight=null;}
  }

  window.KizunaAccount = {getSnapshot:snapshot,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},open,signOut,updateProfile,flush,catalogueRequest,staffRequest,claimRewards,adventureRequest,economyRequest,marketInboxRequest,studioRequest,mythicRequest,anomalyRequest,nexusRequest,nexusAdminRequest};
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
