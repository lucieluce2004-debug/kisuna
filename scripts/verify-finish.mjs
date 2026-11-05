import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
import {transform} from 'esbuild';
const html=await fs.readFile('dist/index.html','utf8'),errors=[],vc=new VirtualConsole();
vc.on('jsdomError',e=>{if(!/CSS stylesheet/.test(e.message))errors.push(e.message);});
const dom=new JSDOM(html,{url:'https://kizuna.test/#profile',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window,d=w.document,flush=()=>new Promise(r=>setTimeout(r,70));
w.scrollTo=()=>{};w.AbortSignal=AbortSignal;w.fetch=async()=>{throw Error('QA: no remote services');};
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
try{
  for(const script of d.scripts){const src=script.getAttribute('src');w.eval(src?await fs.readFile(path.join('dist',src),'utf8'):script.textContent);if(src==='kizuna-config.js')w.KIZUNA_CONFIG={};}
  await flush();
  let account={user:{id:'editor-a'},profile:{username:'Joueur_A',bio:'Bio du compte A'},loading:false,status:'synced'};
  w.KizunaAccount.getSnapshot=()=>account;
  w.KizunaGame.showTab('profile');w.KizunaProfile.refresh();await flush();
  const economicBefore=JSON.stringify(w.KizunaGame.getSnapshot());
  const edit=()=>d.querySelector('[data-kp-action="edit"]');
  edit().focus();edit().click();await flush();
  let dialog=d.querySelector('.kp-edit-dialog');assert.ok(dialog.open);
  assert.equal(d.activeElement,dialog.querySelector('[name=username]'));
  dialog.getBoundingClientRect=()=>({left:10,right:600,top:10,bottom:600});
  dialog.dispatchEvent(new w.MouseEvent('click',{bubbles:true,clientX:30,clientY:30}));assert.ok(dialog.open,'Clicking dialog padding must not discard an edit');
  dialog.querySelector('[data-kp-close]').click();await flush();assert.equal(d.activeElement,edit(),'Focus returns to the newly rendered edit button');
  const numbers=d.querySelector('.kad-player-numbers');numbers.open=true;w.KizunaProfile.refresh();await flush();assert.ok(d.querySelector('.kad-player-numbers').open,'Refreshing does not close expanded collection figures');
  let resolveSave;w.KizunaAccount.updateProfile=()=>new Promise(r=>resolveSave=r);
  edit().click();dialog=d.querySelector('.kp-edit-dialog');dialog.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.ok(dialog.querySelector('button[type=submit]').disabled);
  account={user:{id:'editor-b'},profile:{username:'Joueur_B',bio:'Bio du compte B'},loading:false,status:'synced'};
  d.dispatchEvent(new w.CustomEvent('kizuna:account-change'));await flush();
  assert.equal(d.querySelector('.kp-edit-dialog'),null,'Account switch closes the previous private editor even during saving');
  resolveSave();await flush();assert.match(d.getElementById('kpProfileName').textContent,/Joueur_B/);assert.ok(!d.getElementById('profilePage').textContent.includes('Ton profil a été mis à jour'),'An old account response cannot show success on the next account');
  assert.equal(JSON.stringify(w.KizunaGame.getSnapshot()),economicBefore);
  assert.equal(d.querySelector('.kp-avatar-status').getAttribute('role'),'img');
  const manifest=JSON.parse(await fs.readFile('src/style-bundles.json','utf8'));
  for(const bundle of manifest){
    const source=(await Promise.all(bundle.inputs.map(name=>fs.readFile('dist/'+name,'utf8')))).join('\n');
    const rebuilt=await transform(source,{loader:'css',minifyWhitespace:true,minifyIdentifiers:true,minifySyntax:false,legalComments:'none'});
    assert.deepEqual(rebuilt.warnings,[]);assert.equal(await fs.readFile('dist/'+bundle.output,'utf8'),rebuilt.code,'Bundle keeps the exact ordered source cascade');
    assert.equal(d.querySelectorAll('link[href="'+bundle.output+'"]').length,1);
  }
  assert.equal(d.querySelectorAll('link[rel=stylesheet]').length,3,'39 stylesheet requests consolidated into three');
  assert.ok(!html.includes('/__qa/'),'QA services and instrumentation never ship in production HTML');
  const art=await fs.readFile('dist/kizuna-art.css','utf8');
  const luminance=hex=>{const rgb=hex.match(/[a-f0-9]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
  const background=luminance('#283953');
  for(const token of ['paper','muted','gold','teal','coral']){const value=art.match(new RegExp('--art-'+token+':(#[a-f0-9]{6})'))[1],foreground=luminance(value);assert.ok((Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05)>=4.5,token+' text meets AA against the lightest shared slate surface');}
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({profileEditor:'focus, padding, expanded figures, account switch, late response',styles:'ordered and reproducible, 39 to 3 stylesheet requests',qa:'excluded from production',economicMutation:false,errors:0}));
}finally{w.close();}
