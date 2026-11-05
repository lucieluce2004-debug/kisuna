import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const scope={window:{}};vm.runInNewContext(await fs.readFile('dist/kizuna-config.js','utf8'),scope);
const c=scope.window.KIZUNA_CONFIG,headers={apikey:c.supabaseKey};
const r=await fetch(c.supabaseUrl+'/rest/v1/kizuna_live_design?select=config,revision',{headers});assert.equal(r.status,200);const rows=await r.json();assert.equal(rows.length,1);const cfg=rows[0].config;assert.ok(['night','aurora','ember'].includes(cfg.theme));assert.ok(cfg.variants.every(v=>!('approved'in v)&&v.enabled));assert.equal('draft'in cfg,false);
const rpc=await fetch(c.supabaseUrl+'/rest/v1/rpc/kizuna_studio',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({p_action:'get',p_payload:{}})});assert.ok([401,403].includes(rpc.status));
console.log(JSON.stringify({publicDesign:'published config only',revision:rows[0].revision,publicVariants:cfg.variants.length,anonymousStudio:rpc.status,mutations:0}));
