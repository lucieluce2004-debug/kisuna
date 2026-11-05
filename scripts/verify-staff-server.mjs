import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {transform} from 'esbuild';

// Run the production Edge handler with in-memory Auth/RPC boundaries. No real
// users, Discord authorizations, rewards or network requests are created here.
const source=fs.readFileSync(new URL('../supabase/functions/kizuna-staff/index.ts',import.meta.url),'utf8');
const compiled=await transform(source.replace(/^import[^\n]+\n/,'const createClient=globalThis.__createClient;\n'),{loader:'ts',format:'cjs',target:'es2022'});
const origin='https://kizuna.aleklecaribou.chatgpt.site';
const actor='a52df8a8-accc-412b-b402-91daf6289125',target='b08e3e14-186b-43bd-b98e-1a6e2ed35439';
const requestId='c98e3e14-186b-43bd-b98e-1a6e2ed35439';
function harness({role=null,user={id:actor,is_anonymous:false,user_metadata:{role:'admin',isAdmin:true}},authError=null,dbError=null}={}){
  const calls={auth:[],rpc:[],clients:0};
  const service={
    auth:{async getUser(token){calls.auth.push(token);return {data:{user},error:authError};}},
    async rpc(name,args){
      assert.equal(args.p_actor,actor,'Caller cannot select the acting user');
      calls.rpc.push({name,...structuredClone(args)});
      if(name==='kizuna_set_staff_role'){
        if(dbError)return {data:null,error:dbError};
        return {data:{ok:true,role:args.p_role},error:null};
      }
      assert.equal(name,'kizuna_staff_dispatch');
      if(args.p_action==='me')return {data:{role},error:null};
      if(dbError)return {data:null,error:dbError};
      const data={
        list_players:{players:[{id:target,username:'Player',provider:'discord',review_status:'pending'}],page:1,hasNext:false},
        review_player:{ok:true},list_boosters:{boosters:[]},save_booster:{booster:{id:requestId,...args.p_payload.booster,card_count:5}},
        grant_rewards:{reward:{id:requestId,user_id:target,rolls:3,chakra:100,reason:'Test'},duplicate:false},
        set_moderator:{ok:true,role:'moderator'},claim_rewards:{claimedCount:0,rolls:0,chakra:0,snapshot:null,revision:null},
      }[args.p_action];
      return {data,error:null};
    },
  };
  const module={exports:{}};
  const sandbox={module,exports:module.exports,Request,Response,Headers,TextDecoder,Uint8Array,AbortSignal,setTimeout,clearTimeout,
    Deno:{env:{get:key=>({SUPABASE_URL:'https://unit.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'unit-private-key'})[key]},serve(){}},
    __createClient(url,key,options){calls.clients++;assert.equal(url,'https://unit.supabase.co');assert.equal(key,'unit-private-key');assert.equal(options.auth.persistSession,false);assert.equal(options.auth.autoRefreshToken,false);return service;},
    fetch(){throw new Error('Unexpected network');},
  };
  vm.createContext(sandbox);vm.runInContext(compiled.code,sandbox);
  async function request(body={action:'me'},options={}){
    const headers={Origin:origin,'Content-Type':'application/json',...options.headers};
    if(options.token!==null)headers.Authorization='Bearer '+(options.token||'unit-valid-user-token');
    const method=options.method||'POST';
    const response=await module.exports.handler(new Request('https://unit.supabase.co/functions/v1/kizuna-staff',{method,headers,...(method==='POST'?{body:options.raw??JSON.stringify(body),...(options.raw instanceof ReadableStream?{duplex:'half'}:{})}:{})}));
    const data=response.status===204?null:await response.json();
    assert.ok(!JSON.stringify(data).includes('unit-private-key'));
    return {response,data};
  }
  return {request,calls};
}

let h=harness(),r=await h.request(undefined,{token:null});assert.equal(r.response.status,401);assert.equal(h.calls.clients,0);
for(const settings of [{user:null},{authError:{status:401}},{user:{id:actor,is_anonymous:true}},{user:{id:'invalid'}}]){
  h=harness(settings);r=await h.request({action:'list_players'});assert.equal(r.response.status,401);assert.equal(h.calls.rpc.length,0);
}
h=harness();r=await h.request({action:'me'});assert.equal(r.response.status,200);assert.equal(r.data.role,null,'Editable metadata cannot grant a role');
for(const action of ['list_players','review_player','list_boosters','save_booster','grant_rewards','set_moderator','set_staff_role']){
  h=harness();r=await h.request({action});assert.equal(r.response.status,403);assert.equal(h.calls.rpc.length,1,'No privileged dispatch after role denial');
}
for(const action of ['list_boosters','save_booster','grant_rewards','set_moderator','set_staff_role']){
  h=harness({role:'moderator'});r=await h.request({action});assert.equal(r.response.status,403);assert.equal(h.calls.rpc.length,1);
}
h=harness({role:'moderator'});r=await h.request({action:'list_players',search:'new',page:2});assert.equal(r.response.status,200);assert.equal(h.calls.rpc[1].p_payload.page,2);assert.equal(h.calls.rpc[1].p_payload.search,'new');
r=await h.request({action:'review_player',userId:target,status:'reviewed',note:'Compte vérifié\nDeuxième ligne'});assert.equal(r.response.status,200);
r=await h.request({action:'review_player',userId:target,status:'pending'});assert.equal(r.response.status,200);assert.equal(h.calls.rpc.at(-1).p_payload.note,'');
const grant={action:'grant_rewards',userId:target,rolls:3,chakra:100,reason:'Récompense événement',requestId};
h=harness({role:'admin'});r=await h.request(grant);assert.equal(r.response.status,200);assert.deepEqual(h.calls.rpc.at(-1).p_payload,{userId:target,rolls:3,chakra:100,reason:'Récompense événement',requestId});
r=await h.request({action:'set_moderator',userId:target,enabled:true});assert.equal(r.response.status,200);
for(const role of ['admin','moderator',null]){
  r=await h.request({action:'set_staff_role',userId:target,role});assert.equal(r.response.status,200);assert.equal(r.data.ok,true);assert.equal(r.data.role,role);
  assert.deepEqual(h.calls.rpc.at(-1),{name:'kizuna_set_staff_role',p_actor:actor,p_target:target,p_role:role});
}
const draft={action:'save_booster',booster:{name:'Pack test',description:'Test',card_ids:[],published:false}};
r=await h.request(draft);assert.equal(r.response.status,200);assert.equal(r.data.booster.card_count,5);
r=await h.request({...draft,booster:{...draft.booster,id:requestId,card_ids:['c1','c2'],published:true}});assert.equal(r.response.status,200);
for(const body of [
  {...grant,actor:target},{...grant,role:'admin'},{...grant,userId:'wrong'},{...grant,requestId:'wrong'},
  {...grant,rolls:-1},{...grant,rolls:1001},{...grant,rolls:1.1},{...grant,chakra:1000001},
  {...grant,rolls:0,chakra:0},{...grant,reason:'x'},{...grant,reason:'a'.repeat(281)},
  {...draft,booster:{...draft.booster,card_ids:['c1','c1']}},{...draft,booster:{...draft.booster,card_ids:Array(501).fill('c1')}},
  {...draft,booster:{...draft.booster,published:'true'}},{...draft,booster:{...draft.booster,card_count:10}},
  {action:'list_players',page:0},{action:'list_players',search:'a'.repeat(101)},
  {action:'review_player',userId:target,status:'banned'}, {action:'set_moderator',userId:target,enabled:'true'},
  {action:'claim_rewards',expectedRevision:-1},{action:'claim_rewards',expectedRevision:1.2},{action:'claim_rewards',expectedRevision:0,userId:target},
  {action:'me',userId:target},
  {action:'set_staff_role',userId:target,role:'owner'}, {action:'set_staff_role',userId:target},
  {action:'set_staff_role',userId:target,role:true}, {action:'set_staff_role',userId:'wrong',role:'admin'},
  {action:'set_staff_role',userId:target,role:'admin',actor:target},
]){
  const before=h.calls.rpc.length;r=await h.request(body);assert.equal(r.response.status,400,JSON.stringify(body));assert.equal(h.calls.rpc.length,before+1,'Invalid payload must never reach mutation dispatch');
}
h=harness();r=await h.request({action:'claim_rewards',expectedRevision:4});assert.equal(r.response.status,200);assert.equal(h.calls.rpc.at(-1).p_actor,actor);assert.equal(h.calls.rpc.at(-1).p_payload.expectedRevision,4);
for(const [message,status] of [['STATE_CONFLICT',409],['BALANCE_LIMIT',409],['REQUEST_REUSED',409],['ADMIN_REQUIRED',403],['PLAYER_NOT_FOUND',404],['MISSING_RARITIES',400],['sensitive private database detail',503]]){
  h=harness({role:'admin',dbError:{message}});r=await h.request(grant);assert.equal(r.response.status,status);assert.ok(!JSON.stringify(r.data).includes('sensitive private database detail'));
}
for(const [message,status] of [['SELF_ROLE_PROTECTED',403],['LAST_ADMIN_PROTECTED',409],['ADMIN_REQUIRED',403],['PLAYER_NOT_FOUND',404]]){
  h=harness({role:'admin',dbError:{message}});r=await h.request({action:'set_staff_role',userId:target,role:null});assert.equal(r.response.status,status);assert.equal(r.data.code,message);
}
h=harness();r=await h.request(undefined,{headers:{Origin:'https://outside.example.test'}});assert.equal(r.response.status,403);assert.equal(h.calls.clients,0);assert.equal(r.response.headers.get('Access-Control-Allow-Origin'),null);
r=await h.request(undefined,{method:'OPTIONS',token:null});assert.equal(r.response.status,204);
r=await h.request(undefined,{method:'GET'});assert.equal(r.response.status,405);
r=await h.request(undefined,{raw:'{'});assert.equal(r.response.status,400);
r=await h.request(undefined,{raw:'x'.repeat(70001)});assert.equal(r.response.status,413);
r=await h.request(undefined,{raw:new ReadableStream({start(){}})});assert.equal(r.response.status,408);
console.log(JSON.stringify({verifiedAuth:'passed',metadataCannotEscalate:'passed',staffPermissions:'passed',moderatorReadReviewOnly:'passed',canonicalActor:'passed',staffRoleAssignment:'passed',selfAndLastAdminProtected:'passed',rewardValidation:'passed',customBoosterValidation:'passed',claimRevision:'passed',databaseRoleRevocation:'passed',errorPrivacy:'passed',corsAndBodyLimits:'passed',network:'none'}));
