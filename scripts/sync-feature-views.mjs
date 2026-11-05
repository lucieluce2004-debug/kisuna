import fs from 'node:fs/promises';
const target=new URL('../dist/index.html',import.meta.url);
let html=await fs.readFile(target,'utf8');
const read=name=>fs.readFile(new URL('../src/'+name,import.meta.url),'utf8');
const replaceBlock=(begin,end,source,oldBegin,oldEnd)=>{
  let start=html.indexOf(begin),finish;
  if(start>=0){finish=html.indexOf(end,start);if(finish<0)throw Error('Missing boundary '+end);finish+=end.length;}
  else{start=html.indexOf(oldBegin);finish=html.indexOf(oldEnd,start);if(start<0||finish<0)throw Error('Missing original feature boundary');}
  html=html.slice(0,start)+begin+'\n'+source.trim()+'\n'+end+'\n'+html.slice(finish).replace(/^(?:\r?\n)+/,'');
};
replaceBlock('/* KIZUNA_COLLECTION_VIEW_BEGIN */','/* KIZUNA_COLLECTION_VIEW_END */',await read('collection-view.inc.js'),'function collectionAlbumEntries(){','function showTab(t){');
const late=(await Promise.all(['booster-views.inc.js','wiki-view.inc.js','card-viewer.inc.js','market-presentation.inc.js','ranking-view.inc.js','economy-bridge.inc.js'].map(read))).join('\n\n');
const begin='/* KIZUNA_FEATURE_VIEWS_BEGIN */',end='/* KIZUNA_FEATURE_VIEWS_END */';
if(html.includes(begin))replaceBlock(begin,end,late);
else{const point=html.indexOf('/* KIZUNA_GAME_BRIDGE_BEGIN */');if(point<0)throw Error('Game bridge missing');html=html.slice(0,point)+begin+'\n'+late.trim()+'\n'+end+'\n\n'+html.slice(point);}
await fs.writeFile(target,html);
