import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

const rows=JSON.parse(await fs.readFile('seed/awakening-illustrations.json','utf8'));
const source=JSON.parse(await fs.readFile('seed/catalogue.json','utf8'));
const mythics=source.filter(r=>r.card.rarity==='Mythique');
const dom=new JSDOM('<body></body>',{url:'https://kizuna.example/',runScripts:'outside-only'});
const w=dom.window,d=w.document;
try {
 w.eval(await fs.readFile('dist/kizuna-mythic-art.js','utf8'));
 const A=w.KizunaMythicArt,seen=new Set(),hashes=new Set();
 for(const r of rows){
  const key=r.id+':'+r.level;assert.ok(!seen.has(key));seen.add(key);
  const data=await fs.readFile('dist/'+r.image),hash=crypto.createHash('sha256').update(data).digest('hex');
  assert.equal(hash,r.sha256);assert.ok(!hashes.has(hash),'Distinct artwork per awakening');hashes.add(hash);
  assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WEBP');
  const entry=A.get(r.id);assert.ok(entry);assert.equal(entry.levels[r.level-1].illustration.image,r.image);
  d.body.innerHTML=A.render(r.id,r.level,{compact:true,animate:true});
  const card=d.querySelector('.kma-card'),img=d.querySelector('[data-kma-portrait]');
  assert.equal(img.getAttribute('src'),r.image);assert.equal(img.getAttribute('loading'),'lazy');
  assert.equal(card.classList.contains('kma-animated'),false);assert.equal(card.dataset.kmaFit,r.fit);
  img.dispatchEvent(new w.Event('error'));
  assert.equal(img.getAttribute('src'),entry.image,'A failed illustration falls back to the original');
  assert.equal(img.hasAttribute('data-kma-fallback'),false);assert.ok(card.classList.contains('kma-art-fallback'));
  img.dispatchEvent(new w.Event('error'));
  assert.ok(card.classList.contains('kma-portrait-unavailable'));
  const label=card.getAttribute('aria-label');img.dispatchEvent(new w.Event('error'));assert.equal(card.getAttribute('aria-label'),label,'No retry loop or repeated announcement');
 }
 for(const c of mythics){d.body.innerHTML=A.render(c.id,0);assert.equal(d.querySelector('[data-kma-portrait]').getAttribute('src'),A.get(c.id).image);assert.equal(d.querySelector('[data-kma-fallback]'),null);}
 if(process.argv.includes('--complete'))for(const c of mythics)for(let l=1;l<=3;l++)assert.ok(seen.has(c.id+':'+l),'Missing '+c.id+':'+l);
 console.log(JSON.stringify({illustrations:rows.length,required:mythics.length*3,originalsPreserved:mythics.length,checks:'unique local WebP, hashes, rendered source, lazy loading, compact motion, original fallback, no retry loop'}));
}finally{w.close();}
