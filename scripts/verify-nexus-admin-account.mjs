import assert from 'node:assert/strict';
import {harness,session,until} from './verify-account.mjs';
for(const id of [null,'member','moderator']){
 const h=harness({session:id?session(id):null});try{await h.settled();const n=h.calls.rpc.length;await assert.rejects(h.account.nexusAdminRequest('get'),/réservé aux administrateurs/);assert.equal(h.calls.rpc.length,n);}finally{h.dom.window.close();}
}
const h=harness({session:session('admin'),freeStock:103,freeCapacity:10,progressionRpc:async(name,payload)=>({data:{name,action:payload.p_action,draftRevision:7},error:null})});
try{
 await h.settled();assert.equal(h.current.stock.free,103);assert.equal(h.current.stock.freeCapacity,10);
 const before=JSON.stringify(h.current),writes=h.calls.stateWrites.length;
 const response=await h.account.nexusAdminRequest('publish',{revision:6});assert.equal(response.name,'kizuna_nexus_admin');assert.equal(response.action,'publish');assert.equal(JSON.stringify(h.current),before);assert.equal(h.calls.stateWrites.length,writes,'Admin configuration never saves a player collection');
 for(const [code,match] of [['REVISION_CONFLICT',/autre session/],['NEXUS_CONFIG_CHANGED',/configuration publiée/],['ADMIN_REQUIRED',/plus accès/]]){h.options.progressionRpc=async()=>({error:{message:code}});await assert.rejects(h.account.nexusAdminRequest('save',{}),match);}
 let release;h.options.progressionRpc=()=>new Promise(resolve=>release=resolve);const flight=h.account.nexusAdminRequest('get'),rejected=assert.rejects(flight,/compte connecté a changé/);await until(()=>!!release);h.signin(session('member'));await until(()=>h.account.getSnapshot().user?.id==='member');release({data:{draft:{private:'previous admin'}},error:null});await rejected;
 console.log(JSON.stringify({nexusAdmin:'admin only, dedicated RPC, no player writes, stale response rejected',retainedSurplus:'103 packs remain when capacity lowered to 10'}));
}finally{h.dom.window.close();}
