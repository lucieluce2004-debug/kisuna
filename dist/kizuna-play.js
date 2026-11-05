/* Presentation and optional synthesized feedback. Never writes a player snapshot. */
(() => {
 'use strict';
 const key='kizuna_reveal_preferences_v1', $=id=>document.getElementById(id);
 const media=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 let prefs;try{prefs=JSON.parse(localStorage.getItem(key)||'{}');}catch{prefs={};}
 prefs={quick:prefs.quick===true,sound:prefs.sound===true,reduce:prefs.reduce===true};
 let gesture=false,context,lastSound=0,tilted=null,tiltFrame=0,queued=false,owner=null,previousOwned=null,previousAlbums=null;
 const newCards=new Set(),newAt=new Map(),numbers=new Map();
 const reduced=()=>prefs.reduce||media?.matches===true;
 function updateSettings(){
  document.documentElement.dataset.kzMotion=reduced()?'reduced':'full';
  document.querySelectorAll('[data-kg-pref]').forEach(button=>{const name=button.dataset.kgPref;button.setAttribute('aria-pressed',String(prefs[name]));button.querySelector('b').textContent=prefs[name]?'Oui':'Non';});
 }
 function setPreference(name,value){if(!['quick','sound','reduce'].includes(name))return;prefs[name]=value===true;try{localStorage.setItem(key,JSON.stringify(prefs));}catch{}updateSettings();window.dispatchEvent(new CustomEvent('kizuna:preferences',{detail:{...prefs}}));}
 function sfx(kind='click',rarity=''){
  if(!gesture||!prefs.sound||document.hidden)return;
  const at=performance.now();if(at-lastSound<45)return;lastSound=at;
  try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;context||=new Audio();if(context.state==='suspended')context.resume();const t=context.currentTime;
   const notes=kind==='summon'?[130.81,196,261.63,392,523.25]:kind==='reward'||kind==='finale'?[523,659,784,1046]:kind==='tear'?[200,350,700]:rarity==='Mythique'?[392,587,784,1174]:rarity==='Légendaire'?[440,660,880]:kind==='card'?[660,880]:[520];
   notes.forEach((frequency,i)=>{const osc=context.createOscillator(),gain=context.createGain(),start=t+i*(kind==='summon'?.13:.065),duration=kind==='summon'?.28:kind==='click'?.07:.16;osc.type=kind==='tear'?'triangle':'sine';osc.frequency.setValueAtTime(frequency,start);gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.022,start+.012);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);osc.connect(gain);gain.connect(context.destination);osc.start(start);osc.stop(start+duration+.02);});
  }catch{/* Audio is optional; gameplay remains available. */}
 }
 function celebrate(message){
  document.querySelector('.kg-celebration')?.remove();
  const node=document.createElement('div');node.className='kg-celebration';node.setAttribute('role','status');
  const mark=document.createElement('span');mark.textContent='✦';mark.setAttribute('aria-hidden','true');const label=document.createElement('strong');label.textContent=message;node.append(mark,label);document.body.append(node);sfx('reward');setTimeout(()=>node.remove(),3200);
 }
 function identity(){const a=window.KizunaAccount?.getSnapshot?.();return a?.loading?null:a?.user?.id||'guest';}
 function refresh(){
  queued=false;const current=identity();
  if(current!==owner){owner=current;previousOwned=null;previousAlbums=null;newCards.clear();newAt.clear();numbers.clear();document.querySelector('.kg-celebration')?.remove();document.querySelectorAll('.kg-new-slot').forEach(node=>node.classList.remove('kg-new-slot'));}
  if(!current)return;
  const game=window.KizunaGame, snapshot=game?.getSnapshot?.();if(!snapshot)return;
  const owned=new Set((snapshot.owned||[]).map(row=>String(row.id)));
  if(previousOwned)for(const id of owned)if(!previousOwned.has(id)){newCards.add(id);newAt.set(id,Date.now());}
  for(const id of newCards)if(Date.now()-(newAt.get(id)||0)>120000){newCards.delete(id);newAt.delete(id);}
  previousOwned=owned;
  const complete=new Map((game.getAlbums?.()||[]).filter(a=>a.total>0).map(a=>[a.key,{complete:a.owned===a.total,name:a.name}]));
  if(previousAlbums){for(const [id,album]of complete){if(album.complete&&previousAlbums.get(id)?.complete===false){celebrate('Album complété : '+album.name);break;}}}
  previousAlbums=complete;
  document.querySelectorAll('[data-colcard]').forEach(node=>node.classList.toggle('kg-new-slot',newCards.has(node.dataset.colcard)&&owned.has(node.dataset.colcard)));
 }
 function schedule(){if(queued)return;queued=true;requestAnimationFrame(refresh);}
 function animateNumbers(root){
  const scope=identity();if(!scope)return;
  root.querySelectorAll('[data-kg-number]').forEach(node=>{
   const id=scope+':'+node.dataset.kgNumber,value=Number(node.dataset.kgValue)||0,old=numbers.get(id);numbers.set(id,value);
   if(old==null||old===value||reduced()||document.body.dataset.tab!=='profile')return;
   node.setAttribute('aria-label',value.toLocaleString('fr-FR'));const start=performance.now();
   const frame=now=>{if(!node.isConnected||scope!==identity())return;const p=Math.min(1,(now-start)/420);node.textContent=Math.round(old+(value-old)*(1-(1-p)**3)).toLocaleString('fr-FR');if(p<1&&!reduced())requestAnimationFrame(frame);else node.textContent=value.toLocaleString('fr-FR');};requestAnimationFrame(frame);
  });
 }
 function resetTilt(){if(tilted){tilted.style.removeProperty('--kg-rx');tilted.style.removeProperty('--kg-ry');tilted=null;}}
 document.addEventListener('pointermove',event=>{
  if(reduced()||event.pointerType!=='mouse')return;const node=event.target.closest?.('.kg-tilt');if(!node){resetTilt();return;}if(tilted!==node)resetTilt();tilted=node;
  const x=event.clientX,y=event.clientY;cancelAnimationFrame(tiltFrame);tiltFrame=requestAnimationFrame(()=>{if(tilted!==node)return;const r=node.getBoundingClientRect();if(!r.width||!r.height)return;node.style.setProperty('--kg-rx',((.5-(y-r.top)/r.height)*6).toFixed(2)+'deg');node.style.setProperty('--kg-ry',(((x-r.left)/r.width-.5)*8).toFixed(2)+'deg');});
 },{passive:true});
 document.addEventListener('pointerout',event=>{if(tilted&&!tilted.contains(event.relatedTarget))resetTilt();},{passive:true});
 for(const type of ['pointerdown','keydown'])document.addEventListener(type,event=>{if(event.isTrusted)gesture=true;},{capture:true,passive:true});
 document.addEventListener('click',event=>{
  const pref=event.target.closest?.('[data-kg-pref]');if(pref){setPreference(pref.dataset.kgPref,!prefs[pref.dataset.kgPref]);sfx();return;}
  if(event.isTrusted&&event.target.closest?.('button:not(:disabled),a[href]')&&!event.target.closest('#revealBackdrop'))sfx();
  const action=event.target.closest?.('[data-kg-go]');if(!action)return;
  const destination=action.dataset.kgGo;
  if(destination==='daily'){window.KizunaGame?.showTab('boosts');document.querySelector('#kTabs [data-t="daily"]')?.click();}
  else if(destination==='events')window.KizunaAnomalies?.open();
  else if(['missions','constellations','sanctuary'].includes(destination))window.KizunaAdventure?.navigate(destination);
  else window.KizunaGame?.showTab(destination);
 });
 window.addEventListener('kizuna:reward',event=>{if(event.detail?.message)celebrate(event.detail.message);});
 window.addEventListener('kizuna:tab-change',()=>{resetTilt();schedule();if(reduced())return;document.querySelectorAll('.kg-enter').forEach(n=>n.classList.remove('kg-enter'));const ids={home:'kzHome',boosts:'boosters',col:'collection',wiki:'encyclopedia',rank:'ranking',market:'marketPage',profile:'profilePage',universes:'universes',community:'community',adventure:'kzAdventurePage',nexus:'kzNexusPage'};const node=$(ids[document.body.dataset.tab]);if(node){node.classList.add('kg-enter');setTimeout(()=>node.classList.remove('kg-enter'),320);}});
 for(const event of ['kizuna:game-change','kizuna:albums-change','kizuna:ready','kizuna:mythic-change'])window.addEventListener(event,schedule);
 document.addEventListener('kizuna:account-change',schedule);
 media?.addEventListener?.('change',()=>{updateSettings();resetTilt();});
 window.addEventListener('storage',event=>{if(event.key!==key)return;try{const next=JSON.parse(event.newValue||'{}');for(const name of ['quick','sound','reduce'])prefs[name]=next[name]===true;updateSettings();window.dispatchEvent(new CustomEvent('kizuna:preferences',{detail:{...prefs}}));}catch{}});
 function mountActivities(){const activities=$('kaHomeAdventure'),slot=$('kgActivityFooter');if(activities&&slot&&activities.parentElement!==slot)slot.append(activities);}
 mountActivities();document.addEventListener('DOMContentLoaded',mountActivities,{once:true});window.KizunaHome?.refresh();
 window.KizunaExperience=Object.freeze({reduced,sfx,celebrate,setPreference,animateNumbers,isNew:id=>owner===identity()&&newCards.has(String(id))&&Date.now()-(newAt.get(String(id))||0)<=120000,getPreferences:()=>({...prefs}),refresh:schedule});
 const controls=document.createElement('details');controls.className='kg-settings';controls.innerHTML='<summary aria-label="Réglages de jeu">⚙ <span>Réglages</span></summary><div class="kg-settings-menu"><strong>À ton rythme</strong><button type="button" data-kg-pref="sound" aria-pressed="false">Effets sonores <b>Non</b></button><button type="button" data-kg-pref="reduce" aria-pressed="false">Réduire les animations <b>Non</b></button><small>Les préférences d’accessibilité de ton appareil sont respectées.</small></div>';
 document.querySelector('.top-actions')?.append(controls);document.body.classList.add('kz-game');updateSettings();schedule();
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&controls.open&&controls.contains(event.target)){controls.open=false;controls.querySelector('summary').focus({preventScroll:true});}});
 document.addEventListener('click',event=>{if(controls.open&&!controls.contains(event.target))controls.open=false;});
})();
