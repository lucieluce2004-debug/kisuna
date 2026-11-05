/* KIZUNA artistic invocation · presentation only. The draw/save engine is untouched. */
const kzRevealPreferenceKey='kizuna_reveal_preferences_v1';
const kzRevealPreferences=(()=>{try{const value=JSON.parse(localStorage.getItem(kzRevealPreferenceKey)||'{}');return {quick:value.quick===true,sound:value.sound===true};}catch{return {quick:false,sound:false};}})();
let kzRevealEpoch=0,kzRevealReturnFocus=null,kzRevealQuickPending=false,kzSummonFinish=null;
const kzReducedMotion=()=>window.KizunaExperience?.reduced?.()||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
const kzRevealOpen=()=>$('revealBackdrop')?.classList.contains('open');
const kzRevealOriginalSound=playKyaraSound;
playKyaraSound=function(kind,rarity){if(window.KizunaExperience)window.KizunaExperience.sfx(kind,rarity);else if(kzRevealPreferences.sound)kzRevealOriginalSound(kind,rarity);};
window.addEventListener('kizuna:preferences',event=>{kzRevealPreferences.sound=event.detail.sound===true;kzRevealPreferences.quick=event.detail.quick===true;document.querySelectorAll('[data-kz-reveal-setting]').forEach(button=>{const value=kzRevealPreferences[button.dataset.kzRevealSetting];button.setAttribute('aria-pressed',String(value));button.querySelector('b').textContent=value?'Oui':'Non';});});
function kzRevealSettings(){return `<div class="kz-reveal-settings" role="group" aria-label="Préférences d’ouverture"><button type="button" data-kz-reveal-setting="quick" aria-pressed="${kzRevealPreferences.quick}"><span aria-hidden="true">↠</span> Ouverture rapide <b>${kzRevealPreferences.quick?'Oui':'Non'}</b></button><button type="button" data-kz-reveal-setting="sound" aria-pressed="${kzRevealPreferences.sound}"><span aria-hidden="true">♪</span> Son <b>${kzRevealPreferences.sound?'Oui':'Non'}</b></button></div>`;}
function kzRevealFocus(selector){const node=$('kyaraRevealRoot')?.querySelector(selector);node?.focus({preventScroll:true});}
function kzRevealDialog(){const root=$('revealBackdrop');root?.setAttribute('role','dialog');root?.setAttribute('aria-modal','true');root?.setAttribute('aria-labelledby','kzRevealTitle');}
function kzRevealInvalidate(){kzRevealEpoch++;state.cardTransitioning=false;}
function kzInvocationSeal(letter=''){
  const marks=Array.from({length:12},(_,i)=>`<g transform="rotate(${i*30} 200 200)"><path d="M200 15v12m-5 7 5 7 5-7m-10 13h10"/><circle cx="200" cy="62" r="2"/></g>`).join('');
  return `<div class="ksm-portal${letter==='M'?' kz-mythic-seal':''}" aria-hidden="true"><div class="ksm-halo"></div><div class="ksm-beam"></div><div class="ksm-sigil"><svg viewBox="0 0 400 400" fill="none" stroke="currentColor" stroke-width="1.25"><g class="ksm-ring-outer"><circle cx="200" cy="200" r="187"/><circle cx="200" cy="200" r="177" stroke-dasharray="2 9"/>${marks}</g><g class="ksm-ring-inner"><circle cx="200" cy="200" r="139"/><path d="m200 61 120 208H80Zm0 278L80 131h240Z"/><circle cx="200" cy="200" r="82" stroke-dasharray="25 8"/></g><circle cx="200" cy="200" r="53"/><path d="M200 131v138m-69-69h138m-118-49 98 98m-98 0 98-98"/></svg></div><div class="ksm-motes">${Array.from({length:12},(_,i)=>`<i style="--ksm-angle:${i*30}deg;--ksm-delay:${i%4*65}ms"></i>`).join('')}</div><div class="ksm-wave"></div>${['L','M'].includes(letter)?'<div class="ksm-prestige-ring"></div>':''}</div>`;
}
function karRarityEntrance(letter){
  // Only an already saved card chooses an exceptional scene. No preview predicts a tier.
  if(letter==='L')return '<div class="kar-rarity-event kar-legendary-event" aria-hidden="true"><i></i><i></i><i></i><span>伝説</span></div>';
  if(letter==='M')return '<div class="kar-rarity-event kar-mythic-event" aria-hidden="true"><i></i><i></i><i></i><span>神話</span></div>';
  return '';
}
function karCardBack(){return '<span class="kar-card-back" aria-hidden="true"><span>絆</span><i></i><b>KIZUNA</b><small>LES LIENS NOUS RÉVÈLENT</small></span>';}
const karReportedResults=new Set(),karReportedArrays=new WeakSet();
let karLocalResult=0;
function karAnnounceResult(cards){
  // renderReveal also serves previews/tests; only a successful live opening emits a reaction.
  if(!state.opening||!cards.length||karReportedArrays.has(cards))return;
  const account=window.KizunaAccount?.getSnapshot?.(),owner=account?.user?.id||'guest';
  const receiptKey=account?.economy===true&&Number.isSafeInteger(account.revision)?owner+':revision:'+account.revision:owner+':opening:'+Date.now()+':'+(++karLocalResult);
  if(karReportedResults.has(receiptKey))return;
  karReportedArrays.add(cards);karReportedResults.add(receiptKey);
  if(karReportedResults.size>64)karReportedResults.delete(karReportedResults.values().next().value);
  window.dispatchEvent(new CustomEvent('kizuna:opening-result',{detail:{owner,receiptKey,count:cards.length,newCount:state.revealNew.filter(Boolean).length,mythicCount:cards.filter(c=>rarityFor(c).level===6).length,awakeningCount:cards.filter(c=>c.kzResonance?.unlocked>c.kzResonance?.from).length,cardIds:cards.map(c=>String(c.id))}}));
}
function kzWaitInvocation(milliseconds){return new Promise(resolve=>{let timer;const finish=()=>{clearTimeout(timer);if(kzSummonFinish===finish)kzSummonFinish=null;resolve();};kzSummonFinish=finish;timer=setTimeout(finish,milliseconds);});}
const kzRevealOriginalClose=closeBackdrop;
closeBackdrop=function(id){
  const wasOpen=id==='revealBackdrop'&&kzRevealOpen();
  if(id==='revealBackdrop'){kzRevealInvalidate();kzRevealQuickPending=false;kzSummonFinish?.();$('kyaraRevealRoot')?.classList.remove('ksm-charging');}
  kzRevealOriginalClose(id);
  if(wasOpen){const target=kzRevealReturnFocus?.isConnected?kzRevealReturnFocus:$('kOpen1');target?.focus({preventScroll:true});kzRevealReturnFocus=null;}
};
const kzRevealOriginalRender=renderReveal;
renderReveal=function(cards){
  kzRevealInvalidate();
  kzRevealOriginalRender(cards); // Existing stable ascending rarity sort + NEW flags.
  if(kzRevealQuickPending){kzRevealQuickPending=false;renderKyaraFinale();}
  karAnnounceResult(cards);
};

