import assert from 'node:assert/strict';
import {harness,session,until,pause} from './verify-account.mjs';
let block=null,fail=false;const requests=[],receipts=new Map();
const test=harness({serverEconomy:true,session:session('member'),async economyRpc(payload,active,records){
 const id=active.user.id;requests.push(structuredClone(payload));if(block)await block;
 const row=records.states.get(id);let result={};
 if(payload.p_action==='open'){
  const key=id+payload.p_request_id;
  if(!receipts.has(key)){row.snapshot.stock.free--;row.snapshot.owned.push({id:'earned',at:Date.now()});row.revision++;receipts.set(key,{cards:[{id:'earned'}]});}
  result=receipts.get(key);if(fail){fail=false;throw Error('Network lost after commit');}
 }
 if(payload.p_action==='preferences'){row.snapshot.market.wishlist=payload.p_payload.wishlist;row.revision++;}
 return {data:{snapshot:structuredClone(row.snapshot),revision:row.revision,result,serverNow:Date.now(),economyVersion:1},error:null};
}});
try{
 await test.settled();assert.equal(test.account.getSnapshot().economy,true);assert.equal(test.calls.stateWrites.length,0,'Server mode never writes full snapshots');
 assert.equal(test.account.getSnapshot().guestAvailable,false,'Local guest cards do not enter shared economy');
 test.change(s=>{s.chakra=99999999;s.owned.push({id:'forged',at:Date.now()});});await test.account.flush();
 assert.equal(test.records.states.get('member').snapshot.chakra,500);assert.equal(test.records.states.get('member').snapshot.owned.length,1);
 const res=await test.account.economyRequest('open',{count:1,booster:'mix'});assert.equal(res.result.cards[0].id,'earned');assert.equal(test.current.chakra,500);assert.equal(test.current.owned.some(c=>c.id==='forged'),false);
 assert.equal(requests.at(-1).p_payload.count,1);assert.deepEqual(Object.keys(requests.at(-1).p_payload),['count','booster']);assert.match(requests.at(-1).p_request_id,/^[a-f0-9-]{36}$/);
 fail=true;await assert.rejects(test.account.economyRequest('open',{count:1,booster:'mix'}),/Network/);const pending=JSON.parse(test.storage.get('kizuna_economy_pending_v1_member'));assert.ok(pending);
 await assert.rejects(test.account.economyRequest('shop',{count:1}),/attend sa vérification/);
 const count=test.records.states.get('member').snapshot.owned.length;await test.qa.loadUser(session('member').user,true);assert.equal(test.current.owned.length,count,'Committed operation recovered without duplicate');assert.equal(requests.at(-1).p_request_id,pending.p_request_id);assert.equal(test.storage.has('kizuna_economy_pending_v1_member'),false);
 let release;block=new Promise(r=>release=r);const old=test.account.economyRequest('open',{count:1,booster:'mix'});await pause();await assert.rejects(test.account.economyRequest('shop',{count:1}),/déjà en cours/);
 test.signin(session('admin'));await pause();release();block=null;await assert.rejects(old,/compte connecté a changé/);await until(()=>test.account.getSnapshot().user?.id==='admin');assert.equal(test.current.owned[0].id,'admin-card');
 assert.equal(test.calls.stateWrites.length,0);assert.equal(test.dom.window.document.body.classList.contains('kizuna-economy-loading'),false);
 console.log(JSON.stringify({serverOnlyWrites:true,guestSeparation:true,forgedLocalStateIgnored:true,lostResponseRecovered:true,idempotencyKeyReused:true,accountSwitchIsolated:true}));
}finally{test.dom.window.close();}
