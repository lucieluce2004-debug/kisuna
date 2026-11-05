// Collect reviewed artwork without changing card identities or economic state.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const source=JSON.parse(await fs.readFile('seed/catalogue.json','utf8'));
const mythics=new Set(source.filter(x=>x.card.rarity==='Mythique').map(x=>x.id));
const inputs=['official','generated-a','generated-b','generated-c','generated-d','generated-e'];
let rows=[];for(const name of inputs){try{rows.push(...JSON.parse(await fs.readFile('outputs/illustrations/'+name+'.json','utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}}
const seen=new Set(),hashes=new Set(),manifest=[];
for(const r of rows){assert.ok(mythics.has(r.id),'Unknown Mythic '+r.id);assert.ok([1,2,3].includes(r.level));const key=r.id+':'+r.level;assert.ok(!seen.has(key),'Duplicate illustration '+key);seen.add(key);assert.match(r.image,/^assets\/awakening-illustrations\/[a-z0-9-]+-[123]\.webp$/);const bytes=await fs.readFile('dist/'+r.image),sha256=crypto.createHash('sha256').update(bytes).digest('hex');assert.ok(!hashes.has(sha256),'Reused illustration '+key);hashes.add(sha256);assert.ok(r.width>=250&&r.height>=350);assert.ok(bytes.length>5000&&bytes.length<1500000);assert.ok(['official','generated'].includes(r.kind));if(r.kind==='official')assert.match(r.source,/^https:\/\//);manifest.push({id:r.id,level:r.level,image:r.image,kind:r.kind,label:r.label,form:r.form||'',source:r.source||'',credit:r.credit||'Illustration originale générée pour Kizuna',fit:r.fit==='contain'?'contain':'cover',width:r.width,height:r.height,bytes:bytes.length,sha256});}
manifest.sort((a,b)=>a.id.localeCompare(b.id)||a.level-b.level);
if(process.argv.includes('--complete'))assert.equal(manifest.length,mythics.size*3,'Every awakening must have an illustration');
await fs.writeFile('seed/awakening-illustrations.json',JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile('docs/AWAKENING-ILLUSTRATION-PROMPTS.json',JSON.stringify(rows.filter(r=>r.kind==='generated').map(({id,level,prompt})=>({id,level,prompt})),null,2)+'\n');
const cards=new Map(source.map(r=>[r.id,r.card]));
const creditDoc=['# Illustrations des Éveils','',manifest.length+' / '+mythics.size*3+' illustrations intégrées. Chaque niveau possède son propre fichier WebP ; le portrait original reste sélectionnable.','',
 'Les visuels officiels sont attribués à leurs éditeurs et ayants droit ; leur présence sur un site officiel ne constitue pas une licence libre. Les autres illustrations sont des créations générées pour Kizuna. Les prompts exacts sont conservés dans `AWAKENING-ILLUSTRATION-PROMPTS.json`.','',
 '| Personnage | Éveil | Type | Fichier | Source / crédit |','|---|---:|---|---|---|',
 ...manifest.map(r=>'| '+cards.get(r.id).name+' · `'+r.id+'` | '+r.level+' | '+(r.kind==='official'?'Officiel sourcé':'Création générée')+' | `'+r.image+'` | '+(r.source?'['+r.form+']('+r.source+') · ':'')+r.credit+' |'),''];
await fs.writeFile('docs/AWAKENING-ILLUSTRATIONS.md',creditDoc.join('\n'));
console.log(JSON.stringify({illustrations:manifest.length,required:mythics.size*3,official:manifest.filter(x=>x.kind==='official').length,generated:manifest.filter(x=>x.kind==='generated').length,bytes:manifest.reduce((s,x)=>s+x.bytes,0)}));