renderKyaraPackSelection=function(n=1){
  if(!kzRevealOpen())kzRevealReturnFocus=document.activeElement;
  kzRevealInvalidate();kzRevealQuickPending=false;state.packToken++;kzSummonFinish?.();
  const b=kyaraBooster();state.requestedBoosters=[1,5,10].includes(Number(n))?Number(n):1;
  showKyaraOverlay();kzRevealDialog();
  const root=$('kyaraRevealRoot');root.classList.add('ksm-scene');root.classList.remove('kr-pack-tearing','kr-card-leaving','ksm-charging');root.dataset.phase='pack';root.dataset.rarity='';root.dataset.summon='idle';
  root.style.setProperty('--kr-halo',b.mk||'#d9b86f');root.style.setProperty('--kr-pack-edge',b.edge||'#d9b86f');
  root.innerHTML=`<button class="kr-close" type="button" data-kr-action="close" aria-label="Fermer l’aperçu du booster">×</button>
    <div class="kr-pack-shell kz-reveal-pack">
      <header class="kr-pack-heading"><span class="kr-eyebrow">01 / LE RITUEL DES LIENS</span><h1 id="kzRevealTitle">${esc(b.title)}</h1><p>${esc(b.desc)} · Une rencontre t’attend.</p></header>
      <div class="kr-pack-stage"><div class="kar-stage-arch" aria-hidden="true"></div>${kzInvocationSeal()}
        <button type="button" class="kr-pack-art" data-kr-action="drag-pack" aria-label="Invoquer ${state.requestedBoosters} booster${state.requestedBoosters>1?'s':''} ${esc(b.title)}">
          <span class="kr-pack-foil">${kgPackImage(b)}<span class="kr-pack-brand">絆 · KIZUNA</span><span class="kr-pack-mark">${boosterLogo(b)}</span><span class="kr-pack-copy"><strong>${esc(b.title)}</strong><small>5 CARTES · DES LIENS À RÉVÉLER</small></span></span><span class="kar-pack-tear" aria-hidden="true"></span><span class="kar-pack-seam" aria-hidden="true"></span>
        </button>
        <span class="kar-stage-caption" aria-hidden="true">SCELLE UN NOUVEAU LIEN</span>
      </div>
      <div class="kr-pack-controls"><p class="kr-pack-hint">Ouvre le passage.</p><p class="ksm-ritual-status" role="status" aria-live="polite">Choisis le nombre de paquets, puis lance ton invocation.</p>
        <div class="kr-quantity-options" role="group" aria-label="Nombre de boosters">${[1,5,10].map(q=>`<button type="button" data-kr-action="quantity" data-count="${q}" aria-pressed="${q===state.requestedBoosters}" class="${q===state.requestedBoosters?'selected':''}"><b>×${q}</b><small>${q*5} cartes</small></button>`).join('')}</div>
        ${kzRevealSettings()}
        <button type="button" class="kr-open-cta" data-kr-action="open-pack"><span aria-hidden="true">✦</span><b>Invoquer mes cartes</b><small data-kr-open-label>${packCostLabel(state.requestedBoosters)}</small></button>
        <button type="button" class="ksm-skip-intro" data-ksm-skip hidden>Passer l’invocation →</button>
        <p class="kr-pack-foot" data-kr-pack-count>${state.requestedBoosters*5} cartes à découvrir</p><p class="kz-reveal-guarantee">Une Rare ou mieux par booster. Les probabilités et garanties restent celles affichées dans Boosters.</p>
        <button class="kr-pack-change" type="button" data-kr-action="change">Changer de booster</button>
      </div>
    </div>`;
  updateKyaraQuantity(state.requestedBoosters);
  kzRevealFocus(root.querySelector('[data-kr-action="open-pack"]:not(:disabled)')?'[data-kr-action="open-pack"]':'[data-kr-action="close"]');
};
const kzRevealOriginalQuantity=updateKyaraQuantity;
updateKyaraQuantity=function(n){kzRevealOriginalQuantity(n);const art=$('kyaraRevealRoot')?.querySelector('.kr-pack-art');if(art){art.setAttribute('aria-label','Invoquer '+state.requestedBoosters+' booster'+(state.requestedBoosters>1?'s':'')+' '+kyaraBooster().title);art.disabled=!INFINITE_BOOSTERS&&kzAvailablePacks()<state.requestedBoosters;}};
startKyaraOpening=async function(){
  const root=$('kyaraRevealRoot');if(!root||root.dataset.phase!=='pack'||!kzRevealOpen()||state.opening)return;
  const n=state.requestedBoosters||1,token=state.packToken;
  if(!INFINITE_BOOSTERS&&kzAvailablePacks()<n){toast('Stock insuffisant : '+kzAvailablePacks()+' booster(s) disponible(s).');return;}
  root.dataset.phase='tearing';root.dataset.summon='charging';kzRevealQuickPending=kzRevealPreferences.quick;
  root.classList.add('ksm-charging');
  root.querySelectorAll('button:not([data-kr-action="close"]):not([data-ksm-skip])').forEach(button=>button.disabled=true);
  const skip=root.querySelector('[data-ksm-skip]');if(skip)skip.hidden=kzRevealPreferences.quick||kzReducedMotion();
  const title=root.querySelector('[data-kr-action="open-pack"] b');if(title)title.textContent='Le sceau s’éveille…';
  const status=root.querySelector('.ksm-ritual-status');if(status)status.textContent='L’énergie se rassemble…';
  if(!kzRevealPreferences.quick)playKyaraSound('summon');
  if(skip&&!skip.hidden)skip.focus({preventScroll:true});
  await kzWaitInvocation(kzRevealPreferences.quick||kzReducedMotion()?0:1350);
  if(token!==state.packToken||!kzRevealOpen()||root.dataset.phase!=='tearing'){if(token===state.packToken)kzRevealQuickPending=false;return;}
  root.classList.remove('ksm-charging');root.dataset.summon='resolving';if(skip)skip.hidden=true;if(status)status.textContent='Tes liens se révèlent…';
  // The original engine deducts stock, samples, records the result, then renders it.
  await openBoosterNow(n);
  if(root.dataset.phase==='tearing'&&kzRevealOpen()){kzRevealQuickPending=false;renderKyaraPackSelection(n);}
};

