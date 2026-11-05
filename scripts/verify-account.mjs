import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// All OAuth, Auth and database traffic below stays in memory. No real Discord
// consent, user account, e-mail or database write is created by this script.
const source = fs.readFileSync(new URL('../dist/kizuna-account.js',import.meta.url),'utf8').replace('window.KizunaAccount =','window.__qa = {sanitize,loadUser,startDiscord,completeUsername}; window.KizunaAccount =');
const pause = () => new Promise(resolve=>setTimeout(resolve,10));
const stamp = Date.now();
const guest = {owned:[{id:'guest-card',at:stamp,rarity:'Rare',level:3}],pulls:[{id:'guest-card',at:stamp,name:'',series:'',rarity:'',level:1,username:'',pullId:''}],catalogue:[],market:{listings:[{id:'guest-listing'}],credits:{Invite:10},cards:[],history:[],wishlist:[]},username:'Invite',chakra:500,stock:{free:3,freeCapacity:10,nexusWeekly:0,t:stamp,inv:2,pm:0,pl:0,day:''}};
const user = (id,provider='discord') => ({id,email:id+'@example.test',identities:[{provider}],user_metadata:{role:'admin',isAdmin:true},app_metadata:{provider}});
const session = (id,provider='discord') => ({user:user(id,provider),access_token:'unit-token-'+id});
async function until(predicate) {for(let i=0;i<150;i++){if(predicate())return;await pause();}throw new Error('Account test did not settle');}
function harness(options={}) {
  const dom = new JSDOM('<!doctype html><body><button id="accountButton">Connexion</button><main></main></body>');
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event('close'));};
  let current=structuredClone(guest),gameSubscriber,authSubscriber,activeSession=options.session??null;
  const storage=new Map(),calls={oauth:[],exchange:[],verified:[],fetch:[],trace:[],tabs:[],client:[],claims:[],staff:[],stateWrites:[],order:[],profileInserts:0,serverProfileCreates:0,rpc:[]},navigations=[];
  const records={profiles:new Map([['member',{id:'member',username:'Membre',bio:'Bio conservee',avatar_card_id:'favorite-card'}],['admin',{id:'admin',username:'Admin',bio:''}],['moderator',{id:'moderator',username:'Moderateur',bio:''}]]),states:new Map(),admins:new Set(['admin']),moderators:new Set(['moderator']),rewards:new Map(Object.entries(options.rewards||{}))};
  for(const id of ['member','admin','moderator'])records.states.set(id,{user_id:id,snapshot:{...structuredClone(guest),owned:[{id:id+'-card',at:stamp}],stock:{free:options.freeStock??3,freeCapacity:options.freeCapacity??10,nexusWeekly:options.nexusWeekly??0,t:stamp,inv:2,pm:0,pl:0,day:''},market:{listings:[{id:id+'-listing'}],credits:{[id]:20},cards:[{id:id+'-market-card'}],history:[{id:id+'-history',at:stamp}],wishlist:[id+'-wanted']}},revision:0});
  const location={href:options.url||'https://kizuna.example.test/'};
  for(const key of ['origin','search','hash','pathname'])Object.defineProperty(location,key,{get(){return new URL(location.href)[key];}});
  location.assign=value=>navigations.push(value);
  function builder(table) {
    let op='read',data,filters={};const map=table==='kizuna_profiles'?records.profiles:records.states;
    const api={select(){return api;},eq(key,value){filters[key]=value;return api;},insert(value){op='insert';data=value;return api;},update(value){op='update';data=value;return api;},maybeSingle:run,single:run};
    async function run(){
      const id=filters.id||filters.user_id||data?.id||data?.user_id;
      if(table==='kizuna_admins')return {data:records.admins.has(id)?{user_id:id}:null,error:null};
      if(table==='kizuna_moderators')return {data:records.moderators.has(id)?{user_id:id}:null,error:null};
      if(table==='kizuna_profiles'&&op==='insert'){calls.profileInserts++;throw new Error('Profiles may only be bootstrapped by the verified server endpoint');}
      let row=map.get(id);
      if(op==='insert'){if(row)return {error:{code:'23505'}};row=structuredClone(data);map.set(id,row);calls.stateWrites.push({op,id});}
      if(op==='update'){if(!row||('revision'in filters&&row.revision!==filters.revision))return {data:null,error:null};row={...row,...structuredClone(data)};map.set(id,row);if(table==='kizuna_player_states'){calls.stateWrites.push({op,id,revision:data.revision});calls.order.push('save:'+id);}}
      return {data:row?structuredClone(row):null,error:null};
    }
    return api;
  }
  const config={supabaseUrl:'https://unit.supabase.co',supabaseKey:'unit-publishable-key',siteUrl:'https://kizuna.example.test',serverEconomy:!!options.serverEconomy,discordEnabled:options.enabled!==false};
  const sdk={from:builder,async rpc(name,payload){calls.rpc.push(name);if(name==='kizuna_mythic'||name==='kizuna_anomalies'||name==='kizuna_nexus'||name==='kizuna_nexus_admin')return options.progressionRpc(name,payload,activeSession);if(name==='kizuna_studio')return options.studioRpc(payload,activeSession,records,calls);if(name==='kizuna_market_inbox')return options.inboxRpc(payload,activeSession,records,calls);if(name==='kizuna_economy')return options.economyRpc(payload,activeSession,records,calls);if(name==='kizuna_adventure'){calls.order.push('adventure:'+payload.p_action);if(options.adventureBlock)await options.adventureBlock(payload);return {data:{state:{claims:{}},revision:0,definitions:[]},error:null};}assert.equal(name,'claim_kizuna_admin');return {data:false,error:null};},auth:{
    onAuthStateChange(fn){authSubscriber=fn;},async getSession(){return {data:{session:activeSession},error:null};},
    async getUser(token){calls.trace.push('verified');calls.verified.push(token);if(options.verifyError)return {data:{user:null},error:{message:'invalid token'}};return {data:{user:structuredClone(options.verifiedUser||activeSession?.user)},error:null};},
    async signOut(){activeSession=null;authSubscriber('SIGNED_OUT',null);return {error:null};},
    async signInWithOAuth(value){calls.oauth.push(value);if(options.oauthError)return {data:{url:null},error:options.oauthError};const url=new URL('/auth/v1/authorize',config.supabaseUrl);url.searchParams.set('provider',value.provider);url.searchParams.set('redirect_to',value.options.redirectTo);url.searchParams.set('code_challenge','unit-challenge');return {data:{url:options.authorizeUrl||url.href},error:null};},
    async exchangeCodeForSession(code){calls.exchange.push(code);if(options.exchangeError)return {data:{session:null},error:options.exchangeError};activeSession=options.exchangeSession||activeSession;authSubscriber('SIGNED_IN',activeSession);return {data:{session:activeSession},error:null};},
    async signInWithPassword(){throw new Error('Password login is no longer part of the public client');},async signUp(){throw new Error('E-mail signup is no longer part of the public client');},async updateUser(){throw new Error('Password updates are no longer part of the public client');}
  }};
  const sandbox={console,crypto:globalThis.crypto,performance:globalThis.performance,setTimeout,clearTimeout,URL,URLSearchParams,location,history:{replaceState(state,title,path){location.href=new URL(path,location.href).href;}},CustomEvent:dom.window.CustomEvent,document:dom.window.document,localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    async fetch(url,request){
      calls.fetch.push({url,options:request});
      assert.equal(request.headers.apikey,config.supabaseKey);assert.equal(request.method,'POST');assert.equal(request.credentials,'omit');
      const id=request.headers.Authorization?.replace(/^Bearer unit-token-/,'');
      assert.ok(id&&id!==request.headers.Authorization,'Only the current bearer token may choose the actor');
      const payload=JSON.parse(request.body);
      if(url.endsWith('/kizuna-discord-profile')){
        calls.trace.push('bootstrap');assert.ok(Object.keys(payload).every(key=>key==='username'));
        const status=options.bootstrapStatus||200;
        if(status!==200)return {ok:false,status,async json(){return {error:status===403?'Une identité Discord vérifiée est requise.':'Session invalide.'};}};
        if(!records.profiles.has(id)){
          if(payload.username===undefined)return {ok:true,status,async json(){return {needsUsername:true,userHint:'discord_hint'};}};
          assert.match(payload.username,/^[A-Za-z0-9_.-]{2,20}$/);
          if(options.takenNames?.has(payload.username.toLowerCase())||[...records.profiles.values()].some(profile=>profile.username.toLowerCase()===payload.username.toLowerCase()))return {ok:false,status:409,async json(){return {code:'USERNAME_TAKEN',error:'Ce pseudo est déjà utilisé. Choisis-en un autre.'};}};
          records.profiles.set(id,{id,username:payload.username,bio:'',avatar_card_id:null});calls.serverProfileCreates++;
        }
        return {ok:true,status,async json(){return {profile:structuredClone(records.profiles.get(id))};}};
      }
      if(url.endsWith('/kizuna-staff')){
        calls.staff.push({id,payload:structuredClone(payload)});
        const respond=(body,status=200)=>({ok:status===200,status,async json(){return structuredClone(body);}});
        const role=records.admins.has(id)?'admin':records.moderators.has(id)?'moderator':null;
        if(payload.action==='me')return respond({role});
        if(payload.action==='claim_rewards'){
          calls.claims.push({id,payload:structuredClone(payload)});calls.order.push('claim:'+id);
          if(options.claimBlock)await options.claimBlock(id,payload);
          const state=records.states.get(id);
          if(!state||payload.expectedRevision!==state.revision||options.claimConflict)return respond({code:'STATE_CONFLICT',error:'La sauvegarde a changé.'},409);
          const reward=records.rewards.get(id);
          if(!reward)return respond({rolls:0,chakra:0,revision:state.revision,snapshot:null});
          const snapshot=structuredClone(state.snapshot);snapshot.chakra=(snapshot.chakra||0)+reward.chakra;snapshot.stock={...snapshot.stock,inv:(snapshot.stock?.inv||0)+reward.rolls};
          state.snapshot=snapshot;state.revision++;records.rewards.delete(id);
          return respond({rolls:reward.rolls,chakra:reward.chakra,revision:state.revision,snapshot});
        }
        if(!role)return respond({code:'STAFF_REQUIRED',error:'Accès réservé au staff.'},403);
        if(['grant_rewards','save_booster','set_moderator','list_boosters'].includes(payload.action)&&role!=='admin')return respond({code:'ADMIN_REQUIRED',error:'Cette action est réservée aux administrateurs.'},403);
        return respond(payload.action==='list_players'?{players:[],page:1,hasMore:false}:{ok:true});
      }
      if(url.endsWith('/kizuna-catalogue-admin')){const status=options.catalogueStatus||200;return {ok:status===200,status,async json(){return {results:[]};}};}
      throw new Error('Unexpected endpoint: '+url);
    },
    window:{dispatchEvent(){},location,KIZUNA_CONFIG:config,KizunaBackend:{async ensureCatalogue(){if(options.catalogueBlock)await options.catalogueBlock;}},KizunaGame:{getSnapshot:()=>structuredClone(current),applySnapshot(value){current=structuredClone(value);gameSubscriber?.();},subscribe(fn){gameSubscriber=fn;},showTab(tab){calls.tabs.push(tab);},isBusy:()=>!!options.gameBusy,notify(){}},supabase:{createClient(url,key,settings){calls.client.push({url,key,settings});return sdk;}}}
  };
  vm.createContext(sandbox);vm.runInContext(source,sandbox);
  return {dom,sandbox,config,records,calls,storage,navigations,account:sandbox.window.KizunaAccount,qa:sandbox.window.__qa,options,location,get current(){return current;},change(fn){fn(current);gameSubscriber();},signin(value){activeSession=value;authSubscriber('SIGNED_IN',value);},settled:()=>until(()=>!sandbox.window.KizunaAccount.getSnapshot().loading)};
}
const member=harness({session:session('member','email')});await member.settled();
assert.equal(member.account.getSnapshot().user.id,'member');assert.equal(member.account.getSnapshot().isAdmin,false,'Editable metadata must never grant admin access');
assert.equal(member.current.owned[0].id,'member-card');assert.equal(member.current.market.listings[0].id,'member-listing');assert.equal(member.current.owned[0].at,stamp);
assert.equal(member.calls.fetch.filter(call=>call.url.endsWith('/kizuna-discord-profile')).length,0,'Existing e-mail sessions only read an existing application profile');assert.equal(member.calls.verified.length,1);
await assert.rejects(member.account.catalogueRequest({action:'search'}),/réservé aux administrateurs/);
member.change(value=>{value.owned.push({id:'member-new',at:stamp+1});value.cards=[{id:'whole-catalogue'}];});await member.account.flush();
assert.equal(member.records.states.get('member').snapshot.owned.length,2);assert.equal('cards'in member.records.states.get('member').snapshot,false);
await member.account.signOut();await pause();assert.equal(member.current.owned[0].id,'guest-card');assert.equal(member.current.market.listings[0].id,'guest-listing');
member.signin(session('admin'));await until(()=>member.account.getSnapshot().user?.id==='admin');
assert.equal(member.account.getSnapshot().isAdmin,true);assert.equal(member.current.owned[0].id,'admin-card');assert.equal(member.current.market.listings[0].id,'admin-listing');assert.equal(member.records.states.get('admin').snapshot.owned.length,1,'Guest import remains explicit');
await member.account.catalogueRequest({action:'search',query:'Naruto'});const catalogue=member.calls.fetch.find(call=>call.url.endsWith('/kizuna-catalogue-admin'));
assert.equal(catalogue.options.headers.Authorization,'Bearer unit-token-admin');assert.equal(catalogue.options.headers.apikey,'unit-publishable-key');
member.options.catalogueStatus=403;await assert.rejects(member.account.catalogueRequest({action:'search'}),error=>error.status===403);assert.equal(member.account.getSnapshot().isAdmin,false);
member.records.states.get('admin').revision++;member.change(value=>value.owned.push({id:'admin-new',at:stamp+2}));await member.account.flush();
assert.equal(member.account.getSnapshot().status,'conflict');assert.equal(member.records.states.get('admin').snapshot.owned.length,1);assert.ok(member.storage.has('kizuna_unsynced_v1_admin'));
await member.account.signOut();await pause();assert.equal(member.current.owned[0].id,'guest-card');
member.account.open('signup');const login=member.dom.window.document.querySelector('#kizunaAccountDialog');
assert.equal(login.querySelectorAll('form,input').length,0);assert.equal(login.querySelector('[data-kza="discord"]').textContent,'Continuer avec Discord');
await member.qa.startDiscord();assert.equal(member.calls.oauth.length,1);const oauth=member.calls.oauth[0];
assert.equal(oauth.provider,'discord');assert.equal(oauth.options.redirectTo,'https://kizuna.example.test/?auth=discord');assert.equal(oauth.options.scopes,undefined,'Supabase supplies only the default Discord identify/email scopes');assert.equal(oauth.options.skipBrowserRedirect,true);
assert.equal(member.calls.client[0].settings.auth.flowType,'pkce');assert.equal(member.calls.client[0].settings.auth.storageKey,'kizuna_auth_v1');assert.ok(member.navigations[0].startsWith('https://unit.supabase.co/auth/v1/authorize?'));

