import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

// Exercise the actual production handler with Auth/database/AniList boundaries
// in memory. No imports, rewards, accounts or network requests are performed.
const source=fs.readFileSync(new URL('../supabase/functions/kizuna-catalogue-admin/index.ts',import.meta.url),'utf8');
// Bundle the same shared popularity policy used by the Deno handler. Only the
// external Supabase client boundary is replaced with the in-memory test client.
const compiled=await build({stdin:{contents:source.replace(/^import[^\n]+\n/,'const createClient=globalThis.__createClient;\n'),loader:'ts',resolveDir:fileURLToPath(new URL('../supabase/functions/kizuna-catalogue-admin/',import.meta.url))},bundle:true,format:'cjs',platform:'neutral',target:'es2022',write:false,logLevel:'silent'});
const origin='https://kizuna.aleklecaribou.chatgpt.site';
const adminId='a52df8a8-accc-412b-b402-91daf6289125';
const albumId='b08e3e14-186b-43bd-b98e-1a6e2ed35439';
const image=id=>'https://s4.anilist.co/file/anilistcdn/character/large/b'+id+'.jpg';
const anime=(id=20,title='Naruto')=>({id,type:'ANIME',isAdult:false,title:{english:title,romaji:title,native:'ナルト'},coverImage:{large:'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/b'+id+'.jpg'},format:'TV',episodes:220,season:'FALL',seasonYear:2002,status:'FINISHED',genres:['Fantasy'],tags:[{name:'Shounen'}]});
const character=(id=3710,name='Tenten')=>({id,name:{full:name,native:'テンテン'},image:{large:image(id)},favourites:771,gender:'Female',media:{nodes:[{...anime(999,'Unrelated franchise'),genres:['Sports'],tags:[]}]}});
function harness(settings={}){
  const calls={auth:[],roles:[],network:[],reads:[],writes:[],rpc:[],series:[],upserts:0,trace:[]};
  const records=new Map((settings.existing||[]).map(record=>[record.id,structuredClone(record)]));
  const service={
    auth:{async getUser(token){calls.auth.push(token);calls.trace.push('verified');return {data:{user:settings.user===null?null:{id:adminId,user_metadata:{role:'admin',isAdmin:true}}},error:settings.authError||null};}},
    async rpc(name,args){
      if(name==='kizuna_catalogue_series_size'){calls.series.push(args);return {data:settings.seriesSize??2,error:null};}
      assert.equal(name,'kizuna_album_dispatch');assert.equal(args.p_actor,adminId);
      calls.rpc.push(structuredClone(args));
      if(settings.albumError)return {data:null,error:{message:settings.albumError}};
      const album={id:albumId,name:args.p_payload.name||'Naruto',anime_id:20,cover_image:args.p_payload.coverImage||'',card_ids:args.p_payload.cardId?[args.p_payload.cardId]:[]};
      return {data:args.p_action==='list_albums'?{albums:[album]}:{album},error:null};
    },
    from(table){
      let filters=[],inserted=null;
      const q={
        select(){return q;},eq(key,value){filters.push([key,value]);return q;},in(key,value){filters.push([key,value]);return q;},order(){return q;},limit(){return q;},
        insert(value){inserted=structuredClone(value);return q;},
        upsert(){calls.upserts++;throw new Error('Imports must not overwrite existing records');},
        async maybeSingle(){
          if(table==='kizuna_admins'){calls.roles.push(filters);calls.trace.push('role');return {data:settings.admin===false?null:{user_id:adminId},error:settings.roleError||null};}
          assert.equal(table,'kizuna_cards');calls.reads.push(filters);calls.trace.push('lookup');
          if(settings.lookupError)return {data:null,error:{message:'private DB detail'}};
          return {data:structuredClone([...records.values()].find(record=>filters.every(([key,value])=>Array.isArray(value)?value.includes(record[key]):record[key]===value))||null),error:null};
        },
        async single(){
          assert.equal(table,'kizuna_cards');
          if(inserted){
            calls.writes.push(inserted);calls.trace.push('insert');
            if(settings.race){records.set(inserted.id,{...inserted,card:{...inserted.card,series:'First canonical winner',rarity:'Légendaire'}});return {data:null,error:{code:'23505'}};}
            records.set(inserted.id,inserted);return {data:{card:structuredClone(inserted.card)},error:settings.saveError||null};
          }
          calls.reads.push(filters);return {data:structuredClone([...records.values()].find(record=>filters.every(([key,value])=>Array.isArray(value)?value.includes(record[key]):record[key]===value))||null),error:null};
        },
        then(resolve,reject){return (async()=>{
          assert.equal(table,'kizuna_cards');
          if(inserted){assert.ok(Array.isArray(inserted));for(const record of inserted){calls.writes.push(record);records.set(record.id,structuredClone(record));}return {data:inserted.map(row=>({id:row.id})),error:null};}
          calls.reads.push(filters);
          return {data:structuredClone([...records.values()].filter(record=>filters.every(([key,value])=>Array.isArray(value)?value.includes(record[key]):record[key]===value))),error:null};
        })().then(resolve,reject);},
      };
      return q;
    },
  };
  const module={exports:{}};
  const sandbox={module,exports:module.exports,Request,Response,Headers,TextDecoder,Uint8Array,AbortSignal,Date,URL,setTimeout,clearTimeout,
    Deno:{env:{get:key=>({SUPABASE_URL:'https://unit.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'unit-private-key'})[key]},serve(){}},
    __createClient(url,key,options){assert.equal(url,'https://unit.supabase.co');assert.equal(key,'unit-private-key');assert.equal(options.auth.persistSession,false);return service;},
    async fetch(url,options){
      assert.equal(url,'https://graphql.anilist.co');assert.equal(options.method,'POST');
      const body=JSON.parse(options.body);calls.network.push(body);calls.trace.push('anilist');
      if(settings.providerThrow)throw new Error('provider failure');
      if(settings.providerStatus)return new Response('{}',{status:settings.providerStatus,headers:{'Retry-After':'7'}});
      if(settings.providerMalformed)return new Response('{',{status:200});
      if(settings.providerErrors)return Response.json({errors:[{message:'provider private detail',status:settings.providerErrors}]});
      let data;
      if(body.query.includes('KizunaAdminAnimeSearch')){
        assert.match(body.query,/type:ANIME,isAdult:false/);assert.match(body.query,/sort:\[POPULARITY_DESC,ID\]/);
        data=settings.data??{Page:{pageInfo:{hasNextPage:true},media:[anime(),anime(1735,'Naruto: Shippuden'),{...anime(3,'Adult'),isAdult:true},{...anime(4,'Manga'),type:'MANGA'}]}};
      }else if(body.query.includes('KizunaAdminAnimeCharacters')){
        assert.match(body.query,/Media\(id:\$id,type:ANIME,isAdult:false\)/);assert.match(body.query,/characters\(page:\$page,perPage:24,sort:\[ROLE,FAVOURITES_DESC,ID\]\)/);
        data=settings.data??{Media:{...anime(),characters:{pageInfo:{hasNextPage:true},nodes:[character(),character(4799,'Akamaru')]}}};
      }else if(body.query.includes('KizunaAdminAlbumAnime')){
        assert.match(body.query,/Media\(id:\$id,type:ANIME,isAdult:false\)/);
        const id=body.variables.id;
        data=settings.popularData??{Media:{...anime(id,id===20?'Naruto':'Unrelated franchise'),characters:{nodes:settings.popularNodes??[character(),character(4799,'Akamaru'),character(2011,'Iruka'),character(3438,'Kimimaro'),character(13,'Fifth Character')]}}};
      }else if(body.query.includes('KizunaAdminSearch'))data=settings.data??{Page:{pageInfo:{hasNextPage:false},characters:[character()]}};
      else if(body.query.includes('KizunaAdminCharacter'))data=settings.data??{Character:character()};
      else throw new Error('Unexpected AniList document');
      return Response.json({data});
    },
  };
  vm.createContext(sandbox);vm.runInContext(compiled.outputFiles[0].text,sandbox);
  async function request(body,options={}){
    const headers={Origin:origin,'Content-Type':'application/json',...options.headers};
    if(options.token!==null)headers.Authorization='Bearer '+(options.token||'unit-valid-user-token');
    const method=options.method||'POST';
    const response=await module.exports.handler(new Request('https://unit.supabase.co/functions/v1/kizuna-catalogue-admin',{method,headers,...(method==='POST'?{body:options.raw??JSON.stringify(body)}:{})}));
    const data=response.status===204?null:await response.json();
    assert.ok(!JSON.stringify(data).includes('unit-private-key'));assert.ok(!JSON.stringify(data).includes('private DB detail'));
    return {response,data};
  }
  return {request,calls,records};
}
let h,r;
for(const action of ['search','search_anime','anime_characters','import','create_album','list_albums','add_album_card','remove_album_card']){
  h=harness();r=await h.request({action},{token:null});assert.equal(r.response.status,401);assert.equal(h.calls.network.length,0);assert.equal(h.calls.writes.length,0);
  h=harness({admin:false});r=await h.request({action});assert.equal(r.response.status,403);assert.equal(h.calls.network.length,0);assert.equal(h.calls.rpc.length,0);assert.equal(h.calls.writes.length,0,'Moderator/player metadata must not authorize imports');
}
h=harness({user:null});r=await h.request({action:'search_anime'});assert.equal(r.response.status,401);assert.equal(h.calls.roles.length,0);
h=harness({roleError:{message:'private DB detail'}});r=await h.request({action:'search_anime'});assert.equal(r.response.status,503);assert.equal(h.calls.network.length,0);
h=harness();r=await h.request({action:'search_anime',search:'Naruto',page:2});assert.equal(r.response.status,200);assert.equal(r.data.anime.length,2);assert.equal(r.data.anime[0].id,'20');assert.equal(r.data.anime[0].title,'Naruto');assert.equal(r.data.anime[0].titleRomaji,'Naruto');assert.equal(r.data.anime[0].format,'TV');assert.equal(r.data.page,2);assert.equal(r.data.hasNext,true);assert.deepEqual(h.calls.network[0].variables,{page:2,search:'Naruto'});assert.deepEqual(h.calls.trace,['verified','role','anilist']);
h=harness({data:{Page:{pageInfo:{hasNextPage:false},media:[]}}});r=await h.request({action:'search_anime',search:null,page:1});assert.equal(r.response.status,200);assert.deepEqual(r.data.anime,[]);assert.equal(r.data.hasNext,false);assert.equal(h.calls.network[0].variables.search,null);
h=harness();const injection='Naruto\"){ Character(id:1){id} }';r=await h.request({action:'search_anime',search:injection});assert.equal(r.response.status,200);assert.equal(h.calls.network[0].variables.search,injection);assert.ok(!h.calls.network[0].query.includes(injection),'Search strings must remain GraphQL variables');
h=harness({data:{Page:{media:[{...anime(),title:{native:'ナルト'},coverImage:{large:'https://outside.example.test/image.png'}}]}}});r=await h.request({action:'search_anime',search:'Naruto'});assert.equal(r.data.anime[0].title,'ナルト');assert.equal(r.data.anime[0].coverImage,'');
for(const body of [
  {action:'search_anime',search:'N'},{action:'search_anime',search:'x'.repeat(101)},{action:'search_anime',search:{}},
  {action:'search_anime',page:0},{action:'search_anime',page:10001},{action:'search_anime',page:true},{action:'search_anime',page:[1]},
  {action:'anime_characters',animeId:'1) { id }'},{action:'anime_characters',animeId:'2147483648'},
  {action:'anime_characters',animeId:20,page:1.5},{action:'import',sourceId:'bad'},
  {action:'import',sourceId:3710,animeId:'bad'},{action:'import',sourceId:3710,animePage:2},
  {action:'import',sourceId:3710,animeId:20,animePage:0},
  {action:'import',sourceId:3710,albumId:'wrong'},
  {action:'create_album',animeId:'wrong'},{action:'create_album',animeId:20,name:'N'},
  {action:'create_album',animeId:20,name:'x'.repeat(121)},
  {action:'add_album_card',albumId:'wrong',cardId:'c3710'},{action:'remove_album_card',albumId,cardId:''},
]){h=harness();r=await h.request(body);assert.equal(r.response.status,400,JSON.stringify(body));assert.equal(h.calls.network.length,0);assert.equal(h.calls.writes.length,0);}
h=harness();r=await h.request({action:'anime_characters',animeId:'20',page:2});assert.equal(r.response.status,200);assert.equal(r.data.anime.title,'Naruto');assert.equal(r.data.entries[0].series,'Naruto','Selected anime overrides popular unrelated franchise');assert.deepEqual(r.data.entries[0].cats,['shonen','fantasy']);assert.equal(r.data.entries[0].sourceId,'3710');assert.equal(r.data.page,2);assert.equal(r.data.hasNext,true);assert.deepEqual(h.calls.network[0].variables,{id:20,page:2});
h=harness({data:{Media:{...anime(),characters:{nodes:[],pageInfo:{hasNextPage:false}}}}});r=await h.request({action:'anime_characters',animeId:20});assert.equal(r.response.status,200);assert.deepEqual(r.data.entries,[]);assert.equal(r.data.hasNext,false);
for(const media of [null,{...anime(999),characters:{nodes:[]}},{...anime(),isAdult:true,characters:{nodes:[]}},{...anime(),type:'MANGA',characters:{nodes:[]}}]){h=harness({data:{Media:media}});r=await h.request({action:'anime_characters',animeId:20});assert.equal(r.response.status,422);assert.equal(h.calls.writes.length,0);}
h=harness();r=await h.request({action:'import',sourceId:3710,animeId:20,animePage:2});assert.equal(r.response.status,200);assert.equal(r.data.card.id,'c3710');assert.equal(r.data.card.series,'Naruto');assert.deepEqual(r.data.card.cats,['shonen','fantasy']);assert.equal(r.data.card.rarity,'Commun');assert.equal(h.calls.writes.length,1);assert.equal(h.calls.upserts,0);assert.deepEqual(h.calls.network[0].variables,{id:20,page:2});
for(const [favourites,rarity] of [[0,'Commun'],[999,'Commun'],[1000,'Peu commune'],[2499,'Peu commune'],[2500,'Rare'],[3999,'Rare'],[4000,'Rare'],[6999,'Rare'],[7000,'Rare'],[9999,'Rare'],[10000,'Rare'],[14999,'Rare'],[15000,'Rare'],[4855,'Rare']]){
  const entry={...character(),favourites};
  h=harness({data:{Media:{...anime(),characters:{nodes:[entry],pageInfo:{hasNextPage:false}}}}});
  r=await h.request({action:'import',sourceId:3710,animeId:20});assert.equal(r.response.status,200);assert.equal(r.data.card.rarity,rarity,'Server rarity at '+favourites+' favourites');
}
for(const favourites of [4855,0]){
  h=harness({data:{Media:{...anime(),characters:{nodes:[{...character(53901,'Madara Uchiha'),favourites}],pageInfo:{hasNextPage:false}}}}});
  r=await h.request({action:'import',sourceId:53901,animeId:20});assert.equal(r.response.status,200);assert.equal(r.data.card.rarity,'Mythique','Explicit Madara owner override must be applied on future imports');
}
const retained={id:'retained-3710',source_id:3710,card:{id:'retained-3710',sourceId:'3710',name:'Retained',series:'Original edition',rarity:'Mythique',pow:99}};
h=harness({existing:[retained]});r=await h.request({action:'import',sourceId:3710,animeId:20,animePage:2});assert.equal(r.response.status,200);assert.deepEqual(r.data.card,retained.card);assert.equal(h.calls.writes.length,0);assert.equal(h.calls.network.length,1,'Context membership must be verified even for existing cards');assert.ok(h.calls.trace.indexOf('anilist')<h.calls.trace.indexOf('lookup'));
h=harness({existing:[retained]});r=await h.request({action:'import',sourceId:3710});assert.equal(r.response.status,200);assert.deepEqual(r.data.card,retained.card);assert.equal(h.calls.network.length,0,'Legacy known-card imports remain network-free');
h=harness({existing:[retained],data:{Media:{...anime(),characters:{nodes:[character(999)],pageInfo:{hasNextPage:false}}}}});r=await h.request({action:'import',sourceId:3710,animeId:20,animePage:2});assert.equal(r.response.status,422);assert.equal(r.data.code,'CHARACTER_NOT_IN_ANIME');assert.equal(h.calls.reads.length,0);assert.equal(h.calls.writes.length,0);
h=harness({race:true});r=await h.request({action:'import',sourceId:3710,animeId:20});assert.equal(r.response.status,200);assert.equal(r.data.card.series,'First canonical winner');assert.equal(r.data.card.rarity,'Légendaire');assert.equal(h.calls.upserts,0);
h=harness();r=await h.request({action:'search',search:'Tenten',page:1});assert.equal(r.response.status,200);assert.equal(r.data.entries[0].series,'Unrelated franchise');
h=harness();r=await h.request({action:'import',sourceId:3710});assert.equal(r.response.status,200);assert.equal(r.data.card.series,'Unrelated franchise');
h=harness();r=await h.request({action:'create_album',animeId:20});assert.equal(r.response.status,200);assert.equal(r.data.album.name,'Naruto');assert.deepEqual(h.calls.network[0].variables,{id:20});assert.equal(h.calls.rpc[0].p_payload.animeId,20);assert.equal(h.calls.rpc[0].p_payload.name,'Naruto');assert.match(h.calls.rpc[0].p_payload.coverImage,/s4\.anilist\.co/);
assert.equal(h.calls.writes.length,5,'A new album seeds its five most popular named characters');assert.equal(h.calls.rpc[0].p_payload.cardIds.length,5);assert.equal(r.data.addedCards.length,5);
h=harness({popularNodes:[character(999,'Narrator'),character(1,'Alice'),character(2,'Bob'),character(3,'Celine'),character(4,'Daniel'),character(5,'Eli')]});r=await h.request({action:'create_album',animeId:20});assert.equal(r.response.status,200);assert.equal(h.calls.writes.length,5);assert.ok(!h.calls.writes.some(row=>row.source_id===999),'Narration labels are replaced with the next named character');
h=harness({popularNodes:[character(999,'Narrator'),character(1,'Only Character')]});r=await h.request({action:'create_album',animeId:20});assert.equal(r.response.status,409);assert.equal(r.data.code,'ALBUM_MINIMUM_CHARACTERS');assert.equal(h.calls.writes.length,0);assert.equal(h.calls.rpc.length,0);
h=harness({seriesSize:0});r=await h.request({action:'import',sourceId:3710,animeId:20});assert.equal(r.response.status,200);assert.equal(h.calls.network.length,2);assert.equal(h.calls.writes.length,5);assert.equal(r.data.addedCards.length,5,'First import creates enough named companions for a complete album');
h=harness({seriesSize:0,popularNodes:[character()]});r=await h.request({action:'import',sourceId:3710,animeId:20});assert.equal(r.response.status,409);assert.equal(h.calls.writes.length,0,'A one-character universe must not be committed');
h=harness({seriesSize:0});r=await h.request({action:'import',sourceId:3710});assert.equal(r.response.status,200);assert.equal(h.calls.network.length,2);assert.equal(r.data.addedCards.length,5,'Legacy direct-character imports also add companions');
const borrowed=[character(),character(4799,'Akamaru'),character(2011,'Iruka'),character(3438,'Kimimaro'),character(13,'Fifth Character')].map(entry=>({id:'c'+entry.id,source_id:entry.id,card:{id:'c'+entry.id,sourceId:String(entry.id),name:entry.name.full,series:'Earlier canonical franchise',rarity:'Rare'}}));
h=harness({seriesSize:0,existing:borrowed,data:{Media:{...anime(),characters:{nodes:[character(99999,'New Character')],pageInfo:{hasNextPage:false}}}}});r=await h.request({action:'import',sourceId:99999,animeId:20});assert.equal(r.response.status,409);assert.equal(r.data.code,'ALBUM_MINIMUM_CHARACTERS');assert.equal(h.calls.writes.length,0,'Borrowed canonical companions must not leave a new one-character implicit album');assert.equal(h.records.size,5);assert.ok([...h.records.values()].every(row=>row.card.series==='Earlier canonical franchise'));
h=harness();r=await h.request({action:'create_album',animeId:20,name:'Mon album Naruto',actor:'spoofed',coverImage:'https://outside.example.test/spoof'});assert.equal(r.response.status,200);assert.equal(h.calls.rpc[0].p_actor,adminId);assert.equal(h.calls.rpc[0].p_payload.name,'Mon album Naruto');assert.ok(!h.calls.rpc[0].p_payload.coverImage.includes('outside'));
h=harness();r=await h.request({action:'list_albums'});assert.equal(r.response.status,200);assert.equal(r.data.albums.length,1);assert.equal(h.calls.network.length,0);
for(const action of ['add_album_card','remove_album_card']){h=harness();r=await h.request({action,albumId,cardId:'retained-3710'});assert.equal(r.response.status,200);assert.deepEqual(h.calls.rpc[0].p_payload,{albumId,cardId:'retained-3710'});assert.equal(h.calls.network.length,0);}
h=harness({existing:[retained]});r=await h.request({action:'import',sourceId:3710,animeId:20,animePage:2,albumId});assert.equal(r.response.status,200);assert.equal(r.data.card.id,'retained-3710');assert.equal(r.data.album.id,albumId);assert.deepEqual(h.calls.rpc[0].p_payload,{albumId,cardId:'retained-3710'});assert.equal(h.calls.writes.length,0);
h=harness();r=await h.request({action:'import',sourceId:3710,animeId:20,animePage:2,albumId});assert.equal(r.response.status,200);assert.equal(r.data.album.id,albumId);assert.equal(h.calls.rpc[0].p_payload.cardId,'c3710');assert.equal(h.calls.writes.length,1);
for(const [message,status]of [['ADMIN_REQUIRED',403],['ALBUM_NOT_FOUND',404],['CARD_NOT_FOUND',400],['ALBUM_NAME_TAKEN',409],['ALBUM_CARD_LIMIT',409],['ALBUM_MINIMUM_CHARACTERS',409],['private DB detail',503]]){
  h=harness({albumError:message});r=await h.request({action:'add_album_card',albumId,cardId:'c3710'});assert.equal(r.response.status,status);assert.ok(!JSON.stringify(r.data).includes('private DB detail'));
}
h=harness({existing:[retained],albumError:'ALBUM_NOT_FOUND'});r=await h.request({action:'import',sourceId:3710,albumId});assert.equal(r.response.status,404,'Async album failure must return a handled JSON error');assert.deepEqual(h.records.get(retained.id),retained);
h=harness();await h.request({action:'search_anime',search:'Naruto'});r=await h.request({action:'anime_characters',animeId:20});assert.equal(r.response.status,429);assert.equal(h.calls.network.length,1);assert.ok(Number(r.response.headers.get('Retry-After'))>=1&&Number(r.response.headers.get('Retry-After'))<=3);
for(const settings of [{providerStatus:429},{providerErrors:429},{providerStatus:503},{providerMalformed:true},{providerThrow:true}]){
  h=harness(settings);r=await h.request({action:'search_anime',search:'Naruto'});assert.ok([429,502,504].includes(r.response.status));assert.equal(h.calls.writes.length,0);assert.ok(!JSON.stringify(r.data).includes('provider private detail'));
}
h=harness({data:{Page:{media:{}}}});r=await h.request({action:'search_anime',search:'Naruto'});assert.equal(r.response.status,502);
h=harness();r=await h.request({action:'search_anime'},{headers:{Origin:'https://outside.example.test'}});assert.equal(r.response.status,403);assert.equal(h.calls.auth.length,0);
console.log(JSON.stringify({adminOnly:'passed',animeSearchAndPagination:'passed',adultAndMangaFiltered:'passed',exactAnimeCharacters:'passed',contextualImportMembership:'passed',basePopularityThresholds:'passed',madaraOwnerOverride:'passed',retainedCardsPreserved:'passed',concurrentInsertOnly:'passed',legacyCharacterSearch:'passed',canonicalAlbumCreation:'passed',albumSeedsTopFive:'passed',minimumTwoCharacters:'passed',firstCharacterCompanions:'passed',narratorExcluded:'passed',albumMembership:'passed',albumCanonicalCardIds:'passed',albumErrorsHandled:'passed',serverInputBounds:'passed',rateLimit:'passed',providerErrors:'passed',network:'none'}));