function kzMythicResonanceNotice(card){const r=card.kzResonance;if(!r?.delta)return '';const gained=r.unlocked>r.from;return '<div class="km-resonance-reveal '+(gained?'is-unlock':'')+(card.kzNexusResonance?' knx-resonance-exclusive':'')+'" role="status"><span>+1 Résonance</span>'+(gained?'<strong>Éveil '+r.unlocked+' débloqué · '+['','Révélation','Ascension','Transcendance'][r.unlocked]+'</strong>':'')+'<small>'+r.resonance+' Résonances · tes doublons sont conservés</small></div>';}
renderKyaraCurrentCard=function(){
  const root=$('kyaraRevealRoot'),cards=state.pendingReveal||[];if(!root||!cards.length||!kzRevealOpen())return;
  if(state.revealIndex>=cards.length){renderKyaraFinale();return;}
  kzRevealInvalidate();kzRevealDialog();
  const i=Math.max(0,state.revealIndex),card=cards[i],r=rarityFor(card),b=kyaraBooster(),fresh=!!state.revealNew[i],letter=LET[r.name]||'C';
  root.style.setProperty('--kr-halo',r.color);root.style.setProperty('--kr-rarity',r.color);root.classList.add('ksm-scene');root.classList.remove('kr-card-leaving','kr-pack-tearing','ksm-charging');root.dataset.phase='opening';root.dataset.rarity=letter;root.dataset.summon='revealed';
  root.innerHTML=`<button class="kr-close" type="button" data-kr-action="close" aria-label="Fermer l’ouverture, les cartes sont conservées">×</button>
    <div class="kr-opening-shell kz-reveal-opening"><header class="kr-top-meta"><span class="kr-eyebrow">02 / LES LIENS SE RÉVÈLENT · ${esc(b.title)}</span><span class="kr-pack-name">RARETÉ CROISSANTE <i>·</i> ${i+1} / ${cards.length}</span></header>
      <div class="kr-open-center">
        ${kzInvocationSeal(letter)}${karRarityEntrance(letter)}
        <div class="kr-card-stack" style="--kr-rarity:${r.color}">${fresh?'<span class="kr-new-badge">Nouvelle découverte</span>':''}<button type="button" class="kr-current-card" data-kr-action="advance" aria-label="${i===cards.length-1?'Voir le récapitulatif':'Révéler la carte suivante'}">${cardMarkup(card)}${karCardBack()}</button></div>
        <div class="kr-card-caption"><span style="--kr-rarity:${r.color}">${esc(r.name)}</span><h1 id="kzRevealTitle">${esc(card.name)}</h1><p>${esc(card.series)}</p>${kzMythicResonanceNotice(card)}${letter==='M'?'<small class="kar-rarity-line">Un lien qui traverse les légendes.</small>':letter==='L'?'<small class="kar-rarity-line">Une rencontre hors du commun.</small>':''}</div>
      </div>
      <div class="kr-opening-bottom"><div class="kr-progress-wrap" style="--kr-progress-color:${r.color}"><div class="kr-progress-head"><span>TON OUVERTURE</span><strong>${i+1}<em> / ${cards.length}</em></strong></div><div class="kr-progress-track" role="progressbar" aria-label="Cartes révélées" aria-valuemin="0" aria-valuemax="${cards.length}" aria-valuenow="${i+1}"><span class="kr-progress-fill" style="width:${(i+1)/cards.length*100}%"></span></div></div>
        <div class="kz-reveal-announcement" role="status" aria-live="polite" aria-atomic="true">Carte ${i+1} sur ${cards.length} : ${esc(card.name)}, ${esc(r.name)}${fresh?', nouvelle découverte':''}.</div>
        <div class="kr-opening-actions"><button type="button" data-kr-action="skip" class="kr-action-muted">Prochaine Épique ou +</button><button type="button" data-kr-action="all" class="kr-action-muted">Tout révéler</button></div><p class="kr-key-hint">Touche la carte ou utilise Espace · Échap pour fermer</p>
      </div>
    </div>`;
  if(!kzRevealQuickPending)playKyaraSound('card',r.name);
  kzRevealFocus('[data-kr-action="advance"]');
};
nextKyaraCard=async function(){
  const cards=state.pendingReveal||[],root=$('kyaraRevealRoot');if(!cards.length||state.cardTransitioning||root?.dataset.phase!=='opening'||!kzRevealOpen())return;
  if(state.revealIndex>=cards.length-1){renderKyaraFinale();return;}
  const epoch=++kzRevealEpoch,index=state.revealIndex;
  state.cardTransitioning=true;root.classList.add('kr-card-leaving');
  await wait(kzReducedMotion()?0:140);
  if(epoch!==kzRevealEpoch||!kzRevealOpen()||root.dataset.phase!=='opening'||state.revealIndex!==index)return;
  state.revealIndex++;renderKyaraCurrentCard();
};
skipToKyaraEpic=function(){
  const cards=state.pendingReveal||[],root=$('kyaraRevealRoot');if(!cards.length||!kzRevealOpen()||root?.dataset.phase!=='opening')return;
  kzRevealInvalidate();const next=cards.findIndex((card,index)=>index>state.revealIndex&&rarityFor(card).level>=4);
  if(next>=0)state.revealIndex=next;else if(state.revealIndex<cards.length-1)state.revealIndex=cards.length-1;else{renderKyaraFinale();return;}
  renderKyaraCurrentCard();
};
renderKyaraFinale=function(){
  const root=$('kyaraRevealRoot'),cards=state.pendingReveal||[];if(!root||!cards.length||!kzRevealOpen())return;
  const alreadyFinal=root.dataset.phase==='finale';kzRevealInvalidate();kzRevealDialog();
  const b=kyaraBooster(),freshCount=state.revealNew.filter(Boolean).length,best=cards.reduce((winner,card)=>rarityFor(card).level>rarityFor(winner).level?card:winner,cards[0]),bestTier=rarityFor(best);
  if(!alreadyFinal)playKyaraSound('finale',bestTier.name);
  root.classList.remove('kr-card-leaving','kr-pack-tearing','ksm-charging');root.dataset.phase='finale';root.dataset.summon='complete';root.dataset.rarity=LET[bestTier.name]||'C';root.style.setProperty('--kr-halo',bestTier.color);
  const counts=new Map();for(const card of cards)counts.set(card.rarity,(counts.get(card.rarity)||0)+1);
  root.innerHTML=`<button class="kr-close" type="button" data-kr-action="close" aria-label="Fermer le récapitulatif">×</button><div class="kr-finale-shell kz-reveal-summary"><header class="kr-finale-heading"><span class="kr-eyebrow">03 / L’EMPREINTE DE TON INVOCATION</span><h1 id="kzRevealTitle" tabindex="-1">${freshCount?'De nouveaux liens.':'Tes liens se renforcent.'}</h1><p>${cards.length} cartes · ${esc(b.title)} · ${cards.length/5} booster${cards.length>5?'s':''} ouvert${cards.length>5?'s':''}</p><span class="kr-new-count">${freshCount} nouvelle${freshCount>1?'s':''} découverte${freshCount>1?'s':''}</span></header>
    <div class="kz-summary-rarities" aria-label="Raretés obtenues">${rarityData.slice().sort((a,b)=>a.level-b.level).filter(r=>counts.has(r.name)).map(r=>`<span style="--tier:${r.color}"><i aria-hidden="true"></i>${esc(r.name)} <b>×${counts.get(r.name)}</b></span>`).join('')}</div>
    <div class="kr-finale-fan kz-summary-grid">${cards.map((card,i)=>{const r=rarityFor(card);return `<button type="button" class="kr-finale-card${r.level===bestTier.level?' is-best':''}" data-kr-action="detail" data-kr-index="${i}" style="--kr-rarity:${r.color};--kr-index:${Math.min(i,9)}" aria-label="Voir ${esc(card.name)}, ${esc(r.name)}${state.revealNew[i]?', nouvelle carte':''}">${state.revealNew[i]?'<span class="kr-new-badge">Nouveau</span>':''}${cardMarkup(card)}${card.kzResonance?.delta?'<span class="km-finale-mark">+1 Résonance'+(card.kzResonance.unlocked>card.kzResonance.from?' · Éveil '+card.kzResonance.unlocked+' débloqué':'')+'</span>':''}</button>`;}).join('')}</div>
    <div class="kr-finale-actions"><button type="button" class="kr-open-again" data-kr-action="again"><b>Ouvrir un autre</b><small>${esc(b.title)}</small></button><button type="button" data-kr-action="collection">Voir ma collection</button><button type="button" data-kr-action="change">Changer de booster</button><button type="button" data-kr-action="image">Exporter l’image</button><button type="button" data-kr-action="copy">Copier le lien du booster</button></div><p class="kr-finale-note">Cartes enregistrées dans ta collection · du moins rare au plus rare.</p></div>`;
  kzRevealFocus('#kzRevealTitle');
};

