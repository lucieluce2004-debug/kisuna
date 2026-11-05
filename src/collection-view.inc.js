/* Collection presentation. Reads free copies, escrow and wishlist separately;
   rendering never settles a listing, grants a card, or writes a player snapshot. */
function collectionQuery(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').trim();}
const kgBinder={mode:'book',page:0,pages:1,signature:''};
function kgBinderControls(detail,total=0){
 const grid=$('colGrid');if(!$('kgBinderControls')){const top=document.createElement('div');top.id='kgBinderControls';top.className='kg-binder-controls';grid.before(top);const bottom=document.createElement('div');bottom.id='kgBinderBottom';bottom.className='kg-binder-controls kg-binder-bottom';grid.after(bottom);const folio=document.createElement('div');folio.id='kgBookFolio';folio.className='ka-book-folio';folio.setAttribute('aria-hidden','true');grid.after(folio);}
 const book=detail&&kgBinder.mode==='book';grid.classList.toggle('kg-book',book);$('kgBinderControls').hidden=!detail;$('kgBinderBottom').hidden=!book||total===0;$('kgBookFolio').hidden=!book||total===0;
 if(book){$('kgBookFolio').innerHTML='<span>'+String(kgBinder.page*2+1).padStart(2,'0')+'</span><span>KIZUNA · COLLECTION</span><span>'+String(kgBinder.page*2+2).padStart(2,'0')+'</span>';grid.setAttribute('aria-label','Pages de l’album '+($('colAlbumTitle')?.textContent||''));}else grid.removeAttribute('aria-label');
 if(!detail)return;
 const pages='<div><button type="button" data-kg-page="prev" aria-label="Page précédente"'+(kgBinder.page===0?' disabled':'')+'>←</button><span role="status" aria-live="polite">Page '+(kgBinder.page+1)+' / '+kgBinder.pages+'</span><button type="button" data-kg-page="next" aria-label="Page suivante"'+(kgBinder.page>=kgBinder.pages-1?' disabled':'')+'>→</button></div>';
 $('kgBinderControls').innerHTML='<div role="group" aria-label="Présentation de l’album"><button type="button" data-kg-album-mode="book" aria-pressed="'+book+'">▥ Classeur</button><button type="button" data-kg-album-mode="grid" aria-pressed="'+!book+'">▦ Grille</button></div>'+(book?pages:'');$('kgBinderBottom').innerHTML=pages;
}
document.addEventListener('click',event=>{
 const mode=event.target.closest('[data-kg-album-mode]'),page=event.target.closest('[data-kg-page]');if(!mode&&!page)return;if(page?.disabled)return;
 const group=event.target.closest('.kg-binder-controls')?.id;
 if(mode){kgBinder.mode=mode.dataset.kgAlbumMode;kgBinder.page=0;}else kgBinder.page=Math.max(0,Math.min(kgBinder.pages-1,kgBinder.page+(page.dataset.kgPage==='next'?1:-1)));
 renderCollection();const root=$(group);if(mode)[...root.querySelectorAll('[data-kg-album-mode]')].find(n=>n.dataset.kgAlbumMode===mode.dataset.kgAlbumMode)?.focus({preventScroll:true});else{const buttons=[...root.querySelectorAll('[data-kg-page]')];(buttons.find(n=>n.dataset.kgPage===page.dataset.kgPage&&!n.disabled)||buttons.find(n=>!n.disabled))?.focus({preventScroll:true});}
 if(page&&!window.KizunaExperience?.reduced?.()){const grid=$('colGrid');grid.classList.remove('kg-book-turn');requestAnimationFrame(()=>{grid.classList.add('kg-book-turn');setTimeout(()=>grid.classList.remove('kg-book-turn'),300);});}
});
function collectionStatus(){
  const available=ownCounts(),reserved=Object.create(null),latest=Object.create(null),first=Object.create(null);
  for(const copy of state.owned){const id=String(copy.id),at=Number(copy.at)||0;latest[id]=Math.max(latest[id]||0,at);if(!first[id]||at<first[id])first[id]=at;}
  // Do not call kyaraMarketActive/OwnListings: those legacy helpers settle auctions.
  const seller=String(state.username||'Invité').trim();
  for(const listing of kyaraMarketListings){
    if(listing.status!=='active'||listing.seller!==seller||!listing.reservedCopy||String(listing.reservedCopy.id)!==String(listing.cardId))continue;
    const id=String(listing.cardId);reserved[id]=(reserved[id]||0)+1;
  }
  return {available,reserved,latest,first,wanted:new Set(kyaraMarketWishlistIds.map(String))};
}
function resetCollectionFilters(){
  COL.rar='all';COL.limit=60;window.KizunaMythic?.resetFilter();
  for(const [id,value] of [['colSearch',''],['colUniv','all'],['colOwn','all'],['colSort','num']])if($(id))$(id).value=value;
  renderCollection();
  $('colSearch')?.focus();
}
function collectionLoadMore(){
  const before=$('colGrid')?.querySelectorAll('[data-colcard]').length||0;
  COL.limit+=60;renderCollection();
  const target=$('colGrid')?.querySelectorAll('[data-colcard]')[before];
  (target||$('colMore'))?.focus({preventScroll:true});
}
function collectionToggleCard(id,button){
  const tile=[...$('colGrid').querySelectorAll('[data-colcard]')].find(node=>node.dataset.colcard===String(id));
  const card=tile?.querySelector('.fcard');if(!card)return false;
  const flipped=card.classList.toggle('flipped');
  card.querySelector('.ff')?.setAttribute('aria-hidden',String(flipped));
  card.querySelector('.fb')?.setAttribute('aria-hidden',String(!flipped));
  card.querySelectorAll('.fb a').forEach(link=>link.tabIndex=flipped?0:-1);
  if(button){button.setAttribute('aria-pressed',String(flipped));button.textContent=flipped?'Recto':'Verso';}
  return flipped;
}
function collectionAlbumEntries(){
  const definitions=new Map(sharedAlbumDefinitions.map(row=>[row.name.trim().toLocaleLowerCase('fr'),row])),entries=new Map();
  for(const [rawName,rows] of kgbAlbumGroups()){
    const name=String(rawName||'').trim();if(!name)continue;
    const definition=definitions.get(name.toLocaleLowerCase('fr')),key=definition?'album:'+definition.id:'series:'+name.toLocaleLowerCase('fr');
    let entry=entries.get(key);
    if(!entry){entry={key,name:definition?.name||name,definition:definition||null,cards:[]};entries.set(key,entry);}
    const seen=new Set(entry.cards.map(card=>String(card.id)));
    for(const card of rows){if(!seen.has(String(card.id))){seen.add(String(card.id));entry.cards.push(card);}}
  }
  return [...entries.values()].filter(entry=>entry.definition||new Set(entry.cards.map(card=>String(card.sourceId||'')).filter(source=>/^[1-9]\d*$/.test(source))).size>=2)
    .sort((left,right)=>left.name.localeCompare(right.name,'fr',{sensitivity:'base',numeric:true})||left.key.localeCompare(right.key,'fr',{sensitivity:'variant',numeric:true}));
}
function resetCollectionAlbum(restore=false){
  const previous=COL.albumReturn;COL.albumKey='';COL.albumReturn=null;
  if(restore&&previous){
    COL.rar=previous.rar||'all';COL.limit=Math.max(60,Number(previous.limit)||60);
    for(const [id,key] of [['colSearch','query'],['colUniv','universe'],['colOwn','own'],['colSort','sort']]){
      const input=$(id);if(input&&typeof previous[key]==='string')input.value=previous[key];
    }
  }
}
function openCollectionAlbum(key){
  const entry=collectionAlbumEntries().find(album=>album.key===String(key));
  if(!entry){resetCollectionAlbum(true);COL.view='albums';renderCollection();return false;}
  if(!COL.albumReturn)COL.albumReturn={query:$('colSearch').value,universe:$('colUniv').value,own:$('colOwn').value,sort:$('colSort').value,rar:COL.rar,limit:COL.limit};
  COL.albumKey=entry.key;COL.view='albums';COL.rar='all';COL.limit=60;
  $('colSearch').value='';$('colUniv').value='all';$('colOwn').value='all';$('colSort').value='num';
  document.querySelectorAll('#colSeg button').forEach(button=>button.classList.toggle('on',button.dataset.v==='albums'));
  if(document.body.dataset.tab==='col')renderCollection();else showTab('col');
  $('colAlbumTitle')?.focus({preventScroll:true});
  $('colAlbumDetail')?.scrollIntoView?.({block:'start',behavior:'instant'});
  window.dispatchEvent(new CustomEvent('kizuna:album-open',{detail:{key:entry.key}}));
  return true;
}
function closeCollectionAlbum(){
  const key=COL.albumKey;resetCollectionAlbum(true);COL.view='albums';
  document.querySelectorAll('#colSeg button').forEach(button=>button.classList.toggle('on',button.dataset.v==='albums'));
  renderCollection();
  const tile=[...document.querySelectorAll('#colAlbums [data-open-album]')].find(button=>button.dataset.openAlbum===key);
  (tile||$('colSearch'))?.focus({preventScroll:true});
  tile?.scrollIntoView?.({block:'nearest',behavior:'instant'});
}
function renderCollection(){
  if(document.body.dataset.tab!=='col')return;
  const focusRarity=document.activeElement?.matches('#colChips [data-r]')?document.activeElement.dataset.r:null;
  const status=collectionStatus(),m=status.available,n=LOCAL_CARDS.length,first=status.first;
  const uniq=LOCAL_CARDS.filter(card=>m[card.id]).length,dup=Object.values(m).reduce((sum,count)=>sum+count-1,0),pct=n?uniq/n*100:0;
  $('colUnique').innerHTML=uniq+'<s>/'+n+'</s>';$('colPct').textContent=pct.toFixed(1).replace('.',',')+' %';$('colRingTxt').textContent=pct.toFixed(1).replace('.',',')+' %';$('colRing').style.setProperty('--p',pct);$('colDup').textContent=dup;$('colChakra').textContent=fmt(chakra);
  const albums=COL.view==='albums'?collectionAlbumEntries():[];
  let active=COL.view==='albums'&&COL.albumKey?albums.find(album=>album.key===COL.albumKey):null;
  if(COL.albumKey&&!active)resetCollectionAlbum(true);
  const detail=!!active,albumList=COL.view==='albums'&&!detail,pool=active?active.cards:LOCAL_CARDS;
  if(!detail)kgBinderControls(false);
  const RN=['Commun','Peu commune','Rare','Épique','Légendaire','Mythique'],rc={};
  RN.forEach(rarity=>rc[rarity]=[0,0]);
  pool.forEach(card=>{if(rc[card.rarity]){rc[card.rarity][1]++;if(m[card.id])rc[card.rarity][0]++;}});
  const scopeUnique=pool.filter(card=>m[card.id]).length;
  $('colChips').innerHTML='<button class="col-chip '+(COL.rar==='all'?'on':'')+'" data-r="all" type="button" aria-pressed="'+(COL.rar==='all')+'">Toutes <em>'+scopeUnique+'/'+pool.length+'</em></button>'+RN.map(rarity=>'<button class="col-chip '+(COL.rar===rarity?'on':'')+'" data-r="'+rarity+'" type="button" aria-pressed="'+(COL.rar===rarity)+'" style="--c:'+rarityFor({rarity}).color+'"><i></i>'+rarity+' <em>'+rc[rarity][0]+'/'+rc[rarity][1]+'</em></button>').join('');
  if(focusRarity!==null)[...$('colChips').querySelectorAll('[data-r]')].find(node=>node.dataset.r===focusRarity)?.focus({preventScroll:true});
  const top=[...seriesMap().entries()].map(([name,cards])=>[name,cards.filter(card=>m[card.id]).length,cards.length]).sort((left,right)=>right[1]-left[1]||right[2]-left[2]).slice(0,5);
  $('colUni').innerHTML=top.map(row=>'<div class="r"><span>'+esc(row[0])+'</span><div class="col-bar"><i style="width:'+(row[2]?row[1]/row[2]*100:0)+'%"></i></div><em>'+row[1]+'/'+row[2]+'</em></div>').join('');
  $('colAlbums').hidden=!albumList;$('colGrid').hidden=albumList;$('colMore').hidden=true;
  $('colAlbumDetail').hidden=!detail;$('colUniverseFilter').hidden=detail;
  ['colChips','colCount'].forEach(id=>$(id).style.display=albumList?'none':'');
  document.querySelector('.col-filters').style.display=albumList?'none':'';
  if(detail){
    const obtained=active.cards.filter(card=>m[card.id]).length,total=active.cards.length,percent=total?obtained/total*100:0;
    $('colAlbumTitle').textContent=active.name;
    $('colAlbumProgress').textContent=fmt(obtained)+'/'+fmt(total)+' cartes obtenues · '+percent.toLocaleString('fr-FR',{maximumFractionDigits:1})+' %';
  }else{$('colAlbumTitle').textContent='';$('colAlbumProgress').textContent='';}
  if(albumList){
    const query=collectionQuery($('colSearch').value);
    const visible=albums.filter(album=>!query||collectionQuery(album.name).includes(query)||album.cards.some(card=>collectionQuery(card.name).includes(query)));
    $('colAlbums').innerHTML=visible.map(album=>{
      const count=album.cards.filter(card=>m[card.id]).length,total=album.cards.length,percent=total?Math.round(count/total*100):0,number=albums.indexOf(album)+1;
      // Covers use actual catalogue portraits. Cover art does not imply ownership.
      const artwork=[...album.cards].sort((a,b)=>rarityFor(b).level-rarityFor(a).level||a.rank-b.rank).slice(0,3);
      const cover=total?'<div class="ka-album-art" aria-hidden="true">'+artwork.map((card,index)=>'<img class="ka-cover-character ka-cover-character-'+index+'" src="'+esc(card.image)+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">').join('')+'</div>':'<div class="ka-album-art ka-album-blank" aria-hidden="true"><span>✧</span></div>';
      return '<button type="button" class="col-album ka-album-cover '+(total&&count===total?'is-complete':'')+'" data-open-album="'+esc(album.key)+'"'+(album.definition?' data-album-id="'+esc(album.definition.id)+'"':'')+' style="--album-progress:'+percent+';--album-hue:'+((number*37)%160+115)+'" aria-label="Ouvrir l’album '+esc(album.name)+' · '+count+'/'+total+' cartes"><span class="ka-album-spine" aria-hidden="true">KIZUNA · '+String(number).padStart(2,'0')+'</span>'+cover+'<span class="ka-album-edition" aria-hidden="true">ALBUM <b>'+String(number).padStart(2,'0')+'</b></span><div class="ka-album-copy"><div class="kz-album-heading"><h3>'+esc(album.name)+'</h3><span class="kz-album-percent">'+percent+' %</span></div><small>'+count+'/'+total+' cartes</small><div class="col-bar"><i style="width:'+percent+'%"></i></div>'+(!total?'<p class="kzal-empty">Aucune carte ajoutée à cet album pour le moment.</p>':'')+'<span class="col-album-open">'+(total&&count===total?'Album complété':'Ouvrir l’album')+' <span aria-hidden="true">↗</span></span></div></button>';
    }).join('')||'<div class="col-empty">Aucun album ne correspond à cette recherche.</div>';
    return;
  }
  const query=collectionQuery($('colSearch').value),universe=$('colUniv').value,ownership=$('colOwn').value,sort=$('colSort').value;
  const ownershipMatches=card=>{
    const count=m[card.id]||0,reserved=status.reserved[card.id]||0;
    return ownership==='own'?count>0:ownership==='miss'?count===0&&reserved===0:ownership==='dup'?count>1:ownership==='wanted'?status.wanted.has(String(card.id)):ownership==='reserved'?reserved>0:true;
  };
  const rows=pool.filter(card=>(COL.rar==='all'||card.rarity===COL.rar)&&(detail||universe==='all'||card.series===universe)&&(!query||collectionQuery(card.name+' '+card.series+' '+(card.native||'')).includes(query))&&ownershipMatches(card)&&(window.KizunaMythic?.matches(card)??true));
  rows.sort((left,right)=>sort==='name'?left.name.localeCompare(right.name,'fr',{sensitivity:'base',numeric:true})||left.rank-right.rank:sort==='recent'?(status.latest[right.id]||0)-(status.latest[left.id]||0)||left.rank-right.rank:sort==='num'?left.rank-right.rank:sort==='pow'?right.pow-left.pow||left.rank-right.rank:rarityFor(right).level-rarityFor(left).level||left.rank-right.rank);
  const book=detail&&kgBinder.mode==='book',signature=JSON.stringify([COL.albumKey,query,ownership,sort,COL.rar,rows.map(card=>card.id)]);
  if(signature!==kgBinder.signature){kgBinder.signature=signature;kgBinder.page=0;}
  kgBinder.pages=Math.max(1,Math.ceil(rows.length/8));kgBinder.page=Math.min(kgBinder.page,kgBinder.pages-1);
  const pageSize=Math.max(60,Number(COL.limit)||60),visible=book?rows.slice(kgBinder.page*8,kgBinder.page*8+8):rows.slice(0,pageSize);
  kgBinderControls(detail,rows.length);
  $('colCount').textContent=fmt(rows.length)+' cartes correspondantes · '+fmt(visible.length)+' affichées'+(book?' sur cette page':'');$('colMore').hidden=book||visible.length>=rows.length;
  if(!$('colMore').hidden)$('colMore').textContent='Afficher '+fmt(Math.min(60,rows.length-visible.length))+' cartes de plus · '+fmt(rows.length-visible.length)+' restantes';
  $('colGrid').innerHTML=visible.map(card=>{
    const count=m[card.id]||0,reserved=status.reserved[card.id]||0,wanted=status.wanted.has(String(card.id));
    const stateLabel=count?(count>1?'Doublon · '+count+' disponibles':'Possédée'):reserved?'Réservée':'Manquante';
    const faces=cardMarkup(card,{flip:true,count,since:first[card.id]||0}).replace('<div class="ff">','<div class="ff" aria-hidden="false">').replace('<div class="fb">','<div class="fb" aria-hidden="true">').replace('<a href=','<a tabindex="-1" href=');
    const badges='<div class="kz-col-status"><span class="kz-col-badge '+(count?'is-owned':reserved?'is-reserved':'is-missing')+'">'+stateLabel+'</span>'+(reserved&&count?'<span class="kz-col-badge is-reserved">'+reserved+' réservée'+(reserved>1?'s':'')+'</span>':'')+(wanted?'<span class="kz-col-badge is-wanted">Recherchée</span>':'')+'</div>';
    return '<article class="col-item-unit" data-rarity="'+esc(LET[card.rarity]||'C')+'" style="--slot-rarity:'+rarityFor(card).color+'"><div class="ka-card-register"><span>N° '+String(card.rank).padStart(4,'0')+'</span><span>'+esc(card.rarity)+'</span></div><div class="col-cell '+(count?'owned':reserved?'reserved':'miss')+(count&&window.KizunaExperience?.isNew(card.id)?' kg-new-slot':'')+'" data-colcard="'+esc(card.id)+'" tabindex="0" role="button" aria-label="Ouvrir la fiche de '+esc(card.name)+' · '+stateLabel+'">'+(count>1?'<b class="cx">×'+count+'</b>':'')+faces+(!count&&!reserved?'<span class="missing-lock"><i aria-hidden="true">◇</i>À DÉCOUVRIR</span>':'')+'</div>'+badges+(window.KizunaMythic?.badge(card)||'')+'<div class="kz-col-actions"><button class="kz-col-view" type="button" data-col-open="'+esc(card.id)+'" aria-label="Voir la fiche de '+esc(card.name)+'">Fiche</button><button class="kz-col-flip" type="button" data-col-flip="'+esc(card.id)+'" aria-pressed="false" aria-label="Retourner la carte '+esc(card.name)+'">Verso</button>'+(card.rarity==='Mythique'?'<button type="button" data-km-open="'+esc(card.id)+'">Éveil</button>':'')+(count?'<button class="col-market-sell-btn" type="button" data-col-market-open="'+esc(card.id)+'">Vendre</button>':'')+'</div></article>';
  }).join('')||(detail&&!active.cards.length?'<div class="col-empty"><b>Un album à construire.</b>Aucune carte n’a encore été ajoutée à cet album.</div>':!state.owned.length&&ownership==='own'&&!query&&COL.rar==='all'&&universe==='all'?'<div class="col-empty"><b>Le début d’une collection.</b>Ouvre un booster pour rencontrer tes premiers personnages, ou choisis « Toutes » pour explorer les cartes disponibles.</div>':'<div class="col-empty"><b>Aucune carte avec ces filtres.</b>Essaie une autre rareté, un autre univers ou réinitialise les filtres.</div>');
}

window.addEventListener('kizuna:mythic-change',()=>{if(document.body.dataset.tab==='col')renderCollection();});
