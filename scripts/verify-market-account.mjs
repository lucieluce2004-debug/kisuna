import assert from 'node:assert/strict';
import {harness,session,until} from './verify-account.mjs';
let block=null,release,fail=false;
const h=harness({session:session('member'),async inboxRpc(){if(block)await block;return fail?{error:{message:'ADMIN_REQUIRED'}}:{data:{items:[],unread:0,latestId:'0'},error:null};}});
try{
 await h.settled();const before=structuredClone(h.current),writes=h.calls.stateWrites.length;
 h.options.gameBusy=true;await h.account.marketInboxRequest('get');assert.deepEqual(h.current,before);assert.equal(h.calls.stateWrites.length,writes,'Reading activity never flushes or overwrites a draw');
 fail=true;await assert.rejects(h.account.marketInboxRequest('health'),/administrateurs/);fail=false;
 block=new Promise(r=>release=r);const pending=h.account.marketInboxRequest('get'),rejected=assert.rejects(pending,/compte connecté a changé/);
 h.signin(session('admin'));await until(()=>h.account.getSnapshot().user?.id==='admin');release();block=null;await rejected;
 console.log(JSON.stringify({inboxDoesNotMutateEconomy:true,inboxAvailableDuringReveal:true,adminError:true,lateAccountReplyRejected:true}));
}finally{h.dom.window.close();}
