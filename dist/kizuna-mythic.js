/* Mythic progression is read from authoritative booster transactions. */
(() => {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),clone=x=>JSON.parse(JSON.stringify(x));
 const titles=['Originale','Révélation','Ascension','Transcendance'];
 let progress={},rules={thresholds:[1,3,6],revision:1},owner='',epoch=0,loading=false,loaded=false,busy=false,error='',selected='',preview=0,lastRoute='',search='',universe='',filter='all',queued=false,root=null,animation=true;
 let pendingUnlock=null,unlockTimer=null,unlockVisible=false;
 try{animation=localStorage.getItem('kizuna_mythic_motion')!=='off';}catch{}
 const account=()=>window.KizunaAccount?.getSnapshot?.()||{},game=()=>window.KizunaGame?.getSnapshot?.()||{cards:[],owned:[]};
 const manifest=()=>window.KizunaMythicArt?.manifest||[],entry=id=>window.KizunaMythicArt?.get(id)||null;
 const cards=()=>game().cards.filter(c=>c.rarity==='Mythique'&&entry(c.id)).sort((a,b)=>a.series.localeCompare(b.series,'fr')||a.name.localeCompare(b.name,'fr'));
 const card=id=>game().cards.find(c=>c.id===id),state=id=>!account().loading&&owner===(account().user?.id||'guest')?(progress[id]||{resonance:0,unlocked:0,selected:0}):{resonance:0,unlocked:0,selected:0};
 const motion=()=>animation&&window.KizunaExperience?.reduced?.()!==true&&document.documentElement.dataset.kzMotion!=='reduced'&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 function clearUnlock(){clearTimeout(unlockTimer);unlockTimer=null;pendingUnlock=null;unlockVisible=false;}
 function rememberUnlock(previous,next,key){
  const changes=Object.entries(next||{}).filter(([id,p])=>card(id)?.rarity==='Mythique'&&Number(p.unlocked)>Number(previous[id]?.unlocked||0));
  if(!changes.length)return;
  const [id,p]=changes.sort((a,b)=>Number(b[1].unlocked)-Number(a[1].unlocked))[0];
  clearUnlock();pendingUnlock={owner:key,id,level:Math.min(Number(p.unlocked),entry(id)?.levels.length||3),count:changes.length,at:Date.now()};
 }
 function unlockMarkup(){
  if(!pendingUnlock||pendingUnlock.owner!==owner||owner!==(account().user?.id||'guest')||Date.now()-pendingUnlock.at>90000)return '';
  if(!unlockVisible){unlockVisible=true;const key=owner;unlockTimer=setTimeout(()=>{if(owner===key){clearUnlock();render();}},5500);}
  const c=card(pendingUnlock.id);return '<div class="kaw-unlock" data-kaw-unlock="'+esc(pendingUnlock.id)+'" data-kaw-animate="'+motion()+'" role="status"><i aria-hidden="true">✺</i><span><small>NOUVEL ÉVEIL DÉBLOQUÉ</small><strong>'+esc(c?.name||'Mythique')+' · '+esc(titles[pendingUnlock.level])+'</strong>'+(pendingUnlock.count>1?'<em>'+pendingUnlock.count+' personnages ont franchi un palier.</em>':'')+'</span></div>';
 }
 function emit(){window.dispatchEvent(new CustomEvent('kizuna:mythic-change'));schedule();}
 async function refresh(force=false){
  const a=account(),key=a.user?.id||'guest';if(a.loading)return;if(loading&&!force)return;
  const token=++epoch,previous=loaded&&owner===key&&a.user?clone(progress):null;owner=key;loading=true;error='';render();
  try{let result;if(a.user)result=await window.KizunaAccount.mythicRequest('get');else{const c=window.KIZUNA_CONFIG;result={progress:{},rules};if(c?.supabaseUrl&&c?.supabaseKey){const r=await fetch(c.supabaseUrl+'/rest/v1/kizuna_mythic_rules?select=thresholds,revision,activated_at&limit=1',{headers:{apikey:c.supabaseKey},credentials:'omit',cache:'no-store'});if(!r.ok)throw Error('Les seuils ne sont pas disponibles pour le moment.');const rows=await r.json();result.rules=rows[0]||rules;}}if(token!==epoch||key!==(account().user?.id||'guest'))return;progress=result.progress||{};rules=result.rules||rules;if(previous)rememberUnlock(previous,progress,key);loaded=true;}
  catch(e){if(token===epoch)error=e.publicMessage||e.message||'Progression indisponible.';}
  finally{if(token===epoch){loading=false;emit();render();}}
 }
 function sync(){const a=account(),key=a.user?.id||'guest';if(key!==owner||a.loading){epoch++;owner=key;progress={};loaded=false;loading=false;busy=false;error='';preview=0;clearUnlock();emit();render();}if(!a.loading&&!loaded&&!loading)refresh();}
 async function choose(id,level){if(busy||loading||account().loading||!account().user)return;const token=epoch,key=owner;busy=true;error='';render();
  try{const result=await window.KizunaAccount.mythicRequest('select',{id,level});if(token!==epoch||key!==owner)return;progress=result.progress;rules=result.rules;preview=level;emit();window.KizunaGame?.notify?.(level?'Présentation « '+titles[level]+' » sélectionnée.':'Présentation originale restaurée.');}
  catch(e){if(token===epoch)error=e.publicMessage||e.message;}
  finally{if(token===epoch){busy=false;render();}}
 }
 function renderInto(target,id=''){root=target;if(id!==lastRoute){lastRoute=id;if(id&&card(id)?.rarity==='Mythique'){selected=id;preview=state(id).selected;}}render();}
 let selectorVersion='';
 function updateWorkshop(markup,version){
  const selector=root.querySelector('.km-selector'),stage=root.querySelector('.km-stage'),intro=root.querySelector('.km-intro');
  if(!selector||!stage||!intro){root.innerHTML=markup;selectorVersion=version;return;}
  const position={x:window.scrollX,y:window.scrollY,list:selector.querySelector('.km-card-list')?.scrollTop||0};
  const focused=root.contains(document.activeElement)?document.activeElement:null;
  const focusKey=focused?['kmSelect','kmPreviewLevel','kmEquip','kmRefresh'].find(key=>Object.hasOwn(focused.dataset,key)):null;
  const focusValue=focusKey?focused.dataset[focusKey]:null,focusId=focused?.id;
  const next=document.createElement('template');next.innerHTML=markup;
  const replaceContent=(current,replacement)=>{if(current.innerHTML!==replacement.innerHTML)current.innerHTML=replacement.innerHTML;};
  replaceContent(intro,next.content.querySelector('.km-intro'));
  // Selection and preview changes keep the original scroll container and buttons.
  if(selectorVersion!==version){replaceContent(selector,next.content.querySelector('.km-selector'));selectorVersion=version;}
  selector.querySelectorAll('[data-km-select]').forEach(button=>{const active=button.dataset.kmSelect===selected;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  replaceContent(stage,next.content.querySelector('.km-stage'));
  for(const name of ['data-kaw-level','data-kaw-locked','data-kaw-motion','style'])stage.setAttribute(name,next.content.querySelector('.km-stage').getAttribute(name)||'');
  if(focused&&!focused.isConnected){
   const replacement=focusId?document.getElementById(focusId):focusKey?[...root.querySelectorAll('button')].find(button=>button.dataset[focusKey]===focusValue):null;
   if(replacement&&!replacement.disabled)replacement.focus({preventScroll:true});
  }
  const list=selector.querySelector('.km-card-list');if(list)list.scrollTop=position.list;
  if(window.scrollX!==position.x||window.scrollY!==position.y)window.scrollTo({left:position.x,top:position.y,behavior:'instant'});
 }
 function illustrationCredit(e,level){const art=e.levels[level-1]?.illustration;if(!art)return '';const url=/^https:\/\//.test(art.source||'')?art.source:'';return '<details class="km-art-credit"><summary>'+esc(art.kind==='generated'?'Illustration Kizuna · créée avec l’IA':art.label)+'</summary><p>'+esc(art.form||art.credit)+'</p>'+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Voir la source officielle ↗</a><small>'+esc(art.credit)+'</small>':'<p>Composition originale créée pour cet Éveil. Le portrait initial reste disponible dans « Originale ».</p>')+'</details>';}
 function render(){if(!root?.isConnected||!document.querySelector('#kaAdventureContent')?.contains(root)||document.body.dataset.tab!=='adventure'||!location.hash.includes('/awakening'))return;
  const list=cards(),have=new Set(game().owned.map(x=>x.id));if(!selected||!list.some(c=>c.id===selected)){selected=list.find(c=>have.has(c.id))?.id||list[0]?.id||'';preview=state(selected).selected;}
  const c=list.find(c=>c.id===selected);if(!c){root.innerHTML='<div class="ka-empty">Les compositions mythiques se préparent. Recharge le catalogue.</div>';return;}
  const p=state(c.id),e=entry(c.id),max=e.levels.length,active=Math.min(preview,max),locked=active>p.unlocked,threshold=rules.thresholds[Math.min(p.unlocked,max-1)],ratio=p.unlocked>=max?100:Math.min(100,p.resonance/threshold*100),visible=list.filter(c=>(!universe||c.series===universe)&&(!search||(c.name+' '+c.series).toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr')))).slice(0,60);
  const color=/^#[0-9a-f]{6}$/i.test(e.colors?.[0]||'')?e.colors[0]:'#ff8a9c',accent=/^#[0-9a-f]{6}$/i.test(e.colors?.[1]||'')?e.colors[1]:'#ffe0a7';
  const markup=`<div class="km-intro"><div><span class="km-kicker">L’ÉVEIL DES MYTHIQUES</span><h2>Révèle l’autre lumière.</h2><p>Un personnage. Plusieurs incarnations. Chaque Résonance rapproche le prochain Éveil.</p></div><label class="km-motion"><input type="checkbox" id="kmMotion" ${animation?'checked':''}> Animations d’Éveil</label>${unlockMarkup()}</div>
   <div class="km-atlas"><aside class="km-selector"><div class="kaw-atlas-label"><span aria-hidden="true">✦</span><strong>Tes liens mythiques</strong></div><label>Personnage<input id="kmSearch" type="search" value="${esc(search)}" placeholder="Naruto, Frieren…"></label><label>Univers<select id="kmUniverse"><option value="">Tous les univers</option>${[...new Set(list.map(c=>c.series))].map(s=>`<option ${s===universe?'selected':''}>${esc(s)}</option>`).join('')}</select></label><p>${list.length} Mythiques · ${visible.length} résultats affichés</p><div class="km-card-list">${visible.map(x=>`<button type="button" data-km-select="${esc(x.id)}" aria-pressed="${x.id===c.id}" class="${x.id===c.id?'active':''}"><img src="${esc(x.image)}" alt="" loading="lazy"><span><strong>${esc(x.name)}</strong><small>${esc(x.series)}</small><em>${state(x.id).resonance} Résonance${state(x.id).resonance>1?'s':''}</em></span><b title="${have.has(x.id)?'Dans ta collection':'À découvrir'}" aria-label="${have.has(x.id)?'Dans ta collection':'À découvrir'}">${have.has(x.id)?'◆':'◇'}</b></button>`).join('')||'<p>Aucun personnage trouvé.</p>'}</div></aside>
   <section class="km-stage" data-kaw-level="${active}" data-kaw-locked="${locked}" data-kaw-motion="${motion()}" style="--kaw-primary:${color};--kaw-secondary:${accent}"><header><div><span class="km-kicker">${esc(c.series)} · MYTHIQUE</span><h2>${esc(c.name)}</h2><span class="kaw-ownership ${have.has(c.id)?'is-owned':''}">${have.has(c.id)?'◆ Dans ta collection':'◇ À découvrir'}</span></div><span class="km-progress-seal"><strong>${p.unlocked}</strong><i>/ ${max}</i><small>ÉVEILS</small></span></header>
    <div class="kaw-workshop"><div class="kaw-altar"><div class="kaw-orbits" aria-hidden="true"><i></i><i></i><i></i><b>絆</b></div><div class="km-composition" data-km-preview="${active}" data-knx-prestige="${nexusPrestige()&&p.unlocked>=max&&active===max}">${window.KizunaMythicArt.render(c,active,{compact:false,animate:motion()})}<span class="km-preview-label">${active?'APERÇU · ÉVEIL '+active:'CARTE ORIGINALE'}</span></div><div class="kaw-plinth" aria-hidden="true"><i></i><span>MYTHIQUE · ${esc(titles[active])}</span></div>${illustrationCredit(e,active)}</div>
    <div class="kaw-inscription"><div class="kaw-current-form"><span class="kaw-step-label">${active?'INCARNATION 0'+active:'PORTRAIT ORIGINEL'}</span><span class="kaw-form-state ${locked?'is-locked':''}">${locked?'Aperçu verrouillé':active===p.selected?'Présentation équipée':'Présentation disponible'}</span></div><div class="km-stage-caption"><h3>${esc(active?e.levels[active-1].name:'La rencontre originelle')}</h3><p>${esc(active?(locked?'Découvre cette illustration. '+rules.thresholds[active-1]+' Résonances sont nécessaires pour la choisir.':'Cette illustration est débloquée. Choisis-la pour présenter ta carte.'):'Le portrait de ta première rencontre. Explore les étapes ci-dessous pour découvrir les transformations.')}</p></div>
     <div class="km-levels" role="group" aria-label="Aperçus des Éveils">${[0,...e.levels.map(l=>l.level)].map(l=>`<button type="button" data-km-preview-level="${l}" aria-pressed="${l===active}" class="${l===active?'active':''} ${l>p.unlocked?'is-locked':'is-unlocked'}" aria-label="Aperçu ${esc(titles[l])} · ${l===0?'portrait original':l<=p.unlocked?'débloqué':rules.thresholds[l-1]+' Résonances nécessaires'}"><span class="kaw-tier-image" aria-hidden="true">${window.KizunaMythicArt.render(c,l,{compact:true,animate:false})}</span><b>${l?'0'+l:'◇'}</b><span>${titles[l]}</span><small>${l===0?'Originale':l<=p.unlocked?'Débloqué':rules.thresholds[l-1]+' Résonances'}</small>${l===p.selected?'<i class="kaw-equipped" aria-hidden="true">◆</i>':''}</button>`).join('')}</div>
     <div class="km-resonance"><span>✧ <strong>${p.resonance}</strong> Résonance${p.resonance>1?'s':''}</span><span>${p.unlocked>=max?'Tous les Éveils débloqués':p.resonance+' / '+threshold+' · prochain Éveil'}</span><div role="progressbar" aria-label="Résonance vers le prochain Éveil" aria-valuemin="0" aria-valuemax="${p.unlocked>=max?Math.max(1,p.resonance):threshold}" aria-valuenow="${p.unlocked>=max?p.resonance:Math.min(p.resonance,threshold)}"><i style="width:${ratio}%"></i></div></div>
     <div class="km-actions"><button type="button" class="soft-btn primary" data-km-equip="${active}" ${locked||busy||loading||!account().user||account().loading?'disabled':''}>${locked?'Transformation verrouillée':active===p.selected?'Présentation sélectionnée':active?'Choisir cet Éveil':'Revenir à l’originale'}</button><button class="soft-btn" type="button" data-km-refresh aria-label="Actualiser la progression des Éveils">↻ Actualiser</button></div><p class="km-state ${error?'is-error':''}" role="status">${esc(error|| (loading||account().loading?'Chargement de ta progression…':!account().user?'Connecte-toi avec Discord pour gagner et conserver tes Résonances.':busy?'Enregistrement…':p.legacy?'Un ancien Éveil a été conservé.':locked?'Cette transformation reste consultable. Son équipement se débloque par la Résonance.':'Ton Éveil est un choix visuel. Aucun exemplaire ni Chakra n’est consommé.'))}</p>
     <details class="kaw-rules"><summary>Comment progresser ?</summary><p class="km-note">Les doublons Mythiques obtenus dans les boosters créent une Résonance. Les achats et échanges ne donnent aucune Résonance. Tes exemplaires et tes Éveils restent acquis, même après une vente, un échange ou un recyclage. Le portrait original et les illustrations des Éveils restent sélectionnables séparément.</p></details>
    </div></div></section></div>`;
  updateWorkshop(markup,JSON.stringify([search,universe,list.map(x=>[x.id,x.name,x.series,x.image,state(x.id).resonance,have.has(x.id)])]));
 }
 function matches(c,value=filter){if(value==='all')return true;if(c.rarity!=='Mythique')return false;const p=state(c.id),n=entry(c.id)?.levels.length||3;return value==='complete'?p.unlocked>=n:Number(value)===p.unlocked;}
 function nexusPrestige(){const n=window.KizunaNexus?.getSnapshot?.();return n?.owner===account().user?.id&&n?.loaded&&n.state?.bonuses?.mythicPrestige===true;}
 function badge(c){if(c.rarity!=='Mythique')return '';const p=state(c.id);return `<span class="kz-col-badge km-badge" aria-label="${p.resonance} Résonances, ${p.unlocked} Éveils débloqués">✧ ${p.resonance} · ${p.unlocked?'Éveil '+p.unlocked:'Sans Éveil'}</span>`;}
 function decorate(){
  document.documentElement.dataset.kmMotion=animation?'on':'off';
  const host=document.querySelector('.col-filters');if(host&&!document.getElementById('kmCollectionFilter')){const label=document.createElement('label');label.innerHTML='Éveil mythique <select class="select-input" id="kmCollectionFilter"><option value="all">Tous</option><option value="0">Mythiques sans Éveil</option><option value="1">Éveil I débloqué</option><option value="2">Éveil II débloqué</option><option value="3">Éveil III débloqué</option><option value="complete">Entièrement éveillées</option></select>';host.append(label);label.querySelector('select').value=filter;}
  const catalogue=new Map(game().cards.map(c=>[c.id,c]));document.querySelectorAll('#collection .tcard,#detailBackdrop .tcard,#kyaraProfileOverlay .tcard,#profilePage .tcard,#profilePage .kp-showcase-card').forEach(n=>{const id=n.dataset.kzCardId||n.dataset.kpCard,c=catalogue.get(id),level=c?.rarity==='Mythique'?state(id).selected:0,art=n.querySelector('.ti,.kp-showcase-art');n.classList.toggle('knx-mythic-prestige',Boolean(c?.rarity==='Mythique'&&nexusPrestige()&&state(id).unlocked>=3&&level===3));if(!art)return;let overlay=art.querySelector('.km-card-art');if(!level||!entry(id)){overlay?.remove();art.classList.remove('has-km-art');return;}const sig=id+':'+level;if(overlay?.dataset.signature===sig)return;overlay?.remove();overlay=document.createElement('div');overlay.className='km-card-art';overlay.dataset.signature=sig;overlay.innerHTML=window.KizunaMythicArt.render(c,level,{compact:true,animate:false});art.append(overlay);art.classList.add('has-km-art');});
 }
 function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorate();});}
 document.addEventListener('click',e=>{const b=e.target.closest('[data-km-select],[data-km-preview-level],[data-km-equip],[data-km-refresh],[data-km-open]');if(!b||b.disabled)return;
  if(b.hasAttribute('data-km-select')){selected=b.dataset.kmSelect;preview=state(selected).selected;render();}
  else if(b.hasAttribute('data-km-preview-level')){preview=Number(b.dataset.kmPreviewLevel);render();}
  else if(b.hasAttribute('data-km-equip'))choose(selected,Number(b.dataset.kmEquip));
  else if(b.hasAttribute('data-km-refresh'))refresh(true);
  else if(b.hasAttribute('data-km-open')){window.KizunaGame?.closeCard?.();window.KizunaAdventure?.navigate('awakening',b.dataset.kmOpen);}
 });
 document.addEventListener('input',e=>{if(e.target.id!=='kmSearch')return;search=e.target.value;const pos=e.target.selectionStart;render();const input=document.getElementById('kmSearch');input?.focus({preventScroll:true});input?.setSelectionRange(pos,pos);});
 document.addEventListener('change',e=>{if(e.target.id==='kmUniverse'){universe=e.target.value;render();}if(e.target.id==='kmMotion'){animation=e.target.checked;try{localStorage.setItem('kizuna_mythic_motion',animation?'on':'off');}catch{}render();}if(e.target.id==='kmCollectionFilter'){filter=e.target.value;window.KizunaGame?.refreshCollection?.();}});
 document.addEventListener('kizuna:account-change',sync);window.addEventListener('kizuna:economy-change',()=>{if(account().user)refresh(true);});window.addEventListener('kizuna:game-change',schedule);window.addEventListener('kizuna:nexus-change',()=>{schedule();render();});window.addEventListener('focus',()=>{if(account().user&&!loading)refresh();});
 window.addEventListener('kizuna:preferences',render);
 new MutationObserver(schedule).observe(document.querySelector('main'),{childList:true,subtree:true});
 window.KizunaMythic={renderInto,refresh,state:id=>clone(state(id)),getSnapshot:()=>({progress:clone(progress),rules:clone(rules),loading,loaded,error,owner}),matches,badge,resetFilter:()=>{filter='all';if(document.getElementById('kmCollectionFilter'))document.getElementById('kmCollectionFilter').value='all';},open:id=>window.KizunaAdventure?.navigate('awakening',id),render};
 sync();schedule();
})();
