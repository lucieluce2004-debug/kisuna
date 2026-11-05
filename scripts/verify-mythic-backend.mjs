import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const scope={window:{}};vm.runInNewContext(await fs.readFile('dist/kizuna-config.js','utf8'),scope);const c=scope.window.KIZUNA_CONFIG,headers={apikey:c.supabaseKey};
const read=async p=>{const r=await fetch(c.supabaseUrl+'/rest/v1/'+p,{headers});assert.equal(r.status,200);return r.json();};
const forms=await read('kizuna_mythic_forms?select=card_id,levels'),rules=await read('kizuna_mythic_rules?select=thresholds,revision'),events=await read('kizuna_anomalies?select=id,config,status,enabled');assert.equal(forms.length,197);assert.ok(forms.every(x=>x.levels===3));assert.deepEqual(rules[0].thresholds,[1,3,6]);
assert.equal(events.length,1);assert.equal(events[0].config.challenges.length,6);assert.equal(events[0].config.title,'Convergence des Univers');assert.ok(events[0].config.challenges.every(x=>!('value'in x)&&!('claimed'in x)),'No private progression exposed');
const statuses={};for(const rpc of ['kizuna_mythic','kizuna_anomalies']){const r=await fetch(c.supabaseUrl+'/rest/v1/rpc/'+rpc,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({p_action:'get',p_payload:{}})});assert.ok([401,403].includes(r.status));statuses[rpc]=r.status;}
console.log(JSON.stringify({mythics:forms.length,levels:3,thresholds:rules[0].thresholds,pilot:events[0].config.title,starts:events[0].config.starts_at,ends:events[0].config.ends_at,public:'published definitions only',anonymousRPC:statuses,mutations:0}));