$('kyaraRevealRoot')?.addEventListener('click',event=>{
  if(event.target.closest('[data-ksm-skip]')&&$('kyaraRevealRoot').dataset.summon==='charging'){kzSummonFinish?.();return;}
  const button=event.target.closest('[data-kz-reveal-setting]');if(!button||button.disabled)return;
  const setting=button.dataset.kzRevealSetting;if(!['quick','sound'].includes(setting))return;
  kzRevealPreferences[setting]=!kzRevealPreferences[setting];button.setAttribute('aria-pressed',String(kzRevealPreferences[setting]));button.querySelector('b').textContent=kzRevealPreferences[setting]?'Oui':'Non';
  if(window.KizunaExperience)window.KizunaExperience.setPreference(setting,kzRevealPreferences[setting]);
  else try{const previous=JSON.parse(localStorage.getItem(kzRevealPreferenceKey)||'{}');localStorage.setItem(kzRevealPreferenceKey,JSON.stringify({...previous,...kzRevealPreferences}));}catch{toast('Cette préférence ne peut pas être enregistrée sur cet appareil.');}
});
window.addEventListener('kizuna:preferences',()=>{if(kzReducedMotion())kzSummonFinish?.();});
window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change',()=>{if(kzReducedMotion())kzSummonFinish?.();});
document.addEventListener('keydown',event=>{
  if(!kzRevealOpen()||$('detailBackdrop')?.classList.contains('open')||$('kyaraProfileOverlay')?.classList.contains('open'))return;
  const root=$('kyaraRevealRoot');if(!root)return;
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeBackdrop('revealBackdrop');return;}
  if(event.key==='Tab'){
    const items=[...root.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled)')].filter(node=>!node.hidden&&!node.closest('[hidden]'));
    if(!items.length)return;const i=items.indexOf(document.activeElement);
    if(i<0||event.shiftKey&&i===0||!event.shiftKey&&i===items.length-1){event.preventDefault();items[event.shiftKey?items.length-1:0].focus();}return;
  }
  if(root.dataset.phase!=='opening')return;
  if(event.code==='Space'||event.key===' '||event.key==='Enter'){
    if(event.target.closest('[data-kr-action="advance"]')){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)nextKyaraCard();}
    else if(event.code==='Space'||event.key===' ')event.stopPropagation();
  }else if(event.key==='ArrowRight'){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)nextKyaraCard();}
  else if(event.key==='ArrowLeft'){event.preventDefault();event.stopImmediatePropagation();kzRevealInvalidate();state.revealIndex=Math.max(0,state.revealIndex-1);renderKyaraCurrentCard();}
},true);