const disabled=harness({enabled:false});await disabled.settled();disabled.account.open('signup');await disabled.qa.startDiscord();
assert.equal(disabled.dom.window.document.querySelector('[data-kza="discord"]').disabled,true);assert.match(disabled.dom.window.document.querySelector('#kzaMessage').textContent,/en cours d’activation/);assert.equal(disabled.calls.oauth.length,0);
for(const [options,expected]of [[{oauthError:{message:'Unsupported provider: provider is not enabled'}},/en cours d’activation/],[{authorizeUrl:'https://outside.example.test/auth/v1/authorize?provider=discord'},/n’a pas pu être démarrée/]]){
  const test=harness(options);await test.settled();test.account.open();await test.qa.startDiscord();assert.equal(test.navigations.length,0);assert.match(test.dom.window.document.querySelector('#kzaMessage').textContent,expected);
}
const preview=harness({url:'http://127.0.0.1:8792/'});await preview.settled();await preview.qa.startDiscord();
assert.equal(preview.navigations[0],'https://kizuna.example.test/?auth=discord-start');assert.equal(preview.calls.oauth.length,0,'PKCE must not start on a different origin than its callback');
const handoff=harness({url:'https://kizuna.example.test/?auth=discord-start'});await until(()=>handoff.navigations.length===1);assert.equal(handoff.calls.oauth.length,1);assert.equal(handoff.location.search,'');

