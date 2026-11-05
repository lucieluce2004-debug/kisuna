(() => {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={sale:'Prix fixe',auction:'Enchères',trade:'Échanges',all:'Toutes les offres',mine:'Mes annonces',activity:'Mon historique'};
 const values={'Commun':5,'Peu commune':8,'Rare':10,'Épique':15,'Légendaire':25,'Mythique':60};
 const account=()=>window.KizunaAccount?.getSnapshot?.(),game=()=>window.KizunaGame?.getSnapshot?.();
 let root,legacy,dialog,owner=null,epoch=0,loading=false,rows=[],page=0,mode='all',query='',error='',lastLoad=0,selling=null;
 const card=id=>game()?.cards.find(c=>String(c.id)===String(id));
 const amount=n=>Number(n||0).toLocaleString('fr-FR');
 const now=()=>{const c=account()?.serverClock;return c?c.at+Math.max(0,performance.now()-c.received):Date.now();};
 const remaining=t=>!t?'Sans échéance':new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'short'}).format(new Date(t));
 function setup(){
  const host=document.getElementById('marketPage');if(!host)return false;
  if(!root){legacy=host.firstElementChild;root=document.createElement('div');root.id='keExchange';root.className='wrap';root.hidden=true;host.append(root);dialog=document.createElement('dialog');dialog.id='keExchangeDialog';dialog.className='ke-dialog';dialog.setAttribute('aria-label','Marché des cartes');document.body.append(dialog);dialog.addEventListener('click',e=>{if(e.target.closest('[data-ke-close]')){dialog.close();return;}if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});dialog.addEventListener('submit',publish);}
  return true;
 }
 function sync(){
  if(!setup())return;const a=account(),id=a?.economy?a.user.id:null;
  if(id!==owner){owner=id;epoch++;rows=[];page=0;mode='all';query='';error='';lastLoad=0;loading=false;selling=null;root.innerHTML='';dialog.close();dialog.innerHTML='';}
  root.hidden=!id;legacy.hidden=!!id;
  if(id&&document.body.dataset.tab==='market')show();
 }
 function show(){if(document.body.dataset.tab!=='market'||!setup()||!account()?.economy)return;root.hidden=false;legacy.hidden=true;if(!root.innerHTML)render();if(!loading&&Date.now()-lastLoad>30000)load();}
 function render(){
  if(!root||!owner)return;
  root.innerHTML=`<header class="ke-header"><div><span class="ke-eyebrow">KIZUNA · MARCHÉ PARTAGÉ</span><h1>De ta collection à la leur.</h1><p>Ventes, enchères et échanges entre collectionneurs.</p></div><button type="button" data-ke-refresh ${loading?'disabled':''}>${loading?'Chargement…':'Actualiser'}</button></header><div class="ke-notice"><strong>Cartes et Chakra protégés</strong><p>La carte est réservée dès publication. Dépôt : 2 % · vente conclue : 5 % · échange : gratuit. Les anciens exemplaires et leur date sont conservés.</p></div><form class="ke-filters" id="keSearch"><label>Rechercher<input name="q" maxlength="100" value="${esc(query)}" placeholder="Personnage ou anime"></label><label>Afficher<select name="mode">${Object.entries(labels).map(([id,label])=>`<option value="${id}" ${mode===id?'selected':''}>${label}</option>`).join('')}</select></label><button type="submit" ${loading?'disabled':''}>Rechercher</button><button type="button" data-ke-collection>Vendre une carte</button></form><p role="status" class="ke-status">${esc(error|| (loading?'Chargement des annonces…':'Page '+(page+1)+' · '+Math.min(24,rows.length)+(mode==='activity'?' opération(s)':' annonce(s)')))}</p><div class="ke-grid">${rows.slice(0,24).map(mode==='activity'?activityMarkup:listingMarkup).join('')||(!loading?'<div class="ke-empty"><h2>Aucune annonce pour le moment</h2><p>Publie une carte depuis ta collection ou essaie une autre recherche.</p></div>':'')}</div><div class="ke-pagination"><button type="button" data-ke-page="${page-1}" ${page===0||loading?'disabled':''}>Précédent</button><span>Page ${page+1}</span><button type="button" data-ke-page="${page+1}" ${rows.length<=24||loading?'disabled':''}>Suivant</button></div>`;
  root.querySelector('#keSearch').addEventListener('submit',e=>{e.preventDefault();const f=e.target;query=f.elements.q.value.trim();mode=f.elements.mode.value;page=0;load();});
 }
 function activityMarkup(t){const c=card(t.cardId),who=t.seller||'',label=t.type==='trade'?'Échange':t.type==='cancelled'?'Annonce retirée':t.type==='expired'?'Annonce expirée':t.type==='auction'?'Enchère conclue':t.type==='buy'?'Vente conclue':t.type;return '<article class="ke-listing"><div class="ke-copy"><span>'+esc(label)+'</span><h2>'+esc(c?.name||t.cardName||'Carte')+'</h2><p>'+esc(who)+(t.buyer?' → '+esc(t.buyer):'')+'</p><strong>'+(Number(t.gross)>0?amount(t.gross)+' ◆':'Transfert de carte')+'</strong><small>'+esc(remaining(t.at))+'</small>'+(Number(t.fee)>0?'<p>Frais : '+amount(t.fee)+' ◆</p>':'')+'<button type="button" data-ke-card="'+esc(t.cardId)+'">Voir la carte</button></div></article>';}
 function listingMarkup(l){
  const c=card(l.cardId);if(!c)return '';const mine=l.sellerId===owner,owned=game().owned,wants=l.wantCardIds||[],price=l.mode==='auction'?Math.max(l.price,l.topBid):l.price;
  const expired=l.endsAt&&l.endsAt<=now();
  const pending=mine&&expired?'<p class="ke-pending" role="status">Règlement en attente · la carte reste réservée. Consulte la cloche pour le suivi.</p>':'';
  return `<article class="ke-listing"><button class="ke-art" type="button" data-ke-card="${esc(c.id)}"><img src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy"></button><div class="ke-copy"><span>${esc(c.series)} · ${esc(c.rarity)}</span><h2>${esc(c.name)}</h2><p>${esc(labels[l.mode])} · ${mine?'Ton annonce':esc(l.seller)}</p><strong>${l.mode==='trade'?'Une carte en échange':amount(price)+' ◆'}</strong><small>Fin : ${esc(remaining(l.endsAt))}</small>${pending}${l.mode==='trade'?`<label>Carte proposée<select data-ke-wanted="${esc(l.id)}"><option value="">Choisir une carte possédée</option>${wants.map(id=>`<option value="${esc(id)}" ${owned.some(o=>o.id===id)?'':'disabled'}>${esc(card(id)?.name||id)}${owned.some(o=>o.id===id)?'':' · manquante'}</option>`).join('')}</select></label>`:''}${l.mode==='auction'?`<p>${l.bidder?'Meilleure mise : '+esc(l.bidder)+' · '+amount(l.topBid)+' ◆':'Aucune mise'}</p>`:''}<div class="ke-actions">${mine?`<button type="button" data-ke-action="cancel" data-id="${esc(l.id)}" ${l.bidderId||expired?'disabled':''}>Retirer la carte</button>`:l.mode==='trade'?`<button type="button" data-ke-action="trade" data-id="${esc(l.id)}">Échanger</button>`:l.mode==='sale'?`<button type="button" data-ke-action="buy" data-id="${esc(l.id)}" ${expired?'disabled':''}>Acheter · ${amount(l.price)} ◆</button>`:`<label>Ta mise<input type="number" data-ke-bid="${esc(l.id)}" min="${Math.max(l.price,l.topBid+1)}" max="100000000" step="1" value="${Math.max(l.price,l.topBid+1)}"></label><button type="button" data-ke-action="bid" data-id="${esc(l.id)}" ${expired?'disabled':''}>Enchérir</button><button type="button" data-ke-action="buy" data-id="${esc(l.id)}" ${expired?'disabled':''}>Achat immédiat · ${amount(l.buyNowPrice)} ◆</button>`}<button type="button" class="ke-secondary" data-ke-history="${esc(c.id)}">Ventes récentes</button></div></div></article>`;
 }
 async function load(){
  if(loading||!owner)return;loading=true;error='';rows=[];render();const token=epoch,id=owner;
  try{const response=await window.KizunaAccount.economyRequest(mode==='activity'?'get':'browse',mode==='activity'?{}:{page,mode,q:query});if(token!==epoch||id!==owner)return;rows=mode==='activity'?(response.snapshot.market.history||[]).slice(page*24,page*24+25):response.result.listings||[];lastLoad=Date.now();}
  catch(e){if(token===epoch)error=e.publicMessage||e.message;}
  finally{if(token===epoch){loading=false;render();}}
 }
 async function act(action,id){
  if(loading)return;const l=rows.find(x=>x.id===id);if(!l)return;const payload={id},c=card(l.cardId);
  let message='';
  if(action==='bid'){payload.amount=Number(root.querySelector(`[data-ke-bid="${CSS.escape(id)}"]`)?.value);message='Bloquer '+amount(payload.amount)+' Chakra pour cette enchère ? Une mise dans les 2 dernières minutes prolonge la fin de 2 minutes.';}
  else if(action==='trade'){payload.cardId=root.querySelector(`[data-ke-wanted="${CSS.escape(id)}"]`)?.value;if(!payload.cardId){error='Choisis une carte disponible à échanger.';render();return;}message='Échanger '+(card(payload.cardId)?.name||'ta carte')+' contre '+c.name+' ?';}
  else if(action==='buy')message='Acheter '+c.name+' pour '+amount(l.mode==='auction'?l.buyNowPrice:l.price)+' Chakra ?';
  else message='Retirer cette annonce et récupérer ta carte ? Les frais de dépôt restent prélevés.';
  if(!confirm(message))return;const token=epoch;loading=true;render();
  try{await window.KizunaAccount.economyRequest(action,payload);if(token===epoch)window.KizunaGame.notify('Opération confirmée.');}
  catch(e){if(token===epoch)error=e.publicMessage||e.message;}
  finally{if(token===epoch){loading=false;if(error)render();else await load();}}
 }
 function openSell(id){
  if(!account()?.economy||!setup())return;const c=card(id);if(!c||!game().owned.some(o=>o.id===id)){window.KizunaGame.notify('Aucun exemplaire disponible.');return;}
  selling={id,owner};dialog.setAttribute('aria-label','Proposer '+c.name);dialog.innerHTML=`<form id="keSell"><header><h2>Proposer ${esc(c.name)}</h2><button type="button" data-ke-close aria-label="Fermer">×</button></header><div class="ke-sell-preview"><img src="${esc(c.image)}" alt=""><p>${esc(c.series)}<br>${esc(c.rarity)}<br>Un exemplaire sera réservé.</p></div><label>Type d’annonce<select name="mode"><option value="sale">Prix fixe</option><option value="auction">Enchère</option><option value="trade">Échange</option></select></label><label data-ke-price>Prix / mise de départ<input name="price" type="number" min="${values[c.rarity]}" max="100000000" step="1" value="${values[c.rarity]}" required></label><label data-ke-duration>Durée<select name="hours"><option value="12">12 heures</option><option value="24" selected>24 heures</option><option value="48">48 heures</option></select></label><fieldset data-ke-trade hidden><legend>Cartes acceptées en retour · de 1 à 5</legend><label>Rechercher<input name="search" placeholder="Personnage ou anime"></label><div id="keWanted"></div><p id="keSelected">Aucune carte sélectionnée.</p></fieldset><p id="keFees"></p><p class="ke-status" role="status" id="keSellStatus"></p><button type="submit">Publier l’annonce</button><button type="button" data-ke-close>Annuler</button></form>`;
  const form=dialog.querySelector('form'),chosen=new Set();form.chosen=chosen;
  function candidates(){const q=form.elements.search.value.toLocaleLowerCase('fr'),selected=[...chosen].map(id=>card(id)?.name).filter(Boolean);dialog.querySelector('#keSelected').textContent=selected.length?selected.length+'/5 : '+selected.join(', '):'Aucune carte sélectionnée.';dialog.querySelector('#keWanted').innerHTML=game().cards.filter(x=>x.id!==id&&(!q||(x.name+' '+x.series).toLocaleLowerCase('fr').includes(q))).slice(0,40).map(x=>`<label><input type="checkbox" value="${esc(x.id)}" ${chosen.has(x.id)?'checked':''}>${esc(x.name)} · ${esc(x.series)}</label>`).join('');}
  dialog.querySelector('#keWanted').addEventListener('change',e=>{const input=e.target;if(input.checked&&chosen.size>=5){input.checked=false;return;}input.checked?chosen.add(input.value):chosen.delete(input.value);candidates();});
  form.elements.search.addEventListener('input',candidates);
  const update=()=>{const trade=form.elements.mode.value==='trade',price=Number(form.elements.price.value);dialog.querySelector('[data-ke-price]').hidden=trade;dialog.querySelector('[data-ke-duration]').hidden=trade;dialog.querySelector('[data-ke-trade]').hidden=!trade;form.elements.price.required=!trade;dialog.querySelector('#keFees').textContent=trade?'Échange gratuit contre une seule des cartes sélectionnées.':`Dépôt : ${amount(Math.max(1,Math.ceil(price*.02)))} ◆ · frais de vente : ${amount(Math.max(1,Math.ceil(price*.05)))} ◆${form.elements.mode.value==='auction'?' au prix final. Achat immédiat : '+amount(Math.min(100000000,price+100))+' ◆.':'.'}`;};
  form.elements.mode.addEventListener('change',update);form.elements.price.addEventListener('input',update);candidates();update();dialog.showModal();
 }
 async function publish(event){
  if(event.target.id!=='keSell')return;event.preventDefault();const form=event.target,token=epoch,context=selling;if(!context||context.owner!==owner||form.dataset.busy)return;
  const payload={cardId:context.id,mode:form.elements.mode.value,price:Number(form.elements.price.value),hours:Number(form.elements.hours.value),wants:[...form.chosen]};
  if(payload.mode==='trade'&&!payload.wants.length){dialog.querySelector('#keSellStatus').textContent='Sélectionne au moins une carte acceptée.';return;}
  form.dataset.busy='1';form.querySelector('[type="submit"]').disabled=true;
  try{await window.KizunaAccount.economyRequest('publish',payload);if(token!==epoch)return;dialog.close();window.KizunaGame.notify('Annonce publiée sur le marché partagé.');lastLoad=0;if(document.body.dataset.tab==='market')load();}
  catch(e){if(token===epoch)dialog.querySelector('#keSellStatus').textContent=e.publicMessage||e.message;}
  finally{delete form.dataset.busy;form.querySelector('[type="submit"]').disabled=false;}
 }
 async function history(id){
  if(loading)return;const token=epoch;dialog.setAttribute('aria-label','Ventes récentes');dialog.innerHTML='<h2>Ventes récentes</h2><p role="status">Chargement…</p><button type="button" data-ke-close>Fermer</button>';dialog.showModal();
  try{const response=await window.KizunaAccount.economyRequest('history',{cardId:id});if(token!==epoch)return;const sales=response.result.sales||[],median=rows=>{const a=rows.map(x=>Number(x.gross)).sort((a,b)=>a-b),n=a.length;return n?(n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2):null;},week=median(sales.filter(s=>s.at>=now()-7*86400000)),month=median(sales);dialog.innerHTML=`<h2>${esc(card(id)?.name)} · ventes conclues</h2><p>Médiane 7 j : ${week==null?'—':amount(week)+' ◆'} · médiane 30 j : ${month==null?'—':amount(month)+' ◆'}</p><p>${sales.length} vente(s) sur 30 jours${sales.length===1000?' · 1 000 ventes les plus récentes':''}.</p>${sales.length?'<ul>'+sales.slice(0,30).map(s=>'<li>'+esc(remaining(s.at))+' · '+amount(s.gross)+' ◆</li>').join('')+'</ul>':'<p>Aucune vente conclue. Aucun cours estimé.</p>'}<button type="button" data-ke-close>Fermer</button>`;}
  catch(e){if(token===epoch)dialog.innerHTML='<p role="alert">'+esc(e.publicMessage||e.message)+'</p><button type="button" data-ke-close>Fermer</button>';}
 }
 document.addEventListener('click',e=>{const b=e.target.closest('#keExchange button');if(!b)return;if(b.hasAttribute('data-ke-refresh'))load();else if(b.hasAttribute('data-ke-collection'))window.KizunaGame.showTab('collection');else if(b.dataset.keCard)window.KizunaGame.openCard(b.dataset.keCard);else if(b.dataset.keAction)act(b.dataset.keAction,b.dataset.id);else if(b.dataset.keHistory)history(b.dataset.keHistory);else if(b.hasAttribute('data-ke-page')){page=Number(b.dataset.kePage);load();}});
 document.addEventListener('kizuna:account-change',sync);window.addEventListener('hashchange',()=>setTimeout(show,0));
 window.setInterval(()=>{if(!document.hidden&&document.body.dataset.tab==='market'&&!dialog?.open)show();},30000);
 function searchCard(id){
  if(!account()?.economy)return;sync();const c=card(id);if(!c)return;
  if(loading){window.KizunaGame?.notify?.('Attends la fin du chargement du marché.');return;}
  query=c.name;page=0;mode='all';lastLoad=0;rows=[];render();window.KizunaGame.showTab('market');show();
 }
 window.KizunaExchange={show,openSell,searchCard};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
})();