// Display actual eligible characters; this selection never calls the draw engine.
function kgBoosterCards(booster){const rows=booster.custom?LOCAL_CARDS.filter(c=>booster.cardIds.has(String(c.id))):LOCAL_CARDS.filter(c=>!booster.f||booster.f(c));return rows.slice().sort((a,b)=>(b.fav||0)-(a.fav||0)||a.rank-b.rank);}
function kgBoosterArt(card){return card?(window.KizunaMythicArt?.get(card.id)?.levels[1]?.illustration?.image||card.image):'';}
function kgPackImage(booster){const card=kgBoosterCards(booster)[0];return card?'<img class="kg-pack-image" src="'+esc(kgBoosterArt(card))+'" alt="" width="210" height="295" loading="lazy" decoding="async">':'';}
renderPacks=function(){
 const root=$('kGrid');if(!root)return;const left=root.scrollLeft,focused=document.activeElement?.closest('#kGrid .kpack')?.dataset.id;
 root.setAttribute('role','group');root.setAttribute('aria-label','Choisir un booster : parcours les paquets avec les flèches ou Tab');
 root.innerHTML=BOOST.map((b,i)=>`<button class="kpack kg-tilt ${b.id===state.selectedBooster?'sel':''}" data-id="${esc(b.id)}" type="button" aria-pressed="${b.id===state.selectedBooster}" aria-label="${esc(b.title)}, ${esc(b.desc)}, 5 cartes, Rare ou mieux garantie" style="--pb:${b.bg};--pe:${b.edge};--pf:${b.fg};--pm:${b.mk};--pg:${b.glow};--kar-pack-lean:${i%2?2:-2}deg"><span class="kar-pack-number" aria-hidden="true">${String(i+1).padStart(2,'0')} / ${String(BOOST.length).padStart(2,'0')}</span><div class="kp-face">${kgPackImage(b)}<span class="kp-brand">絆 · KIZUNA</span><span class="kp-mark">${boosterLogo(b)}</span><b class="kp-title">${esc(b.title)}</b><i class="kp-sub">${esc(b.desc)}</i><em class="kp-pill">5 cartes · Rare ou +</em></div><span class="kp-lab">${b.id===state.selectedBooster?'✦ Prêt à invoquer':'Choisir ce paquet →'}</span></button>`).join('');
 root.scrollLeft=left;if(focused)[...root.querySelectorAll('.kpack')].find(node=>node.dataset.id===focused)?.focus({preventScroll:true});
};
function kgRenderPackPreview(){
 const root=$('kgPackPreview');if(!root)return;const b=kyaraBooster(),cards=kgBoosterCards(b).slice(0,3),signature=JSON.stringify(cards.map(c=>[c.id,c.name,kgBoosterArt(c)]));if(root.dataset.signature===signature)return;root.dataset.signature=signature;
 root.innerHTML='<p class="kg-preview-caption">Des rencontres possibles <span>Illustrations d’Éveil</span></p><div class="kg-pack-preview">'+cards.map(card=>'<button type="button" data-kg-card="'+esc(card.id)+'" aria-label="Découvrir '+esc(card.name)+'"><img src="'+esc(kgBoosterArt(card))+'" alt="" width="90" height="120" loading="eager" decoding="async"><span>'+esc(card.name)+'</span></button>').join('')+'</div>';
}
function karArrangeBoosterPanel(){
 const panel=document.querySelector('#boosters .kb-panel'),heading=panel?.querySelector('.kb-sel');
 if(!panel||!heading||panel.querySelector('.kar-panel-actions'))return;
 const actions=document.createElement('div');actions.className='kar-panel-actions';
 // Move the existing controls so their original handlers and IDs stay intact.
 for(const selector of ['.kb-open','.kb-multi','.kb-foot']){const node=panel.querySelector(selector);if(node)actions.append(node);}
 heading.after(actions);
}
const kgBaseRenderPanel=renderPanel;
renderPanel=function(){kgBaseRenderPanel();kgRenderPackPreview();karArrangeBoosterPanel();};
document.addEventListener('click',event=>{
 const rail=event.target.closest('[data-kg-rail]');if(rail){const grid=$('kGrid');if(!grid||grid.hidden)return;const amount=Number(rail.dataset.kgRail)*Math.max(210,grid.clientWidth*.75),left=Math.max(0,Math.min(grid.scrollWidth-grid.clientWidth,grid.scrollLeft+amount));if(grid.scrollTo)grid.scrollTo({left,behavior:kzReducedMotion()?'instant':'smooth'});else grid.scrollLeft=left;}
 const card=event.target.closest('[data-kg-card]');if(card)window.KizunaGame?.openCard(card.dataset.kgCard);
});
document.addEventListener('DOMContentLoaded',()=>{renderPacks();kgRenderPackPreview();},{once:true});
