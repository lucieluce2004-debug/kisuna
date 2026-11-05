/* Accessible card inspection and factual Wiki presentation. No inventory writes. */
let kzViewerReturn=null,kzViewerBack=false,kzViewerZoom=false,kzProfileReturn=null;
const kzViewerFocusable=root=>[...root.querySelectorAll('button:not([disabled]),a[href]:not([tabindex="-1"]),input:not([disabled]),select:not([disabled]),[tabindex="0"]')].filter(node=>!node.closest('[hidden],[aria-hidden="true"]'));
function kzViewerUpdate(){
  const viewer=$('cardViewer'),flip=$('kzViewerFlip'),zoom=$('kzViewerZoom');if(!viewer)return;
  viewer.classList.toggle('kz-zoomed',kzViewerZoom);viewer.querySelector('.fcard')?.classList.toggle('flipped',kzViewerBack);
  viewer.querySelector('.ff')?.setAttribute('aria-hidden',String(kzViewerBack));viewer.querySelector('.fb')?.setAttribute('aria-hidden',String(!kzViewerBack));
  viewer.querySelectorAll('.fb a').forEach(link=>link.tabIndex=kzViewerBack?0:-1);
  if(flip){flip.textContent=kzViewerBack?'Voir le recto':'Voir le verso';flip.setAttribute('aria-pressed',String(kzViewerBack));}
  if(zoom){zoom.textContent=kzViewerZoom?'Taille normale':'Agrandir';zoom.setAttribute('aria-pressed',String(kzViewerZoom));}
  if($('kzViewerStatus'))$('kzViewerStatus').textContent=(kzViewerBack?'Verso':'Recto')+' · '+(kzViewerZoom?'Agrandissement activé':'Taille normale');
}
openDetail=function(card){
  if(!card)return;
  if(!$('detailBackdrop').classList.contains('open'))kzViewerReturn=document.activeElement;
  state.activeCharacter=card;kzViewerBack=false;kzViewerZoom=false;
  const info=ownInfo(card.id),rarity=rarityFor(card),root=$('detailBackdrop'),reserved=collectionStatus().reserved[card.id]||0;
  root.classList.add('kz-card-viewer');root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Carte : '+card.name);root.style.setProperty('--viewer-glow',rarity.color);
  $('detailTitle').textContent=card.name;$('detailSubtitle').textContent=card.series;
  const acquired=info.since>0&&Number.isFinite(new Date(info.since).getTime())?new Date(info.since).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}):null;
  const owned=info.count>0?info.count+' exemplaire'+(info.count>1?'s disponibles':' disponible'):reserved?'Exemplaire réservé au marché':'À découvrir dans un booster';
  $('detailContent').innerHTML='<div class="kz-viewer-head"><div><small>COLLECTION · '+esc(rarity.name)+'</small><h2>'+esc(card.name)+'</h2><p>'+esc(card.series)+'</p></div><button type="button" class="kr-detail-close" id="viewerClose" aria-label="Fermer la carte">×</button></div><div class="ka-viewer-layout"><div class="kz-viewer-stage"><div class="ka-viewer-halo" aria-hidden="true"></div><span class="ka-viewer-seal" aria-hidden="true">KIZUNA<br>COLLECTION</span><div class="bigcard" id="cardViewer">'+cardMarkup(card,{flip:true,count:info.count,since:info.since})+'</div></div><div class="ka-viewer-dossier"><span class="ka-viewer-kicker">FICHE DE COLLECTION</span><p class="ka-viewer-number">N° <strong>'+String(card.rank).padStart(4,'0')+'</strong><span> / '+String(LOCAL_CARDS.length).padStart(4,'0')+'</span></p><p class="ka-viewer-owned">'+esc(owned)+'</p><dl class="ka-viewer-facts"><div><dt>Univers</dt><dd>'+esc(card.series)+'</dd></div><div><dt>Rareté</dt><dd class="ka-viewer-rarity">'+esc(rarity.name)+'</dd></div>'+(card.native?'<div><dt>Nom original</dt><dd>'+esc(card.native)+'</dd></div>':'')+(reserved?'<div><dt>Au marché</dt><dd>'+reserved+' exemplaire'+(reserved>1?'s réservés':' réservé')+'</dd></div>':'')+(acquired?'<div><dt>Première obtention disponible</dt><dd>'+esc(acquired)+'</dd></div>':'')+'</dl><p class="ka-viewer-help">Retourne la carte pour consulter ses caractéristiques. Clique sur l’illustration ou utilise les commandes ci-dessous.</p><div class="kz-viewer-controls"><button class="soft-btn" id="kzViewerFlip" type="button" aria-pressed="false">Voir le verso</button><button class="soft-btn" id="kzViewerZoom" type="button" aria-pressed="false">Agrandir</button></div><p class="kz-viewer-caption" id="kzViewerStatus" role="status"></p></div></div>';
  if(card.rarity==='Mythique'){const b=document.createElement('button');b.type='button';b.className='soft-btn';b.dataset.kmOpen=card.id;b.textContent='Éveil mythique';$('detailContent').querySelector('.kz-viewer-controls').append(b);}
  root.classList.add('open');document.body.style.overflow='hidden';kzViewerUpdate();
  $('viewerClose').addEventListener('click',()=>closeBackdrop('detailBackdrop'));
  $('kzViewerFlip').addEventListener('click',()=>{kzViewerBack=!kzViewerBack;kzViewerUpdate();});
  $('kzViewerZoom').addEventListener('click',()=>{kzViewerZoom=!kzViewerZoom;kzViewerUpdate();});
  $('cardViewer').addEventListener('click',event=>{if(event.target.closest('a,button'))return;event.preventDefault();event.stopPropagation();kzViewerBack=!kzViewerBack;kzViewerUpdate();});
  $('viewerClose').focus({preventScroll:true});
};
const kzViewerPriorClose=closeBackdrop;
closeBackdrop=function(id){const restore=id==='detailBackdrop'&&$('detailBackdrop')?.classList.contains('open');kzViewerPriorClose(id);if($('kyaraProfileOverlay')?.classList.contains('open'))document.body.style.overflow='hidden';if(restore&&kzViewerReturn?.isConnected){kzViewerReturn.focus({preventScroll:true});kzViewerReturn=null;}};
document.addEventListener('keydown',event=>{
  const root=$('detailBackdrop');if(!root?.classList.contains('open')||!root.classList.contains('kz-card-viewer'))return;
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeBackdrop('detailBackdrop');return;}
  if(event.key==='Tab'){const nodes=kzViewerFocusable($('detailContent'));if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&(document.activeElement===first||!nodes.includes(document.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||!nodes.includes(document.activeElement))){event.preventDefault();first.focus();}}
},true);

