import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';

// Admin discovery is exercised against an in-memory endpoint. No AniList
// request, real card import, album or account write is performed by this suite.
const source=await fs.readFile(new URL('../dist/kizuna-catalogue.js',import.meta.url),'utf8');
const pause=()=>new Promise(resolve=>setTimeout(resolve,5));
async function until(predicate){for(let i=0;i<200;i++){if(predicate())return;await pause();}throw new Error('Catalogue UI did not settle');}
const anime=(id,title,year)=>({id:String(id),title,titleRomaji:title+' Romaji',titleNative:'アニメ',coverImage:'https://s4.anilist.co/anime/'+id+'.jpg',format:'TV',season:'FALL',seasonYear:year,episodes:12,status:'FINISHED'});
const shows=[anime(101,'Bleach',2004),anime(202,'Bleach: Thousand-Year Blood War',2022)];
const character=(id,name,series='Bleach')=>({sourceId:String(id),name,native:'キャラ',series,image:'https://s4.anilist.co/character/'+id+'.jpg',fav:1000,g:'M',cats:['shonen']});
function harness(role='admin'){
  const errors=[],virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM('<!doctype html><body class="theme-kizuna"><section id="encyclopedia"><div class="wrap"></div></section></body>',{url:'https://kizuna.example.test/#staff',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
  const w=dom.window,calls=[],known=[],albumRecords=[],subscribers=new Set();let activeRole=role,handler=null,refreshHandler=null,refreshes=0;
  w.KizunaGame={getSnapshot:()=>({cards:structuredClone(known)}),addCatalogueCards(cards){known.push(...structuredClone(cards));w.dispatchEvent(new w.CustomEvent('kizuna:game-change'));}};
  w.KizunaAccount={getSnapshot:()=>({user:activeRole?{id:activeRole+'-user',user_metadata:{role:'admin'}}:null,isAdmin:activeRole==='admin',loading:false}),subscribe(fn){subscribers.add(fn);return()=>subscribers.delete(fn);},async catalogueRequest(payload){
    calls.push(structuredClone(payload));if(handler)return handler(payload);
    if(payload.action==='search')return {entries:[character(1,'Ichigo')],page:payload.page,hasNext:payload.page===1};
    if(payload.action==='search_anime')return {anime:structuredClone(shows),page:payload.page,hasNext:payload.page===1};
    if(payload.action==='anime_characters')return {anime:structuredClone(shows.find(show=>show.id===payload.animeId)),entries:[character(payload.page===1?21:22,payload.page===1?'Rukia':'Renji')],page:payload.page,hasNext:payload.page===1};
    if(payload.action==='create_album'){const album={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:shows.find(show=>show.id===payload.animeId).title,anime_id:payload.animeId,cover_image:'',card_ids:[]};albumRecords.push(album);return {album:structuredClone(album)};}
    if(payload.action==='add_album_card'){const album=albumRecords.find(value=>value.id===payload.albumId);if(!album.card_ids.includes(payload.cardId))album.card_ids.push(payload.cardId);return {album:structuredClone(album)};}
    if(payload.action==='import'){const card={...character(payload.sourceId,'Imported'),id:'c'+payload.sourceId},album=albumRecords.find(value=>value.id===payload.albumId);if(album&&!album.card_ids.includes(card.id))album.card_ids.push(card.id);return {card,...(album?{album:structuredClone(album)}:{})};}
    throw new Error('Unexpected action '+payload.action);
  }};
  w.KizunaAlbums={getAlbums:()=>structuredClone(albumRecords),async refresh(){refreshes++;if(refreshHandler)await refreshHandler();w.dispatchEvent(new w.CustomEvent('kizuna:albums-change'));return structuredClone(albumRecords);}};
  w.eval(source);
  return {w,dom,calls,known,albumRecords,errors,get refreshes(){return refreshes;},setRole(value){activeRole=value;subscribers.forEach(fn=>fn());w.document.dispatchEvent(new w.CustomEvent('kizuna:account-change'));},setHandler(value){handler=value;},setRefreshHandler(value){refreshHandler=value;},ready:async()=>{await pause();await pause();},settled:()=>until(()=>!w.document.querySelector('#kizunaAniListCatalogue')||w.document.querySelector('#kizunaAniListCatalogue').getAttribute('aria-busy')!=='true'),close(){dom.window.close();}};
}
function click(h,selector){const node=h.w.document.querySelector(selector);assert.ok(node,'Missing '+selector);node.click();}
function search(h,value){const input=h.w.document.querySelector('#kacSearchInput');input.value=value;input.form.dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));}

