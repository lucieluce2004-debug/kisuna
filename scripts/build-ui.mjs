import fs from 'node:fs/promises';
import {transform} from 'esbuild';
import {gzipSync} from 'node:zlib';
const manifest=JSON.parse(await fs.readFile('src/style-bundles.json','utf8'));
const report=[];
for(const {output,inputs} of manifest){
  const sources=await Promise.all(inputs.map(name=>fs.readFile('dist/'+name,'utf8')));
  // Keep source order, specificity and every selector. Do not purge runtime views.
  const source=sources.join('\n');
  const result=await transform(source,{loader:'css',minifyWhitespace:true,minifyIdentifiers:true,minifySyntax:false,legalComments:'none'});
  if(result.warnings.length)throw Error(JSON.stringify(result.warnings));
  await fs.writeFile('dist/'+output,result.code);
  report.push({output,files:inputs.length,beforeBytes:Buffer.byteLength(source),afterBytes:Buffer.byteLength(result.code),gzipBytes:gzipSync(result.code).length});
}
console.log(JSON.stringify({styles:report}));
