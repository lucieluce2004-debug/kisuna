import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {transform} from 'esbuild';
import {JSDOM} from 'jsdom';
const html=await fs.readFile('dist/index.html','utf8'),dom=new JSDOM(html);
const resources=[...dom.window.document.querySelectorAll('script[src],link[rel="stylesheet"]')].map(n=>n.getAttribute('src')||n.getAttribute('href')).filter(s=>!/^https?:/.test(s));
for(const resource of resources){const source=await fs.readFile(path.join('dist',resource),'utf8');if(resource.endsWith('.js'))new vm.Script(source,{filename:resource});else if(resource.endsWith('.css'))await transform(source,{loader:'css',logLevel:'silent'});}
assert.equal(resources.filter(r=>r==='kizuna-studio.js').length,1);assert.equal(resources.filter(r=>r==='kizuna-studio-admin.js').length,1);
const bundles=JSON.parse(await fs.readFile('src/style-bundles.json','utf8'));
assert.equal(bundles.flatMap(b=>b.inputs).filter(r=>r==='kizuna-studio.css').length,1);
assert.equal(resources.filter(r=>r==='kizuna-game.bundle.css').length,1);
async function hashes(dir){const result={};for(const entry of await fs.readdir(dir,{withFileTypes:true})){const filename=path.join(dir,entry.name);if(entry.isDirectory())Object.assign(result,await hashes(filename));else result[filename]=crypto.createHash('sha256').update(await fs.readFile(filename)).digest('hex');}return result;}
const before=await hashes('dist'),build=spawnSync(process.execPath,['scripts/build.mjs'],{encoding:'utf8'});assert.equal(build.status,0,build.error?.message||build.stderr);assert.deepEqual(await hashes('dist'),before,'Rebuilding the same sources must not change deployment files');
dom.window.close();console.log(JSON.stringify({localResources:resources.length,syntax:'JS and CSS valid',studioAssets:'loaded exactly once',build:'passed and reproducible'}));
