// Local guest preview only: remote account configuration is never served.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname);
    const qaFiles={'/__qa/axe.js':'node_modules/axe-core/axe.min.js','/__qa/audit.js':'scripts/qa/audit.js','/__qa/staff.js':'scripts/qa/staff.js'};
    if(qaFiles[pathname]){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'}).end(await readFile(qaFiles[pathname]));return;}
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    let body=pathname==='/kizuna-config.js'?'window.KIZUNA_CONFIG = {};':await readFile(file);
    if(file.endsWith('index.html')&&url.searchParams.has('qa')){
      const scripts=(url.searchParams.get('qa')==='staff'?'<script src="/__qa/staff.js" defer></script>':'')+'<script src="/__qa/axe.js" defer></script><script src="/__qa/audit.js" defer></script>';
      body=body.toString().replace('</head>',scripts+'</head>');
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(body);
  }catch{res.writeHead(404).end('Introuvable');}
}).listen(4173,'127.0.0.1',()=>console.log('KIZUNA aperçu invité local : http://127.0.0.1:4173'));