const callback=harness({url:'https://kizuna.example.test/?auth=discord&code=unit-code',exchangeSession:session('new-discord')});await callback.settled();
assert.equal(callback.calls.exchange[0],'unit-code');assert.equal(callback.calls.client[0].settings.auth.detectSessionInUrl,false);assert.equal(callback.account.getSnapshot().user,null);assert.equal(callback.account.getSnapshot().profile,null);assert.equal(callback.account.getSnapshot().needsUsername,true);assert.equal(callback.account.getSnapshot().status,'onboarding');assert.equal(callback.account.getSnapshot().isAdmin,false);
assert.deepEqual(callback.calls.trace,['verified','bootstrap']);assert.equal(callback.location.search,'');assert.deepEqual(callback.calls.tabs,[]);assert.equal(callback.calls.profileInserts,0);assert.equal(callback.calls.serverProfileCreates,0);assert.equal(callback.calls.stateWrites.length,0);assert.equal(callback.calls.rpc.length,0);assert.deepEqual(callback.current,guest,'Choosing a username must leave the guest game intact');assert.ok(callback.dom.window.document.querySelector('[data-kza-username-form]'));
const inputName=value=>{const input=callback.dom.window.document.querySelector('#kzaUsername');input.value=value;input.dispatchEvent(new callback.dom.window.Event('input',{bubbles:true}));};
inputName('bad name');await callback.qa.completeUsername('bad name');assert.equal(callback.calls.serverProfileCreates,0);assert.equal(callback.calls.trace.length,2,'Invalid names must be rejected before Auth or server requests');assert.equal(callback.dom.window.document.querySelector('#kzaUsername').value,'bad name');assert.match(callback.dom.window.document.querySelector('#kzaMessage').textContent,/2 à 20/);
callback.options.takenNames=new Set(['membre']);inputName('Membre');await callback.qa.completeUsername('Membre');assert.equal(callback.account.getSnapshot().needsUsername,true);assert.equal(callback.account.getSnapshot().user,null);assert.equal(callback.dom.window.document.querySelector('#kzaUsername').value,'Membre');assert.match(callback.dom.window.document.querySelector('#kzaMessage').textContent,/déjà utilisé/);assert.deepEqual(callback.current,guest);assert.equal(callback.calls.serverProfileCreates,0);
inputName('Mon_Pseudo');await callback.qa.completeUsername('Mon_Pseudo');assert.equal(callback.account.getSnapshot().user.id,'new-discord');assert.equal(callback.account.getSnapshot().profile.username,'Mon_Pseudo');assert.equal(callback.account.getSnapshot().needsUsername,false);assert.equal(callback.account.getSnapshot().staffRole,null);assert.equal(callback.calls.serverProfileCreates,1);assert.equal(callback.calls.profileInserts,0);assert.equal(callback.current.owned.length,0);assert.equal(callback.account.getSnapshot().guestAvailable,true);assert.deepEqual(callback.calls.tabs,['profile']);assert.equal(callback.records.profiles.get('new-discord').username,'Mon_Pseudo');
const existing=harness({url:'https://kizuna.example.test/?auth=discord&code=existing-code',exchangeSession:session('member')});await existing.settled();
assert.equal(existing.current.owned[0].id,'member-card');assert.equal(existing.account.getSnapshot().profile.username,'Membre');assert.equal(existing.account.getSnapshot().profile.bio,'Bio conservee');assert.equal(existing.account.getSnapshot().profile.avatar_card_id,'favorite-card');assert.equal(existing.records.states.get('member').revision,0);
const legacy=harness({url:'https://kizuna.example.test/?auth=confirmed#access_token=legacy&refresh_token=legacy&type=signup',session:session('member','email')});await legacy.settled();assert.equal(legacy.calls.client[0].settings.auth.flowType,'implicit');assert.equal(legacy.location.hash,'');assert.equal(legacy.account.getSnapshot().user.id,'member');
await legacy.account.signOut();await pause();await legacy.qa.startDiscord();assert.equal(legacy.calls.oauth.length,0,'A consumed legacy hash must never start a new implicit OAuth flow');assert.equal(legacy.navigations[0],'https://kizuna.example.test/?auth=discord-start');
const errorCodeOnly=harness({url:'https://kizuna.example.test/#error_code=flow_state_not_found'});await errorCodeOnly.settled();assert.equal(errorCodeOnly.location.hash,'');assert.equal(errorCodeOnly.dom.window.document.querySelector('#kizunaAccountDialog').open,true);assert.equal(errorCodeOnly.account.getSnapshot().user,null);
for(const options of [
  {url:'https://kizuna.example.test/?auth=discord#error=access_denied&error_description=cancelled'},
  {url:'https://kizuna.example.test/?auth=discord&code=expired',session:session('member'),exchangeError:{message:'invalid code verifier'}},
  {session:session('new-discord'),verifyError:true},
  {session:session('new-discord'),bootstrapStatus:401},
  {session:session('new-discord'),bootstrapStatus:403},
  {session:session('yugen-only','email')}
]){
  const test=harness(options);await test.settled();assert.equal(test.account.getSnapshot().user,null);assert.equal(test.account.getSnapshot().profile,null);assert.equal(test.account.getSnapshot().isAdmin,false);assert.equal(test.current.owned[0].id,'guest-card');assert.equal(test.calls.profileInserts,0);assert.ok(test.account.getSnapshot().error);
  if(options.exchangeError||options.verifyError||options.url?.includes('access_denied'))assert.equal(test.calls.fetch.length,0,'Failed Auth verification cannot reach application bootstrap');
  if(options.session?.user.id==='yugen-only')assert.equal(test.calls.fetch.length,0,'An unrelated e-mail account cannot create a Kizuna profile');
  if(options.url?.includes('access_denied')){assert.match(test.account.getSnapshot().error,/annulée/);assert.equal(test.location.hash,'');}
}
let releaseCatalogue;const catalogueBlock=new Promise(resolve=>{releaseCatalogue=resolve;});
const blocked=harness({session:session('member'),catalogueBlock});await pause();assert.equal(blocked.account.getSnapshot().loading,true);assert.equal(blocked.account.getSnapshot().user,null);assert.equal(blocked.calls.fetch.length,0);releaseCatalogue();await blocked.settled();assert.equal(blocked.current.owned[0].id,'member-card');
const sanitized=blocked.qa.sanitize({owned:[{id:'timestamp',at:stamp}],pulls:[{id:'timestamp',at:stamp}],market:{history:[{id:'history',at:stamp}]}});
assert.equal(sanitized.owned[0].at,stamp);assert.equal(sanitized.pulls[0].at,stamp);assert.equal(sanitized.market.history[0].at,stamp);

