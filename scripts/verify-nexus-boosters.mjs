import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!/Could not parse CSS/.test(e.message))errors.push(e.message);});vc.on('error',e=>errors.push(String(e)));
const dom=new JSDOM(await fs.readFile('dist/index.html','utf8'),{url:'https://kizuna.example.test/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,d=w.document;
w.scrollTo=()=>{};w.confirm=()=>true;w.matchMedia=()=>({matches:true,addListener(){},removeListener(){}});w.CSS={escape:s=>String(s)};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.fetch=async()=>{throw Error('No external calls');};
const pause=(ms=80)=>new Promise(r=>setTimeout(r,ms));
try{
 for(const tag of d.scripts){const src=tag.getAttribute('src');w.eval(src?await fs.readFile(path.join('dist',src),'utf8'):tag.textContent);if(src==='kizuna-config.js')w.KIZUNA_CONFIG={};}
 await pause();const game=w.KizunaGame;let account={economy:true,user:{id:'a'},profile:{username:'A'},loading:true,revision:1};w.KIZUNA_CONFIG={serverEconomy:true};w.KizunaAccount.getSnapshot=()=>account;
 const s=game.getSnapshot();s.stock={free:103,freeCapacity:13,nexusWeekly:2,inv:0,t:Date.now(),pm:0,pl:0,day:''};s.owned=[];game.applySnapshot(s,{preserveViews:true});
 assert.equal(game.getSnapshot().stock.free,103,'Loading must not clamp an earned capacity to the new recharge capacity');
 const surplus=game.getSnapshot();surplus.stock.freeCapacity=10;game.applySnapshot(surplus,{preserveViews:true});assert.equal(game.getSnapshot().stock.free,103,'A configured reduction preserves already accumulated packs');
 account.loading=false;const pool=['Commun','Peu commune','Rare','Épique','Légendaire','Mythique'].map(r=>game.getSnapshot().cards.find(c=>c.rarity===r));
 w.KizunaNexus.getSnapshot=()=>({owner:'a',loaded:true,state:{weeklyBooster:{id:'nexus:weekly',name:'Coffret du Nexus',cardIds:pool.map(c=>c.id)},bonuses:{resonanceAnimation:true,mythicPrestige:true}}});
 // The backend transaction is mocked here; real draws are covered in check-nexus-lot2.sql.
 const calls=[];w.KizunaAccount.economyRequest=async(action,payload)=>{
  calls.push({action,payload});assert.equal(action,'open');assert.equal(payload.booster,'nexus:weekly');
  const state=game.getSnapshot();state.stock.nexusWeekly--;const picks=[pool[5],pool[2],pool[0],pool[1],pool[0]].map(c=>({id:c.id,rarity:c.rarity,level:c.level,at:Date.now()}));state.owned.push(...picks);game.applySnapshot(state,{preserveViews:true});
  return {snapshot:state,revision:2,serverNow:Date.now(),result:{cards:picks,resonance:[{index:0,delta:1,from:2,unlocked:3,resonance:6}],nexus:{bonuses:{resonanceAnimation:true}}}};
 };
 assert.equal(game.openNexusWeekly(),true);assert.equal(calls.length,0,'Preview does not spend');assert.match(d.querySelector('[data-kr-open-label]').textContent,/coffret.*Nexus/);
 d.querySelector('[data-kr-action="close"]').click();assert.equal(game.getSnapshot().stock.nexusWeekly,2,'Cancel does not spend');
 const zero=game.getSnapshot();zero.stock.free=0;zero.stock.inv=0;game.applySnapshot(zero,{preserveViews:true});game.openNexusWeekly();const open=d.querySelector('[data-kr-action="open-pack"]');assert.equal(open.disabled,false,'Special stock can open with no ordinary packs');open.click();open.click();await pause(450);
 assert.equal(calls.length,1);assert.equal(game.getSnapshot().stock.nexusWeekly,1);assert.equal(game.getSnapshot().stock.free,0);assert.equal(game.getSnapshot().stock.inv,0);assert.equal(game.getSnapshot().owned.length,5);assert.match(d.querySelector('.kr-card-caption').textContent,/Commun/);
 for(let i=0;i<4;i++){d.querySelector('[data-kr-action="advance"]')?.click();await pause(300);}
 // The notice is derived from the actual returned resonance and earned entitlement.
 assert.ok(d.querySelector('.knx-resonance-exclusive'));
 d.querySelector('[data-kr-action="close"]').click();account={economy:false,user:null,loading:false};d.dispatchEvent(new w.CustomEvent('kizuna:account-change'));await pause();assert.equal(game.openNexusWeekly(),false);assert.equal(d.querySelector('[data-id="nexus:weekly"]'),null,'Weekly selector does not leak to another identity');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({capacity103DuringLoad:true,weeklyUsesExistingInvocation:true,cancelNoSpend:true,weeklyOnlyStock:true,doubleClickSafe:true,ascendingRarity:true,earnedResonanceAnimation:true,identityCleared:true}));
}finally{dom.window.close();}
