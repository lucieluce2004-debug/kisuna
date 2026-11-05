import assert from 'node:assert/strict';
import {harness,session,until} from './verify-account.mjs';
for(const id of [null,'member','moderator']){
 const h=harness({session:id?session(id):null});await h.settled();const count=h.calls.rpc.length;
 await assert.rejects(h.account.studioRequest('get'),/réservé aux administrateurs/);assert.equal(h.calls.rpc.length,count,'Non-admin cannot dispatch a studio call');
}
const h=harness({session:session('admin'),studioRpc:async payload=>({data:{revision:7,draft:{},testAction:payload.p_action},error:null})});await h.settled();
const before=JSON.stringify(h.current),writes=h.calls.stateWrites.length;const result=await h.account.studioRequest('publish',{revision:6});assert.equal(result.testAction,'publish');assert.equal(JSON.stringify(h.current),before);assert.equal(h.calls.stateWrites.length,writes,'Studio cannot save a collection');
for(const [message,match] of [['REVISION_CONFLICT',/autre session/],['ART_APPROVAL_REQUIRED',/illustrations/],['INVALID_IMAGE_URL',/HTTPS/],['ADMIN_REQUIRED',/plus accès/]]){h.options.studioRpc=async()=>({error:{message}});await assert.rejects(h.account.studioRequest('save',{}),match);}
let release;h.options.studioRpc=()=>new Promise(resolve=>release=resolve);const flight=h.account.studioRequest('get'),rejected=assert.rejects(flight,/compte connecté a changé/);await until(()=>!!release);h.signin(session('member'));await until(()=>h.account.getSnapshot().user?.id==='member');release({data:{draft:{private:'old admin'}},error:null});await rejected;assert.equal(h.current.owned[0].id,'member-card');
console.log(JSON.stringify({studioAccount:'permissions, RPC, friendly errors, late account reply discarded',economicWrites:0}));