const moderator=harness({session:session('moderator')});await moderator.settled();
assert.equal(moderator.account.getSnapshot().staffRole,'moderator');assert.equal(moderator.account.getSnapshot().isModerator,true);assert.equal(moderator.account.getSnapshot().isAdmin,false);
await assert.rejects(moderator.account.catalogueRequest({action:'search',query:'Naruto'}),/réservé aux administrateurs/);
const monitored=await moderator.account.staffRequest({action:'list_players',page:1});assert.deepEqual(monitored.players,[]);
await assert.rejects(moderator.account.staffRequest({action:'grant_rewards',userId:'member',rolls:1,chakra:10,requestId:'unit-request'}),error=>error.status===403);
assert.equal(moderator.account.getSnapshot().staffRole,'moderator','An admin-only refusal must preserve a legitimate moderator role');
assert.equal(moderator.account.getSnapshot().isModerator,true);assert.equal(moderator.calls.staff.at(-1).payload.action,'me');
moderator.records.moderators.delete('moderator');
await assert.rejects(moderator.account.staffRequest({action:'list_players',page:1}),error=>error.status===403);
assert.equal(moderator.account.getSnapshot().staffRole,null,'A revoked staff role must be re-read from the server');assert.equal(moderator.account.getSnapshot().isAdmin,false);assert.equal(moderator.account.getSnapshot().isModerator,false);
const beforeDenied=moderator.calls.staff.length;await assert.rejects(moderator.account.staffRequest({action:'list_players'}),error=>error.status===403);assert.equal(moderator.calls.staff.length,beforeDenied);

