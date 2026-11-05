/* Nexus: presentation only. Purchases, XP, benefits and daily periods are authoritative. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy = value => JSON.parse(JSON.stringify(value));
  const number = value => new Intl.NumberFormat('fr-FR').format(Number(value) || 0);
  const branches = [
    {id:'invocation', name:'Invocation', mark:'✦', color:'#f3cc78', angle:-90},
    {id:'destin', name:'Destin', mark:'◇', color:'#ba9bff', angle:-18},
    {id:'resonance', name:'Résonance', mark:'❖', color:'#f38cbd', angle:54},
    {id:'collection', name:'Collection', mark:'▥', color:'#72dec0', angle:126},
    {id:'prestige', name:'Prestige', mark:'♔', color:'#86bcff', angle:198}
  ];
  const account = () => window.KizunaAccount?.getSnapshot?.() || {};
  let gameCache=null;
  const game = () => gameCache || (gameCache=window.KizunaGame?.getSnapshot?.() || {cards:[], owned:[], chakra:0});
  const identity = () => account().user?.id || '';
  let root, dialog, owner='', epoch=0, sequence=0, data=null, loading=false, busy=false, error='', selected='', view='tree';
  let refreshTimer, dailyTimer, serverReceivedAt=0, renderFrame, mounted=false, lastLoading=false, graphSignature='', detailSignature='', benefitsSignature='', gallerySignature='';
  let draftIds=[], draftDirty=false, search='', galleryLimit=24, confirmNode='', confirmOwner='', confirmEpoch=0, confirmPayload=null, lastFocus=null;
  let confirmKind='node',archiveDraft={series:'',rarity:'',mode:'all',sort:'name'},archiveDirty=false,archiveSearch='',archiveLimit=36,trackingMode='all',trackingSeries='';
  const auraIds=['echo','astral','transcendance'],rarities=['Commun','Peu commune','Rare','Épique','Légendaire','Mythique'];
  let viewport, world, resizeObserver, initializedView=false, transform={x:0,y:0,scale:.85}, pointers=new Map(), gesture=null, blockClickUntil=0;
  let celebrationTimer, cameraTimer, rewardCelebrationTimer;
  const treeHeart={x:500,y:630};
  const treePaths={
    invocation:[[500,500],[480,400],[520,300],[490,200],[500,100],[500,30]],
    destin:[[385,535],[320,460],[255,385],[195,310],[130,240],[105,155]],
    resonance:[[615,535],[680,460],[745,385],[805,310],[870,240],[895,155]],
    collection:[[370,665],[290,635],[215,605],[140,575],[70,545],[95,450]],
    prestige:[[630,665],[710,635],[785,605],[860,575],[930,545],[905,450]]
  };
  function chestArt(kind='daily') {return `<span class="kanx-chest-art" data-kind="${esc(kind)}" aria-hidden="true"><span class="kanx-chest-rays"></span><span class="kanx-chest-base"></span><span class="kanx-chest-lid"></span><span class="kanx-chest-lock">${kind==='weekly'?'◆':kind==='album'?'▥':'✦'}</span></span>`;}
  function treeScenery(){
    const wood='<path class="kanx-trunk-shadow" d="M460 882Q522 826 480 733Q446 660 495 571Q488 648 530 709Q566 792 534 858L616 896L510 879L415 901Z"/><path class="kanx-trunk" d="M493 577Q468 665 505 730Q542 804 508 872M493 747Q446 821 362 864M519 770Q587 833 666 864M507 860Q456 880 415 901M510 872Q567 879 615 896"/><path class="kanx-root-fine" d="M362 864 292 879m70-15-16 29m320-29 52 8m-52-8 18 28M480 799q-62 22-81 57M543 810q43 2 72 36"/>';
    const boughs=branches.map(b=>{let from=treeHeart;return treePaths[b.id].slice(0,5).map((xy,i)=>{const to={x:xy[0],y:xy[1]},bend=b.id==='invocation'?32:Math.sign(to.x-from.x)*24,d=`M${from.x} ${from.y} C${from.x+bend} ${from.y-34} ${to.x-bend} ${to.y+34} ${to.x} ${to.y}`;const leaf=`<path class="kanx-leaf" d="M${to.x} ${to.y}q${i%2?34:-34} -36 ${i%2?52:-52} -23q${i%2?-6:6} 31 ${i%2?-52:52} 23Z"/>`;from=to;return `<g style="--knx-color:${b.color}"><path class="kanx-bough-shadow" d="${d}"/><path class="kanx-bough" d="${d}"/>${leaf}</g>`;}).join('');}).join('');
    return `<g class="kanx-tree-scenery">${wood}${boughs}<ellipse class="kanx-root-ring" cx="500" cy="875" rx="258" ry="27"/></g>`;
  }
  const motionMedia=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reducedMotion=()=>window.KizunaExperience?.reduced?.()===true||document.documentElement.dataset.kzMotion==='reduced'||motionMedia?.matches===true;
  const byBranch = id => branches.find(b => b.id === id) || branches[0];
  const ready = () => Boolean(data && owner && owner === identity() && !account().loading);
  const nodes = () => ready() ? data.nodes : [];
  const owned = id => ready() && data.unlocked.includes(id);
  const safeImage = value => { try { const u=new URL(String(value||''),location.href); return ['https:','http:'].includes(u.protocol)?u.href:''; } catch { return ''; } };
  function branchProgress(value=data) {
    const unlocked=new Set(value?.unlocked||[]);
    return branches.map(branch=>{const list=(value?.nodes||[]).filter(n=>n.branch===branch.id),count=list.filter(n=>unlocked.has(n.id)).length;return {...branch,count,total:list.length,complete:list.length===5&&count===5};});
  }
  function mastery(value=data) {return Boolean(value?.nodes?.length===25&&branchProgress(value).every(b=>b.complete));}
  function availableRewards() {
    if(!ready())return {count:0,packs:0};
    const rewards=(data.rewards||[]).filter(r=>r.available&&!r.locked&&!r.claimed),daily=data.daily.available&&!data.daily.claimed;
    return {count:rewards.length+(daily?1:0),packs:rewards.reduce((n,r)=>n+Number(r.packs||0)+Number(r.weeklyPacks||0),0)+(daily?Number(data.daily.count||0):0)};
  }
  function clearCelebration() {
    clearTimeout(celebrationTimer);clearTimeout(rewardCelebrationTimer);if(!root)return;
    root.querySelectorAll('.knx-particle-burst').forEach(n=>n.remove());
    root.querySelectorAll('[data-kn-celebrate]').forEach(n=>n.removeAttribute('data-kn-celebrate'));
    const message=root.querySelector('#knxCelebration');if(message){message.hidden=true;message.textContent='';}
    root.querySelectorAll('[data-kn-reward-celebrate]').forEach(el=>el.removeAttribute('data-kn-reward-celebrate'));
    const rewardMessage=root.querySelector('#kanxRewardCelebration');if(rewardMessage){rewardMessage.hidden=true;rewardMessage.textContent='';}
  }
  function celebratePurchase(previous,response,nodeId) {
    const current=response?.result?.nexus;
    if(response.replayed||response.result?.replayed||response.result?.nodeId!==nodeId||previous.unlocked.includes(nodeId)||!current?.unlocked?.includes(nodeId))return;
    const node=current.nodes.find(n=>n.id===nodeId);if(!node)return;
    const branch=byBranch(node.branch),wasComplete=branchProgress(previous).find(b=>b.id===branch.id)?.complete,isComplete=branchProgress(current).find(b=>b.id===branch.id)?.complete;
    const allComplete=mastery(current)&&!mastery(previous),message=allComplete?'Les cinq voies sont réunies. Ton Nexus atteint sa forme suprême.':isComplete&&!wasComplete?'Voie '+branch.name+' accomplie. Ses cinq liens rayonnent ensemble.':'Nouveau lien : '+node.name+'.';
    clearCelebration();renderGraph();
    const banner=root.querySelector('#knxCelebration');banner.textContent=message;banner.hidden=false;banner.style.setProperty('--knx-color',branch.color);banner.dataset.knCelebrationKind=allComplete?'mastery':isComplete&&!wasComplete?'branch':'node';
    if(!reducedMotion()&&!document.hidden&&document.body.dataset.tab==='nexus'){
      const target=root.querySelector('#knxNodes [data-kn-node="'+nodeId+'"]');if(target)target.dataset.knCelebrate='node';
      if(isComplete&&!wasComplete)root.querySelectorAll('[data-kn-branch="'+branch.id+'"]').forEach(n=>n.dataset.knCelebrate='branch');
      if(allComplete)root.querySelector('.knx-heart').dataset.knCelebrate='mastery';
      const p=allComplete?treeHeart:point(branch,120+(node.tier-1)*65),burst=document.createElement('div');burst.className='knx-particle-burst';burst.setAttribute('aria-hidden','true');burst.style.cssText='left:'+p.x+'px;top:'+p.y+'px;--knx-color:'+branch.color;
      for(let i=0;i<(allComplete?16:10);i++){const spark=document.createElement('i'),angle=i*2.39996;spark.style.cssText='--knx-dx:'+Math.round(Math.cos(angle)*(50+i*4))+'px;--knx-dy:'+Math.round(Math.sin(angle)*(50+i*4))+'px;--knx-delay:'+(i%4)*30+'ms';burst.append(spark);}world.append(burst);
      window.KizunaExperience?.sfx?.('reward');
    }
    const key=owner,generation=epoch;celebrationTimer=setTimeout(()=>{if(key===owner&&generation===epoch)clearCelebration();},4500);
  }
  function celebrateReward(previous,response,action,payload){
    const next=response?.result?.nexus;
    if(!next||response.replayed||response.result?.replayed||document.body.dataset.tab!=='nexus')return;
    const before=action==='nexus_daily'?previous.daily:previous.rewards?.find(r=>r.key===payload.key),after=action==='nexus_daily'?next.daily:next.rewards?.find(r=>r.key===payload.key);
    if(!before||!after||before.claimed||!after.claimed||!before.available||before.locked||before.periodKey!==payload.periodKey||after.periodKey!==before.periodKey)return;
    clearTimeout(rewardCelebrationTimer);
    const target=root.querySelector('.kanx-reward-altar');
    const label=root.querySelector('#kanxRewardCelebration');label.textContent=action==='nexus_daily'?'Ton cadeau d’Invocation a rejoint ta réserve.':(before.name||'Récompense')+' · reçu dans ta réserve.';label.hidden=false;
    if(!reducedMotion()&&!document.hidden){target?.setAttribute('data-kn-reward-celebrate','received');window.KizunaExperience?.sfx?.('reward');}
    const key=owner,generation=epoch;rewardCelebrationTimer=setTimeout(()=>{if(key===owner&&generation===epoch){label.hidden=true;target?.removeAttribute('data-kn-reward-celebrate');}},3600);
  }
  function status(node) {
    if (owned(node.id)) return {key:'owned', text:'Acquis'};
    if (!node.enabled) return {key:'future', text:'À venir'};
    if ((node.prerequisites||[]).some(id=>!owned(id))) return {key:'locked', text:'Prérequis manquant'};
    if (Number(data?.level||0)<Number(node.requiredLevel||1)) return {key:'locked', text:'Niveau '+node.requiredLevel+' requis'};
    if (Number(game().chakra||0)<node.cost) return {key:'insufficient', text:'Chakra insuffisant'};
    return {key:'available', text:'Disponible'};
  }
  function valid(value) {
    return value && Number.isSafeInteger(value.stateRevision) && Array.isArray(value.nodes) && Array.isArray(value.unlocked)
      && value.nodes.every(n=>typeof n.id==='string'&&branches.some(b=>b.id===n.branch)&&Number.isInteger(n.tier)&&n.tier>=1&&n.tier<=5&&Number.isSafeInteger(n.cost)&&n.cost>=0)
      && value.bonuses && value.daily && value.preferences;
  }
  function accept(value) {
    if (!valid(value)) throw Error('Le Nexus n’a pas pu être chargé. Actualise pour réessayer.');
    if (data && (value.stateRevision<data.stateRevision || (value.stateRevision===data.stateRevision && Number(value.serverNow||0)<Number(data.serverNow||0)))) return false;
    data=copy(value);serverReceivedAt=performance.now();
    scheduleDailyRefresh();
    if (!draftDirty) draftIds=[...(data.preferences.priorityCardIds||[])];
    if (!archiveDirty) archiveDraft={series:'',rarity:'',mode:'all',sort:'name',...(data.preferences.archivePreferences||{})};
    if (!data.nodes.some(n=>n.id===selected)) selected=data.nodes.find(n=>n.enabled&&!data.unlocked.includes(n.id))?.id||data.nodes[0]?.id||'';
    schedule();
    window.dispatchEvent(new CustomEvent('kizuna:nexus-change',{detail:{owner,stateRevision:data.stateRevision}}));
    return true;
  }
  function scheduleDailyRefresh() {
    clearTimeout(dailyTimer);
    if(!owner||!data)return;
    const resets=[data.daily.nextResetAt,...(data.rewards||[]).filter(r=>!r.locked).map(r=>r.nextResetAt)].map(raw=>typeof raw==='number'?raw:Date.parse(raw)).filter(Number.isFinite);
    const next=Math.min(...resets),now=Number(data.serverNow)+(performance.now()-serverReceivedAt);
    if(!Number.isFinite(next)||!Number.isFinite(now))return;
    const key=owner,generation=epoch,delay=next>now?Math.min(86400000,next-now+300):60000;
    dailyTimer=setTimeout(()=>{if(key===identity()&&generation===epoch&&!document.hidden&&['nexus','home','profile'].includes(document.body.dataset.tab))requestRefresh();},delay);
  }
  async function refresh() {
    clearTimeout(refreshTimer);
    if (!mounted) mount();
    if (!identity() || account().loading || busy) { sync(); return; }
    if (typeof window.KizunaAccount?.nexusRequest!=='function') { error='Le Nexus est en cours de préparation. Réessaie dans un instant.';schedule();return; }
    const token=++sequence, generation=epoch, key=owner;
    loading=true;error='';schedule();
    try {
      const result=await window.KizunaAccount.nexusRequest('get',{});
      if(token!==sequence||generation!==epoch||key!==identity()||account().loading)return;
      accept(result);
    } catch(e) {
      if(token===sequence&&generation===epoch&&key===identity())error=e.publicMessage||e.message||'Le Nexus est momentanément indisponible.';
    } finally {
      if(token===sequence&&generation===epoch){loading=false;schedule();}
    }
  }
  function requestRefresh() { clearTimeout(refreshTimer); if(identity()&&!account().loading&&!busy)refreshTimer=setTimeout(refresh,60); }
  function sync() {
    gameCache=null;
    const a=account(), key=identity(), isLoading=Boolean(a.loading);
    if(key!==owner || (isLoading&&!lastLoading)) {
      clearCelebration();clearTimeout(notify.timer);const receipt=root?.querySelector('#knxReceipt');if(receipt){receipt.hidden=true;receipt.textContent='';}
      ++epoch;++sequence;clearTimeout(dailyTimer);owner=key;data=null;loading=false;busy=false;error='';selected='';draftIds=[];draftDirty=false;search='';galleryLimit=24;
      archiveDraft={series:'',rarity:'',mode:'all',sort:'name'};archiveDirty=false;archiveSearch='';archiveLimit=36;trackingMode='all';trackingSeries='';
      graphSignature=detailSignature=benefitsSignature=gallerySignature='';closeConfirm(false);
      if(root){root.querySelector('#knxPrioritySearch').value='';root.querySelector('#knxArchiveSearch').value='';}
    }
    const becameReady=lastLoading&&!isLoading;lastLoading=isLoading;
    if(key&&!isLoading&&!loading&&!busy&&(!data||becameReady))requestRefresh();
    schedule();
  }
  async function mutate(action,payload,success) {
    if(!ready()||busy||loading)return;
    const key=owner,generation=epoch,previous=copy(data);
    ++sequence;busy=true;loading=false;error='';schedule();
    try {
      const response=await window.KizunaAccount.economyRequest(action,payload);
      if(key!==identity()||generation!==epoch||account().loading)return;
      if(!response?.result?.nexus)throw Error('L’opération doit être vérifiée. Actualise le Nexus pour retrouver son résultat.');
      if(action==='nexus_preferences'&&Object.hasOwn(payload,'priorityCardIds'))draftDirty=false;
      if(action==='nexus_preferences'&&Object.hasOwn(payload,'archivePreferences'))archiveDirty=false;
      const accepted=accept(response.result.nexus);notify(success);
      if(accepted&&action==='nexus_buy')celebratePurchase(previous,response,payload.nodeId);
      if(accepted&&['nexus_daily','nexus_reward'].includes(action))celebrateReward(previous,response,action,payload);
    } catch(e) {
      if(key===identity()&&generation===epoch)error=e.publicMessage||e.message||'L’opération n’a pas été confirmée.';
    } finally {
      if(key===identity()&&generation===epoch){busy=false;loading=false;schedule();}
    }
  }
  function notify(message) {
    const el=root?.querySelector('#knxReceipt');if(el){el.textContent=message;el.hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>{el.hidden=true;},6500);}
    window.KizunaGame?.notify?.(message);
  }
  function mount() {
    if(mounted)return;const main=document.querySelector('main');if(!main)return;
    root=document.createElement('section');root.id='kzNexusPage';root.setAttribute('aria-labelledby','knxTitle');
    root.innerHTML=`<div class="wrap knx-wrap">
      <header class="knx-header"><div><span class="knx-eyebrow">LES LIENS QUI TE FONT GRANDIR</span><h1 id="knxTitle">Nexus des <em>Destinées</em></h1><p>Cinq voies. Une collection qui te ressemble.</p></div><div class="knx-wallet"><span>TON CHAKRA</span><strong id="knxBalance">—</strong><small>Investis dans des bonus permanents</small></div></header>
      <div id="knxNotice" class="knx-notice" role="status" aria-live="polite"></div>
      <div class="knx-progress"><span class="knx-level"><b id="knxLevel">—</b><small>NIVEAU NEXUS</small></span><div class="knx-xp"><div><span id="knxXpLabel">Ta progression se révèle à la connexion</span><span id="knxOwnedCount">— / 25 liens</span></div><div id="knxXpBar" role="progressbar" aria-label="Progression du Nexus" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div><small>Ouvre des boosters, découvre des cartes et accomplis tes objectifs.</small></div></div>
      <div class="knx-layout"><div class="knx-atlas"><div class="knx-atlas-toolbar"><div role="group" aria-label="Présentation du Nexus"><button type="button" data-kn-view="tree" aria-pressed="true">Arbre</button><button type="button" data-kn-view="list" aria-pressed="false">Liste accessible</button></div><div class="knx-zoom" role="group" aria-label="Zoom de l’arbre"><button type="button" data-kn-zoom="out" aria-label="Réduire le zoom">−</button><output id="knxZoomLabel" aria-label="Zoom">85 %</output><button type="button" data-kn-zoom="in" aria-label="Augmenter le zoom">+</button><button type="button" data-kn-zoom="fit" aria-label="Voir l’ensemble du Nexus">⤢</button><button type="button" data-kn-zoom="center" aria-label="Recentrer le cristal">⌖</button></div></div>
        <div id="knxViewport" class="knx-viewport" aria-label="Arbre des cinq voies. Déplace le fond pour explorer. Une vue liste est disponible."><div id="knxWorld" class="knx-world"><svg class="knx-links" viewBox="0 0 1000 920" width="1000" height="920" aria-hidden="true"><defs><radialGradient id="knxHalo"><stop stop-color="#a88af8" stop-opacity=".16"/><stop offset="1" stop-color="#a88af8" stop-opacity="0"/></radialGradient></defs><circle cx="500" cy="460" r="390" fill="url(#knxHalo)"/><g id="knxLines"></g><circle class="knx-orbit" cx="500" cy="460" r="120"/><circle class="knx-orbit" cx="500" cy="460" r="250"/><circle class="knx-orbit" cx="500" cy="460" r="380"/></svg><div class="knx-heart" aria-hidden="true"><div class="knx-heart-orbit"></div><svg viewBox="0 0 110 140"><defs><linearGradient id="knxCrystal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f5e7ff"/><stop offset=".45" stop-color="#b39aff"/><stop offset="1" stop-color="#5278ce"/></linearGradient></defs><path d="M55 5 94 47 84 101 55 135 25 101 16 47Z" fill="url(#knxCrystal)"/><path d="m55 5-6 57 6 73 17-71ZM16 47l33 15-24 39m69-54L72 64l12 37" fill="none" stroke="#fff" stroke-opacity=".65"/><path d="M16 47 55 5l-6 57Z" fill="#fff" opacity=".24"/><path d="m49 62 6 73-30-34Z" fill="#6756aa" opacity=".4"/></svg><span>LE NEXUS</span></div><div id="knxBranchLabels"></div><div id="knxNodes"></div></div></div>
        <div id="knxList" class="knx-list" hidden></div><div class="knx-atlas-footer"><span><i class="knx-legend-owned"></i> Acquis</span><span><i class="knx-legend-available"></i> Disponible</span><span><i></i> À venir</span><p>Glisse pour explorer · pince pour zoomer · Ctrl + molette pour zoomer</p></div>
      </div><aside id="knxDetail" class="knx-detail" aria-label="Détail du lien sélectionné"></aside></div>
      <div class="knx-benefits"><section class="knx-benefit knx-daily"><span class="knx-eyebrow">INVOCATION</span><h2>Le cadeau de ton Nexus</h2><div id="knxDaily"></div></section><section class="knx-benefit knx-frame"><span class="knx-eyebrow">PRESTIGE</span><h2>Une signature qui rayonne</h2><div id="knxFrame"></div></section></div>
      <section class="knx-benefit knx-rewards"><header><div><span class="knx-eyebrow">LES FRUITS DE TES LIENS</span><h2>Récompenses du Nexus</h2></div><span class="knx-section-symbol" aria-hidden="true">✦</span></header><div id="knxRewards"></div><div id="knxWeekly"></div></section>
      <section class="knx-benefit knx-priorities"><header><div><span class="knx-eyebrow">DESTIN</span><h2>Tes personnages prioritaires</h2></div><span id="knxPriorityCount" class="knx-pill">0 / 0</span></header><p id="knxPriorityNotice"></p><div id="knxTracking"></div><div id="knxTrackingFilters" class="knx-filter-bar" hidden><label>Afficher<select id="knxTrackingMode"><option value="all">Toutes mes priorités</option><option value="missing">À collectionner</option><option value="mythic">Mythiques</option></select></label><label>Univers<select id="knxTrackingSeries"><option value="">Tous les univers</option></select></label></div><div id="knxPriorityChosen" class="knx-priority-chosen"></div><label for="knxPrioritySearch">Rechercher dans le catalogue</label><input id="knxPrioritySearch" type="search" autocomplete="off" placeholder="Un personnage ou un anime…"><div id="knxPriorityResults" class="knx-priority-results"></div><div class="knx-priority-actions"><button type="button" class="knx-primary" data-kn-action="save-priorities">Enregistrer mes priorités</button><span id="knxPriorityDirty" role="status"></span></div><div id="knxMarketWatch"></div></section>
      <section class="knx-benefit knx-statistics"><header><div><span class="knx-eyebrow">DESTIN · LECTURE DES TIRAGES</span><h2>Comprendre tes invocations</h2></div><span class="knx-section-symbol" aria-hidden="true">◎</span></header><div id="knxStats"></div></section>
      <section class="knx-benefit knx-archive"><header><div><span class="knx-eyebrow">COLLECTION · TES ARCHIVES</span><h2>Chaque pièce à sa place</h2></div><span id="knxArchiveCount" class="knx-pill">—</span></header><p id="knxArchiveNotice"></p><div id="knxArchiveControls"><label class="knx-archive-search">Rechercher un personnage<input id="knxArchiveSearch" type="search" autocomplete="off" placeholder="Nom ou anime…"></label><div class="knx-filter-bar"><label>Univers<select id="knxArchiveSeries"><option value="">Tous les univers</option></select></label><label>Rareté<select id="knxArchiveRarity"><option value="">Toutes les raretés</option></select></label><label>Exemplaires<select id="knxArchiveMode"><option value="all">Tout le catalogue</option><option value="duplicates">Mes doublons</option><option value="missing">Cartes manquantes</option></select></label><label>Trier par<select id="knxArchiveSort"><option value="name">Nom</option><option value="copies">Nombre d’exemplaires</option><option value="rarity">Rareté</option></select></label></div><div class="knx-priority-actions"><button type="button" class="knx-secondary" data-kn-action="save-archive">Mémoriser mes filtres</button><span id="knxArchiveDirty" role="status"></span></div></div><div id="knxArchiveResults"></div></section>
      <section class="knx-benefit knx-gallery"><header><div><span class="knx-eyebrow">RÉSONANCE</span><h2>Les visages de tes Éveils</h2></div><span class="knx-gallery-mark" aria-hidden="true">❖</span></header><div id="knxGallery"></div></section>
      <section class="knx-benefit knx-cosmetics"><header><div><span class="knx-eyebrow">RÉSONANCE · ATELIER DES AURAS</span><h2>Donne une couleur à tes liens</h2></div><span class="knx-section-symbol" aria-hidden="true">❖</span></header><div id="knxCosmetics"></div></section>
      <footer class="knx-note">Cinq voies à développer à ton rythme. Tes bonus, tes choix et tes récompenses restent liés à ton compte.</footer><div id="knxReceipt" class="knx-receipt" role="status" aria-live="polite" hidden></div>
    </div>`;
    main.append(root);mounted=true;viewport=root.querySelector('#knxViewport');world=root.querySelector('#knxWorld');
    world.querySelector('.knx-links').insertAdjacentHTML('afterbegin',treeScenery());
    root.querySelector('.knx-rewards header').insertAdjacentHTML('afterend','<div class="kanx-reward-altar"><div class="kanx-altar-object" aria-hidden="true">'+chestArt('weekly')+'<i></i></div><div><span class="knx-eyebrow">L’AUTEL DES LIENS</span><h3 id="kanxAltarTitle">Tes récompenses prennent racine.</h3><p id="kanxAltarStatus">Retrouve ici les cadeaux de tes voies.</p></div><span id="kanxAltarCount" class="kanx-altar-count"></span></div><p id="kanxRewardCelebration" class="kanx-reward-celebration" role="status" aria-live="polite" hidden></p>');
    root.querySelector('.knx-layout').insertAdjacentHTML('beforebegin','<nav id="knxBranchProgress" class="knx-branch-progress" aria-label="Progression des cinq voies"></nav><p id="knxMasteryStatus" class="knx-mastery-status"></p>');
    root.querySelector('.knx-atlas').insertAdjacentHTML('beforeend','<div id="knxCelebration" class="knx-celebration" role="status" aria-live="polite" hidden></div>');
    root.querySelector('#knxBranchLabels').innerHTML=branches.map(b=>{const p=point(b,445);return `<span class="knx-branch-label" data-kn-branch="${b.id}" style="left:${p.x}px;top:${p.y}px;--knx-color:${b.color}"><b>${b.mark}</b>${b.name}<small>0 / 5 liens</small></span>`;}).join('');
    root.querySelector('.knx-heart').insertAdjacentHTML('afterbegin','<div class="knx-crown" aria-hidden="true">'+branches.map(b=>`<i style="--knx-color:${b.color};--knx-angle:${b.angle}deg"></i>`).join('')+'</div>');
    dialog=document.createElement('dialog');dialog.id='knxConfirm';dialog.className='knx-confirm';dialog.setAttribute('aria-labelledby','knxConfirmTitle');document.body.append(dialog);
    dialog.addEventListener('cancel',e=>{e.preventDefault();closeConfirm();});dialog.addEventListener('click',e=>{const b=e.target.closest('[data-kn-confirm]');if(!b)return;if(b.dataset.knConfirm==='cancel')closeConfirm();else commitPurchase();});
    root.addEventListener('click',click);root.querySelector('#knxPrioritySearch').addEventListener('input',e=>{search=e.target.value;renderPriorities();});
    root.querySelector('#knxArchiveSearch').addEventListener('input',e=>{archiveSearch=e.target.value;archiveLimit=36;renderArchive();});
    root.addEventListener('change',e=>{const id=e.target.id;if(id==='knxTrackingMode'){trackingMode=e.target.value;renderPriorities();}else if(id==='knxTrackingSeries'){trackingSeries=e.target.value;renderPriorities();}else if(id.startsWith('knxArchive')){const key={knxArchiveSeries:'series',knxArchiveRarity:'rarity',knxArchiveMode:'mode',knxArchiveSort:'sort'}[id];if(key){archiveDraft[key]=e.target.value;archiveDirty=true;archiveLimit=36;renderArchive();}}});
    setupGestures();if(typeof ResizeObserver!=='undefined'){resizeObserver=new ResizeObserver(()=>{if(!initializedView&&viewport.clientWidth)fit();});resizeObserver.observe(viewport);}
    render();
  }
  function point(branch,radius) {if(radius<=65)return {...treeHeart};const i=Math.max(0,Math.min(5,Math.round((radius-120)/65))),p=treePaths[branch.id][i];return {x:p[0],y:p[1]};}
  function schedule() { if(renderFrame)return;renderFrame=requestAnimationFrame(()=>{renderFrame=0;render();}); }
  function setHTML(target,html) { if(target && target.innerHTML!==html)target.innerHTML=html; }
  function keepFocus(fn) {
    const active=document.activeElement, attrs=['data-kn-node','data-kn-branch-select','data-kn-action','data-kn-priority','data-kn-remove','data-kn-open-mythic','data-kn-reward','data-kn-cosmetic','data-kn-aura','data-kn-card','data-kn-market'];
    const key=active&&attrs.find(attr=>active.hasAttribute?.(attr)),value=key?active.getAttribute(key):null;
    fn();if(active&&!active.isConnected&&key){let replacement=[...root.querySelectorAll('['+key+']')].find(el=>el.getAttribute(key)===value&&!el.disabled);if(!replacement&&key==='data-kn-action'&&value==='buy')replacement=[...root.querySelectorAll(view==='tree'?'#knxNodes [data-kn-node]':'#knxList [data-kn-node]')].find(el=>el.dataset.knNode===selected);replacement?.focus({preventScroll:true});}
  }
  function render() {
    if(!mounted)return;
    const a=account(), available=ready(), current=available?data:null, waiting=loading||a.loading;
    root.querySelector('#knxBalance').textContent=available?number(game().chakra):'—';root.querySelector('#knxLevel').textContent=current?number(current.level):'—';
    const xp=Math.max(0,Number(current?.xp||0)),floor=Math.max(0,Number(current?.levelFloor||0)),ceil=Number(current?.nextLevelXp||0),ratio=ceil>floor?Math.max(0,Math.min(100,(xp-floor)/(ceil-floor)*100)):current?100:0;
    root.querySelector('#knxXpLabel').textContent=current?number(xp)+' XP'+(ceil>floor?' · '+number(Math.max(0,ceil-xp))+' avant le prochain niveau':' · Niveau maximum'):'Ta progression se révèle à la connexion';
    root.querySelector('#knxOwnedCount').textContent=current?current.unlocked.length+' / '+current.nodes.length+' liens':'— / 25 liens';
    const bar=root.querySelector('#knxXpBar');bar.setAttribute('aria-valuenow',String(Math.round(ratio)));bar.firstElementChild.style.width=ratio+'%';
    const notice=root.querySelector('#knxNotice');
    setHTML(notice,error?`<span>${esc(error)}</span><button type="button" data-kn-action="refresh" ${busy?'disabled':''}>Réessayer</button>`:a.loading||loading?'<span>Les liens de ton Nexus se chargent…</span>':!a.user?'<span>Connecte-toi pour découvrir ton arbre, gagner de l’XP et conserver tes bonus.</span><button type="button" data-kn-action="login">Continuer avec Discord</button>':busy?'<span>Le Nexus enregistre ton choix…</span>':'');notice.hidden=!notice.textContent;
    notice.classList.toggle('is-error',Boolean(error));root.setAttribute('aria-busy',String(busy||waiting));
    renderGraph();renderDetail();renderBenefits();renderRewards();renderPriorities();renderStats();renderArchive();renderGallery();renderCosmetics();decorateProfile();decorateHome();
    if(document.body.dataset.tab==='nexus'&&!initializedView&&viewport.clientWidth)fit();
  }
  function renderGraph() {
    const list=nodes(), signature=JSON.stringify(list.map(n=>[n.id,n.branch,n.tier,n.name,n.description,n.enabled,n.prerequisites]));
    if(signature!==graphSignature){
      graphSignature=signature;const sorted=[...list].sort((a,b)=>branches.findIndex(x=>x.id===a.branch)-branches.findIndex(x=>x.id===b.branch)||a.tier-b.tier);
      root.querySelector('#knxNodes').innerHTML=sorted.map(n=>{const branch=byBranch(n.branch),p=point(branch,120+(n.tier-1)*65);return `<button type="button" class="knx-node" data-kn-node="${esc(n.id)}" style="left:${p.x}px;top:${p.y}px;--knx-color:${branch.color}" aria-pressed="false"><span class="knx-node-gem">${n.tier===1?branch.mark:['','I','II','III','IV','V'][n.tier]}</span><span class="knx-node-state" aria-hidden="true"></span><span class="knx-node-caption">${['','I','II','III','IV','V'][n.tier]}</span><span class="kanx-node-name">${esc(n.name)}</span></button>`;}).join('');
      root.querySelector('#knxLines').innerHTML=sorted.map(n=>{const b=byBranch(n.branch),parents=(n.prerequisites||[]).map(id=>sorted.find(p=>p.id===id)).filter(Boolean),z=point(b,120+(n.tier-1)*65);return (parents.length?parents:[null]).map(parent=>{const a=parent?point(byBranch(parent.branch),120+(parent.tier-1)*65):treeHeart,bend=Math.sign(z.x-a.x)*24;return `<path data-kn-path="${esc(n.id)}" data-kn-branch="${b.id}" d="M${a.x} ${a.y} C${a.x+bend} ${a.y-34} ${z.x-bend} ${z.y+34} ${z.x} ${z.y}" style="--knx-color:${b.color}"/>`;}).join('');}).join('');
      root.querySelector('#knxList').innerHTML=branches.map(b=>`<section style="--knx-color:${b.color}"><h2><span aria-hidden="true">${b.mark}</span> ${b.name}</h2>${sorted.filter(n=>n.branch===b.id).map(n=>`<button type="button" data-kn-node="${esc(n.id)}" aria-pressed="false"><span class="knx-list-tier">${['','I','II','III','IV','V'][n.tier]}</span><span><strong>${esc(n.name)}</strong><small>${esc(n.description)}</small></span><span class="knx-list-state"></span></button>`).join('')}</section>`).join('')||'<p class="knx-empty">Connecte-toi pour découvrir les liens disponibles.</p>';
    }
    const byId=new Map(list.map(n=>[n.id,n])),states=new Map(list.map(n=>[n.id,status(n)]));
    root.querySelectorAll('[data-kn-node]').forEach(button=>{const n=byId.get(button.dataset.knNode);if(!n)return;const s=states.get(n.id);button.dataset.state=s.key;button.classList.toggle('is-selected',selected===n.id);button.setAttribute('aria-pressed',String(selected===n.id));button.setAttribute('aria-label',byBranch(n.branch).name+', palier '+n.tier+', '+n.name+' : '+s.text+(n.enabled&&!owned(n.id)?', '+number(n.cost)+' chakra':''));const caption=button.querySelector('.knx-list-state');if(caption)caption.textContent=s.text;const marker=button.querySelector('.knx-node-state');if(marker)marker.textContent=s.key==='owned'?'✓':s.key==='future'?'·':'';});
    const progress=branchProgress(ready()?data:null),byBranchId=new Map(progress.map(b=>[b.id,b]));
    root.querySelectorAll('[data-kn-path]').forEach(path=>path.dataset.state=states.get(path.dataset.knPath)?.key||'future');
    root.querySelectorAll('[data-kn-branch]').forEach(el=>{const b=byBranchId.get(el.dataset.knBranch);el.dataset.knGrowth=String(b.count);el.style.setProperty('--knx-growth',String(b.count/5));el.dataset.knComplete=String(b.complete);const counter=el.querySelector('small');if(counter)counter.textContent=b.complete?'VOIE ACCOMPLIE':b.count+' / 5 liens';});
    keepFocus(()=>setHTML(root.querySelector('#knxBranchProgress'),progress.map(b=>`<button type="button" data-kn-branch-select="${b.id}" style="--knx-color:${b.color};--knx-growth:${b.count/5}" aria-label="Explorer ${b.name}, ${b.count} liens acquis sur cinq" ${!ready()?'disabled':''}><span aria-hidden="true">${b.mark}</span><span><strong>${b.name}</strong><small>${b.complete?'Voie accomplie':b.count+' / 5 liens'}</small><i><b></b></i></span>${b.complete?'<em aria-hidden="true">✓</em>':''}</button>`).join('')));
    const full=ready()&&mastery(data),prestige=ready()&&data.bonuses.prestigeCrystal;
    root.dataset.knMastery=full?'complete':prestige?'prestige':ready()&&data.unlocked.length?'growing':'dormant';
    root.querySelector('.knx-heart>span').textContent=full?'LES CINQ VOIES':prestige?'LÉGENDE KIZUNA':'LE NEXUS';
    root.querySelector('#knxMasteryStatus').textContent=full?'Nexus accompli · les vingt-cinq liens illuminent ton cristal.':prestige?'Ton cristal de Légende rayonne. Réunis les cinq voies pour révéler sa forme suprême.':progress.some(b=>b.complete)?progress.filter(b=>b.complete).length+' voie'+(progress.filter(b=>b.complete).length>1?'s':'')+' accomplie'+(progress.filter(b=>b.complete).length>1?'s':'')+' · chaque lien fait évoluer ton arbre.':'Chaque lien acquis renforce la lumière de sa voie.';
  }
  function renderDetail() {
    const n=nodes().find(value=>value.id===selected), s=n?status(n):null;
    const signature=JSON.stringify([n,s,busy,loading,account().loading,identity(),data?.stateRevision]);if(signature===detailSignature)return;detailSignature=signature;
    const box=root.querySelector('#knxDetail');
    if(!n){setHTML(box,`<span class="knx-eyebrow">CHOISIS TA VOIE</span><div class="knx-detail-emblem" aria-hidden="true">✧</div><h2>Chaque lien compte.</h2><p>${identity()?'Sélectionne un lien dans l’arbre ou dans la liste pour découvrir son effet.':'Ton Nexus est lié à ton compte. Connecte-toi pour retrouver ta progression.'}</p>${!identity()?'<button type="button" class="knx-primary" data-kn-action="login">Continuer avec Discord</button>':''}`);return;}
    const b=byBranch(n.branch);box.style.setProperty('--knx-color',b.color);
    keepFocus(()=>setHTML(box,`<span class="knx-eyebrow">${b.name.toLocaleUpperCase('fr')} · PALIER ${['','I','II','III','IV','V'][n.tier]}</span><div class="knx-detail-emblem" aria-hidden="true">${b.mark}</div><span class="knx-state-pill" data-state="${s.key}">${s.text}</span><h2>${esc(n.name)}</h2><p>${esc(n.description)}</p><dl><div><dt>Investissement</dt><dd>${n.enabled?number(n.cost)+' chakra':'À venir'}</dd></div><div><dt>Niveau Nexus</dt><dd>${number(n.requiredLevel||1)}</dd></div><div><dt>Prérequis</dt><dd>${n.prerequisites?.length?n.prerequisites.map(id=>esc(data.nodes.find(x=>x.id===id)?.name||id)).join(', '):'Premier lien de la voie'}</dd></div></dl>${n.enabled?`<button type="button" class="knx-primary" data-kn-action="buy" ${s.key!=='available'||busy||loading?'disabled':''}>${s.key==='owned'?'Lien déjà acquis':s.key==='available'?'Débloquer ce lien':s.text}</button><small class="knx-detail-note">${s.key==='owned'?'Ce bonus fait désormais partie de ton Nexus.':'Un achat unique, un bonus permanent.'}</small>`:'<div class="knx-future-note">Ce lien se dévoilera dans un prochain chapitre. Aucun achat n’est possible pour le moment.</div>'}`));
  }
  function resetLabel() {
    const raw=data?.daily?.nextResetAt,t=typeof raw==='number'?raw:Date.parse(raw);
    if(!Number.isFinite(t))return 'Renouvellement à minuit, heure de Paris.';
    return 'Prochain cadeau : '+new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(t))+' (Paris).';
  }
  function renderBenefits() {
    const d=ready()?data:null,signature=JSON.stringify([d?.bonuses,d?.daily,d?.unlocked,d?.preferences?.frame,busy,loading,Boolean(d)]);if(signature===benefitsSignature)return;benefitsSignature=signature;
    const unlocked=Number(d?.bonuses?.dailyPacks||0)>0,paused=owned('invocation_1')&&!unlocked,claimable=unlocked&&Number(d.daily.available)>0&&!d.daily.claimed;
    keepFocus(()=>{
      setHTML(root.querySelector('#knxDaily'),`<div class="knx-chest${claimable?' is-ready':''}" aria-hidden="true">${chestArt('daily')}</div><p>${unlocked?'Ton lien d’Invocation apporte '+number(d.bonuses.dailyPacks)+' booster'+(d.bonuses.dailyPacks>1?'s':'')+' supplémentaire'+(d.bonuses.dailyPacks>1?'s':'')+' chaque jour.':paused?'Le cadeau quotidien est temporairement désactivé. Tes rangs d’Invocation restent acquis.':'Débloque Invocation I pour recevoir un booster bonus chaque jour.'}</p><button type="button" class="knx-primary" data-kn-action="daily" ${!claimable||busy||loading?'disabled':''}>${claimable?'Récupérer '+number(d.daily.count||d.daily.available)+' booster'+((d.daily.count||d.daily.available)>1?'s':''):paused?'Cadeau temporairement désactivé':d?.daily?.claimed?'Cadeau déjà récupéré':'Invocation I requis'}</button><small>${unlocked?esc(resetLabel()):'Les cadeaux quotidiens sont liés à ton compte.'}</small>${d?.bonuses?.freeCapacity?`<small>Capacité de recharge gratuite : <b>${number(d.bonuses.freeCapacity)}</b> packs.</small>`:''}`);
      const frame=Boolean(d?.bonuses?.profileFrame),equipped=d?.preferences?.frame==='nexus';
      setHTML(root.querySelector('#knxFrame'),`<div class="knx-frame-preview${equipped?' is-equipped':''}" aria-hidden="true"><span>絆</span><i>✦</i></div><p>${frame?'Le cadre du Nexus est à toi. Sa couronne de cristal accompagne ton avatar.':'Débloque Prestige I pour obtenir le cadre de profil du Nexus.'}</p><button type="button" class="knx-secondary" data-kn-action="frame" ${!frame||busy||loading?'disabled':''}>${equipped?'Retirer le cadre Nexus':frame?'Équiper le cadre Nexus':'Prestige I requis'}</button><small>Les autres décorations de ton profil sont conservées.</small>`);
    });
  }
  function parisDate(raw) {
    const at=typeof raw==='number'?raw:Date.parse(raw);return Number.isFinite(at)?new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(at))+' (Paris)':'';
  }
  function renderRewards() {
    const state=ready()?data:null,rewards=state?.rewards||[],regular=rewards.filter(r=>!r.key.startsWith('album:')),albums=rewards.filter(r=>r.key.startsWith('album:'));
    const available=availableRewards(),altar=root.querySelector('.kanx-reward-altar');altar.dataset.state=available.count?'ready':state?'resting':'locked';
    root.querySelector('#kanxAltarTitle').textContent=available.count?'Des cadeaux attendent ton retour.':state?'Tes prochains cadeaux se préparent.':'Les fruits de ta progression.';
    root.querySelector('#kanxAltarStatus').textContent=!state?'Connecte-toi pour retrouver les cadeaux de tes voies.':available.count?available.count+' récompense'+(available.count>1?'s':'')+' disponible'+(available.count>1?'s':'')+' dans ton Nexus.':'Chaque lien acquis révèle de nouvelles récompenses.';
    root.querySelector('#kanxAltarCount').textContent=available.packs?number(available.packs)+' pack'+(available.packs>1?'s':'')+' à récupérer':'';
    const markup=r=>{
      const gains=[Number(r.chakra)>0?number(r.chakra)+' chakra':'',Number(r.packs)>0?number(r.packs)+' booster'+(r.packs>1?'s':''):'',Number(r.weeklyPacks)>0?number(r.weeklyPacks)+' Coffret'+(r.weeklyPacks>1?'s':'')+' Nexus':''].filter(Boolean);
      const required={prestige_daily:'prestige_2',weekly:'prestige_3',prestige_once:'prestige_5'}[r.key]||'collection_4';
      const label=r.locked?(owned(required)?r.key==='weekly'&&Number(state?.bonuses?.weeklyPacks)>0?'Coffret momentanément indisponible':'Récompense temporairement désactivée':({prestige_daily:'Prestige II requis',weekly:'Prestige III requis',prestige_once:'Prestige V requis'}[r.key]||'Collection IV requis')):r.claimed?'Récompense récupérée':r.available?'Récupérer':!gains.length?'Récompense temporairement désactivée':r.albumId&&Number(r.owned)<Number(r.total)?'Album à compléter':'Pas encore disponible';
      return `<article class="knx-reward-card${r.available&&!r.claimed&&!r.locked?' is-ready':''}" data-kanx-reward-key="${esc(r.key)}" data-kanx-reward-state="${r.locked?'locked':r.claimed?'claimed':r.available?'ready':'waiting'}"><span class="knx-reward-symbol" aria-hidden="true">${chestArt(r.albumId?'album':r.key==='weekly'?'weekly':'daily')}</span><div><span class="knx-eyebrow">${r.albumId?'ALBUM':r.kind==='daily'||r.key==='prestige_daily'?'QUOTIDIEN':r.key==='weekly'?'HEBDOMADAIRE':'RÉCOMPENSE UNIQUE'}</span><h3>${esc(r.name)}</h3><p>${esc(gains.join(' · ')||'Récompense de progression')}</p>${r.albumId?`<small>${number(r.owned)} / ${number(r.total)} personnages réunis</small>`:''}${r.nextResetAt?`<small>Renouvellement : ${esc(parisDate(r.nextResetAt))}</small>`:''}</div><button type="button" class="knx-secondary" data-kn-reward="${esc(r.key)}" ${!r.available||r.claimed||r.locked||busy||loading?'disabled':''}>${label}</button></article>`;
    };
    const host=root.querySelector('#knxRewards'),opened=host.querySelector('details')?.open;
    keepFocus(()=>setHTML(host,!state?'<p>Connecte-toi pour retrouver les cadeaux de tes voies.</p>':!rewards.length?'<p>Les récompenses des prochains liens apparaîtront ici.</p>':`<div class="knx-reward-grid">${regular.map(markup).join('')}</div>${albums.length?`<details class="knx-album-rewards" ${opened?'open':''}><summary>Récompenses d’albums <span>${albums.filter(r=>r.available&&!r.claimed&&!r.locked).length} à récupérer · ${albums.length} albums</span></summary><div class="knx-reward-grid">${albums.map(markup).join('')}</div></details>`:''}`));
    const stock=state?Number(game().stock?.nexusWeekly??state.weeklyBooster?.count??0):0;
    keepFocus(()=>setHTML(root.querySelector('#knxWeekly'),state?.bonuses?.weeklyPacks||stock?`<div class="knx-weekly"><div class="knx-weekly-seal" aria-hidden="true">絆</div><div><span class="knx-eyebrow">L’INVOCATION DU NEXUS</span><h3>${esc(state.weeklyBooster?.name||'Coffret Nexus')}</h3><p><strong>${number(stock)}</strong> coffret${stock>1?'s':''} dans ta réserve${state.weeklyBooster?.cardCount?' · '+number(state.weeklyBooster.cardCount)+' personnages possibles':''}.</p><small>Le coffre hebdomadaire ajoute ces boosters à ta réserve. Tu choisis quand les ouvrir.</small></div><button type="button" class="knx-primary" data-kn-action="open-weekly" ${stock<1||state.weeklyBooster?.available===false||busy||loading?'disabled':''}>Ouvrir un coffret</button></div>`:''));
  }
  function setOptions(select,values,placeholder,value) {
    const options=[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
    if(value&&!options.includes(value))options.push(value);
    setHTML(select,`<option value="">${placeholder}</option>`+options.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join(''));select.value=value;
  }
  function renderStats() {
    const host=root.querySelector('#knxStats'),enabled=ready()&&data.bonuses.detailedStats,s=enabled?data.stats:null;
    if(!s){setHTML(host,`<p>${enabled?'Tes statistiques enregistrées sont en cours de chargement.':'Destin II dévoile ton historique de tirages, les probabilités du moteur et tes garanties.'}</p>`);return;}
    const counts=Object.entries(s.rarities||{}),total=counts.reduce((sum,[,n])=>sum+Number(n||0),0),wasOpen=host.querySelector('details')?.open;
    setHTML(host,`<div class="knx-metrics">${[[s.packs,'Boosters ouverts'],[s.cards,'Cartes tirées'],[s.newCards,'Nouvelles découvertes']].map(([n,label])=>`<div><strong>${number(n)}</strong><span>${label}</span></div>`).join('')}</div><p class="knx-history-note">Historique enregistré par le moteur Kizuna. Les anciennes ouvertures locales ne sont pas reconstituées.</p><div class="knx-stats-columns"><div><h3>Raretés obtenues</h3><div class="knx-rarity-stats">${rarities.filter(r=>Object.hasOwn(s.rarities||{},r)).map(r=>{const n=Number(s.rarities[r]||0),pct=total?n/total*100:0;return `<div><span>${esc(r)}</span><b>${number(n)}</b><i><span style="width:${pct.toFixed(2)}%"></span></i><small>${pct.toLocaleString('fr-FR',{maximumFractionDigits:1})} %</small></div>`;}).join('')||'<p>Aucun tirage enregistré pour le moment.</p>'}</div></div><div><h3>Garanties de progression</h3><div class="knx-pity">${[['legendary','Légendaire'],['mythic','Mythique']].filter(([key])=>s.pity?.[key]).map(([key,name])=>{const p=s.pity[key],progress=Math.min(100,Number(p.current||0)/Math.max(1,Number(p.threshold))*100);return `<div><span>${name}</span><strong>${number(p.current)} / ${number(p.threshold)}</strong><i><span style="width:${progress}%"></span></i><small>${number(p.remaining)} étape${Number(p.remaining)>1?'s':''} avant la garantie</small></div>`;}).join('')}</div></div></div><details class="knx-odds" ${wasOpen?'open':''}><summary>Probabilités et garanties du moteur</summary>${(s.odds||[]).map(o=>{const sum=Object.values(o.weights||{}).reduce((n,v)=>n+Number(v||0),0);return `<article><h3>${esc(o.name)}${o.cardCount?' · '+number(o.cardCount)+' cartes':''}</h3><div class="knx-table-scroll"><table><caption>Poids de base normalisés, avant les garanties d’emplacement</caption><thead><tr><th>Rareté</th><th>Poids</th><th>Part de base</th></tr></thead><tbody>${Object.entries(o.weights||{}).map(([r,v])=>`<tr><th scope="row">${esc(r)}</th><td>${number(v)}</td><td>${sum?(Number(v)/sum*100).toLocaleString('fr-FR',{maximumFractionDigits:3}):'0'} %</td></tr>`).join('')}</tbody></table></div><p>${esc(o.guarantee||'')}</p></article>`;}).join('')}<p>Les garanties d’emplacement, la progression de garantie et les raretés présentes dans le booster influencent le tirage final. Si une rareté manque dans son catalogue, le moteur utilise une rareté disponible. Les priorités ne modifient pas ces probabilités.</p></details>`);
  }
  function renderArchive() {
    const enabled=ready()&&data.bonuses.archiveTools,controls=root.querySelector('#knxArchiveControls'),host=root.querySelector('#knxArchiveResults');controls.hidden=!enabled;
    root.querySelector('#knxArchiveNotice').textContent=enabled?'Explore tes doublons, les personnages manquants et les univers de ta collection. Mémorise tes filtres pour les retrouver à ta prochaine visite.':'Collection II ouvre les archives : recherche, tri et filtres de collection.';
    if(!enabled){root.querySelector('#knxArchiveCount').textContent='Verrouillé';setHTML(host,'');return;}
    const all=game().cards||[],counts=new Map();for(const c of game().owned||[])counts.set(c.id,(counts.get(c.id)||0)+1);
    setOptions(root.querySelector('#knxArchiveSeries'),all.map(c=>c.series),'Tous les univers',archiveDraft.series);setOptions(root.querySelector('#knxArchiveRarity'),rarities,'Toutes les raretés',archiveDraft.rarity);
    root.querySelector('#knxArchiveMode').value=archiveDraft.mode;root.querySelector('#knxArchiveSort').value=archiveDraft.sort;
    controls.querySelectorAll('select,input').forEach(n=>n.disabled=busy||loading);root.querySelector('[data-kn-action="save-archive"]').disabled=!archiveDirty||busy||loading;
    root.querySelector('#knxArchiveDirty').textContent=archiveDirty?'Filtres à enregistrer':'Filtres enregistrés';
    const q=archiveSearch.trim().toLocaleLowerCase('fr'),filtered=all.filter(c=>(!archiveDraft.series||c.series===archiveDraft.series)&&(!archiveDraft.rarity||c.rarity===archiveDraft.rarity)&&(!q||(c.name+' '+c.series).toLocaleLowerCase('fr').includes(q))&&(archiveDraft.mode==='duplicates'?(counts.get(c.id)||0)>1:archiveDraft.mode==='missing'?!counts.has(c.id):true));
    filtered.sort((a,b)=>(archiveDraft.sort==='copies'?(counts.get(b.id)||0)-(counts.get(a.id)||0):archiveDraft.sort==='rarity'?rarities.indexOf(b.rarity)-rarities.indexOf(a.rarity):0)||a.name.localeCompare(b.name,'fr'));
    root.querySelector('#knxArchiveCount').textContent=number(filtered.length)+' résultat'+(filtered.length>1?'s':'');
    keepFocus(()=>setHTML(host,`<p class="knx-archive-summary">${number(counts.size)} personnages possédés · ${number((game().owned||[]).length)} exemplaires · ${number(all.length)} cartes au catalogue</p><div class="knx-archive-grid">${filtered.slice(0,archiveLimit).map(c=>{const n=counts.get(c.id)||0,image=safeImage(c.image);return `<button type="button" data-kn-card="${esc(c.id)}" class="${n?'':'is-missing'}">${image?`<img src="${esc(image)}" alt="" loading="lazy" decoding="async">`:'<span>◇</span>'}<span><strong>${esc(c.name)}</strong><small>${esc(c.series)}</small><em>${esc(c.rarity)} · ${n?number(n)+' exemplaire'+(n>1?'s':''):'À collectionner'}</em></span></button>`;}).join('')}</div>${!filtered.length?'<p>Aucun personnage ne correspond à ces filtres.</p>':''}${filtered.length>archiveLimit?'<button type="button" class="knx-secondary" data-kn-action="more-archive">Afficher plus de cartes</button>':''}`));
  }
  function renderCosmetics() {
    const c=ready()?data.cosmetics:null,enabled=owned('resonance_2'),host=root.querySelector('#knxCosmetics');
    const remove=c&&auraIds.includes(c.aura)?`<p>Une aura est actuellement équipée. <button type="button" class="knx-secondary" data-kn-action="remove-aura" ${busy||loading?'disabled':''}>Retirer mon aura</button></p>`:'';
    if(!c||!enabled){setHTML(host,'<p>Résonance II permet de gagner des fragments cosmétiques grâce aux doublons mythiques obtenus en booster. Résonance IV augmente ce gain.</p>'+remove);return;}
    const items=(c.items||[]).filter(item=>auraIds.includes(item.id)),gainsActive=Number(data.bonuses.fragmentsPerDuplicate)>0&&Number(c.dailyCap)>0;
    keepFocus(()=>setHTML(host,`<div class="knx-fragment-balance"><span aria-hidden="true">❖</span><div><strong>${number(c.fragments)}</strong><small>FRAGMENTS DISPONIBLES</small></div><p>${number(c.earnedToday)} / ${number(c.dailyCap)} fragments gagnés aujourd’hui avec le Nexus.<br><small>${gainsActive?number(data.bonuses.fragmentsPerDuplicate)+' fragment'+(data.bonuses.fragmentsPerDuplicate>1?'s':'')+' par doublon mythique éligible · renouvellement à minuit à Paris.':'Les gains de fragments Nexus sont temporairement désactivés. Tes fragments restent utilisables.'}</small></p></div><p>Ces fragments servent aux présentations cosmétiques et aux Éveils existants. Ils ne modifient pas la rareté ni les probabilités des cartes.</p>${remove}<div class="knx-aura-grid">${items.map(item=>`<article data-kn-aura-preview="${item.id}"><div class="knx-aura-orb" aria-hidden="true"><span>絆</span></div><h3>${esc(item.name)}</h3><p>${item.owned?'Aura acquise':number(item.cost)+' fragments'}</p>${item.owned?`<button type="button" class="knx-secondary" data-kn-aura="${item.id}" ${busy||loading?'disabled':''}>${c.aura===item.id?'Retirer cette aura':'Équiper cette aura'}</button>`:`<button type="button" class="knx-primary" data-kn-cosmetic="${item.id}" ${Number(c.fragments)<Number(item.cost)||busy||loading?'disabled':''}>${Number(c.fragments)<Number(item.cost)?'Fragments insuffisants':'Créer cette aura'}</button>`}</article>`).join('')}</div>${items.length?'':'<p>Aucune aura n’est proposée à l’achat pour le moment.</p>'}`));
  }
  function renderPriorities() {
    const slots=ready()?Number(data.bonuses.prioritySlots||0):0,enabled=slots>0;
    root.querySelector('#knxPriorityCount').textContent=draftIds.length+' / '+slots;
    root.querySelector('#knxPriorityNotice').textContent=enabled?'Garde jusqu’à '+slots+' personnages à portée de vue. Tes priorités complètent ta liste d’envies et ne changent pas les probabilités des boosters.':owned('destin_1')?'L’ajout de priorités est temporairement désactivé. Les personnages déjà enregistrés restent conservés.':'Débloque Destin I pour suivre cinq personnages supplémentaires, sans modifier ta liste d’envies.';
    const input=root.querySelector('#knxPrioritySearch');input.disabled=!enabled||busy||loading;
    const cards=Array.isArray(game().cards)?game().cards:[],byId=new Map(cards.map(c=>[c.id,c])),have=new Set((game().owned||[]).map(c=>c.id));
    const advanced=ready()&&data.bonuses.advancedTracking,tracking=advanced?data.advancedTracking:null;
    root.querySelector('#knxTrackingFilters').hidden=!advanced;
    setOptions(root.querySelector('#knxTrackingSeries'),draftIds.map(id=>byId.get(id)?.series),'Tous les univers',trackingSeries);root.querySelector('#knxTrackingMode').value=trackingMode;
    setHTML(root.querySelector('#knxTracking'),tracking?`<div class="knx-tracking-summary"><span>LISTE D’ENVIES ENREGISTRÉE</span><div>${[[tracking.total,'Personnages suivis'],[tracking.owned,'Possédés'],[tracking.missing,'À collectionner'],[tracking.mythics,'Mythiques'],[tracking.fullyAwakened,'Éveils complets']].map(([n,label])=>`<p><strong>${number(n)}</strong><small>${label}</small></p>`).join('')}</div></div>`:'');
    keepFocus(()=>{
      const visible=draftIds.filter(id=>!advanced||((trackingMode!=='missing'||!have.has(id))&&(trackingMode!=='mythic'||byId.get(id)?.rarity==='Mythique')&&(!trackingSeries||byId.get(id)?.series===trackingSeries)));
      setHTML(root.querySelector('#knxPriorityChosen'),visible.map(id=>{const c=byId.get(id);return `<span class="knx-priority-chip"><span><strong>${esc(c?.name||'Carte à retrouver')}</strong><small>${have.has(id)?'Dans ta collection':'À collectionner'}</small></span>${c?`<button type="button" data-kn-market="${esc(id)}" aria-label="Consulter les annonces pour ${esc(c.name)}">Marché ↗</button>`:''}<button type="button" data-kn-remove="${esc(id)}" aria-label="Retirer ${esc(c?.name||'cette carte')} des priorités" ${busy||loading?'disabled':''}>×</button></span>`;}).join('')||(draftIds.length?'<p>Aucune priorité ne correspond à ces filtres.</p>':''));
      const q=search.trim().toLocaleLowerCase('fr'), candidates=enabled&&q.length>=2?cards.filter(c=>(c.name+' '+c.series).toLocaleLowerCase('fr').includes(q)).slice(0,24):[];
      setHTML(root.querySelector('#knxPriorityResults'),candidates.map(c=>{const image=safeImage(c.image),added=draftIds.includes(c.id);return `<button type="button" data-kn-priority="${esc(c.id)}" aria-pressed="${added}" ${added||draftIds.length>=slots||busy||loading?'disabled':''}>${image?`<img src="${esc(image)}" alt="" loading="lazy" decoding="async">`:'<span class="knx-card-placeholder">◇</span>'}<span><strong>${esc(c.name)}</strong><small>${esc(c.series)}</small></span><b aria-hidden="true">${added?'✓':'+'}</b></button>`;}).join('')||(enabled?`<p class="knx-search-help">${q.length>=2?'Aucun personnage ne correspond à cette recherche.':'Saisis au moins deux caractères pour trouver un personnage.'}</p>`:''));
    });
    const save=root.querySelector('[data-kn-action="save-priorities"]');save.disabled=!owned('destin_1')||draftIds.length>slots||!draftDirty||busy||loading;
    root.querySelector('#knxPriorityDirty').textContent=draftDirty?'Modifications à enregistrer':enabled?'Priorités enregistrées':'';
    const watch=ready()&&data.bonuses.marketWatch?data.marketWatch:null;
    keepFocus(()=>setHTML(root.querySelector('#knxMarketWatch'),watch?`<div class="knx-watch-heading"><div><h3>Les annonces de tes priorités</h3><small>${watch.observedAt?'Dernière vérification : '+esc(parisDate(watch.observedAt)):'Annonces actuellement enregistrées'}</small></div><button type="button" class="knx-secondary" data-kn-action="refresh" ${busy||loading?'disabled':''}>Actualiser</button></div><div class="knx-watch-list">${(watch.listings||[]).map(l=>`<article><div><strong>${esc(l.name)}</strong><small>${esc(l.series)} · ${esc(l.rarity)}</small><span>${l.mode==='auction'?'Enchère':'Vente'} · ${esc(l.seller||'Collectionneur')}</span></div><b>${number(l.mode==='auction'?(l.topBid||l.price):l.price)} chakra</b><button type="button" class="knx-secondary" data-kn-market="${esc(l.cardId)}">Voir les annonces</button></article>`).join('')||'<p>Aucune annonce active ne correspond à tes priorités enregistrées. Reviens vérifier plus tard.</p>'}</div><p class="knx-watch-note">Les annonces peuvent évoluer. Leur disponibilité et leur prix sont vérifiés dans le marché avant un achat.</p>`:'<p class="knx-watch-locked">Destin IV ajoute ici les annonces actives correspondant à tes priorités enregistrées.</p>'));
  }
  function renderGallery() {
    const enabled=ready()&&data.bonuses.awakenedGallery, my=window.KizunaMythic?.getSnapshot?.()||{},cards=Array.isArray(game().cards)?game().cards:[],have=new Set((game().owned||[]).map(c=>c.id));
    const list=enabled?cards.filter(c=>have.has(c.id)&&c.rarity==='Mythique'&&Number(window.KizunaMythic?.state?.(c.id)?.unlocked||0)>0):[];
    const aura=ready()&&auraIds.includes(data.cosmetics?.aura)?data.cosmetics.aura:'',prestige=ready()&&data.bonuses.mythicPrestige;
    const signature=JSON.stringify([enabled,owner,my.owner,my.loading,list.map(c=>[c.id,c.name,window.KizunaMythic?.state?.(c.id)]),galleryLimit,aura,prestige]);if(signature===gallerySignature)return;gallerySignature=signature;
    const host=root.querySelector('#knxGallery');
    host.dataset.knAura=aura;
    if(!enabled){setHTML(host,'<div class="knx-gallery-empty"><span aria-hidden="true">❖</span><p>Résonance I rassemble ici tes Mythiques éveillées. Chaque transformation raconte un nouveau lien.</p></div>');return;}
    if(my.loading){setHTML(host,'<p class="knx-empty">Chargement de tes Éveils…</p>');return;}
    if(!list.length){setHTML(host,'<div class="knx-gallery-empty"><span aria-hidden="true">✧</span><h3>Aucune Mythique éveillée en collection.</h3><p>Les doublons mythiques issus des boosters gagnent de la Résonance. Retrouve ici les transformations des cartes que tu possèdes.</p><button type="button" class="knx-secondary" data-kn-action="awakening">Découvrir les Éveils</button></div>');return;}
    setHTML(host,`<p>${list.length} Mythique${list.length>1?'s':''} éveillée${list.length>1?'s':''} · Tes Éveils restent acquis.</p><div class="knx-gallery-grid">${list.slice(0,galleryLimit).map(c=>{const p=window.KizunaMythic.state(c.id),level=Math.min(3,Math.max(1,p.selected||p.unlocked)),art=window.KizunaMythicArt?.render?.(c,level,{compact:true,animate:false}),image=safeImage(c.image);return `<button type="button" data-kn-open-mythic="${esc(c.id)}" data-kn-mythic-prestige="${prestige&&p.unlocked>=3?'on':''}" aria-label="Voir les Éveils de ${esc(c.name)}"><span class="knx-gallery-art">${art|| (image?`<img src="${esc(image)}" alt="" loading="lazy" decoding="async">`:'◇')}<b>${prestige&&p.unlocked>=3?'✦ PRESTIGE · ':''}ÉVEIL ${p.unlocked}</b></span><strong>${esc(c.name)}</strong><small>${esc(c.series)}</small><span class="knx-gallery-owned">Dans ta collection</span></button>`;}).join('')}</div>${list.length>galleryLimit?'<button type="button" class="knx-secondary" data-kn-action="more-gallery">Afficher plus de Mythiques</button>':''}`);
  }
  function decorateProfile() {
    const profile=document.getElementById('profilePage'),available=ready();if(!profile)return;
    const equipped=available&&data.bonuses.profileFrame&&data.preferences.frame==='nexus'?'nexus':'';
    if(profile.dataset.knFrame!==equipped)profile.dataset.knFrame=equipped;
    profile.dataset.knAura=available&&auraIds.includes(data.cosmetics?.aura)?data.cosmetics.aura:'';
    profile.dataset.knAnimation=available&&data.bonuses.profileAnimation?'on':'';profile.dataset.knCrystal=available&&data.bonuses.prestigeCrystal?'on':'';
    const title=available?data.bonuses.prestigeTitle||'':'';let badge=profile.querySelector('#knxPrestigeTitle');
    if(title){if(!badge){const identityHost=profile.querySelector('.kp-identity-title');if(identityHost){badge=document.createElement('span');badge.id='knxPrestigeTitle';identityHost.append(badge);}}if(badge)badge.textContent='✦ '+title;}else badge?.remove();
    profile.querySelectorAll('[data-kn-profile]').forEach(host=>{
      const completed=available?branchProgress().filter(b=>b.complete).length:0,rewards=availableRewards();
      const markup=`<div class="knx-profile-summary" data-kn-complete="${available&&mastery()}"><span class="knx-profile-crystal" aria-hidden="true">◆</span><div><span class="knx-eyebrow">NEXUS DES DESTINÉES</span><strong>${available?'Niveau '+number(data.level)+' · '+data.unlocked.length+' liens acquis':'Fais grandir tes liens'}</strong><small>${available?number(data.xp)+' XP · '+completed+' / 5 voies accomplies':'Retrouve ta progression et tes bonus.'}</small>${rewards.count?`<small class="knx-profile-rewards">${rewards.count} récompense${rewards.count>1?'s':''} à récupérer${rewards.packs?' · '+number(rewards.packs)+' pack'+(rewards.packs>1?'s':''):''}</small>`:''}</div><button type="button" class="knx-secondary" data-kn-profile-open>Explorer le Nexus</button></div>`;
      setHTML(host,markup);
    });
  }
  function decorateHome() {
    const rewards=availableRewards();
    document.querySelectorAll('[data-kg-go="nexus"]').forEach(button=>{button.dataset.knRewards=String(rewards.count);const label=button.querySelector('small');if(label)label.textContent=rewards.count?rewards.count+' récompense'+(rewards.count>1?'s':'')+' à récupérer'+(rewards.packs?' · '+number(rewards.packs)+' pack'+(rewards.packs>1?'s':''):''):ready()?'Niveau '+number(data.level)+' · '+data.unlocked.length+' / 25 liens':'Débloquer des bonus permanents';button.setAttribute('aria-label',rewards.count?'Nexus des Destinées, '+rewards.count+' récompense'+(rewards.count>1?'s':'')+' à récupérer':'Explorer le Nexus des Destinées');});
    document.querySelectorAll('.nav a[data-tab="nexus"]').forEach(link=>{link.dataset.knRewards=String(rewards.count);link.setAttribute('aria-label',rewards.count?'Nexus, '+rewards.count+' récompense'+(rewards.count>1?'s':'')+' à récupérer':'Nexus');});
  }
  function openConfirm() {
    const n=nodes().find(x=>x.id===selected);if(!n||status(n).key!=='available'||busy||loading)return;
    confirmKind='node';confirmNode=n.id;confirmOwner=owner;confirmEpoch=epoch;confirmPayload={nodeId:n.id,configVersion:data.configVersion,expectedCost:n.cost};lastFocus=document.activeElement;
    dialog.innerHTML=`<span class="knx-eyebrow">UN NOUVEAU LIEN</span><h2 id="knxConfirmTitle">Débloquer ${esc(n.name)} ?</h2><p>${esc(n.description)}</p><dl><div><dt>Coût unique</dt><dd>${number(n.cost)} chakra</dd></div><div><dt>Solde après achat</dt><dd>${number(Number(game().chakra||0)-n.cost)} chakra</dd></div></dl><p class="knx-confirm-note">Ce lien est permanent. Le chakra sera débité après confirmation.</p><div><button type="button" class="knx-secondary" data-kn-confirm="cancel">Annuler</button><button type="button" class="knx-primary" data-kn-confirm="buy">Confirmer l’achat</button></div>`;
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
    dialog.querySelector('[data-kn-confirm="cancel"]').focus({preventScroll:true});
  }
  function openCosmetic(id) {
    const item=ready()&&data.cosmetics?.items?.find(x=>x.id===id);
    if(!owned('resonance_2')||!item||item.owned||!auraIds.includes(id)||Number(data.cosmetics.fragments)<Number(item.cost)||busy||loading)return;
    confirmKind='cosmetic';confirmNode=id;confirmOwner=owner;confirmEpoch=epoch;confirmPayload={id,expectedCost:item.cost,configVersion:data.configVersion};lastFocus=document.activeElement;
    dialog.innerHTML=`<span class="knx-eyebrow">ATELIER DES AURAS</span><h2 id="knxConfirmTitle">Créer ${esc(item.name)} ?</h2><p>Cette aura décore ton profil et ta galerie de Mythiques éveillées. Elle reste acquise et peut être équipée ou retirée à tout moment.</p><dl><div><dt>Coût unique</dt><dd>${number(item.cost)} fragments</dd></div><div><dt>Fragments restants</dt><dd>${number(Number(data.cosmetics.fragments)-Number(item.cost))}</dd></div></dl><div><button type="button" class="knx-secondary" data-kn-confirm="cancel">Annuler</button><button type="button" class="knx-primary" data-kn-confirm="buy">Créer l’aura</button></div>`;
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');dialog.querySelector('[data-kn-confirm="cancel"]').focus({preventScroll:true});
  }
  function closeConfirm(restore=true) {
    if(!dialog)return;if(dialog.open){if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');}
    confirmNode='';confirmOwner='';confirmPayload=null;if(restore&&lastFocus?.isConnected)lastFocus.focus({preventScroll:true});lastFocus=null;
  }
  function commitPurchase() {
    if(confirmKind==='cosmetic'){
      const item=ready()&&data.cosmetics?.items?.find(x=>x.id===confirmNode),same=owner===confirmOwner&&epoch===confirmEpoch;
      if(!same||!owned('resonance_2')||!item||item.owned||busy||loading||Number(data.cosmetics.fragments)<Number(item.cost)){closeConfirm();return;}
      if(!confirmPayload||item.cost!==confirmPayload.expectedCost||data.configVersion!==confirmPayload.configVersion){closeConfirm();notify('Cette aura a été actualisée. Vérifie son coût avant de confirmer à nouveau.');return;}
      const payload={...confirmPayload};closeConfirm();mutate('nexus_cosmetic',payload,'Aura créée : '+item.name+'.');return;
    }
    const n=nodes().find(x=>x.id===confirmNode),same=owner===confirmOwner&&epoch===confirmEpoch;
    if(!same||!n||status(n).key!=='available'||busy||loading){closeConfirm();return;}
    if(!confirmPayload||n.cost!==confirmPayload.expectedCost||data.configVersion!==confirmPayload.configVersion){closeConfirm();notify('Ce lien a été actualisé. Vérifie son prix avant de confirmer à nouveau.');return;}
    const payload={...confirmPayload};closeConfirm();
    mutate('nexus_buy',payload,'Lien acquis : '+n.name+'.');
  }
  function click(event) {
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.hasAttribute('data-kn-branch-select')){const branch=button.dataset.knBranchSelect,list=nodes().filter(n=>n.branch===branch).sort((a,b)=>a.tier-b.tier),target=list.find(n=>!owned(n.id))||list.at(-1);if(!target)return;selected=target.id;renderGraph();renderDetail();if(view==='tree'){const p=point(byBranch(branch),120+(target.tier-1)*65);transform.x=viewport.clientWidth/2-p.x*transform.scale;transform.y=(viewport.clientHeight||550)/2-p.y*transform.scale;applyTransform(true);}const targetButton=[...root.querySelectorAll(view==='tree'?'#knxNodes [data-kn-node]':'#knxList [data-kn-node]')].find(n=>n.dataset.knNode===target.id);targetButton?.focus({preventScroll:true});if(view==='list'&&targetButton){const container=root.querySelector('#knxList'),box=container.getBoundingClientRect(),item=targetButton.getBoundingClientRect();if(box.height>0&&item.height>0){if(item.top<box.top)container.scrollTop+=item.top-box.top-8;else if(item.bottom>box.bottom)container.scrollTop+=item.bottom-box.bottom+8;}}return;}
    if(button.hasAttribute('data-kn-node')){if(performance.now()<blockClickUntil&&event.detail!==0){event.preventDefault();return;}selected=button.dataset.knNode;renderGraph();renderDetail();return;}
    if(button.hasAttribute('data-kn-view')){view=button.dataset.knView;viewport.hidden=view!=='tree';root.querySelector('#knxList').hidden=view!=='list';root.querySelector('.knx-zoom').hidden=view!=='tree';root.querySelectorAll('[data-kn-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.knView===view)));if(view==='tree'&&!initializedView)center();return;}
    if(button.hasAttribute('data-kn-zoom')){const action=button.dataset.knZoom;if(action==='fit')fit();else if(action==='center')center();else zoomAt(transform.scale*(action==='in'?1.2:1/1.2),viewport.clientWidth/2,viewport.clientHeight/2);return;}
    if(button.hasAttribute('data-kn-priority')){const id=button.dataset.knPriority;if(ready()&&draftIds.length<Number(data.bonuses.prioritySlots)&&!draftIds.includes(id)){draftIds.push(id);draftDirty=true;renderPriorities();}return;}
    if(button.hasAttribute('data-kn-remove')){draftIds=draftIds.filter(id=>id!==button.dataset.knRemove);draftDirty=true;renderPriorities();return;}
    if(button.hasAttribute('data-kn-market')){window.KizunaExchange?.searchCard?.(button.dataset.knMarket);return;}
    if(button.hasAttribute('data-kn-card')){window.KizunaGame?.openCard?.(button.dataset.knCard);return;}
    if(button.hasAttribute('data-kn-reward')){const reward=ready()&&data.rewards?.find(r=>r.key===button.dataset.knReward);if(reward?.available&&!reward.claimed&&!reward.locked)mutate('nexus_reward',{key:reward.key,periodKey:reward.periodKey},'Récompense récupérée : '+reward.name+'.');return;}
    if(button.hasAttribute('data-kn-cosmetic')){openCosmetic(button.dataset.knCosmetic);return;}
    if(button.hasAttribute('data-kn-aura')){const id=button.dataset.knAura;if(ready()&&auraIds.includes(id)&&data.cosmetics?.items?.some(item=>item.id===id&&item.owned)){const aura=data.cosmetics.aura===id?'':id;mutate('nexus_preferences',{aura},aura?'Aura équipée.':'Aura retirée.');}return;}
    if(button.hasAttribute('data-kn-open-mythic')){window.KizunaMythic?.open?.(button.dataset.knOpenMythic);return;}
    switch(button.dataset.knAction){
      case 'login':window.KizunaAccount?.open?.('login');break;
      case 'refresh':refresh();break;
      case 'buy':openConfirm();break;
      case 'daily':if(ready()&&Number(data.daily.available)>0&&!data.daily.claimed)mutate('nexus_daily',{periodKey:data.daily.periodKey},'Ton booster du Nexus a rejoint ton stock.');break;
      case 'frame':if(ready()&&data.bonuses.profileFrame)mutate('nexus_preferences',{frame:data.preferences.frame==='nexus'?'':'nexus'},data.preferences.frame==='nexus'?'Cadre Nexus retiré.':'Cadre Nexus équipé.');break;
      case 'remove-aura':if(ready()&&auraIds.includes(data.cosmetics?.aura))mutate('nexus_preferences',{aura:''},'Aura retirée.');break;
      case 'save-priorities':mutate('nexus_preferences',{priorityCardIds:[...draftIds]},'Tes personnages prioritaires sont enregistrés.');break;
      case 'save-archive':mutate('nexus_preferences',{archivePreferences:{...archiveDraft}},'Tes filtres d’archives sont enregistrés.');break;
      case 'more-archive':archiveLimit+=36;renderArchive();break;
      case 'open-weekly':if(ready()&&Number(game().stock?.nexusWeekly??data.weeklyBooster?.count??0)>0&&data.weeklyBooster?.available!==false)window.KizunaGame?.openNexusWeekly?.();break;
      case 'awakening':window.KizunaAdventure?.navigate?.('awakening');break;
      case 'more-gallery':galleryLimit+=24;renderGallery();break;
    }
  }
  function applyTransform(animate=false) {
    clearTimeout(cameraTimer);world.classList.toggle('is-camera-moving',animate&&!reducedMotion());
    world.style.transform=`translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;
    root.querySelector('#knxZoomLabel').textContent=Math.round(transform.scale*100)+' %';
    if(animate)cameraTimer=setTimeout(()=>world.classList.remove('is-camera-moving'),260);
  }
  function center() {const width=viewport.clientWidth,height=viewport.clientHeight||650;if(!width)return;const animate=initializedView;transform={x:width/2-treeHeart.x*.85,y:height/2-treeHeart.y*.85,scale:.85};initializedView=true;applyTransform(animate);}
  function fit() {const width=viewport.clientWidth,height=viewport.clientHeight||650;if(!width)return;const animate=initializedView,scale=Math.max(.3,Math.min(1.1,(width-24)/1000,(height-24)/920));transform={scale,x:width/2-500*scale,y:height/2-460*scale};initializedView=true;applyTransform(animate);}
  function zoomAt(scale,x,y) {scale=Math.max(.3,Math.min(1.7,scale));const ratio=scale/transform.scale;transform={scale,x:x-(x-transform.x)*ratio,y:y-(y-transform.y)*ratio};applyTransform();}
  function setupGestures() {
    const position=e=>{const rect=viewport.getBoundingClientRect();return {x:e.clientX-rect.left,y:e.clientY-rect.top};};
    const begin=()=>{const values=[...pointers.values()];if(values.length===2){const [a,b]=values;gesture={kind:'pinch',distance:Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)),mid:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},initial:{...transform}};}else if(values.length===1)gesture={kind:'pan',start:{...values[0]},initial:{...transform},moved:false};else gesture=null;};
    viewport.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;pointers.set(e.pointerId,position(e));begin();if(e.target.closest('button')&&pointers.size===1)return;try{viewport.setPointerCapture(e.pointerId);}catch{};});
    viewport.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||!gesture)return;pointers.set(e.pointerId,position(e));const values=[...pointers.values()];if(gesture.kind==='pinch'&&values.length>=2){const [a,b]=values,mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},scale=Math.max(.3,Math.min(1.7,gesture.initial.scale*Math.hypot(b.x-a.x,b.y-a.y)/gesture.distance)),ratio=scale/gesture.initial.scale;transform={scale,x:mid.x-(gesture.mid.x-gesture.initial.x)*ratio,y:mid.y-(gesture.mid.y-gesture.initial.y)*ratio};blockClickUntil=performance.now()+400;applyTransform();e.preventDefault();}else if(gesture.kind==='pan'&&values.length===1){const dx=values[0].x-gesture.start.x,dy=values[0].y-gesture.start.y;if(Math.hypot(dx,dy)<6&&!gesture.moved)return;gesture.moved=true;try{viewport.setPointerCapture(e.pointerId);}catch{};transform.x=gesture.initial.x+dx;transform.y=gesture.initial.y+dy;blockClickUntil=performance.now()+400;viewport.classList.add('is-dragging');applyTransform();e.preventDefault();}});
    const end=e=>{pointers.delete(e.pointerId);try{if(viewport.hasPointerCapture?.(e.pointerId))viewport.releasePointerCapture(e.pointerId);}catch{};viewport.classList.remove('is-dragging');begin();};
    viewport.addEventListener('pointerup',end);viewport.addEventListener('pointercancel',end);viewport.addEventListener('lostpointercapture',e=>{if(pointers.has(e.pointerId)){pointers.delete(e.pointerId);begin();}});
    viewport.addEventListener('wheel',e=>{if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();const p=position(e);zoomAt(transform.scale*Math.exp(-e.deltaY*.002),p.x,p.y);},{passive:false});
    viewport.addEventListener('focusin',e=>{const button=e.target.closest('[data-kn-node]');if(!button||!button.matches(':focus-visible'))return;const left=parseFloat(button.style.left),top=parseFloat(button.style.top),x=transform.x+left*transform.scale,y=transform.y+top*transform.scale;if(x<35||x>viewport.clientWidth-35||y<35||y>viewport.clientHeight-35){transform.x=viewport.clientWidth/2-left*transform.scale;transform.y=viewport.clientHeight/2-top*transform.scale;applyTransform();}});
  }
  function recycleQuote(base,eligibleBase=base) {
    const total=Math.max(0,Math.floor(Number(base)||0)),eligible=Math.max(0,Math.min(total,Math.floor(Number(eligibleBase)||0)));
    if(!ready()||eligible===0)return total;
    const bps=Math.max(0,Number(data.bonuses.recycleBps)||0),remainder=Math.max(0,Math.min(9999,Number(data.recycleRemainder)||0));
    return total+Math.floor((eligible*bps+remainder)/10000);
  }
  window.KizunaNexus={refresh,decorateProfile,decorateHome,recycleQuote,getSnapshot:()=>({owner,loading:loading||Boolean(account().loading),busy,loaded:ready(),error,state:ready()?copy(data):null})};
  document.addEventListener('click',e=>{if(e.target.closest('[data-kn-profile-open]'))window.KizunaGame?.showTab?.('nexus');});
  document.addEventListener('kizuna:account-change',sync);
  window.addEventListener('kizuna:economy-change',event=>{gameCache=null;if(busy)return;if(ready()&&event.detail?.nexus){try{accept(event.detail.nexus);}catch{requestRefresh();}}else requestRefresh();});
  window.addEventListener('kizuna:game-change',()=>{gameCache=null;schedule();});
  window.addEventListener('kizuna:mythic-change',schedule);
  window.addEventListener('kizuna:profile-render',decorateProfile);
  window.addEventListener('kizuna:tab-change',()=>{if(['nexus','home','profile'].includes(document.body.dataset.tab)){requestRefresh();schedule();}else clearCelebration();});
  window.addEventListener('focus',()=>{if(['nexus','home','profile'].includes(document.body.dataset.tab))requestRefresh();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearCelebration();else if(['nexus','home','profile'].includes(document.body.dataset.tab))requestRefresh();});
  const motionChanged=()=>{if(reducedMotion()){clearCelebration();world?.classList.remove('is-camera-moving');}};
  window.addEventListener('kizuna:preferences',motionChanged);motionMedia?.addEventListener?.('change',motionChanged);
  function start(){mount();sync();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