for(const role of [null,'moderator']){
  const denied=harness(role);await denied.ready();assert.equal(denied.w.document.querySelector('#kizunaAniListCatalogue'),null);assert.equal(denied.calls.length,0);denied.close();
}
const h=harness();await h.ready();assert.ok(h.w.document.querySelector('#kizunaAniListCatalogue'));assert.equal(h.calls.length,0,'Loading the page must not query AniList');
assert.equal(h.w.document.querySelector('[data-kac-mode="character"]').getAttribute('aria-pressed'),'true');
search(h,'Ichigo');await h.settled();assert.deepEqual(h.calls.at(-1),{action:'search',search:'Ichigo',page:1});assert.ok(h.w.document.querySelector('[data-kac-import="1"]'));
click(h,'.kac-next');await h.settled();assert.equal(h.calls.at(-1).page,2);click(h,'.kac-prev');await h.settled();assert.equal(h.calls.length,2,'Character pagination reuses its own cache');

click(h,'[data-kac-mode="anime"]');assert.equal(h.w.document.querySelector('label[for="kacSearchInput"]').textContent,'Titre de l’anime');assert.equal(h.calls.length,2,'Changing mode does not start an automatic query');
search(h,'Bleach');await h.settled();assert.deepEqual(h.calls.at(-1),{action:'search_anime',search:'Bleach',page:1});assert.equal(h.w.document.querySelectorAll('[data-kac-anime]').length,2);assert.match(h.w.document.querySelector('[data-kac-anime="202"]').textContent,/2022/);
click(h,'[data-kac-anime="202"]');await h.settled();assert.deepEqual(h.calls.at(-1),{action:'anime_characters',animeId:'202',page:1});assert.match(h.w.document.querySelector('.kac-anime-breadcrumb h4').textContent,/Thousand-Year/);assert.ok(h.w.document.querySelector('[data-kac-import="21"]'));
click(h,'.kac-next');await h.settled();assert.deepEqual(h.calls.at(-1),{action:'anime_characters',animeId:'202',page:2});assert.ok(h.w.document.querySelector('[data-kac-import="22"]'));
click(h,'[data-kac-import="22"]');await until(()=>h.calls.at(-1).action==='import'&&h.w.document.querySelector('[data-kac-import="22"]').textContent.includes('Déjà'));
assert.deepEqual(h.calls.at(-1),{action:'import',sourceId:'22',animeId:'202',animePage:2});assert.equal(h.known.length,1);assert.equal(h.refreshes,1,'Catalogue-only imports refresh canonical album metadata too');click(h,'[data-kac-import="22"]');assert.equal(h.known.length,1,'Duplicate imports remain disabled');
click(h,'.kac-back-anime');assert.equal(h.w.document.querySelectorAll('[data-kac-anime]').length,2);assert.equal(h.w.document.querySelector('.kac-page').textContent,'Page 1 · 2 animes');const beforeChoose=h.calls.length;click(h,'[data-kac-anime="101"]');await h.settled();assert.equal(h.calls.at(-1).animeId,'101','A different season has a separate character cache');assert.equal(h.calls.length,beforeChoose+1);
click(h,'.kac-back-anime');click(h,'[data-kac-anime="202"]');await h.settled();assert.equal(h.calls.length,beforeChoose+1,'Returning to a previously opened season reuses only that season’s cache');
click(h,'.kac-back-anime');click(h,'.kac-next');await h.settled();assert.deepEqual(h.calls.at(-1),{action:'search_anime',search:'Bleach',page:2},'After returning, pagination targets anime results');
click(h,'.kac-popular');await h.settled();assert.deepEqual(h.calls.at(-1),{action:'search_anime',search:null,page:1});