const rewards=harness({session:session('member'),rewards:{member:{rolls:4,chakra:250}}});await rewards.settled();
assert.equal(rewards.current.chakra,750);assert.equal(rewards.current.stock.inv,6);assert.equal(rewards.current.owned[0].id,'member-card');assert.equal(rewards.current.market.listings[0].id,'member-listing');assert.equal(rewards.records.states.get('member').revision,1);assert.equal(rewards.calls.claims[0].payload.expectedRevision,0);
rewards.records.rewards.set('member',{rolls:3,chakra:50});
rewards.change(value=>{value.owned.push({id:'earned-before-reward',at:stamp+3,rarity:'Rare',level:3});value.market.wishlist.push('just-wished');value.chakra+=10;});
const beforeReward=structuredClone(rewards.current),beforeOrder=rewards.calls.order.length;
await rewards.account.claimRewards();
assert.deepEqual(rewards.calls.order.slice(beforeOrder),['save:member','claim:member'],'Pending game progress must be committed before the server merges the reward');
assert.equal(rewards.calls.claims.at(-1).payload.expectedRevision,2);assert.equal(rewards.records.states.get('member').revision,3);
assert.deepEqual(rewards.current.owned,beforeReward.owned);assert.deepEqual(rewards.current.market,beforeReward.market);assert.equal(rewards.current.chakra,beforeReward.chakra+50);assert.equal(rewards.current.stock.inv,beforeReward.stock.inv+3);assert.equal(rewards.account.getSnapshot().status,'synced');assert.equal(rewards.account.getSnapshot().loading,false);
const claimedSnapshot=structuredClone(rewards.current),claimCount=rewards.calls.claims.length;
await Promise.all([rewards.account.claimRewards(),rewards.account.claimRewards()]);
assert.equal(rewards.calls.claims.length,claimCount+1,'Concurrent reward checks must share one request');assert.deepEqual(rewards.current,claimedSnapshot,'An acknowledged reward must not be added a second time');assert.equal(rewards.records.states.get('member').revision,3);
rewards.change(value=>value.chakra++);await rewards.account.flush();assert.equal(rewards.records.states.get('member').revision,4,'The next save must use the revision returned by the reward claim');assert.equal(rewards.records.states.get('member').snapshot.chakra,claimedSnapshot.chakra+1);
rewards.options.gameBusy=true;rewards.records.rewards.set('member',{rolls:1,chakra:25});const beforeBusy=rewards.calls.claims.length;await rewards.account.claimRewards();assert.equal(rewards.calls.claims.length,beforeBusy,'Do not replace the game snapshot during a booster opening');assert.ok(rewards.records.rewards.has('member'));rewards.options.gameBusy=false;await rewards.account.claimRewards();assert.equal(rewards.records.rewards.has('member'),false);

