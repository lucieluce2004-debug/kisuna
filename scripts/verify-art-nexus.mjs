/* Phase C: real-state reward effects and dependency geometry; browser layout is checked separately. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {transformSync} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';

const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM('<main></main>',{url:'https://kizuna.example/#nexus',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window,d=w.document,copy=x=>JSON.parse(JSON.stringify(x)),wait=(ms=80)=>new Promise(r=>setTimeout(r,ms));
const $=s=>{const el=d.querySelector(s);assert.ok(el,s);return el;},click=s=>{const el=$(s);assert.equal(el.disabled,false,s);el.click();return el;};
let user={user:{id:'collector-a'},loading:false},reduced=false,pending=null,mode='success';
const branches=['invocation','destin','resonance','collection','prestige'],calls=[],sounds=[],timers=[];
const game={cards:[],owned:[],chakra:5000,stock:{inv:0,nexusWeekly:0}};
let server={configVersion:3,stateRevision:1,serverNow:Date.now(),xp:10000,level:20,levelFloor:9500,nextLevelXp:11000,
 nodes:branches.flatMap(branch=>Array.from({length:5},(_,i)=>({id:branch+'_'+(i+1),branch,tier:i+1,name:branch+' '+(i+1),description:'Bonus réel.',cost:100,requiredLevel:1,enabled:true,prerequisites:i?[branch+'_'+i]:[]}))),
 unlocked:['invocation_1','prestige_1','prestige_2','prestige_3'],bonuses:{dailyPacks:2,weeklyPacks:2},
 daily:{available:true,claimed:false,count:2,periodKey:'2026-11-04',nextResetAt:Date.now()+3600000},preferences:{priorityCardIds:[],frame:'',aura:''},
 rewards:[{key:'weekly',name:'Coffret hebdomadaire',kind:'weekly',available:true,claimed:false,locked:false,weeklyPacks:2,periodKey:'2026-11-02'},{key:'album:bleach',name:'Bleach',albumId:'bleach',kind:'album',available:false,claimed:false,locked:false,packs:1,chakra:100,owned:4,total:8,periodKey:'once'}]};
const publish=()=>{server.stateRevision++;server.serverNow++;w.dispatchEvent(new w.CustomEvent('kizuna:economy-change',{detail:{nexus:copy(server)}}));};
const nativeTimeout=w.setTimeout.bind(w);w.setTimeout=(fn,delay,...args)=>{timers.push({fn,delay});return nativeTimeout(fn,delay,...args);};
const expire=()=>{const timer=timers.filter(t=>t.delay===3600).at(-1);assert.ok(timer);timer.fn();};
Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get(){return this.id==='knxViewport'?700:800;}});
Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{get(){return this.id==='knxViewport'?594:600;}});
w.scrollTo=()=>{throw Error('The tree cannot scroll the page');};w.fetch=()=>{throw Error('Presentation cannot issue network calls');};
w.matchMedia=()=>({get matches(){return reduced;},addEventListener(){}});
w.KizunaExperience={reduced:()=>reduced,sfx:kind=>sounds.push(kind)};
w.KizunaGame={getSnapshot:()=>copy(game),notify(){},showTab(){}};
function claim(action,payload){
 const next=action==='nexus_daily'?server.daily:server.rewards.find(r=>r.key===payload.key);
 assert.equal(next.periodKey,payload.periodKey);assert.equal(next.claimed,false);
 next.claimed=true;next.available=false;
 if(action==='nexus_daily')game.stock.inv+=next.count;else game.stock.nexusWeekly+=next.weeklyPacks||0;
 if(mode==='wrong-period')next.periodKey='different-period';
 publish();return {replayed:mode==='replay',result:{nexus:copy(server)}};
}
w.KizunaAccount={getSnapshot:()=>copy(user),nexusRequest:async()=>copy(server),economyRequest:async(action,payload)=>{
 calls.push({action,payload:copy(payload)});assert.ok(['nexus_daily','nexus_reward'].includes(action));
 if(mode==='pending'){return new Promise((resolve,reject)=>{pending={resolve,reject,action,payload};});}
 return claim(action,payload);
}};
d.body.className='kz-art';d.body.dataset.tab='nexus';
try{
 w.eval(await fs.readFile('dist/kizuna-nexus.js','utf8'));await wait(150);
 assert.equal(d.querySelectorAll('#knxNodes button').length,25);
 assert.equal(d.querySelectorAll('.kanx-tree-scenery .kanx-bough').length,25);
 assert.equal(d.querySelectorAll('#knxLines path').length,25);
 assert.match($('#knxLines [data-kn-path="invocation_1"]').getAttribute('d'),/^M500 630 C/,'The true first link grows from the central crystal');
 server.nodes.find(n=>n.id==='destin_1').prerequisites=['invocation_5'];publish();await wait();
 assert.match($('#knxLines [data-kn-path="destin_1"]').getAttribute('d'),/^M500 100 C/,'A changed dependency comes from its actual prerequisite, including another branch');
 assert.equal($('#kanxRewardCelebration').hidden,true);assert.equal($('.kanx-reward-altar').dataset.state,'ready');
 assert.match($('#kanxAltarStatus').textContent,/2 récompenses/);assert.match($('#kanxAltarCount').textContent,/4 packs/);
 assert.equal($('[data-kn-reward="album:bleach"]').disabled,true,'An incomplete album cannot be claimed');
 assert.equal(d.querySelector('[data-kn-reward-celebrate]'),null);

 mode='pending';const daily=click('[data-kn-action="daily"]');daily.click();await wait(15);
 assert.equal(calls.length,1,'A second immediate click cannot queue another reward');
 assert.equal(game.stock.inv,0);assert.equal($('#kanxRewardCelebration').hidden,true);assert.equal(sounds.length,0);
 pending.reject(Error('Récompense refusée'));await wait();
 assert.equal(game.stock.inv,0);assert.equal(d.querySelector('[data-kn-reward-celebrate]'),null);
 assert.match($('#knxNotice').textContent,/Récompense refusée/);

 mode='success';click('[data-kn-action="daily"]');await wait();
 assert.equal(game.stock.inv,2);assert.equal(calls.length,2);assert.equal($('[data-kn-action="daily"]').disabled,true);
 assert.equal($('#kanxRewardCelebration').hidden,false);assert.match($('#kanxRewardCelebration').textContent,/Invocation/);
 assert.equal($('.kanx-reward-altar').dataset.knRewardCelebrate,'received','The successful reveal survives the final busy=false render');
 assert.equal(sounds.length,1);assert.match($('#kanxAltarStatus').textContent,/1 récompense/);
 for(let i=0;i<10;i++)w.dispatchEvent(new w.CustomEvent('kizuna:game-change'));await wait();
 assert.equal(sounds.length,1);assert.equal(game.stock.inv,2);expire();
 assert.equal($('#kanxRewardCelebration').hidden,true);assert.equal(d.querySelector('[data-kn-reward-celebrate]'),null);
 await w.KizunaNexus.refresh();await wait();assert.equal($('#kanxRewardCelebration').hidden,true);

 mode='replay';click('[data-kn-reward="weekly"]');await wait();
 assert.equal(game.stock.nexusWeekly,2);assert.equal($('#kanxRewardCelebration').hidden,true);assert.equal(sounds.length,1,'A replay updates ownership without celebration');
 assert.equal($('.kanx-reward-altar').dataset.state,'resting');
 server.rewards[0].claimed=false;server.rewards[0].available=true;publish();await wait();
 mode='wrong-period';click('[data-kn-reward="weekly"]');await wait();
 assert.equal($('#kanxRewardCelebration').hidden,true);assert.equal(sounds.length,1,'A different period never receives the requested reward effect');

 reduced=true;d.documentElement.dataset.kzMotion='reduced';mode='success';
 server.daily={...server.daily,available:true,claimed:false,periodKey:'2026-11-05'};publish();await wait();
 click('[data-kn-action="daily"]');await wait();
 assert.equal($('#kanxRewardCelebration').hidden,false,'Reduced motion preserves the readable success message');
 assert.equal(d.querySelector('[data-kn-reward-celebrate]'),null);assert.equal(sounds.length,1);expire();

 server.daily={...server.daily,available:true,claimed:false,periodKey:'2026-11-06'};publish();await wait();
 mode='pending';click('[data-kn-action="daily"]');await wait(15);const old=copy(server);old.daily.claimed=true;old.daily.available=false;old.stateRevision++;
 user={user:{id:'collector-b'},loading:true};d.dispatchEvent(new w.CustomEvent('kizuna:account-change'));pending.resolve({result:{nexus:old}});await wait();
 assert.equal(w.KizunaNexus.getSnapshot().state,null);assert.equal($('#kanxRewardCelebration').hidden,true);assert.equal($('.kanx-reward-altar').dataset.state,'locked');
 assert.equal(d.querySelector('[data-kn-reward-celebrate]'),null);assert.equal(sounds.length,1);
 const css=await fs.readFile('dist/kizuna-art-nexus.css','utf8');transformSync(css,{loader:'css'});assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/data-kz-motion="reduced"/);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({tree:'25 actual nodes, curved prerequisite links, real cross-branch changes',altar:'real daily, weekly and album availability',rewardEffects:'success only, no pending/failure/replay/wrong-period/reload effect; survives final rendering',guards:'duplicate click and stale identity ignored; no optimistic currency or inventory',accessibility:'no page scroll; reduced-motion text without effects or sound',css:'parsed; browser layout checked separately',errors}));
}finally{dom.window.close();}
