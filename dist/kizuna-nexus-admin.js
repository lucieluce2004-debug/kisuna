/* Nexus administration. Drafts never change the live economy before a verified publication. */
(() => {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const clone=v=>JSON.parse(JSON.stringify(v));
 const $=id=>document.getElementById(id);
 const branches=[['invocation','Invocation','#edc47b'],['destin','Destin','#c2a2ff'],['resonance','Résonance','#f49bc2'],['collection','Collection','#89e4c3'],['prestige','Prestige','#a3cfff']];
 const rarities=['Commun','Peu commune','Rare','Épique','Légendaire','Mythique'];
 const sections=[['overview','Pilotage'],['nodes','Améliorations'],['economy','Bonus & limites'],['weekly','Coffret hebdomadaire'],['rewards','Albums & auras'],['history','Versions']];
 const scalarFields=[
  ['recycleCapBps','Plafond du bonus de recyclage','%',0,15,.01],
  ['fragmentsBasic','Fragments par doublon · Résonance II','fragments',0,10,1],
  ['fragmentsAdvanced','Fragments par doublon · Résonance IV','fragments',0,10,1],
  ['fragmentsDailyCap','Plafond quotidien des fragments Nexus','fragments',0,100,1],
  ['prestigeDailyChakra','Cadeau quotidien · Prestige II','Chakra',0,1000,1],
  ['weeklyBasic','Coffrets par semaine · Prestige III','coffrets',0,5,1],
  ['weeklyAdvanced','Coffrets par semaine · Prestige IV','coffrets',0,10,1],
  ['prestigeOnceChakra','Récompense unique · Prestige V','Chakra',0,100000,1],
  ['prestigeOncePacks','Packs uniques · Prestige V','packs',0,1000,1]
 ];
 const arrayFields=[
  ['dailyBoosters','Boosters quotidiens supplémentaires',[1,3,5],'Invocation',4,1,'packs'],
  ['storageBonuses','Emplacements de réserve supplémentaires',[2,4],'Invocation',3,1,'places'],
  ['priorityBonuses','Suivis prioritaires supplémentaires',[1,3,5],'Destin',20,1,'suivis'],
  ['recycleBonuses','Bonus de recyclage supplémentaires',[1,3,5],'Collection',15,.01,'%']
 ];
 let host,panel,owner='',epoch=0,busy=false,record=null,draft=null,dirty=false,preview=null,blockedOwner='';
 let section='overview',selectedNode='invocation_1',poolQuery='',poolSeries='',poolSelected=false,poolLimit=60,albumQuery='',albumLimit=20;
 let dialog=null,confirmState=null,lastFocus=null,observerQueued=false,pendingPublish=null;
 const account=()=>window.KizunaAccount?.getSnapshot?.()||{};
 const allowed=()=>{const a=account();return a.isAdmin===true&&!a.loading&&!!a.user?.id&&a.user.id!==blockedOwner;};
 const current=()=>allowed()&&owner===account().user.id;
 const cards=()=>window.KizunaGame?.getSnapshot?.().cards||[];
 const number=v=>Number.isFinite(Number(v))?new Intl.NumberFormat('fr-FR').format(Number(v)):'—';
 const date=v=>v&&Number.isFinite(new Date(v).getTime())?new Date(v).toLocaleString('fr-FR'):'—';
 const isBps=key=>key==='recycleCapBps'||key==='recycleBonuses';
 const display=(key,value)=>isBps(key)?Number(value)/100:value;
 const parse=(key,value)=>isBps(key)?Math.round(Number(value)*100):Number(value);
 function message(text,error=false){const el=$('knxaStatus');if(el){el.textContent=text;el.classList.toggle('is-error',error);}}
 function reset(){epoch++;busy=false;record=null;draft=null;dirty=false;preview=null;pendingPublish=null;section='overview';selectedNode='invocation_1';poolQuery='';poolSeries='';poolSelected=false;poolLimit=60;albumQuery='';albumLimit=20;closeConfirm(false);panel?.remove();$('knxaTab')?.remove();panel=null;host=null;}
 function mount(){
  const a=account(),next=a.isAdmin===true&&!a.loading?a.user?.id||'':'';
  if(next!==owner){reset();owner=next;if(blockedOwner!==next)blockedOwner='';}
  if(!allowed()){if(panel)reset();return;}
  host=$('staffPage');if(!host?.querySelector('.ks-tabs')||!host.querySelector('.ks-wrap'))return;
  if(panel?.isConnected)return;
  const tab=document.createElement('button');tab.id='knxaTab';tab.type='button';tab.dataset.ksTab='nexus-admin';tab.textContent='Nexus';tab.setAttribute('aria-controls','ks-nexus-admin');tab.setAttribute('aria-pressed','false');host.querySelector('.ks-tabs').append(tab);
  panel=document.createElement('section');panel.id='ks-nexus-admin';panel.className='ks-panel knxa';panel.hidden=true;panel.setAttribute('aria-labelledby','knxaTitle');
  panel.innerHTML='<header class="knxa-heading"><div><span class="knxa-kicker">NEXUS · ADMINISTRATION</span><h2 id="knxaTitle">Façonner les destinées.</h2><p>Prépare les règles, vérifie leurs effets, puis publie une nouvelle version.</p></div><button type="button" class="ks-button ks-secondary" data-knxa="refresh">Actualiser</button></header><p id="knxaStatus" role="status" aria-live="polite"></p><div id="knxaWorkspace"><div class="knxa-empty">Ouvre cet onglet pour charger la configuration.</div></div>';
  host.querySelector('.ks-wrap').append(panel);
  tab.addEventListener('click',()=>{if(!current())return;host.querySelectorAll('.ks-panel').forEach(n=>n.hidden=n!==panel);host.querySelectorAll('.ks-tabs button').forEach(n=>{const active=n===tab;n.classList.toggle('is-active',active);n.setAttribute('aria-pressed',String(active));});if(!record&&!busy)request('get');});
  panel.addEventListener('click',click);panel.addEventListener('input',input);panel.addEventListener('change',change);panel.addEventListener('submit',submit);
  if(record)render();
 }
 function remember(){const active=document.activeElement;return {key:active?.closest('#ks-nexus-admin')?active.id:'',start:active?.selectionStart,end:active?.selectionEnd,scrolls:[...panel.querySelectorAll('[data-knxa-scroll]')].map(e=>[e.id,e.scrollTop,e.scrollLeft]),y:window.scrollY};}
 function restorePosition(saved){if(!saved)return;for(const [id,top,left] of saved.scrolls){const e=$(id);if(e){e.scrollTop=top;e.scrollLeft=left;}}let focus=saved.key?$(saved.key):null;if(focus?.disabled){focus=saved.key==='knxaSave'?$('knxaPreview'):saved.key==='knxaPublish'?$('knxaTitle'):null;if(focus?.tagName==='H2')focus.tabIndex=-1;}if(focus&&!focus.disabled){focus.focus({preventScroll:true});try{if(saved.start!==null&&saved.start!==undefined)focus.setSelectionRange(saved.start,saved.end);}catch{}}}
 function validRecord(r){return r&&Number.isSafeInteger(r.revision)&&Number.isSafeInteger(r.publishedVersion)&&r.draft&&Array.isArray(r.draft.nodes)&&r.draft.economy&&r.draft.weeklyBooster&&Array.isArray(r.draft.albums)&&Array.isArray(r.draft.cosmetics);}
 async function request(action,payload={}){
  if(busy||!current())return false;const generation=epoch,key=owner,saved=remember();busy=true;controls();message(action==='get'?'Chargement de la configuration…':action==='preview'?'Validation et comparaison du brouillon…':action==='publish'?'Publication de la nouvelle version…':'Enregistrement du brouillon…');
  try{
   const result=await window.KizunaAccount.nexusAdminRequest(action,payload);
   if(generation!==epoch||key!==owner||!current())return false;
   if(!validRecord(result))throw Error('La configuration reçue est incomplète. Actualise pour réessayer.');
   if(action==='preview'&&(!result.preview||typeof result.preview.hash!=='string'||!result.preview.hash||!Array.isArray(result.preview.changes)))throw Error('Le comparatif serveur est incomplet. Relance la validation avant de publier.');
   record=clone(result);draft=clone(result.draft);dirty=false;preview=action==='preview'?clone(result.preview):null;
   if(action!=='publish')pendingPublish=null;
   if(!draft.nodes.some(n=>n.id===selectedNode))selectedNode=draft.nodes[0]?.id||'';
   render();
   message(action==='publish'?'Version '+result.publishedVersion+' publiée. Les achats, collections et récompenses déjà obtenus sont conservés.':action==='restore'?'Version reprise en brouillon. Vérifie les changements avant de publier.':action==='save'?'Brouillon enregistré. Valide maintenant les changements.':action==='preview'?'Brouillon validé. Consulte le comparatif avant publication.':'Configuration chargée.');
   if(action==='publish'){pendingPublish=null;window.dispatchEvent(new CustomEvent('kizuna:nexus-config-change',{detail:{version:result.publishedVersion}}));window.KizunaNexus?.refresh?.();}
   return true;
  }catch(error){
   if(generation!==epoch||key!==owner)return false;
   const code=String(error.code||error.message||'');
   if(error.status===403||/ADMIN_REQUIRED|AUTH_REQUIRED/.test(code)){blockedOwner=owner;reset();return false;}
   preview=null;
   message(/REVISION_CONFLICT|NEXUS_CONFIG_CHANGED|PREVIEW_CHANGED/.test(code)?'La configuration a changé dans une autre session. Tes modifications restent ici ; actualise pour charger la nouvelle version avant de les reprendre.':error.publicMessage||error.message||'La demande n’a pas abouti. Réessaie dans un instant.',true);
   return false;
  }finally{if(generation===epoch&&key===owner){busy=false;controls();restorePosition(saved);}}
 }
 function controls(){
  if(!panel)return;panel.setAttribute('aria-busy',String(busy));panel.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=busy||n.hasAttribute('data-knxa-fixed'));
  const save=$('knxaSave'),check=$('knxaPreview'),publish=$('knxaPublish');if(save)save.disabled=busy||!draft||!dirty;if(check)check.disabled=busy||dirty||!record;if(publish)publish.disabled=busy||dirty||!preview?.hash||!preview.changes?.length;
  const state=$('knxaDraftState');if(state)state.textContent=dirty?'Modifications non enregistrées':record?'Brouillon '+record.revision+' · version publique '+record.publishedVersion:'';
  if($('knxaPoolMore'))$('knxaPoolMore').disabled=busy||filteredCards().length<=poolLimit;
  if($('knxaAlbumMore'))$('knxaAlbumMore').disabled=busy||filteredAlbums().length<=albumLimit;
 }
 function markDirty(){dirty=true;preview=null;pendingPublish=null;const p=$('knxaComparison');if(p)p.innerHTML='<p>Enregistre puis valide ce brouillon pour obtenir le comparatif serveur.</p>';controls();}
 function input(e){
  if(!current()||busy||!draft)return;const t=e.target;
  if(t.id==='knxaPoolQuery'){poolQuery=t.value;poolLimit=60;renderPool();return;}
  if(t.id==='knxaAlbumQuery'){albumQuery=t.value;albumLimit=20;renderAlbums();return;}
  if(t.matches('[data-knxa-field]')){captureField(t);markDirty();updateTotals();}
 }
 function change(e){
  if(!current()||busy||!draft)return;const t=e.target;
  if(t.id==='knxaPoolSeries'){poolSeries=t.value;poolLimit=60;renderPool();return;}
  if(t.id==='knxaPoolSelected'){poolSelected=t.checked;poolLimit=60;renderPool();return;}
  if(t.matches('[data-knxa-card]')){const ids=new Set(draft.weeklyBooster.cardIds);if(t.checked&&ids.size>=500){t.checked=false;message('Le coffret peut contenir 500 personnages au maximum.',true);return;}t.checked?ids.add(t.value):ids.delete(t.value);draft.weeklyBooster.cardIds=[...ids];t.closest('.knxa-card-choice')?.classList.toggle('is-selected',t.checked);markDirty();updatePoolSummary();if(poolSelected)renderPool();return;}
  if(t.matches('[data-knxa-prerequisite]')){const n=draft.nodes.find(n=>n.id===selectedNode),ids=new Set(n.prerequisites);t.checked?ids.add(t.value):ids.delete(t.value);n.prerequisites=[...ids];markDirty();return;}
  if(t.matches('[data-knxa-field]')){captureField(t);markDirty();updateTotals();if(t.dataset.knxaScope==='node')renderNodeList();}
 }
 function captureField(t){
  const key=t.dataset.knxaField,value=t.type==='checkbox'?t.checked:t.type==='number'?parse(key,t.value):t.value;
  if(t.dataset.knxaScope==='node'){const n=draft.nodes.find(n=>n.id===selectedNode);if(n)n[key]=value;}
  if(t.dataset.knxaScope==='economy'){const i=t.dataset.knxaIndex;if(i===undefined)draft.economy[key]=value;else draft.economy[key][Number(i)]=value;}
  if(t.dataset.knxaScope==='weekly')draft.weeklyBooster[key]=value;
  if(t.dataset.knxaScope==='album'||t.dataset.knxaScope==='cosmetic'){const group=t.dataset.knxaScope==='album'?draft.albums:draft.cosmetics,row=group.find(r=>r.id===t.dataset.knxaId);if(row)row[key]=value;}
 }
 async function submit(e){if(e.target.id!=='knxaForm')return;e.preventDefault();if(!current()||busy||!e.target.reportValidity())return;if(!validateDraft())return;await request('save',{revision:record.revision,config:clone(draft)});}
 function validateDraft(){
  const e=draft.economy,totals={dailyBoosters:4,storageBonuses:3,priorityBonuses:20,recycleBonuses:1500};
  for(const [key,max] of Object.entries(totals)){if(!Array.isArray(e[key])||e[key].some(v=>!Number.isSafeInteger(v)||v<0)||e[key].reduce((a,b)=>a+b,0)>max){message('La somme des bonus « '+(arrayFields.find(f=>f[0]===key)?.[1]||key)+' » dépasse sa limite.',true);return false;}}
  if(e.fragmentsAdvanced<e.fragmentsBasic||e.weeklyAdvanced<e.weeklyBasic){message('Le rang supérieur doit accorder au moins autant que le rang précédent.',true);return false;}
  if(draft.nodes.some(n=>!Number.isSafeInteger(n.cost)||!Number.isSafeInteger(n.requiredLevel))){message('Utilise des nombres entiers pour les coûts et les niveaux.',true);return false;}
  return true;
 }
 function click(e){
  const b=e.target.closest('[data-knxa],[data-knxa-section],[data-knxa-node]');if(!b||b.disabled||busy||!current())return;
  if(b.dataset.knxaSection){section=b.dataset.knxaSection;showSection();return;}
  if(b.dataset.knxaNode){selectedNode=b.dataset.knxaNode;renderNodeList();renderNodeEditor();$('knxaSelect-'+selectedNode)?.focus({preventScroll:true});return;}
  const action=b.dataset.knxa;
  if(action==='refresh'){if(dirty)openConfirm('discard');else request('get');}
  if(action==='preview'){if(!dirty)request('preview',{revision:record.revision});}
  if(action==='publish'&&preview?.hash&&!dirty)openConfirm('publish');
  if(action==='restore')openConfirm('restore',Number(b.dataset.version));
  if(action==='pool-more'){poolLimit+=60;renderPool();}
  if(action==='album-more'){albumLimit+=20;renderAlbums();}
  if(action==='pool-add-series'){
   if(!poolSeries){message('Choisis un anime avant d’ajouter ses personnages.',true);return;}
   const ids=new Set(draft.weeklyBooster.cardIds),add=cards().filter(c=>c.series===poolSeries&&!ids.has(c.id));
   if(ids.size+add.length>500){message('Cette sélection dépasserait 500 personnages. Retire quelques cartes ou ajoute-les une par une.',true);return;}
   add.forEach(c=>ids.add(c.id));draft.weeklyBooster.cardIds=[...ids];markDirty();renderPool();
  }
  if(action==='pool-clear')openConfirm('clear-pool');
 }
 function openConfirm(kind,target){
  if(!current()||busy)return;lastFocus=document.activeElement;confirmState={kind,target,owner,epoch};
  if(kind==='publish'){
   if(!preview?.hash||dirty)return;
   const existing=pendingPublish?.revision===record.revision&&pendingPublish?.previewHash===preview.hash?pendingPublish:null;
   confirmState.payload=existing||{revision:record.revision,expectedVersion:record.publishedVersion,requestId:crypto.randomUUID(),previewHash:preview.hash};
  }
  if(!dialog){dialog=document.createElement('dialog');dialog.id='knxaConfirm';dialog.className='knxa-dialog';dialog.setAttribute('aria-labelledby','knxaConfirmTitle');document.body.append(dialog);dialog.addEventListener('cancel',e=>{e.preventDefault();closeConfirm();});dialog.addEventListener('click',e=>{if(e.target.closest('[data-knxa-cancel]'))closeConfirm();if(e.target.closest('[data-knxa-confirm]'))confirmAction();});dialog.addEventListener('close',()=>{confirmState=null;});}
  const titles={publish:'Publier cette configuration ?',restore:'Reprendre cette version ?',discard:'Recharger le brouillon ?', 'clear-pool':'Vider la sélection du coffret ?'};
  const text={publish:'Les nouvelles règles s’appliqueront aux prochains achats et gains. Les achats existants, les stocks et les récompenses déjà récupérées restent conservés.',restore:'La version '+target+' devient un nouveau brouillon. Le site public ne changera qu’après validation et publication.',discard:'Tes modifications non enregistrées seront remplacées par le brouillon du serveur.','clear-pool':'Les cartes seront retirées de ce brouillon. La sélection publiée restera active jusqu’à une publication valide.'};
  dialog.innerHTML='<span class="knxa-kicker">NEXUS · CONFIRMATION</span><h2 id="knxaConfirmTitle">'+titles[kind]+'</h2><p>'+esc(text[kind])+'</p>'+(kind==='publish'?'<p class="knxa-confirm-version">Version '+record.publishedVersion+' → '+(record.publishedVersion+1)+' · '+preview.changes.length+' changement(s) validé(s)</p>':'')+'<div class="knxa-actions"><button type="button" class="ks-button ks-secondary" data-knxa-cancel>Annuler</button><button type="button" class="ks-button" data-knxa-confirm>'+(kind==='publish'?'Publier les changements':kind==='restore'?'Préparer le brouillon':kind==='discard'?'Recharger':'Vider le brouillon')+'</button></div>';
  dialog.showModal();dialog.querySelector('[data-knxa-cancel]').focus({preventScroll:true});
 }
 function closeConfirm(focus=true){if(dialog?.open)dialog.close();confirmState=null;if(focus&&lastFocus?.isConnected)lastFocus.focus({preventScroll:true});lastFocus=null;}
 async function confirmAction(){const c=confirmState;if(!c||c.owner!==owner||c.epoch!==epoch||!current()||busy){closeConfirm(false);return;}closeConfirm();if(c.kind==='publish'){pendingPublish=clone(c.payload);await request('publish',c.payload);}if(c.kind==='restore')await request('restore',{revision:record.revision,targetVersion:c.target});if(c.kind==='discard')await request('get');if(c.kind==='clear-pool'){draft.weeklyBooster.cardIds=[];markDirty();renderPool();}}
 const inputField=(scope,key,label,value,{min=0,max=100000,step=1,id='',index,unit='',type='number',length=80,rowId=''}={})=>'<label>'+esc(label)+'<span class="knxa-field"><input id="'+esc(id||'knxa-'+scope+'-'+key+(index===undefined?'':'-'+index)+(rowId?'-'+rowId.replace(/[^a-z0-9]/gi,'_'):''))+'" data-knxa-scope="'+scope+'" data-knxa-field="'+key+'" '+(index===undefined?'':'data-knxa-index="'+index+'" ')+(rowId?'data-knxa-id="'+esc(rowId)+'" ':'')+'type="'+type+'" '+(type==='number'?'min="'+min+'" max="'+max+'" step="'+step+'" inputmode="decimal"':'maxlength="'+length+'"')+' value="'+esc(value)+'" required>'+(unit?'<small>'+esc(unit)+'</small>':'')+'</span></label>';
 const checkField=(scope,key,label,checked,rowId='')=>'<label class="knxa-check"><input type="checkbox" data-knxa-scope="'+scope+'" data-knxa-field="'+key+'" '+(rowId?'data-knxa-id="'+esc(rowId)+'" ':'')+(checked?'checked':'')+'> '+esc(label)+'</label>';
 function render(){
  if(!panel||!record||!draft)return;
  $('knxaWorkspace').innerHTML='<form id="knxaForm"><div class="knxa-toolbar"><p id="knxaDraftState"></p><div class="knxa-actions"><button type="submit" class="ks-button ks-secondary" id="knxaSave">Enregistrer le brouillon</button><button type="button" class="ks-button ks-secondary" id="knxaPreview" data-knxa="preview">Valider & comparer</button><button type="button" class="ks-button" id="knxaPublish" data-knxa="publish">Publier…</button></div></div><nav class="knxa-sections" aria-label="Configuration du Nexus">'+sections.map(([id,label])=>'<button type="button" data-knxa-section="'+id+'" aria-pressed="'+(section===id)+'">'+label+'</button>').join('')+'</nav><div data-knxa-view="overview"><div id="knxaStats"></div><div class="knxa-overview"><section class="knxa-surface"><span class="knxa-kicker">EFFETS AU RANG MAXIMAL</span><h3>Le brouillon en un regard</h3><div id="knxaTotals" class="knxa-totals"></div><p class="knxa-note">Les rangs et prérequis restent nécessaires. Les bonus s’additionnent par branche ; ils ne modifient ni les raretés ni les probabilités.</p></section><section class="knxa-surface"><span class="knxa-kicker">AVANT PUBLICATION</span><h3>Comparer les versions</h3><div id="knxaComparison"></div></section></div></div><section data-knxa-view="nodes"><div class="knxa-node-layout"><nav id="knxaNodeList" class="knxa-node-list" aria-label="Les 25 améliorations" data-knxa-scroll></nav><div id="knxaNodeEditor"></div></div></section><section data-knxa-view="economy"><h3>Bonus et limites</h3><p class="knxa-note">Les quantités indiquées par rang s’ajoutent. Les montants quotidiens et hebdomadaires se renouvellent à minuit, heure de Paris ; la semaine commence le lundi.</p><div id="knxaEconomy" class="knxa-settings-grid"></div></section><section data-knxa-view="weekly"><div class="knxa-weekly-head"><div><h3>Composer le Coffret Nexus</h3><p>Ce coffret se récupère uniquement dans le Nexus. Chaque ouverture donne cinq cartes avec les probabilités et garanties Kizuna.</p></div>'+checkField('weekly','enabled','Coffret disponible',draft.weeklyBooster.enabled)+'</div><div class="knxa-pair">'+inputField('weekly','name','Nom du coffret',draft.weeklyBooster.name,{type:'text',length:60})+'<label>Description<textarea data-knxa-scope="weekly" data-knxa-field="description" maxlength="300" rows="2">'+esc(draft.weeklyBooster.description)+'</textarea></label></div><div class="knxa-pool-tools"><label>Personnage<input id="knxaPoolQuery" type="search" placeholder="Rechercher un personnage" value="'+esc(poolQuery)+'"></label><label>Anime<select id="knxaPoolSeries"><option value="">Tous les animes</option>'+[...new Set(cards().map(c=>c.series))].sort((a,b)=>a.localeCompare(b,'fr')).map(s=>'<option value="'+esc(s)+'" '+(poolSeries===s?'selected':'')+'>'+esc(s)+'</option>').join('')+'</select></label><label class="knxa-check"><input type="checkbox" id="knxaPoolSelected" '+(poolSelected?'checked':'')+'> Voir la sélection</label><button type="button" class="ks-button ks-secondary" data-knxa="pool-add-series">Ajouter cet anime</button></div><div id="knxaPoolSummary" aria-live="polite"></div><div id="knxaCardPool" class="knxa-card-pool" data-knxa-scroll></div><div class="knxa-actions"><button type="button" class="ks-button ks-secondary" data-knxa="pool-more" id="knxaPoolMore">Afficher plus</button><button type="button" class="knxa-link" data-knxa="pool-clear">Vider le brouillon</button></div></section><section data-knxa-view="rewards"><h3>Auras permanentes</h3><p class="knxa-note">Les achats existants restent acquis. Désactiver une aura ferme ses prochains achats et conserve les équipements déjà obtenus.</p><div id="knxaCosmetics" class="knxa-cosmetics"></div><h3>Récompenses d’albums</h3><p class="knxa-note">Les cartes requises de chaque album restent fixes. Modifier le montant ne permet pas de récupérer à nouveau une récompense déjà reçue.</p><label>Filtrer les albums<input type="search" id="knxaAlbumQuery" placeholder="Bleach, Naruto…" value="'+esc(albumQuery)+'"></label><div id="knxaAlbums" class="knxa-albums"></div><button type="button" id="knxaAlbumMore" class="ks-button ks-secondary" data-knxa="album-more">Afficher plus d’albums</button></section><section data-knxa-view="history"><h3>Versions et activité</h3><p class="knxa-note">Reprendre une version crée un nouveau brouillon. Une restauration ne retire aucun achat, stock, gain ou progression.</p><div id="knxaHistory"></div></section></form>';
  renderStats();renderNodeList();renderNodeEditor();renderEconomy();renderPool();renderCosmetics();renderAlbums();renderHistory();renderComparison();updateTotals();showSection();controls();
 }
 function showSection(){panel?.querySelectorAll('[data-knxa-view]').forEach(el=>el.hidden=el.dataset.knxaView!==section);panel?.querySelectorAll('[data-knxa-section]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.knxaSection===section)));}
 function renderNodeList(){const el=$('knxaNodeList');if(!el||!draft)return;const top=el.scrollTop;el.innerHTML=branches.map(([id,label,color])=>'<div class="knxa-branch" style="--branch:'+color+'"><h4>'+label+'</h4>'+draft.nodes.filter(n=>n.id.startsWith(id+'_')).map(n=>'<button id="knxaSelect-'+esc(n.id)+'" type="button" data-knxa-node="'+esc(n.id)+'" aria-pressed="'+(n.id===selectedNode)+'"><span>'+esc(n.id.split('_').at(-1))+'</span><b>'+esc(n.name)+'</b><small>'+(!n.enabled?'En pause':number(n.cost)+' Chakra')+'</small></button>').join('')+'</div>').join('');el.scrollTop=top;}
 function renderNodeEditor(){const el=$('knxaNodeEditor'),n=draft?.nodes.find(n=>n.id===selectedNode);if(!el||!n)return;const branch=branches.find(b=>n.id.startsWith(b[0]+'_')),tier=Number(n.id.split('_').at(-1)),previous=branch[0]+'_'+(tier-1);el.innerHTML='<section class="knxa-surface knxa-node-detail" style="--branch:'+branch[2]+'"><span class="knxa-kicker">'+branch[1]+' · RANG '+tier+'</span><h3>'+esc(n.name)+'</h3>'+inputField('node','name','Nom du nœud',n.name,{type:'text',length:80,id:'knxaNodeName'})+'<div class="knxa-pair">'+inputField('node','cost','Coût',n.cost,{min:1,max:record.bounds?.nodeCost?.[1]||1000000000,unit:'Chakra',id:'knxaNodeCost'})+inputField('node','requiredLevel','Niveau Nexus requis',n.requiredLevel,{min:1,max:record.bounds?.nodeLevel?.[1]||10000,unit:'niveau',id:'knxaNodeLevel'})+'</div>'+checkField('node','enabled','Disponible aux prochains achats',n.enabled)+'<p class="knxa-note">Un achat existant reste acquis si ce nœud est mis en pause. Son effet est calculé à partir des bonus configurés.</p><fieldset class="knxa-prerequisites"><legend>Prérequis à posséder</legend><p>Le rang précédent est obligatoire. Tu peux ajouter des prérequis entre les branches ; le serveur vérifie les niveaux et l’absence de boucle.</p>'+branches.map(([id,label])=>'<details '+(id===branch[0]?'open':'')+'><summary>'+label+'</summary>'+draft.nodes.filter(x=>x.id!==n.id&&x.id.startsWith(id+'_')).map(x=>'<label class="knxa-check"><input type="checkbox" data-knxa-prerequisite value="'+esc(x.id)+'" '+(n.prerequisites.includes(x.id)?'checked ':'')+(x.id===previous?'data-knxa-fixed disabled':'')+'> '+esc(x.name)+' <small>· '+x.id.split('_').at(-1)+(x.id===previous?' · requis':'')+'</small></label>').join('')+'</details>').join('')+'</fieldset></section>';controls();}
 function renderEconomy(){const e=draft.economy;const arrays=arrayFields.map(([key,label,ranks,branch,max,step,unit])=>'<fieldset class="knxa-surface"><legend>'+label+'</legend><div class="knxa-setting-fields">'+ranks.map((rank,i)=>inputField('economy',key,branch+' '+rank,display(key,e[key][i]),{max,step,index:i,unit})).join('')+'</div><small>Maximum cumulé : '+max+' '+unit+'.</small></fieldset>').join('');$('knxaEconomy').innerHTML=arrays+'<fieldset class="knxa-surface knxa-global-settings"><legend>Récompenses et plafonds</legend><div class="knxa-setting-fields">'+scalarFields.map(([key,label,unit,min,max,step])=>inputField('economy',key,label,display(key,e[key]),{min,max,step,unit})).join('')+'</div><p class="knxa-note">Un plafond de réserve abaissé conserve les packs déjà en stock et suspend leur recharge jusqu’à repasser sous la nouvelle limite.</p></fieldset>';}
 function updateTotals(){const el=$('knxaTotals');if(!el||!draft)return;const e=draft.economy,sum=k=>e[k].reduce((a,b)=>a+Number(b||0),0),capacity=preview?.summary?.freeCapacity??10+sum('storageBonuses');el.innerHTML=[['Packs / jour',sum('dailyBoosters')],['Capacité de réserve',capacity],['Priorités',sum('priorityBonuses')],['Recyclage',Math.min(e.recycleCapBps,sum('recycleBonuses'))/100+' %'],['Coffrets / semaine',e.weeklyAdvanced],['Chakra / jour',e.prestigeDailyChakra]].map(([k,v])=>'<div><span>'+k+'</span><strong>'+esc(v)+'</strong></div>').join('');}
 function filteredCards(){const selected=new Set(draft?.weeklyBooster.cardIds||[]),q=poolQuery.toLocaleLowerCase('fr');return cards().filter(c=>(!poolSeries||c.series===poolSeries)&&(!poolSelected||selected.has(c.id))&&(c.name+' '+c.series).toLocaleLowerCase('fr').includes(q)).sort((a,b)=>a.name.localeCompare(b.name,'fr'));}
 function updatePoolSummary(){const selected=new Set(draft.weeklyBooster.cardIds),catalogue=cards(),counts=Object.fromEntries(rarities.map(r=>[r,0]));catalogue.forEach(c=>{if(selected.has(c.id)&&counts[c.rarity]!==undefined)counts[c.rarity]++;});$('knxaPoolSummary').innerHTML='<p><strong>'+selected.size+' / 500 personnages</strong> · Au moins un personnage de chacune des six raretés.</p><div class="knxa-rarities">'+rarities.map(r=>'<span class="'+(counts[r]?'':'is-missing')+'">'+esc(r)+' <b>'+counts[r]+'</b></span>').join('')+'</div>';}
 function renderPool(){const el=$('knxaCardPool');if(!el||!draft)return;const top=el.scrollTop,selected=new Set(draft.weeklyBooster.cardIds),rows=filteredCards();el.innerHTML=rows.slice(0,poolLimit).map(c=>'<label class="knxa-card-choice '+(selected.has(c.id)?'is-selected':'')+'"><input type="checkbox" data-knxa-card value="'+esc(c.id)+'" '+(selected.has(c.id)?'checked':'')+'><span><strong>'+esc(c.name)+'</strong><small>'+esc(c.series)+'</small><em>'+esc(c.rarity)+'</em></span></label>').join('')||'<p class="knxa-empty">Aucun personnage ne correspond à cette recherche.</p>';el.scrollTop=top;updatePoolSummary();controls();}
 function renderCosmetics(){$('knxaCosmetics').innerHTML=draft.cosmetics.map(c=>'<fieldset class="knxa-surface"><legend>'+esc(c.name)+'</legend>'+inputField('cosmetic','name','Nom de l’aura',c.name,{type:'text',rowId:c.id,length:80})+inputField('cosmetic','cost','Prix',c.cost,{min:1,max:100000,unit:'fragments',rowId:c.id})+checkField('cosmetic','enabled','Disponible à l’achat',c.enabled,c.id)+'</fieldset>').join('');}
 function filteredAlbums(){const q=albumQuery.toLocaleLowerCase('fr');return (draft?.albums||[]).filter(a=>a.name.toLocaleLowerCase('fr').includes(q)).sort((a,b)=>a.name.localeCompare(b.name,'fr'));}
 function renderAlbums(){const el=$('knxaAlbums');if(!el||!draft)return;el.innerHTML=filteredAlbums().slice(0,albumLimit).map(a=>'<fieldset class="knxa-surface knxa-album"><legend>'+esc(a.name)+'</legend>'+inputField('album','name','Nom de la récompense',a.name,{type:'text',rowId:a.id,length:120})+'<div class="knxa-pair">'+inputField('album','chakra','Récompense',a.chakra,{max:10000,unit:'Chakra',rowId:a.id})+inputField('album','packs','Boosters ordinaires',a.packs,{max:100,unit:'packs',rowId:a.id})+'</div>'+checkField('album','enabled','Récompense disponible',a.enabled,a.id)+'</fieldset>').join('')||'<p class="knxa-empty">Aucun album trouvé.</p>';controls();}
 function renderStats(){const s=record.stats||{},labels=[['players','Joueurs avec un Nexus'],['unlocks','Améliorations acquises'],['chakraSpent','Chakra investis'],['activePlayers30d','Joueurs actifs · 30 jours']];$('knxaStats').innerHTML='<div class="knxa-stats">'+labels.map(([k,label])=>'<article><span>'+label+'</span><strong>'+number(s[k])+'</strong></article>').join('')+'</div><p class="knxa-note">Activité enregistrée sur le serveur · '+date(s.generatedAt||record.serverNow)+'</p><details class="knxa-stat-details"><summary>Récompenses et progression par branche</summary><div class="knxa-stat-claims">'+[['dailyClaims','Récupérations quotidiennes'],['weeklyClaims','Récupérations hebdomadaires'],['albumClaims','Albums récompensés'],['fragmentsAwarded','Fragments accordés'],['cosmeticsPurchased','Auras achetées']].map(([k,label])=>'<span>'+label+' <b>'+number(s[k])+'</b></span>').join('')+'</div><div class="knxa-stat-table"><table><thead><tr><th>Branche</th><th>Achats</th><th>Branches complétées</th><th>Chakra investis</th></tr></thead><tbody>'+(s.branches||[]).map(b=>'<tr><th scope="row">'+esc(branches.find(x=>x[0]===b.id)?.[1]||b.id)+'</th><td>'+number(b.unlocks)+'</td><td>'+number(b.completedPlayers)+'</td><td>'+number(b.chakraSpent)+'</td></tr>').join('')+'</tbody></table></div><p class="knxa-note">Gains Nexus enregistrés : '+number(s.granted?.chakra)+' Chakra · '+number(s.granted?.packs)+' packs ordinaires · '+number(s.granted?.weeklyPacks)+' coffrets.</p></details>';}
 function renderHistory(){const history=record.history||[];$('knxaHistory').innerHTML=history.length?'<div class="knxa-history">'+history.map(h=>{const version=h.version??h.publishedVersion,revision=h.revision,action={initial:'Configuration initiale',save:'Brouillon enregistré',publish:'Version publiée',restore:'Version reprise'}[h.action]||'Configuration';return '<article><div><strong>'+esc(action)+(version?' · v'+number(version):'')+'</strong><span>'+date(h.createdAt||h.created_at)+(revision?' · brouillon '+number(revision):'')+'</span></div>'+(Number.isSafeInteger(Number(version))&&Number(version)>0&&['publish','initial'].includes(h.action)?'<button type="button" class="ks-button ks-secondary" data-knxa="restore" data-version="'+Number(version)+'">Reprendre en brouillon</button>':'')+'</article>';}).join('')+'</div>':'<p class="knxa-empty">L’historique apparaîtra après les premières modifications.</p>';}
 const pathLabel=path=>{const parts=String(path).split('.'),group=parts[0],key=parts.at(-1),id=parts.slice(1,-1).join('.');if(group==='economy')return [...arrayFields,...scalarFields].find(f=>f[0]===key)?.[1]||'Bonus';const field={name:'Nom',cost:'Prix',requiredLevel:'Niveau requis',prerequisites:'Prérequis',enabled:'Disponibilité',description:'Description',cardIds:'Personnages',chakra:'Chakra',packs:'Boosters'}[key]||'Paramètre';const items={nodes:draft.nodes,albums:draft.albums,cosmetics:draft.cosmetics};return (group==='weeklyBooster'?'Coffret':items[group]?.find(n=>n.id===id)?.name||'Configuration')+' · '+field;};
 const valueLabel=(value,path='')=>{const key=String(path).split('.').at(-1);if(value===null||value===undefined)return '—';if(typeof value==='boolean')return value?'Activé':'Désactivé';if(Array.isArray(value)){if(key==='prerequisites')return value.length?value.map(id=>draft.nodes.find(n=>n.id===id)?.name||id).join(', '):'Aucun';if(key==='recycleBonuses')return value.map(v=>number(v/100)+' %').join(' + ');return value.join(' + ');}if(isBps(key))return number(value/100)+' %';return typeof value==='number'?number(value):typeof value==='object'?JSON.stringify(value):String(value);};
 function changeMarkup(c){if(c.path==='weeklyBooster.cardIds'){const before=new Set(c.before||[]),after=new Set(c.after||[]),catalogue=new Map(cards().map(c=>[c.id,c])),names=ids=>ids.map(id=>{const c=catalogue.get(id);return c?c.name+' · '+c.series:id;}).join(', '),added=[...after].filter(id=>!before.has(id)),removed=[...before].filter(id=>!after.has(id));return '<article><strong>Personnages du coffret · '+before.size+' → '+after.size+'</strong><details><summary>'+added.length+' ajout(s) · '+removed.length+' retrait(s)</summary><p>Ajoutés : '+esc(names(added)||'Aucun')+'</p><p>Retirés : '+esc(names(removed)||'Aucun')+'</p></details></article>';}return '<article><strong>'+esc(pathLabel(c.path))+'</strong><div><span>'+esc(valueLabel(c.before,c.path))+'</span><span aria-label="devient">→</span><b>'+esc(valueLabel(c.after,c.path))+'</b></div></article>';}
 function renderComparison(){const el=$('knxaComparison');if(!el)return;if(!preview){el.innerHTML='<p>Enregistre puis valide ce brouillon pour obtenir le comparatif serveur.</p>';return;}el.innerHTML='<p><strong>'+preview.changes.length+' changement(s)</strong> par rapport à la version '+record.publishedVersion+'.</p>'+(preview.warnings||[]).map(w=>'<p class="knxa-warning">'+esc(typeof w==='string'?w:w.message)+'</p>').join('')+(preview.changes.length?'<div class="knxa-diff" data-knxa-scroll id="knxaDiff">'+preview.changes.map(changeMarkup).join('')+'</div>':'<p>Le brouillon et la version publiée sont identiques.</p>');}
 function queueMount(){if(observerQueued)return;observerQueued=true;queueMicrotask(()=>{observerQueued=false;mount();});}
 if(document.querySelector('main'))new MutationObserver(queueMount).observe(document.querySelector('main'),{childList:true,subtree:true});
 document.addEventListener('kizuna:account-change',mount);
 window.KizunaNexusAdmin={mount,refresh:()=>request('get'),getSnapshot:()=>({owner,loaded:!!record,busy,dirty,section,record:record?clone(record):null,draft:draft?clone(draft):null,preview:preview?clone(preview):null})};
 mount();
})();
