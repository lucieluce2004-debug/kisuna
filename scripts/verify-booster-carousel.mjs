import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
import {transform} from 'esbuild';

const html=await fs.readFile('dist/index.html','utf8'),css=await fs.readFile('dist/kizuna-play.css','utf8'),errors=[];
const vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!/Could not parse CSS/.test(e.message))errors.push(e.message);});
const dom=new JSDOM(html,{url:'https://kizuna.example/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,d=w.document;
w.scrollTo=()=>{};w.fetch=async()=>{throw Error('Unexpected network');};w.matchMedia=()=>({matches:true,addListener(){},removeListener(){}});
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
const wait=()=>new Promise(r=>setTimeout(r,70));
try{
 const style=d.createElement('style');style.textContent=css;d.head.append(style);
 for(const tag of d.scripts){const src=tag.getAttribute('src');w.eval(src?await fs.readFile(path.join('dist',src),'utf8'):tag.textContent);if(src==='kizuna-config.js')w.KIZUNA_CONFIG={};}
 await wait();const G=w.KizunaGame;G.showTab('boosters');
 const grid=d.getElementById('kGrid'),first=()=>grid.querySelector('.kpack'),last=()=>grid.querySelector('.kpack:last-child');
 assert.equal(first().dataset.id,'mix');
 // This is the CSS regression: the legacy .kb-grid centre rule otherwise clips
 // the leading overflow before scrollLeft=0, making Mix unreachable in a browser.
 assert.equal(w.getComputedStyle(grid).display,'flex');
 assert.equal(w.getComputedStyle(grid).justifyContent,'flex-start');
 assert.equal(w.getComputedStyle(grid).boxSizing,'border-box');
 assert.equal(w.getComputedStyle(grid).maxWidth,'100%');
 assert.equal(w.getComputedStyle(grid.closest('.kb-main')).minWidth,'0');
 const econ=()=>JSON.stringify({owned:G.getSnapshot().owned,chakra:G.getSnapshot().chakra,stock:G.getSnapshot().stock,pulls:G.getSnapshot().pulls}),before=econ();
 const next=d.querySelector('[data-kg-rail="1"]'),prev=d.querySelector('[data-kg-rail="-1"]');
 let railWidth=580,packWidth=210,left=0;const total=()=>grid.children.length*packWidth+(grid.children.length-1)*20+40,max=()=>Math.max(0,total()-railWidth);
 // jsdom has no layout engine. Supply measured-style geometry only for scrolling;
 // actual responsive layout is verified separately in the browser by the root task.
 Object.defineProperty(grid,'clientWidth',{get:()=>railWidth});Object.defineProperty(grid,'scrollWidth',{get:total});
 Object.defineProperty(grid,'scrollLeft',{get:()=>left,set:v=>{left=Math.max(0,Math.min(max(),Number(v)||0));}});
 const scrollCalls=[];grid.scrollTo=options=>{scrollCalls.push(options);grid.scrollLeft=options.left;};
 for(const width of [580,340,260]){
  railWidth=width;packWidth=width<400?190:210;grid.scrollLeft=0;
  for(let i=0;i<25;i++)next.click();assert.equal(left,max(),'Next reaches the end at rail width '+width);
  last().click();assert.equal(grid.querySelector('[aria-pressed="true"]').dataset.id,last().dataset.id);assert.equal(left,max(),'Selecting the final pack retains the end position');
  for(let i=0;i<25;i++)prev.click();assert.equal(left,0,'Previous reaches Mix at rail width '+width);
  first().focus({preventScroll:true});first().click();assert.equal(grid.querySelector('[aria-pressed="true"]').dataset.id,'mix');assert.equal(left,0);assert.equal(d.activeElement.dataset.id,'mix','Rerender retains focus on Mix');
  assert.match(d.querySelector('#boosters .kb-panel').textContent,/Kizuna Mix/i);
  next.click();const retained=left;grid.querySelector('[data-id="shojo"]').click();assert.equal(left,retained,'Selection does not reset browsing position');
 }
 assert.ok(scrollCalls.every(x=>x.left>=0));assert.ok(scrollCalls.every(x=>x.behavior==='instant'),'Reduced motion disables smooth movement');
 assert.equal(econ(),before,'Browsing and selecting boosters must not spend or draw');
 const selected=grid.querySelector('[aria-pressed="true"]').dataset.id;assert.equal(selected,'shojo');
 grid.hidden=true;const calls=scrollCalls.length;next.click();assert.equal(scrollCalls.length,calls,'Hidden rail does not move when another booster tab is open');grid.hidden=false;
 assert.deepEqual((await transform(css,{loader:'css'})).warnings,[]);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({cause:'legacy centred flex overflow corrected',alignment:'leading edge, width contained',arrows:'first and last reachable at 580/340/260 rail widths',mix:'selected from first pack, focus retained',rerender:'scroll position retained',economy:'unchanged',css:'parsed; actual layout requires browser QA'}));
}finally{dom.window.close();}
