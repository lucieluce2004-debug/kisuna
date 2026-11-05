import assert from 'node:assert/strict';
import {harness,session,until,pause} from './verify-account.mjs';

let finishRead,readGate=null;
const requests=[];
const test=harness({serverEconomy:true,session:session('member'),
 async progressionRpc(name,payload){
  assert.equal(name,'kizuna_nexus');assert.equal(payload.p_action,'get');
  if(readGate)await readGate;
  return {data:{xp:20,stateRevision:1,snapshot:{chakra:999999}},error:null};
 },
 async economyRpc(payload,active,records){
  requests.push(structuredClone(payload));const row=records.states.get(active.user.id);
  if(payload.p_action==='nexus_buy'){row.snapshot.chakra-=100;row.revision++;}
  return {data:{snapshot:structuredClone(row.snapshot),revision:row.revision,serverNow:Date.now(),result:{nexus:{stateRevision:2,unlocked:['invocation_1']}}},error:null};
 }
});
try{
 await test.settled();readGate=new Promise(r=>finishRead=r);
 const read=test.account.nexusRequest('get');await pause();
 await test.account.economyRequest('nexus_buy',{nodeId:'invocation_1',configVersion:1,expectedCost:1000});
 assert.equal(test.current.chakra,400);finishRead();await read;readGate=null;
 assert.equal(test.current.chakra,400,'A delayed Nexus read must not overwrite a purchase balance');
 assert.match(requests.at(-1).p_request_id,/^[a-f0-9-]{36}$/);
 assert.equal(requests.at(-1).p_payload.nodeId,'invocation_1');
 readGate=new Promise(r=>finishRead=r);const old=test.account.nexusRequest('get');await pause();
 test.signin(session('admin'));await until(()=>test.account.getSnapshot().user?.id==='admin');finishRead();
 await assert.rejects(old,/compte connecté a changé/);readGate=null;
 assert.equal(test.current.chakra,500);assert.equal(test.calls.stateWrites.length,0);
 console.log(JSON.stringify({nexusReadsNeverApplyWallet:true,nexusReadAccountIsolation:true,nexusUsesPersistentIntents:true}));
}finally{test.dom.window.close();}