// Catalogue data are always available. Live AniList enrichment stays in the staff workflow.
cpFetchProfile=async function(){return null;};
const kzOriginalProfileOpen=openCharacterProfile;
openCharacterProfile=function(card,source='wiki',options={}){
  if(!$('kyaraProfileOverlay')?.classList.contains('open'))kzProfileReturn=document.activeElement;
  kzOriginalProfileOpen(card,source,options);
  const root=$('kyaraProfileOverlay');if(!root)return;
  root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Fiche de '+card.name);
  root.querySelectorAll('[data-kz-profile-inspect]').forEach(node=>node.remove());
  const button=document.createElement('button');button.type='button';button.className='soft-btn kz-profile-enlarge';button.textContent='Examiner la carte';button.dataset.kzProfileInspect=String(card.id);
  root.querySelector('.cp-hero-inner > div')?.append(button);
};
const kzOriginalProfileHide=cpHideProfile;
cpHideProfile=function(){const open=$('kyaraProfileOverlay')?.classList.contains('open');kzOriginalProfileHide();if(open&&kzProfileReturn?.isConnected){kzProfileReturn.focus({preventScroll:true});kzProfileReturn=null;}};
document.addEventListener('click',event=>{const button=event.target.closest('[data-kz-profile-inspect]');if(!button)return;const card=LOCAL_CARDS.find(row=>String(row.id)===button.dataset.kzProfileInspect);if(card)openDetail(card);});
document.addEventListener('keydown',event=>{
  const root=$('kyaraProfileOverlay');if(!root?.classList.contains('open')||$('detailBackdrop')?.classList.contains('open'))return;
  if(event.key==='Tab'){const nodes=kzViewerFocusable(root),first=nodes[0],last=nodes.at(-1);if(!first)return;if(event.shiftKey&&(document.activeElement===first||!root.contains(document.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||!root.contains(document.activeElement))){event.preventDefault();first.focus();}}
},true);

// The character sheet must not turn catalogue recycle values or asking prices into observed sales.
kaMarketProfilePanel=function(card,r){
  const now=Date.now(),week=now-7*86400000,month=now-30*86400000,cutoff=now-kyaraMarketChartRange*86400000;
  const actual=kyaraMarketHistory.filter(row=>String(row.cardId)===String(card.id)&&['buy','auction','buy-now'].includes(row.type)&&Number.isFinite(Number(row.at))&&row.at>0&&row.at<=now&&Number.isFinite(Number(row.gross))&&row.gross>0).map(row=>({at:Number(row.at),value:Number(row.gross)})).sort((a,b)=>a.at-b.at);
  const w=actual.filter(row=>row.at>=week),m=actual.filter(row=>row.at>=month),visible=actual.filter(row=>row.at>=cutoff);
  const median=rows=>rows.length?fmt(kaMedian(rows.map(row=>row.value)))+' ◆':'—';
  const chart=visible.length>=2?kaChartSvg(visible,r?.color||'#d9b86f',165):'<p class="kz-price-empty">'+(visible.length?'Une vente enregistrée sur cette période. Le graphique apparaîtra à partir de deux ventes.':'Aucune vente enregistrée sur cette période.')+'</p>';
  return '<section class="cp-panel cp-market-panel"><div class="cp-section-id">MARCHÉ · HISTORIQUE LOCAL</div><div class="cp-market-title-row"><h2 class="cp-section-title">Ventes constatées</h2><div class="ka-range-toggle" role="group" aria-label="Période du graphique">'+[7,30].map(days=>'<button type="button" data-ka-range="'+days+'" data-ka-range-card="'+esc(card.id)+'" class="'+(kyaraMarketChartRange===days?'active':'')+'" aria-pressed="'+(kyaraMarketChartRange===days)+'">'+days+' j</button>').join('')+'</div></div><div class="cp-market-stats"><div><span>Médiane 7 j</span><b>'+median(w)+'</b></div><div><span>Médiane 30 j</span><b>'+median(m)+'</b></div><div><span>Ventes 30 j</span><b>'+fmt(m.length)+'</b></div></div>'+chart+'<p class="cp-market-foot">Transactions enregistrées dans ton espace de jeu. Les prix demandés dans les annonces ne sont pas des ventes conclues.</p><div class="cp-market-actions"><button class="cp-action primary" type="button" data-cp-market-list="'+esc(card.id)+'">Voir les annonces</button><button class="cp-action" type="button" data-cp-toggle-wishlist="'+esc(card.id)+'">'+(kyaraMarketWishlistIds.includes(String(card.id))?'Retirer de mes envies':'Ajouter à mes envies')+'</button></div></section>';
};
