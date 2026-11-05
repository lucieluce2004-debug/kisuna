/* Injected at the end of the game IIFE, after catalogue and market definitions. */
const kgbExtraKey='kizuna_extra_catalogue_v1';
const kgbExtras=new Map();
const kgbCategories=new Set(['shonen','seinen','shojo','isekai','sport','mecha','fantasy','waifus','husbandos']);
const kgbBaseIds=new Set(LOCAL_CARDS.map(card=>String(card.id)));
const kgbString=(value,max=200)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max):'';
function kgbInteger(value,min,max,fallback=min){const number=Number(value);return Number.isFinite(number)?Math.max(min,Math.min(max,Math.floor(number))):fallback;}
function kgbTime(value,fallback=Date.now(),future=300000){return kgbInteger(value,0,Date.now()+future,fallback);}
function kgbSourceId(value){const id=String(value??'');return /^\d{1,10}$/.test(id)&&Number(id)>0&&Number.isSafeInteger(Number(id))?String(Number(id)):'';}
function kgbImage(value,local=false){
  const input=kgbString(value,1500);if(!input)return '';
  if(local&&/^assets\/[a-zA-Z0-9_./-]+$/.test(input)&&!input.split('/').includes('..'))return input;
  try{const url=new URL(input);if(url.protocol!=='https:'||url.username||url.password)return '';const host=url.hostname.toLowerCase();return host==='anilist.co'||host.endsWith('.anilist.co')?url.href:'';}catch{return '';}
}
function kgbCategoriesOf(value){const values=Array.isArray(value)?value:typeof value==='string'?value.split(','):[];return [...new Set(values.map(x=>kgbString(x,24).toLowerCase()).filter(x=>kgbCategories.has(x)))].slice(0,8);}
function kgbImportedTier(fav,sourceId){return window.KizunaRarity.rarityFromPopularity(fav,sourceId,window.KizunaRarity.retainedRarityContext);}
function kgbCompact(card){return {id:card.id,sourceId:card.sourceId,name:card.name,native:card.native||'',series:card.series,image:card.image,fav:card.fav||0,g:card.g||'',cats:(card.cats||[]).slice()};}
function kgbNormalizeCard(input,canonical=false){
  if(!input||typeof input!=='object'||Array.isArray(input))return null;
  const rawName=input.name&&typeof input.name==='object'?input.name.full:input.name;
  const name=kgbString(rawName,160);if(!name)return null;
  const rawId=kgbString(input.id==null?'':String(input.id),96);
  const sourceId=kgbSourceId(input.sourceId??input.source_id??input.anilist_id??(/^\d+$/.test(rawId)?rawId:/^c\d+$/.test(rawId)?rawId.slice(1):''));
  const seedId=canonical&&/^cseed-\d{4,8}$/.test(rawId)?rawId:'';
  if(!sourceId&&!seedId)return null;
  const existingSeed=seedId?LOCAL_CARDS.find(card=>String(card.id)===seedId):null;
  const media=input.media?.nodes?.[0];
  const series=kgbString(input.series??media?.title?.english??media?.title?.romaji,180)||'—';
  const image=kgbImage(input.image&&typeof input.image==='object'?input.image.large:input.image??input.image_url,!!seedId)||(existingSeed?.image||'');
  if(!image)return null;
  const policy=window.KizunaRarity;
  const fav=policy.favouriteCount(canonical&&input.fav!=null?input.fav:Object.hasOwn(policy.retainedPopularity,sourceId)?policy.retainedPopularity[sourceId]:input.fav??input.favourites);
  const gender=kgbString(input.g??input.gender,12).toLowerCase();
  const g=gender==='m'||gender==='male'?'M':gender==='f'||gender==='female'?'F':'';
  const rarity=kgbImportedTier(fav,sourceId);
  const id=seedId||'c'+sourceId,rank=seedId?kgbInteger(input.rank,1,2000000000,existingSeed?.rank||LOCAL_CARDS.length+1):1000000+Number(sourceId);
  const stats=TIER[rarity],fingerprint=hash(id),pow=stats[0]+fingerprint%stats[1];
  return {id,sourceId,name,native:kgbString(input.native??input.name?.native,160),series,image,fav,g,cats:kgbCategoriesOf(input.cats),rank,rarity,tag:'',pow,aura:pow-stats[2]+(fingerprint>>3)%3};
}
function kgbExisting(card){return LOCAL_CARDS.find(row=>String(row.id)===card.id||(card.sourceId&&String(row.sourceId||'')===card.sourceId))||LOCAL_CARDS.find(row=>row.name.toLocaleLowerCase()===card.name.toLocaleLowerCase()&&row.series.toLocaleLowerCase()===card.series.toLocaleLowerCase());}
function kgbAdd(input,canonical=false){
  const card=kgbNormalizeCard(input,canonical);if(!card)return null;
  const existing=kgbExisting(card);
  if(existing){
    // Canonical identities stay stable while their popularity classification updates.
    if(!existing.sourceId&&card.sourceId)existing.sourceId=card.sourceId;
    if(canonical){kgbBaseIds.add(String(existing.id));kgbExtras.delete(String(existing.id));for(const key of ['fav','rarity','pow','aura'])existing[key]=card[key];}
    else if(kgbExtras.has(String(existing.id)))kgbExtras.set(String(existing.id),kgbCompact(existing));
    return existing;
  }
  LOCAL_CARDS.push(card);
  if(canonical||/^cseed-/.test(card.id))kgbBaseIds.add(card.id);
  else kgbExtras.set(card.id,kgbCompact(card));
  return card;
}
function kgbPersistExtras(){try{localStorage.setItem(kgbExtraKey,JSON.stringify([...kgbExtras.values()]));}catch{toast('Le catalogue ajouté est trop volumineux pour ce navigateur.');}}
function kgbCopy(input,byId){
  if(!input||typeof input!=='object')return null;
  const id=kgbString(input.id==null?'':String(input.id),96),card=byId.get(id);if(!card)return null;
  return {id:card.id,at:kgbTime(input.at),rarity:card.rarity,level:rarityFor(card).level};
}
function kgbPull(input,byId){
  const copy=kgbCopy(input,byId);if(!copy)return null;
  const card=byId.get(String(copy.id));
  return {...copy,name:card.name,series:card.series,username:kgbString(input.username,20)||state.username||'Invité',pullId:kgbString(input.pullId,96)||'pull-'+copy.at+'-'+card.id};
}
function kgbStock(input){
  const value=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
  // Retain previously accumulated stock independently from the recharge limit.
  return {free:kgbInteger(value.free,0,103,FREE_START),freeCapacity:kgbInteger(value.freeCapacity,10,13,10),nexusWeekly:kgbInteger(value.nexusWeekly,0,1000000,0),t:kgbTime(value.t),inv:kgbInteger(value.inv,0,1000000,2),pm:kgbInteger(value.pm,0,PITY_M-1,0),pl:kgbInteger(value.pl,0,PITY_L-1,0),day:kgbString(value.day,60)};
}
function kgbMarket(input,byId){
  const value=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
  const list=Array.isArray(value.listings)?value.listings:[];
  const listings=list.slice(-800).map(entry=>{
    if(!entry||typeof entry!=='object')return null;
    const id=kgbString(entry.id,96),cardId=kgbString(entry.cardId==null?'':String(entry.cardId),96),seller=kgbString(entry.seller,20);
    if(!id||!byId.has(cardId)||!seller||!['sale','auction','trade'].includes(entry.mode))return null;
    const wantCardIds=[...new Set((Array.isArray(entry.wantCardIds)?entry.wantCardIds:[entry.wantCardId]).map(x=>kgbString(x==null?'':String(x),96)).filter(x=>byId.has(x)))].slice(0,5);
    if(entry.mode==='trade'&&!wantCardIds.length)return null;
    const reserved=kgbCopy(entry.reservedCopy,byId),reservedCopy=reserved&&reserved.id===cardId?reserved:null;
    const requestedStatus=['active','cancelled','sold','traded','ended'].includes(entry.status)?entry.status:'active';
    const status=requestedStatus==='active'&&!reservedCopy?'cancelled':requestedStatus;
    const result={id,cardId,seller,mode:entry.mode,status,price:entry.mode==='trade'?0:kgbInteger(entry.price,1,1000000000,1),createdAt:kgbTime(entry.createdAt),endsAt:entry.endsAt?kgbTime(entry.endsAt,0,31*86400000):0,topBid:kgbInteger(entry.topBid,0,1000000000,0),bidder:kgbString(entry.bidder,20),reservedCopy,wantCardId:wantCardIds[0]||'',wantCardIds};
    for(const field of ['depositFee','fee','gross','net','buyNowPrice'])if(entry[field]!=null)result[field]=kgbInteger(entry[field],0,1000000000,0);
    for(const field of ['soldAt','endedAt','cancelledAt'])if(entry[field]!=null)result[field]=kgbTime(entry[field],0);
    if(entry.buyer)result.buyer=kgbString(entry.buyer,20);
    if(entry.instant===true)result.instant=true;
    return result;
  }).filter(Boolean);
  const credits=Object.create(null);
  if(value.credits&&typeof value.credits==='object'&&!Array.isArray(value.credits)){
    for(const [key,amount] of Object.entries(value.credits).slice(0,300)){
      const username=kgbString(key,20);if(!username||['__proto__','constructor','prototype'].includes(username))continue;
      const balance=kgbInteger(amount,0,1000000000,0);if(balance)credits[username]=balance;
    }
  }
  const cards=(Array.isArray(value.cards)?value.cards:[]).slice(-300).map(entry=>{
    if(!entry||typeof entry!=='object')return null;
    const username=kgbString(entry.username,20),card=kgbCopy(entry.card,byId);return username&&card?{username,card,at:kgbTime(entry.at)}:null;
  }).filter(Boolean);
  const history=(Array.isArray(value.history)?value.history:[]).slice(0,80).map(entry=>{
    if(!entry||typeof entry!=='object')return null;
    const id=kgbString(entry.id,96),type=kgbString(entry.type,32),cardId=kgbString(entry.cardId==null?'':String(entry.cardId),96);
    if(!id||!byId.has(cardId)||!type||!/^[-a-z]+$/.test(type))return null;
    const card=byId.get(cardId),result={id,type,cardId,cardName:card.name,at:kgbTime(entry.at)};
    for(const field of ['seller','buyer'])if(entry[field])result[field]=kgbString(entry[field],20);
    for(const field of ['gross','fee','net','depositFee'])if(entry[field]!=null)result[field]=kgbInteger(entry[field],0,1000000000,0);
    const wantedCardId=kgbString(entry.wantedCardId==null?'':String(entry.wantedCardId),96);
    if(byId.has(wantedCardId)){result.wantedCardId=wantedCardId;result.wantedName=byId.get(wantedCardId).name;}
    if(entry.instant===true)result.instant=true;
    return result;
  }).filter(Boolean);
  const wishlist=[...new Set((Array.isArray(value.wishlist)?value.wishlist:[]).map(id=>kgbString(id==null?'':String(id),96)).filter(id=>byId.has(id)))].slice(0,5000);
  return {listings,credits,cards,history,wishlist};
}
function kgbCloseActiveViews(){
  state.packToken++;state.revealToken++;state.revealAnimating=false;state.opening=false;state.pendingReveal=null;state.revealNew=[];state.revealIndex=0;
  if(typeof cpCloseProfile==='function'&&$('kyaraProfileOverlay')?.classList.contains('open'))cpCloseProfile();
  if(typeof closeBackdrop==='function'){closeBackdrop('revealBackdrop');closeBackdrop('detailBackdrop');}
  if(typeof kyaraMarketCloseSellPanel==='function')kyaraMarketCloseSellPanel();
  $('kyaraAuctionBackdrop')?.classList.remove('open');
  kyaraMarketDraftCardId='';kyaraMarketChosenTargetId='';kyaraMarketChosenTargetIds=[];
}
function kgbRefresh(){
  if($('usernameLabel'))$('usernameLabel').textContent=state.username;
  if($('userAvatar'))$('userAvatar').textContent=state.username==='Invité'?'K':state.username.charAt(0).toUpperCase();
  if($('editUsernamePulls'))$('editUsernamePulls').textContent='Pseudo : '+state.username+' ✎';
  buildFilters();renderHero();renderPanel();renderPacks();renderExtra();renderGrossPulls();updateLocalStats();
  if(document.body.dataset.tab==='wiki')renderWiki($('wikiSearch')?.value||'');
  if(document.body.dataset.tab==='rank')renderRanking();
  if(typeof renderKyaraMarket==='function')renderKyaraMarket();
  if(window.KizunaProfile?.refresh)window.KizunaProfile.refresh();
}
function kgbSnapshot(){
  const byId=new Map(LOCAL_CARDS.map(card=>[String(card.id),card]));
  const copies=state.owned.map(copy=>kgbCopy(copy,byId)).filter(Boolean).slice(-5000);
  const pulls=state.pulls.map(pull=>kgbPull(pull,byId)).filter(Boolean).slice(0,30);
  const market=kgbMarket({listings:kyaraMarketListings,credits:kyaraMarketPendingCredits,cards:kyaraMarketPendingCards,history:kyaraMarketHistory,wishlist:kyaraMarketWishlistIds},byId);
  return {cards:Object.freeze(LOCAL_CARDS.map(card=>Object.freeze({...card,cats:Object.freeze((card.cats||[]).slice())}))),owned:copies,pulls,chakra:kgbInteger(chakra,0,1000000000,0),username:state.username,stock:kgbStock(stock),catalogue:[...kgbExtras.values()].map(card=>({...card,cats:card.cats.slice()})),market};
}
function kgbApplySnapshot(snapshot,options={}){
  const input=snapshot&&typeof snapshot==='object'&&!Array.isArray(snapshot)?snapshot:{};
  const wasApplying=gameApplying;gameApplying=true;
  try{
    if(!options.preserveViews)kgbCloseActiveViews();
    // Imported cards belong to this snapshot; retained seed identities remain shared.
    for(let index=LOCAL_CARDS.length-1;index>=0;index--)if(kgbExtras.has(String(LOCAL_CARDS[index].id))&&!kgbBaseIds.has(String(LOCAL_CARDS[index].id)))LOCAL_CARDS.splice(index,1);
    kgbExtras.clear();
    for(const card of (Array.isArray(input.catalogue)?input.catalogue:[]).slice(0,5000))kgbAdd(card,false);
    classifyCatalogue();
    const byId=new Map(LOCAL_CARDS.map(card=>[String(card.id),card]));
    state.username=kgbString(input.username,20).replace(/[<>]/g,'')||'Invité';
    state.owned=(Array.isArray(input.owned)?input.owned:[]).slice(-5000).map(copy=>kgbCopy(copy,byId)).filter(Boolean);
    state.pulls=(Array.isArray(input.pulls)?input.pulls:[]).slice(0,30).map(pull=>kgbPull(pull,byId)).filter(Boolean).sort((a,b)=>b.at-a.at);
    chakra=kgbInteger(input.chakra,0,1000000000,500);
    Object.assign(stock,kgbStock(input.stock));
    const market=kgbMarket(input.market,byId);
    kyaraMarketListings=market.listings;kyaraMarketPendingCredits=market.credits;kyaraMarketPendingCards=market.cards;kyaraMarketHistory=market.history;kyaraMarketWishlistIds=market.wishlist;
    if(!options.preserveViews){kyaraMarketQuery='';kyaraMarketRarityFilter='all';kyaraMarketMissingOnly=false;kyaraMarketWantedOnly=false;
    for(const id of ['marketSearch','colSearch','wikiSearch'])if($(id))$(id).value='';
    COL.rar='all';COL.limit=60;
    COL.albumKey='';COL.albumReturn=null;
    window.KizunaWiki?.reset?.({render:false});}
    saveStore();saveStock();saveChakra();kyaraMarketSave();kaWishlistSave();kgbPersistExtras();kgbRefresh();
  }finally{gameApplying=wasApplying;}
  if(options.silent===false&&!gameApplying)notifyGameChange();
  return kgbSnapshot();
}
function kgbImportCard(input){
  if(window.KizunaAccount?.getSnapshot?.().isAdmin!==true)throw new Error('L’import de personnages est réservé aux administrateurs.');
  const before=LOCAL_CARDS.length,card=kgbAdd(input,false);if(!card)throw new Error('Cette carte AniList est incomplète ou invalide.');
  if(LOCAL_CARDS.length!==before){const wasApplying=gameApplying;gameApplying=true;try{classifyCatalogue();kgbPersistExtras();kgbRefresh();}finally{gameApplying=wasApplying;}if(!gameApplying)notifyGameChange();}
  return Object.freeze({...card,cats:Object.freeze((card.cats||[]).slice())});
}
function kgbAddCatalogueCards(input){
  if(!Array.isArray(input))return 0;
  let added=0,changed=false;
  const previous=new Map(LOCAL_CARDS.map(card=>[String(card.id),[card.fav,card.rarity,card.pow,card.aura].join('|')]));
  const wasApplying=gameApplying;gameApplying=true;
  try{
    for(const row of input.slice(0,5000)){const before=LOCAL_CARDS.length,card=kgbAdd(row,true);if(LOCAL_CARDS.length>before)added++;if(card&&previous.get(String(card.id))!==[card.fav,card.rarity,card.pow,card.aura].join('|'))changed=true;}
    changed=classifyCatalogue()||changed;
    if(added||changed){kgbPersistExtras();kgbRefresh();}
  }finally{gameApplying=wasApplying;}
  if((added||changed)&&!gameApplying)notifyGameChange();
  return added;
}
function kgbAlbumGroups(){
  const groups=seriesMap(),known=new Map(LOCAL_CARDS.map(card=>[String(card.id),card]));
  for(const definition of sharedAlbumDefinitions){
    const cards=new Map();
    for(const name of groups.keys())if(name.toLocaleLowerCase()===definition.name.toLocaleLowerCase())groups.delete(name);
    for(const id of definition.card_ids){const card=known.get(id);if(card)cards.set(id,card);}
    groups.set(definition.name,[...cards.values()]);
  }
  return groups;
}
function kgbSetAlbumDefinitions(rows){
  if(!Array.isArray(rows))return 0;
  const next=[],names=new Set();
  for(const row of rows){
    if(!row||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(row.id||''))continue;
    const name=kgbString(row.name,120),key=name.toLocaleLowerCase();
    if(name.length<2||names.has(key))continue;
    names.add(key);next.push({id:row.id,name,anime_id:kgbSourceId(row.anime_id),cover_image:kgbImage(row.cover_image),card_ids:[...new Set((Array.isArray(row.card_ids)?row.card_ids:[]).map(id=>kgbString(id,96)).filter(Boolean))].slice(0,5000)});
  }
  sharedAlbumDefinitions.splice(0,sharedAlbumDefinitions.length,...next);
  const changed=classifyCatalogue();
  if(changed)kgbRefresh();else if(document.body.dataset.tab==='col')renderCollection();
  if(changed&&!gameApplying)notifyGameChange();
  window.dispatchEvent(new CustomEvent('kizuna:albums-change'));
  return next.length;
}
function kgbSetBoosterDefinitions(rows){
  if(!Array.isArray(rows))return 0;
  const known=new Map(LOCAL_CARDS.map(card=>[String(card.id),card])),definitions=[];
  for(const row of rows.slice(0,200)){
    if(!row||row.published!==true||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(row.id||''))continue;
    const cardIds=new Set(Array.isArray(row.card_ids)?row.card_ids.map(String):[]),name=kgbString(row.name,60);
    if(!name||!cardIds.size||cardIds.size>500||[...cardIds].some(id=>!known.has(id)))continue;
    const rarities=new Set([...cardIds].map(id=>known.get(id).rarity));
    if(!['Rare','Épique','Légendaire','Mythique'].every(tier=>rarities.has(tier)))continue;
    definitions.push({id:'staff:'+row.id,title:name,desc:kgbString(row.description,140)||'Édition Kizuna',mark:name[0],custom:true,cardIds,bg:'linear-gradient(150deg,#326c88,#253659 55%,#704b8a)',edge:'#92e9ef',fg:'#eefcff',mk:'#ba9af7',glow:'#88dbea55'});
  }
  for(let i=BOOST.length-1;i>=0;i--)if(BOOST[i].custom&&!BOOST[i].nexusWeekly){delete boosters[BOOST[i].id];BOOST.splice(i,1);}
  for(const definition of definitions){BOOST.push(definition);boosters[definition.id]=definition;}
  if(!BOOST.some(booster=>booster.id===state.selectedBooster)){kgbCloseActiveViews();state.selectedBooster='mix';toast('Le booster sélectionné n’est plus disponible.');}
  if(!state.opening&&!$('revealBackdrop')?.classList.contains('open')){renderPacks();renderPanel();if(typeof v8UpdateCatalogButton==='function')v8UpdateCatalogButton();}
  window.dispatchEvent(new CustomEvent('kizuna:boosters-change',{detail:{count:definitions.length}}));
  return definitions.length;
}
// Read-only presentation adapters. New feature modules never receive the live
// inventory, market arrays or stock object and cannot mutate them through these APIs.
function kgbAlbumSummaries(){
  const counts=ownCounts();
  return Object.freeze(collectionAlbumEntries().map(album=>{
    const total=album.cards.length,owned=album.cards.filter(card=>counts[card.id]).length;
    return Object.freeze({key:album.key,name:album.name,total,owned,percent:total?owned/total*100:0,
      cardIds:Object.freeze(album.cards.map(card=>String(card.id))),
      cover:album.definition?.cover_image||album.cards[0]?.image||''});
  }));
}
function kgbHomeSummary(){
  const counts=ownCounts(),total=LOCAL_CARDS.length,owned=LOCAL_CARDS.filter(card=>counts[card.id]).length;
  const albums=kgbAlbumSummaries();
  const favourites=albums.filter(album=>album.owned>0).slice().sort((a,b)=>b.owned-a.owned||b.percent-a.percent||a.name.localeCompare(b.name,'fr')).slice(0,3);
  const seen=new Set(),discoveries=[];
  for(const card of LOCAL_CARDS.slice().sort((a,b)=>b.fav-a.fav||a.rank-b.rank)){
    if(seen.has(card.series))continue;seen.add(card.series);
    discoveries.push(Object.freeze({id:card.id,name:card.name,series:card.series,image:card.image,rarity:card.rarity}));
    if(discoveries.length===4)break;
  }
  const featured=BOOST.find(booster=>booster.id==='mix')||BOOST[0];
  return Object.freeze({username:state.username,total,owned,copies:state.owned.length,percent:total?owned/total*100:0,
    albums,completedAlbums:albums.filter(album=>album.total>0&&album.owned===album.total).length,
    favourites:Object.freeze(favourites),discoveries:Object.freeze(discoveries),
    featured:featured?Object.freeze({id:featured.id,name:featured.title,description:featured.desc,
      logo:featured.custom?'':'assets/boosters/'+featured.id+'.svg',cards:5,
      stock:Math.max(0,Number(stock.free)||0)+Math.max(0,Number(stock.inv)||0),
      guaranteed:'Rare ou mieux',legendaryRemaining:Math.max(0,PITY_L-stock.pl),mythicRemaining:Math.max(0,PITY_M-stock.pm),
      rarities:Object.freeze(rarityData.filter(tier=>LOCAL_CARDS.some(card=>card.rarity===tier.name)).map(tier=>tier.name))}):null});
}
function kgbOpenNexusWeekly(){
  const a=window.KizunaAccount?.getSnapshot?.(),n=window.KizunaNexus?.getSnapshot?.();
  if(!a?.economy||a.loading||n?.owner!==a.user?.id||!n.state?.weeklyBooster){toast('Attends le chargement du coffre Nexus.');return false;}
  if(!stock.nexusWeekly){toast('Aucun coffret hebdomadaire en stock.');return false;}
  const b=n.state.weeklyBooster,cardIds=new Set((b.cardIds||[]).map(String));
  if(!cardIds.size||cardIds.size>500||!LOCAL_CARDS.some(c=>cardIds.has(c.id))){toast('Recharge le catalogue pour afficher ce coffret.');return false;}
  const definition={id:'nexus:weekly',title:kgbString(b.name,60)||'Coffret du Nexus',desc:'Ton coffret hebdomadaire · mêmes probabilités et garanties',custom:true,nexusWeekly:true,cardIds,bg:'linear-gradient(145deg,#315780,#594080)',edge:'#badcff',fg:'#fff',mk:'#c2b2ff',glow:'#8ba7ed55'};
  const index=BOOST.findIndex(x=>x.id===definition.id);if(index<0)BOOST.push(definition);else BOOST[index]=definition;boosters[definition.id]=definition;
  showTab('boosts');selectBooster(definition.id);openBooster(1);return true;
}
document.addEventListener('kizuna:account-change',()=>{
  const a=window.KizunaAccount?.getSnapshot?.();if(a?.economy&&!a.loading)return;
  const index=BOOST.findIndex(x=>x.nexusWeekly);if(index>=0){delete boosters[BOOST[index].id];BOOST.splice(index,1);}
  if(state.selectedBooster==='nexus:weekly')state.selectedBooster='mix';
  if(index>=0){renderPacks();renderPanel();}
});
window.KizunaGame={
  get freePackLimit(){return kzFreeCapacity();},
  getSnapshot:kgbSnapshot,
  getAlbums:kgbAlbumSummaries,
  getHomeSummary:kgbHomeSummary,
  openAlbumKey:key=>openCollectionAlbum(String(key)),
  openNexusWeekly:kgbOpenNexusWeekly,
  openBoosterSelection(id='mix',quantity=1){if(!BOOST.some(booster=>booster.id===id)||![1,5,10].includes(Number(quantity)))return false;showTab('boosts');selectBooster(id);openBooster(Number(quantity));return true;},
  applySnapshot:kgbApplySnapshot,
  subscribe(callback){if(typeof callback!=='function')return ()=>{};const listener=()=>callback(kgbSnapshot());window.addEventListener('kizuna:game-change',listener);return ()=>window.removeEventListener('kizuna:game-change',listener);},
  refreshCollection(){renderCollection();},
  showTab(tab,options){const routes={collection:'col',encyclopedia:'wiki',ranking:'rank',boosters:'boosts'};const target=routes[tab]||tab;if(!['home','col','market','wiki','rank','profile','staff','boosts','universes','community','adventure','nexus'].includes(target))return;showTab(target,options);},
  openCard(id){const card=LOCAL_CARDS.find(row=>String(row.id)===String(id));if(!card)return false;if(typeof openCharacterProfile==='function')openCharacterProfile(card,'profile');else openDetail(card);return true;},
  closeCard(){if(typeof cpHideProfile==='function')cpHideProfile();closeBackdrop('detailBackdrop');},
  importCard:kgbImportCard,
  addCatalogueCards:kgbAddCatalogueCards,
  setBoosterDefinitions:kgbSetBoosterDefinitions,
  setAlbumDefinitions:kgbSetAlbumDefinitions,
  showAlbums(id){resetCollectionAlbum();COL.view='albums';document.querySelectorAll('#colSeg button').forEach(button=>button.classList.toggle('on',button.dataset.v==='albums'));const album=sharedAlbumDefinitions.find(row=>row.id===id);if($('colSearch'))$('colSearch').value=album?.name||'';showTab('col');},
  isBusy:()=>state.opening||$('revealBackdrop')?.classList.contains('open')||!!document.querySelector('dialog[open]:not(#kizunaAccountDialog)'),
  notify:message=>toast(kgbString(message,220))
};
try{
  const stored=JSON.parse(localStorage.getItem(kgbExtraKey)||'[]');
  const wasApplying=gameApplying;gameApplying=true;
  try{if(Array.isArray(stored))for(const card of stored.slice(0,5000))kgbAdd(card,false);if(kgbExtras.size){classifyCatalogue();kgbRefresh();}}finally{gameApplying=wasApplying;}
}catch{ /* A damaged optional catalogue does not replace the retained seed cards. */ }
window.dispatchEvent(new CustomEvent('kizuna:ready'));
const kgbInitialRoutes={'#profile':'profile','#collection':'col','#encyclopedia':'wiki','#ranking':'rank','#marketPage':'market','#staff':'staff','#boosters':'boosts','#universes':'universes','#community':'community'};
if(kgbInitialRoutes[location.hash])showTab(kgbInitialRoutes[location.hash]);