const conflict=harness({session:session('member')});await conflict.settled();conflict.records.rewards.set('member',{rolls:1,chakra:100});conflict.records.states.get('member').revision++;
const staleLocal=structuredClone(conflict.current);await conflict.account.claimRewards();
assert.equal(conflict.account.getSnapshot().status,'conflict');assert.deepEqual(conflict.current,staleLocal,'A conflict cannot apply a different snapshot over local progress');assert.ok(conflict.records.rewards.has('member'));assert.ok(conflict.storage.has('kizuna_unsynced_v1_member'));
const saveConflict=harness({session:session('member')});await saveConflict.settled();saveConflict.records.states.get('member').revision++;saveConflict.change(value=>value.owned.push({id:'unsaved-card',at:stamp+5}));const beforeConflictClaim=saveConflict.calls.claims.length;await saveConflict.account.claimRewards();assert.equal(saveConflict.calls.claims.length,beforeConflictClaim,'A failed optimistic save must block reward application');assert.equal(saveConflict.account.getSnapshot().status,'conflict');assert.equal(saveConflict.current.owned.at(-1).id,'unsaved-card');

for(const freeStock of [25,100]){
  const storedPacks=harness({session:session('member'),freeStock});await storedPacks.settled();
  assert.equal(storedPacks.current.stock.free,freeStock,'Hydrating a cloud stock above ten must retain the full free balance');
  assert.equal(storedPacks.qa.sanitize({stock:{free:freeStock,inv:250}}).stock.free,freeStock);
  assert.equal(storedPacks.qa.sanitize({stock:{free:freeStock,inv:250}}).stock.inv,250,'Bonus packs remain a separate balance without a ten-pack cap');
  storedPacks.change(value=>{value.chakra++;});await storedPacks.account.flush();
  assert.equal(storedPacks.records.states.get('member').snapshot.stock.free,freeStock,'Saving another field must not reduce free stock');
  const ownedBefore=structuredClone(storedPacks.current.owned);
  await storedPacks.account.signOut();await pause();storedPacks.signin(session('member'));await until(()=>storedPacks.account.getSnapshot().user?.id==='member');
  assert.equal(storedPacks.current.stock.free,freeStock,'Reconnecting must restore the same cloud balance above ten');assert.deepEqual(storedPacks.current.owned,ownedBefore);
  assert.equal(storedPacks.qa.sanitize({stock:{free:103,freeCapacity:10}}).stock.free,103,'A lower configured capacity retains previously accumulated packs');assert.equal(storedPacks.qa.sanitize({stock:{free:104}}).stock.free,103,'The retained surplus remains bounded by the historical maximum Nexus stock');assert.equal(storedPacks.qa.sanitize({stock:{}}).stock.free,3,'A new account still starts with three free packs');
}

