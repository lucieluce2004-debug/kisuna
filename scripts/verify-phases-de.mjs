import {spawnSync} from 'node:child_process';
const suites=['interface','art-shell','art-spaces','wiki-v2','discord-profile','adventure-community','adventure','art-adventure','market-account','market-inbox','gaming-ui','home','collection-v2','art-lobby','nexus','finish','staff-panel','staff-server','studio','studio-build','nexus-admin','nexus-admin-account','adventure-admin','economy-interface'];
for(const name of suites){
  console.log('\nTEST '+name);
  const result=spawnSync(process.execPath,['scripts/verify-'+name+'.mjs'],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
}
console.log('\n'+suites.length+' suites passed. Browser QA and remote multiplayer validation remain separate.');
