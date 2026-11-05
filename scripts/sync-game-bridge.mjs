import fs from 'node:fs/promises';
const target=new URL('../dist/index.html',import.meta.url);
let html=await fs.readFile(target,'utf8');
const source=await fs.readFile(new URL('../src/game-bridge.inc.js',import.meta.url),'utf8');
const start='/* KIZUNA_GAME_BRIDGE_BEGIN */',end='/* KIZUNA_GAME_BRIDGE_END */';
if(html.includes(start)){
  const a=html.indexOf(start),b=html.indexOf(end,a);if(b<0)throw new Error('Broken game bridge boundary');
  html=html.slice(0,a)+start+'\n'+source+'\n'+html.slice(b);
}else{
  const at=html.lastIndexOf('\n})();\n</script>');if(at<0)throw new Error('Main application closure missing');
  html=html.slice(0,at)+'\n'+start+'\n'+source+'\n'+end+html.slice(at);
}
await fs.writeFile(target,html);