const switched=harness({session:session('member')});await switched.settled();let releaseOldClaim;const oldClaimBlock=new Promise(resolve=>{releaseOldClaim=resolve;});switched.records.rewards.set('member',{rolls:2,chakra:300});switched.options.claimBlock=async id=>{if(id==='member')await oldClaimBlock;};const oldClaimCount=switched.calls.claims.length;const oldClaim=switched.account.claimRewards();await until(()=>switched.calls.claims.length===oldClaimCount+1);switched.signin(session('admin'));await until(()=>switched.account.getSnapshot().user?.id==='admin');const adminBefore=structuredClone(switched.current);releaseOldClaim();await oldClaim;
assert.equal(switched.account.getSnapshot().user.id,'admin');assert.equal(switched.account.getSnapshot().staffRole,'admin');assert.deepEqual(switched.current,adminBefore,'A late reward response for a previous account must be ignored');assert.equal(switched.current.owned[0].id,'admin-card');assert.equal(switched.records.states.get('member').snapshot.chakra,800);assert.equal(switched.records.states.get('admin').snapshot.chakra,500);

const adventure=harness({session:session('member')});await adventure.settled();adventure.change(value=>value.chakra++);const orderStart=adventure.calls.order.length;const stable=structuredClone(adventure.current);await adventure.account.adventureRequest('claim',{id:'fixture'});assert.deepEqual(adventure.calls.order.slice(orderStart),['save:member','adventure:claim'],'Cosmetic validation follows the committed collection');assert.deepEqual(adventure.current,stable,'Cosmetic response cannot replace economic state');adventure.options.gameBusy=true;await assert.rejects(adventure.account.adventureRequest('awaken',{}),/Termine/);await adventure.account.adventureRequest('private');adventure.options.gameBusy=false;adventure.records.states.get('member').revision++;adventure.change(value=>value.chakra++);await assert.rejects(adventure.account.adventureRequest('claim',{}),/Synchronise/);await adventure.account.adventureRequest('private');
const adventureSwitch=harness({session:session('member')});await adventureSwitch.settled();let releaseAdventure;adventureSwitch.options.adventureBlock=()=>new Promise(resolve=>releaseAdventure=resolve);const staleAdventure=adventureSwitch.account.adventureRequest('get');const oldAdventureRejected=assert.rejects(staleAdventure,/compte connecté a changé/);await until(()=>!!releaseAdventure);adventureSwitch.signin(session('admin'));await until(()=>adventureSwitch.account.getSnapshot().user?.id==='admin');releaseAdventure();await oldAdventureRejected;

