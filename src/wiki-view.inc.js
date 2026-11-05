/* KIZUNA Lot 2 · browser of real catalogue entries, independent of economics. */
const kzwState={query:'',universe:'all',rarity:'all',ownership:'all',sort:'name',limit:60};
const kzwCollator=new Intl.Collator('fr',{sensitivity:'base',numeric:true});
const kzwFold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/œ/g,'oe').toLocaleLowerCase('fr');
let kzwSignature='',kzwOptionsSignature='',kzwIdentity=null,kzwQueued=false;
function kzwAccount(){return window.KizunaAccount?.getSnapshot?.()||null;}
function kzwSchedule(){if(kzwQueued)return;kzwQueued=true;(window.requestAnimationFrame||window.setTimeout)(()=>{kzwQueued=false;if(document.body.dataset.tab==='wiki')renderWiki($('wikiSearch')?.value||'');});}
function kzwSetup(){
  const tools=document.querySelector('#encyclopedia .wiki-tools');if(!tools||$('kzwControls'))return;
  tools.classList.add('kzw-tools');
  const search=$('wikiSearch');
  if(search){const label=document.createElement('label');label.className='kzw-search';label.htmlFor='wikiSearch';label.innerHTML='<span>Rechercher un personnage ou un anime</span>';search.before(label);label.append(search);search.placeholder='Nom français, japonais ou univers…';search.setAttribute('aria-controls','wikiGrid');}
  // Replace the old two-button filter, including its old event listener.
  $('v8WikiFilter')?.remove();
  const controls=document.createElement('div');controls.id='kzwControls';controls.className='kzw-controls';
  controls.innerHTML='<label>Univers<select id="kzwUniverse" aria-controls="wikiGrid"><option value="all">Tous les univers</option></select></label><label>Rareté<select id="kzwRarity" aria-controls="wikiGrid"><option value="all">Toutes les raretés</option>'+rarityData.slice().sort((a,b)=>b.level-a.level).map(r=>'<option value="'+esc(r.name)+'">'+esc(r.name)+'</option>').join('')+'</select></label><label>Trier par<select id="kzwSort" aria-controls="wikiGrid"><option value="name">Nom · A à Z</option><option value="popularity">Popularité AniList</option><option value="rarity">Rareté décroissante</option></select></label><button id="kzwReset" class="soft-btn" type="button">Effacer les filtres</button>';
  tools.append(controls);
  const filters=document.createElement('div');filters.id='v8WikiFilter';filters.className='kzw-ownership';filters.setAttribute('role','group');filters.setAttribute('aria-label','Filtrer selon ma collection');
  filters.innerHTML=[['all','Toutes'],['own','Possédées'],['missing','Manquantes'],['duplicates','Doublons'],['wishlist','Recherchées']].map(([value,label])=>'<button type="button" data-v8-wiki-filter="'+value+'" aria-pressed="'+(value==='all')+'" class="'+(value==='all'?'active':'')+'">'+label+'</button>').join('');
  tools.append(filters);
  const count=$('wikiCount');if(count){count.setAttribute('role','status');count.setAttribute('aria-live','polite');tools.append(count);}
  const note=document.createElement('p');note.className='kzw-help';note.textContent='Les cartes recherchées correspondent à ta liste d’envies. La popularité utilise les favoris AniList enregistrés dans le catalogue.';tools.append(note);
  const grid=$('wikiGrid');grid?.classList.add('kzw-grid');grid?.setAttribute('role','group');grid?.setAttribute('aria-label','Personnages du catalogue');
  const more=document.createElement('button');more.id='kzwMore';more.className='soft-btn kzw-more';more.type='button';more.hidden=true;grid?.after(more);
  for(const [id,key] of [['kzwUniverse','universe'],['kzwRarity','rarity'],['kzwSort','sort']])$(id).addEventListener('change',event=>{kzwState[key]=event.target.value;kzwState.limit=60;renderWiki(search?.value||'');});
  filters.addEventListener('click',event=>{const button=event.target.closest('[data-v8-wiki-filter]');if(!button)return;kzwState.ownership=button.dataset.v8WikiFilter;v8WikiFilter=kzwState.ownership;kzwState.limit=60;renderWiki(search?.value||'');});
  $('kzwReset').addEventListener('click',()=>{kzwReset();search?.focus();});
  more.addEventListener('click',()=>{const oldCount=grid.querySelectorAll('[data-wiki]').length;kzwState.limit+=60;renderWiki(search?.value||'');grid.querySelectorAll('[data-wiki]')[oldCount]?.focus({preventScroll:true});});
  const explorer=document.createElement('div');explorer.className='kad-wiki-explorer';tools.before(explorer);explorer.append(tools);const results=document.createElement('div');results.className='kad-wiki-results';explorer.append(results);results.append(grid,more);
  const stage=document.createElement('div');stage.id='kadWikiStage';stage.className='kad-wiki-stage';document.querySelector('#encyclopedia .section-heading')?.append(stage);
  stage.addEventListener('click',event=>{const id=event.target.closest('[data-kad-wiki-card]')?.dataset.kadWikiCard;const card=id&&LOCAL_CARDS.find(c=>String(c.id)===id);if(card)openDetail(card);});
  grid?.addEventListener('click',event=>{if(event.target.closest('[data-kzw-reset]')){kzwReset();search?.focus();}});
}
function kzwReset(options={}){
  Object.assign(kzwState,{query:'',universe:'all',rarity:'all',ownership:'all',sort:'name',limit:60});v8WikiFilter='all';kzwSignature='';
  if($('wikiSearch'))$('wikiSearch').value='';
  for(const [id,value] of [['kzwUniverse','all'],['kzwRarity','all'],['kzwSort','name']])if($(id))$(id).value=value;
  if(options.render!==false&&document.body.dataset.tab==='wiki')renderWiki('');
}
function kzwUniverseOptions(){
  const names=[...new Set(LOCAL_CARDS.map(card=>String(card.series||'')).filter(Boolean))].sort(kzwCollator.compare),signature=JSON.stringify(names);
  if(kzwOptionsSignature===signature)return;kzwOptionsSignature=signature;
  if(!names.includes(kzwState.universe))kzwState.universe='all';
  $('kzwUniverse').innerHTML='<option value="all">Tous les univers</option>'+names.map(name=>'<option value="'+esc(name)+'">'+esc(name)+'</option>').join('');$('kzwUniverse').value=kzwState.universe;
}
function kzwCardMarkup(card,counts,wishes,loading){
  const rarity=rarityFor(card),count=loading?0:Number(counts[card.id]||0),wanted=!loading&&wishes.has(String(card.id));
  const ownership=loading?'Collection en chargement':count?'Possédée'+(count>1?' · '+fmt(count)+' exemplaires':''):'Manquante';
  return '<button type="button" class="kzw-card '+(count?'is-owned':'is-missing')+'" data-wiki="'+esc(card.id)+'" data-r="'+(LET[card.rarity]||'C')+'" style="--kzw-rarity:'+rarity.color+'" aria-label="'+esc(card.name)+' · '+esc(card.series)+' · '+esc(rarity.name)+' · '+esc(ownership)+(wanted?' · Recherchée':'')+'"><span class="kzw-card-art"><img src="'+esc(card.image)+'" alt="" loading="lazy" decoding="async" width="240" height="320" draggable="false"><span class="kzw-card-rarity">'+esc(rarity.name)+'</span>'+(count>1?'<b class="kzw-card-quantity">×'+fmt(count)+'</b>':'')+'</span><span class="kzw-card-copy"><strong>'+esc(card.name)+'</strong><small>'+esc(card.series)+'</small><span class="kzw-card-state">'+esc(ownership)+(wanted?'<em>Recherchée</em>':'')+'</span><span class="kzw-card-open">Fiche personnage <span aria-hidden="true">↗</span></span></span></button>';
}
renderWiki=function(query=''){
  kzwSetup();const grid=$('wikiGrid');if(!grid||!$('kzwControls'))return;
  const raw=String(query||'').trim(),q=kzwFold(raw);if(raw!==kzwState.query){kzwState.query=raw;kzwState.limit=60;}
  kzwUniverseOptions();
  const account=kzwAccount(),loading=!account||account.loading===true,counts=loading?Object.create(null):ownCounts(),wishes=new Set(loading?[]:kyaraMarketWishlistIds.map(String));
  const allowed=['all','own','missing','duplicates','wishlist'];if(!allowed.includes(kzwState.ownership))kzwState.ownership='all';
  document.querySelectorAll('#v8WikiFilter [data-v8-wiki-filter]').forEach(button=>{const selected=button.dataset.v8WikiFilter===kzwState.ownership;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));button.disabled=loading&&button.dataset.v8WikiFilter!=='all';});
  const rows=LOCAL_CARDS.filter(card=>{
    const count=Number(counts[card.id]||0),matchOwnership=kzwState.ownership==='all'||(!loading&&(kzwState.ownership==='own'?count>0:kzwState.ownership==='missing'?count===0:kzwState.ownership==='duplicates'?count>1:wishes.has(String(card.id))));
    return matchOwnership&&(kzwState.universe==='all'||card.series===kzwState.universe)&&(kzwState.rarity==='all'||card.rarity===kzwState.rarity)&&(!q||kzwFold(card.name+' '+card.series+' '+(card.native||'')).includes(q));
  });
  rows.sort((a,b)=>(kzwState.sort==='popularity'?(Number(b.fav)||0)-(Number(a.fav)||0):kzwState.sort==='rarity'?rarityFor(b).level-rarityFor(a).level:0)||kzwCollator.compare(a.name,b.name)||kzwCollator.compare(String(a.id),String(b.id)));
  const visible=rows.slice(0,kzwState.limit),personalLoading=loading&&kzwState.ownership!=='all';
  $('wikiCount').textContent=personalLoading?'Chargement de ta collection…':fmt(rows.length)+' personnage'+(rows.length===1?'':'s')+' · '+fmt(visible.length)+' affiché'+(visible.length===1?'':'s');
  grid.setAttribute('aria-busy',String(personalLoading));
  const more=$('kzwMore');more.hidden=visible.length>=rows.length;more.textContent='Afficher '+fmt(Math.min(60,rows.length-visible.length))+' personnages de plus · '+fmt(rows.length-visible.length)+' restants';
  const signature=JSON.stringify([loading,kzwState,visible.map(card=>[card.id,card.name,card.series,card.image,card.rarity,counts[card.id]||0,wishes.has(String(card.id))])]);
  if(signature===kzwSignature)return;kzwSignature=signature;
  const spotlight=$('kadWikiStage');if(spotlight)spotlight.innerHTML=visible.slice(0,3).map((card,i)=>'<button type="button" data-kad-wiki-card="'+esc(card.id)+'" aria-label="Découvrir '+esc(card.name)+'"><img src="'+esc(card.image)+'" alt="" decoding="async" loading="lazy"><span>'+esc(card.name)+'</span><i aria-hidden="true">'+String(i+1).padStart(2,'0')+'</i></button>').join('');
  const focused=document.activeElement?.closest?.('#wikiGrid [data-wiki]')?.dataset.wiki;
  grid.innerHTML=visible.map(card=>kzwCardMarkup(card,counts,wishes,loading)).join('')||(personalLoading?'<div class="kzw-empty"><span aria-hidden="true">絆</span><h3>Ta collection se synchronise.</h3><p>Les personnages possédés apparaîtront dès que ton compte sera prêt.</p></div>':'<div class="kzw-empty"><span aria-hidden="true">索</span><h3>Aucun personnage trouvé.</h3><p>Essaie un autre nom, un autre univers ou élargis tes filtres.</p><button class="soft-btn" type="button" data-kzw-reset>Voir tout le catalogue</button></div>');
  if(focused)[...grid.querySelectorAll('[data-wiki]')].find(button=>button.dataset.wiki===focused)?.focus({preventScroll:true});
};
document.addEventListener('kizuna:account-change',()=>{
  const account=kzwAccount(),identity=account?.user?.id||'guest';
  if(kzwIdentity!==null&&identity!==kzwIdentity)kzwReset({render:false});
  kzwIdentity=identity;kzwSchedule();
});
for(const event of ['kizuna:game-change','kizuna:albums-change'])window.addEventListener(event,kzwSchedule);
window.KizunaWiki=Object.freeze({reset:kzwReset,refresh:kzwSchedule});
kzwSetup();
if(document.body.dataset.tab==='wiki')renderWiki($('wikiSearch')?.value||'');