let finish;h.setHandler(()=>new Promise(resolve=>{finish=resolve;}));search(h,'Pending anime');await until(()=>typeof finish==='function');click(h,'[data-kac-mode="character"]');finish({anime:[anime(999,'Must stay hidden',2026)],page:1,hasNext:false});await pause();await pause();assert.equal(h.w.document.querySelector('[data-kac-anime="999"]'),null);assert.equal(h.w.document.querySelector('[data-kac-mode="character"]').getAttribute('aria-pressed'),'true');assert.equal(h.w.document.querySelector('.kac-search-row button[type="submit"]').disabled,false);

h.setHandler(async payload=>payload.action==='search_anime'?{anime:[anime(333,'<img src=x onerror=alert(1)>',2025)],page:1,hasNext:false}:{entries:[],page:1,hasNext:false});click(h,'[data-kac-mode="anime"]');search(h,'Escaped');await h.settled();assert.equal(h.w.document.querySelector('.kac-anime-copy img'),null);assert.match(h.w.document.querySelector('.kac-anime-copy strong').textContent,/<img src=x/);
h.setHandler(async()=>({anime:[],page:1,hasNext:false}));search(h,'Nothing');await h.settled();assert.match(h.w.document.querySelector('.kac-empty strong').textContent,/Aucun anime/,'An empty response must stop the loading state');

h.setHandler(async()=>{const error=new Error('Rate limited');error.status=429;error.retryAfter=1;throw error;});search(h,'Limited');await h.settled();assert.equal(h.w.document.querySelector('.kac-search-row button[type="submit"]').disabled,true);assert.match(h.w.document.querySelector('.kac-status').textContent,/réessayer dans/);click(h,'[data-kac-mode="character"]');assert.equal(h.w.document.querySelector('.kac-popular').disabled,true,'Mode switches cannot bypass the shared rate limit');
assert.deepEqual(h.errors,[]);h.close();

const stale=harness();await stale.ready();let late;stale.setHandler(()=>new Promise(resolve=>{late=resolve;}));search(stale,'Pending logout');await until(()=>typeof late==='function');stale.setRole(null);late({entries:[character(999,'Private stale result')],page:1,hasNext:false});await pause();await pause();assert.equal(stale.w.document.querySelector('#kizunaAniListCatalogue'),null);assert.equal(stale.w.document.body.textContent.includes('Private stale result'),false);stale.close();
const forbidden=harness();await forbidden.ready();forbidden.setHandler(async()=>{const error=new Error('Forbidden');error.status=403;throw error;});search(forbidden,'Denied');await forbidden.settled();assert.equal(forbidden.w.document.querySelector('#kizunaAniListCatalogue'),null);assert.match(forbidden.w.document.querySelector('#kacProtectedNotice').textContent,/Accès au catalogue/);forbidden.close();
const refreshFailed=harness();await refreshFailed.ready();refreshFailed.setRefreshHandler(async()=>{throw new Error('Reload unavailable');});search(refreshFailed,'Ichigo');await refreshFailed.settled();click(refreshFailed,'[data-kac-import="1"]');await until(()=>refreshFailed.w.document.querySelector('.kac-status').textContent.includes('Recharge la page'));assert.equal(refreshFailed.refreshes,1);assert.equal(refreshFailed.known.length,1,'A refresh failure must not undo an already completed import');assert.equal(refreshFailed.w.document.querySelector('[data-kac-import="1"]').disabled,true);assert.equal(refreshFailed.calls.filter(call=>call.action==='import').length,1);refreshFailed.close();
const lateRefresh=harness();await lateRefresh.ready();let releaseRefresh;lateRefresh.setRefreshHandler(()=>new Promise(resolve=>{releaseRefresh=resolve;}));search(lateRefresh,'Ichigo');await lateRefresh.settled();click(lateRefresh,'[data-kac-import="1"]');await until(()=>typeof releaseRefresh==='function');lateRefresh.setRole(null);releaseRefresh();await pause();await pause();assert.equal(lateRefresh.w.document.querySelector('#kizunaAniListCatalogue'),null,'A metadata refresh finishing after logout cannot restore the admin panel');lateRefresh.close();

