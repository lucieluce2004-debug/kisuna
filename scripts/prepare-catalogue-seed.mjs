import fs from 'node:fs/promises';
import vm from 'node:vm';
const scope={};vm.runInNewContext(await fs.readFile(new URL('../dist/kizuna-rarity.js',import.meta.url),'utf8'),scope);
const policy=scope.KizunaRarity;
const html=await fs.readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const artwork=JSON.parse(await fs.readFile(new URL('../dist/assets/character-art.json',import.meta.url),'utf8'));
const seed=html.match(/const SEED_LIST = `([\s\S]*?)`;/)?.[1];
if(!seed)throw new Error('Catalogue seed not found');
const hash=s=>{let h=7;for(const ch of s)h=(h*31+ch.charCodeAt(0))>>>0;return h;};
const tiers={'Commun':[48,8,14],'Peu commune':[58,8,16],'Rare':[72,9,26],'Épique':[84,10,30],'Légendaire':[90,7,30],'Mythique':[96,4,25]};
const seen=new Set();
const rows=seed.trim().split(/\n+/).flatMap((line,index)=>{
  const [name,series,g,categories]=line.trim().split('|'),key=(name+'|'+series).toLocaleLowerCase();
  if(seen.has(key))return [];
  const rank=seen.size+1,id='cseed-'+String(index+1).padStart(4,'0');seen.add(key);
  const art=artwork[name+'|'+series];if(!art)throw new Error('Portrait missing for '+name);
  if(!Object.hasOwn(policy.retainedPopularity,String(art.sourceId)))throw new Error('Popularity snapshot missing for '+name);
  const fav=policy.favouriteCount(policy.retainedPopularity[String(art.sourceId)]),rarity=policy.rarityFromPopularity(fav,art.sourceId,policy.retainedRarityContext);
  const tier=tiers[rarity],h=hash(id),pow=tier[0]+h%tier[1];
  return [{id,source_id:Number(art.sourceId),card:{id,name,series,image:art.image,sourceId:String(art.sourceId),fav,native:'',g,cats:categories.split(',').filter(Boolean),rank,rarity,tag:'',pow,aura:pow-tier[2]+(h>>3)%3,rarity_policy:'album-ranks-v2',popularity_checked_at:policy.popularitySnapshotAt}}];
});
for(const extra of policy.retainedExtraCards||[]){
  if(rows.some(row=>row.id===extra.id))throw new Error('Duplicate companion identity '+extra.id);
  const fav=policy.favouriteCount(extra.fav),rarity=policy.rarityFromPopularity(fav,extra.sourceId,policy.retainedRarityContext),tier=tiers[rarity],h=hash(extra.id),pow=tier[0]+h%tier[1];
  rows.push({id:extra.id,source_id:Number(extra.sourceId),card:{...extra,fav,rarity,pow,aura:pow-tier[2]+(h>>3)%3,rarity_policy:'album-ranks-v2'}});
}
await fs.mkdir(new URL('../seed/',import.meta.url),{recursive:true});
await fs.writeFile(new URL('../seed/catalogue.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');
console.log('Prepared '+rows.length+' retained cards for the dedicated database.');