console.log(JSON.stringify({discordOnlyUI:'passed',oauthPKCE:'passed',authorizeUrlValidated:'passed',previewCanonicalHandoff:'passed',callbackExchange:'passed',callbackCancelAndExpiry:'passed',usernameBeforeCreation:'passed',invalidAndTakenUsername:'passed',verifiedServerBootstrap:'passed',legacySessions:'preserved',existingCollectionAndProfile:'preserved',metadataCannotEscalate:'passed',adminFromProtectedTable:'passed',moderatorPermissions:'passed',revokedStaffRole:'passed',catalogueAuth:'passed',forbiddenClearsAdmin:'passed',accountIsolation:'passed',guestImport:'explicit',optimisticConflict:'passed',rewardsFlushBeforeClaim:'passed',rewardsRevisionAndIdempotency:'passed',rewardsConflictAndAccountSwitch:'passed',busyGameDefersRewards:'passed',freeStockAboveTenCloudSaveAndReload:'25 and 100 preserved',freeStockCapacity:'10 to 13; initial balance stays 3; legacy free stock up to 103 retained',catalogueLoadOrder:'passed',timestamps:'preserved',adventureSaveBeforeClaim:'passed',adventureConflictAndAccountSwitch:'passed',privacyRevocationDuringConflict:'passed'}));

export {harness,session,until,pause};