const albumUI=harness();await albumUI.ready();albumUI.known.push({...character(21,'Rukia'),id:'cseed-0042'});
assert.equal(albumUI.w.KizunaCatalogue.openAnimeSearch(),true);assert.equal(albumUI.calls.length,0,'Opening the album creation flow focuses anime search without a query');assert.equal(albumUI.w.document.activeElement.id,'kacSearchInput');
search(albumUI,'Bleach');await albumUI.settled();click(albumUI,'[data-kac-anime="101"]');await albumUI.settled();click(albumUI,'.kac-create-album');
await until(()=>albumUI.w.document.querySelector('.kac-create-album').textContent.includes('créé'));
const albumId=albumUI.albumRecords[0].id;assert.deepEqual(albumUI.calls.at(-1),{action:'create_album',animeId:'101'});assert.equal(albumUI.w.document.querySelector('.kac-album-select').value,albumId);assert.equal(albumUI.refreshes,1);assert.equal(albumUI.w.document.querySelector('.kac-create-album').disabled,true,'An existing anime album is not created twice');
assert.match(albumUI.w.document.querySelector('[data-kac-import="21"]').textContent,/Ajouter à l’album/);click(albumUI,'[data-kac-import="21"]');await until(()=>albumUI.w.document.querySelector('[data-kac-import="21"]').textContent.includes('Dans l’album'));
assert.deepEqual(albumUI.calls.at(-1),{action:'add_album_card',albumId,cardId:'cseed-0042'});assert.deepEqual(albumUI.albumRecords[0].card_ids,['cseed-0042']);assert.equal(albumUI.known.length,1,'Adding a retained card to an album must not duplicate the canonical catalogue card');
click(albumUI,'.kac-next');await albumUI.settled();click(albumUI,'[data-kac-import="22"]');await until(()=>albumUI.w.document.querySelector('[data-kac-import="22"]').textContent.includes('Dans l’album'));assert.deepEqual(albumUI.calls.at(-1),{action:'import',sourceId:'22',animeId:'101',animePage:2,albumId});assert.deepEqual(albumUI.albumRecords[0].card_ids,['cseed-0042','c22']);assert.equal(albumUI.refreshes,3);
const alternate={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',name:'Album alternatif',anime_id:'202',cover_image:'',card_ids:[]};albumUI.albumRecords.push(alternate);albumUI.w.dispatchEvent(new albumUI.w.CustomEvent('kizuna:albums-change'));
let destination=albumUI.w.document.querySelector('.kac-album-select');destination.value=alternate.id;destination.dispatchEvent(new albumUI.w.Event('change',{bubbles:true}));click(albumUI,'[data-kac-import="22"]');await until(()=>albumUI.w.document.querySelector('[data-kac-import="22"]').textContent.includes('Dans l’album'));assert.deepEqual(albumUI.calls.at(-1),{action:'add_album_card',albumId:alternate.id,cardId:'c22'});assert.deepEqual(alternate.card_ids,['c22']);
destination=albumUI.w.document.querySelector('.kac-album-select');destination.value='';destination.dispatchEvent(new albumUI.w.Event('change',{bubbles:true}));assert.equal(albumUI.w.document.querySelector('[data-kac-import="22"]').disabled,true);assert.match(albumUI.w.document.querySelector('[data-kac-import="22"]').textContent,/Déjà au catalogue/);assert.deepEqual(albumUI.errors,[]);albumUI.close();

console.log(JSON.stringify({adminOnly:'passed',noAutomaticQueries:'passed',characterSearchPreserved:'passed',animeSeasons:'passed',animeCharacterPagination:'passed',contextImport:'passed',separateCaches:'passed',returnToAnimeResults:'passed',staleModeResponse:'ignored',staleLogoutResponse:'ignored',escapedTitles:'passed',emptyResults:'passed',sharedRateLimit:'passed',forbiddenClearsPanel:'passed',animeAlbumCreation:'passed',existingSeedIntoAlbum:'preserves canonical identity',albumDestination:'passed',albumImportPaginationContext:'passed',allImportsRefreshMetadata:'passed',refreshFailureKeepsImport:'passed',lateRefreshAfterLogout:'ignored',network:'none'}));
