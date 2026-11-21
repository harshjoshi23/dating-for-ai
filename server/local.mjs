import http from 'node:http';
import {readFileSync,fsyncSync,appendFileSync,mkdirSync,openSync,closeSync,unlinkSync,existsSync} from 'node:fs';
import {resolve,extname,dirname} from 'node:path';
import {Readable} from 'node:stream';
import {createAPI,SECURITY_HEADERS} from './encounter.mjs';
// A durable, conservative reservation ledger. Exclusive lock blocks multiple processes.
const ledgerPath=resolve('work/spend-reservations.jsonl');mkdirSync(dirname(ledgerPath),{recursive:true});
let locked=false;
const live=process.env.ENCOUNTERS_ENABLED==='true';
if(live){closeSync(openSync(ledgerPath+'.lock','wx',0o600));locked=true;}
process.on('exit',()=>{if(locked)unlinkSync(ledgerPath+'.lock');});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>process.exit(0));
const ledger={reserve:async(amount,cap)=>{
  const rows=existsSync(ledgerPath)?readFileSync(ledgerPath,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
  if(rows.some(x=>!Number.isSafeInteger(x.reserved)||x.reserved<0))throw new Error('Invalid ledger');
  const total=rows.reduce((sum,x)=>sum+x.reserved,0);if(total+amount>cap)return false;
  const fd=openSync(ledgerPath,'a',0o600);try{appendFileSync(fd,JSON.stringify({reserved:amount,at:new Date().toISOString()})+'\n');fsyncSync(fd);}finally{closeSync(fd);}return true;
}};
const api=createAPI({env:process.env,ledger:live?ledger:null});
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.txt':'text/plain'};
const server=http.createServer(async(req,res)=>{
  const abort=new AbortController();res.on('close',()=>{if(!res.writableFinished)abort.abort();});
  try{
    const url=new URL(req.url,'http://'+req.headers.host);
    if(url.hostname!=='127.0.0.1'&&url.hostname!=='localhost'){res.writeHead(403).end();return;}
    let result;
    if(url.pathname.startsWith('/api/')){
      result=await api(new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Readable.toWeb(req),duplex:'half',signal:abort.signal}));
    }else{
      const path=resolve('dist','.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
      if(!path.startsWith(resolve('dist')+'/')||path.includes('/server/')||!['GET','HEAD'].includes(req.method)){res.writeHead(404).end();return;}
      try{result=new Response(readFileSync(path),{headers:{...SECURITY_HEADERS,'Content-Type':types[extname(path)]||'application/octet-stream'}});}catch{result=new Response('Not found',{status:404});}
    }
    res.writeHead(result.status,Object.fromEntries(result.headers));
    if(req.method==='HEAD'){await result.body?.cancel();res.end();return;}
    if(result.body)for await(const chunk of result.body){if(res.destroyed)break;if(!res.write(chunk))await new Promise(r=>{res.once('drain',r);res.once('close',r);});}
    res.end();
  }catch{if(!res.headersSent)res.writeHead(500);res.end('Request failed.');}
});
server.listen(Number(process.env.PORT||8080),'127.0.0.1',()=>console.log('Dating for AI: http://127.0.0.1:'+(process.env.PORT||8080)));
