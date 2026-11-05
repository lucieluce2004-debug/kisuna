/* Private transaction activity; reads never mutate the collection or balance. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=n=>Number(n||0).toLocaleString('fr-FR'),date=v=>v?new Date(v).toLocaleString('fr-FR'):'Pas encore exécuté';
 const account=()=>window.KizunaAccount?.getSnapshot?.()||{};
 const key=()=>{const a=account();return !a.loading&&a.user?.id?String(a.user.id):'';};
 const admin=()=>!!key()&&account().isAdmin===true;
 let owner='',epoch=0,ticket=0,busy=false,items=[],unread=0,latest='0',more=false,filter='all',dialog,lastFocus,staffOwner='',staffEpoch=0,staffBusy=false,countBusy=false;
 function badge(){const b=$('kzNotifications');if(!b)return;let n=$('knUnread');if(!n){n=document.createElement('span');n.id='knUnread';n.className='kn-badge';n.setAttribute('aria-hidden','true');b.append(n);}n.hidden=!owner||!unread;n.textContent=unread>99?'99+':String(unread);b.setAttribute('aria-label',owner?'Notifications du marché'+(unread?', '+number(unread)+' non lues':''):'Notifications');}
 function description(row){const p=row.payload||{},name=p.cardName||'Carte',cash=n=>number(n)+' Chakra';switch(row.kind){
  case 'wishlist':return ['Une carte recherchée est proposée',name+' vient d’apparaître au marché. Consulte les annonces pour vérifier sa disponibilité.'];
  case 'published':return ['Annonce publiée',name+' est réservé au marché. Frais de dépôt : '+cash(p.deposit)+'.'];
  case 'sold':return ['Vente conclue',name+' vendu pour '+cash(p.gross)+'. Tu reçois '+cash(p.net)+' après '+cash(p.fee)+' de frais.'];
  case 'bought':return ['Carte reçue',name+' rejoint ta collection. Prix : '+cash(p.amount)+'.'];
  case 'traded':return ['Échange conclu','L’échange concernant '+name+' est terminé. Les cartes ont été transférées.'];
  case 'new_bid':return ['Nouvelle enchère',cash(p.amount)+' proposés pour '+name+'.'];
  case 'bid_placed':return ['Mise enregistrée',cash(p.amount)+' réservés pour '+name+'. Une surenchère te rembourse automatiquement.'];
  case 'outbid':return ['Surenchère · mise rendue','Ta mise de '+cash(p.amount)+' pour '+name+' a été remboursée.'];
  case 'refunded':return ['Mise remboursée',name+' a été acheté directement. Ta mise de '+cash(p.amount)+' a été rendue.'];
  case 'ended':return ['Annonce expirée',name+' est revenu dans ta collection.'];
  case 'cancelled':return ['Annonce retirée',name+' est revenu dans ta collection.'];
  case 'pending':return ['Règlement en attente',name+' reste réservé. '+(p.reason==='inventory_full'?'Ta collection a atteint 5 000 exemplaires. Libère une place : le règlement reprendra automatiquement.':p.reason==='balance_limit'?'Ton solde est à sa limite. Dépense du Chakra pour permettre le versement.':'Une nouvelle tentative aura lieu automatiquement. Le staff peut consulter le suivi.')];
  default:return ['Activité du marché',name];
 }}
 function status(text,error=false){const n=$('knStatus');if(n){n.textContent=text;n.classList.toggle('is-error',error);}}
 function controls(){if(!dialog)return;dialog.querySelectorAll('[data-kn-action]').forEach(b=>b.disabled=busy);$('knReadAll').disabled=busy||!unread||latest==='0';$('knMore').hidden=!more;$('knFilter').disabled=busy;dialog.setAttribute('aria-busy',String(busy));}
 function render(){if(!dialog)return;$('knList').innerHTML=items.length?items.map(row=>{const [title,text]=description(row);return '<li class="kn-item '+(row.readAt?'':'is-unread')+'"><div><strong>'+esc(title)+'</strong><p>'+esc(text)+'</p><time datetime="'+esc(row.createdAt)+'">'+esc(date(row.createdAt))+'</time></div>'+(!row.readAt?'<button type="button" class="soft-btn" data-kn-action="read" data-kn-id="'+esc(row.id)+'" aria-label="Marquer comme lu : '+esc(title)+'">Lu</button>':'<span class="kn-read">Lu</span>')+'</li>';}).join(''):'<li class="kn-empty">'+(filter==='unread'?'Tu n’as aucune notification non lue.':'Tes ventes, enchères et échanges apparaîtront ici dès leur prochaine activité.')+'</li>';$('knCount').textContent=number(unread)+' non lue'+(unread>1?'s':'');badge();controls();}
 async function load(action='get',payload={},append=false){if(busy||!owner||owner!==key())return;const e=epoch,t=++ticket;busy=true;controls();status('Chargement…');
  try{const result=await window.KizunaAccount.marketInboxRequest(action,{...payload,filter});if(e!==epoch||t!==ticket||owner!==key())return;
   const rows=Array.isArray(result?.items)?result.items:[];more=rows.length>25;items=append?[...items,...rows.slice(0,25)]:rows.slice(0,25);unread=Number(result.unread)||0;if(!append)latest=String(result.latestId||'0');render();status('Activité synchronisée. Les nouveaux règlements peuvent prendre une minute.');
  }catch(error){if(e===epoch&&t===ticket)status(error.message||'Le suivi est indisponible. Réessaie.',true);}
  finally{if(e===epoch&&t===ticket){busy=false;controls();}}
 }
 async function count(){if(!owner||owner!==key()||busy||countBusy||document.hidden)return;const e=epoch,t=ticket;countBusy=true;
  try{const r=await window.KizunaAccount.marketInboxRequest('count');if(e===epoch&&t===ticket&&owner===key()){unread=Number(r.unread)||0;badge();}}
  catch{/* Preserve the last confirmed count; the dialog exposes retryable errors. */}finally{if(e===epoch)countBusy=false;}
 }
 function mountDialog(){if(dialog)return;dialog=document.createElement('dialog');dialog.id='knInbox';dialog.className='kn-dialog';dialog.setAttribute('aria-labelledby','knTitle');dialog.innerHTML='<header><div><span class="kn-kicker">TON ACTIVITÉ</span><h2 id="knTitle">Le courrier du marché</h2><p id="knCount"></p></div><button type="button" class="soft-btn" data-kn-close>Fermer</button></header><div class="kn-toolbar"><label>Afficher<select id="knFilter"><option value="all">Toute l’activité</option><option value="unread">Non lues</option></select></label><button type="button" class="soft-btn" data-kn-action="get">Actualiser</button><button type="button" class="soft-btn" id="knReadAll" data-kn-action="read_all">Tout marquer comme lu</button></div><p id="knStatus" role="status" aria-live="polite"></p><ul id="knList"></ul><button type="button" id="knMore" class="soft-btn" data-kn-action="more" hidden>Activité plus ancienne</button>';document.body.append(dialog);
  dialog.addEventListener('click',e=>{if(e.target.closest('[data-kn-close]')){dialog.close();return;}const b=e.target.closest('[data-kn-action]');if(!b||b.disabled)return;const a=b.dataset.knAction;if(a==='more')load('get',{before:items.at(-1)?.id},true);else if(a==='read')load('read',{id:b.dataset.knId});else if(a==='read_all')load('read_all',{through:latest});else load();});
  $('knFilter').addEventListener('change',()=>{filter=$('knFilter').value;items=[];more=false;render();load();});
  dialog.addEventListener('close',()=>{if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});});
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 }
 function open(){sync();if(!owner)return;mountDialog();lastFocus=document.activeElement;if(!dialog.open)dialog.showModal();render();load();}
 function sync(){const next=key();if(next!==owner){owner=next;epoch++;ticket++;busy=false;countBusy=false;items=[];unread=0;latest='0';more=false;filter='all';if(dialog){dialog.close();dialog.remove();dialog=null;}badge();if(owner)count();}staffMount();}
 function staffMount(){const tabs=$('staffPage')?.querySelector('.ks-tabs'),next=admin()?key():'';if(staffOwner!==next||!next){$('knStaffTab')?.remove();$('ks-market')?.remove();staffOwner=next;staffEpoch++;staffBusy=false;}if(!next||!tabs||$('ks-market'))return;
  const tab=document.createElement('button');tab.type='button';tab.id='knStaffTab';tab.dataset.ksTab='market';tab.textContent='Marché';tab.setAttribute('aria-controls','ks-market');tab.setAttribute('aria-pressed','false');tabs.append(tab);
  const panel=document.createElement('section');panel.id='ks-market';panel.className='ks-panel kn-staff';panel.hidden=true;panel.innerHTML='<span class="kn-kicker">SUIVI DES RÈGLEMENTS</span><h2>Un marché qui reste actif</h2><p>Les annonces arrivées à échéance sont vérifiées chaque minute, même sans joueur connecté. Les cartes et mises restent réservées pendant un règlement en attente.</p><button type="button" class="ks-button" id="knHealthRefresh">Actualiser le suivi</button><p id="knHealthStatus" role="status"></p><div id="knHealth"></div>';$('staffPage').querySelector('.ks-wrap').append(panel);tab.addEventListener('click',health);$('knHealthRefresh').addEventListener('click',health);
 }
 async function health(){if(!admin()||staffBusy)return;const e=staffEpoch,u=key();staffBusy=true;$('knHealthRefresh').disabled=true;$('knHealthStatus').textContent='Vérification…';
  try{const r=await window.KizunaAccount.marketInboxRequest('health');if(e!==staffEpoch||u!==key()||!admin())return;const s=r.scheduler||{},old=!s.last_success_at||Date.now()-Date.parse(s.last_success_at)>180000;
   $('knHealthStatus').textContent=!r.scheduled?'Le règlement automatique n’est pas activé.':s.status==='error'?'Le dernier passage a rencontré une erreur.':old?'Le dernier passage réussi date de plus de trois minutes, ou le service vient de démarrer.':s.status==='busy'?'Une opération était en cours. Nouvelle vérification à la prochaine minute.':'Le règlement automatique fonctionne.';
   $('knHealth').innerHTML='<dl><div><dt>Dernier passage réussi</dt><dd>'+esc(date(s.last_success_at))+'</dd></div><div><dt>Annonces à régler</dt><dd>'+number(r.due)+'</dd></div><div><dt>En attente de résolution</dt><dd>'+number(r.blocked)+'</dd></div><div><dt>Réglées au dernier passage</dt><dd>'+number(s.processed)+'</dd></div></dl><p>Collections pleines : '+number(r.issues?.inventory_full)+' · Soldes à la limite : '+number(r.issues?.balance_limit)+' · Autres tentatives : '+number(r.issues?.retry_error)+'.</p>'+(s.error_code?'<p>Code du dernier incident : '+esc(s.error_code)+'</p>':'');
  }catch(error){if(e===staffEpoch&&admin()){$('knHealth').textContent='';$('knHealthStatus').textContent=error.message||'Le suivi est indisponible.';}}
  finally{if(e===staffEpoch){staffBusy=false;if($('knHealthRefresh'))$('knHealthRefresh').disabled=false;}}
 }
 new MutationObserver(staffMount).observe(document.querySelector('main'),{childList:true,subtree:true});
 document.addEventListener('kizuna:account-change',sync);window.addEventListener('kizuna:economy-change',()=>{if(dialog?.open)load();else count();});window.addEventListener('focus',count);document.addEventListener('visibilitychange',count);window.setInterval(count,60000);
 window.KizunaMarketInbox=Object.freeze({open});sync();
})();
