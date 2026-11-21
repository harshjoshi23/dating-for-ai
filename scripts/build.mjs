import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {extname} from 'node:path';
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.txt':'text/plain'};
const assets={};
async function collect(dir,prefix=''){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if(entry.name==='server'||entry.name==='.openai')continue;
    const key=prefix+'/'+entry.name;
    if(entry.isDirectory())await collect(dir+'/'+entry.name,key);
    else if(mime[extname(entry.name)])assets[key]=[mime[extname(entry.name)],await readFile(dir+'/'+entry.name,'utf8')];
  }
}
await collect('dist');
const runtime=await readFile('server/encounter.mjs','utf8');
const worker=`\nconst assets=${JSON.stringify(assets)};\nconst apis=new WeakMap();
export default {async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/')){
    let api=apis.get(env);
    if(!api){
      // Optional preprovisioned D1 binding. No resource is created by this build.
      const ledger=env.DATING_BUDGET?{reserve:async(amount,cap)=>{
        const result=await env.DATING_BUDGET.prepare('UPDATE encounter_budget SET reserved = reserved + ? WHERE id = 1 AND reserved + ? <= ?').bind(amount,amount,cap).run();
        return result.meta.changes===1;
      }}:null;
      api=createAPI({env,ledger});apis.set(env,api);
    }
    return api(request);
  }
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  const asset=assets[url.pathname==='/'?'/index.html':url.pathname];
  if(!asset)return new Response('Not found',{status:404,headers:SECURITY_HEADERS});
  return new Response(request.method==='HEAD'?null:asset[1],{headers:{...SECURITY_HEADERS,'Content-Type':asset[0]}});
}};
`;
await mkdir('dist/server',{recursive:true});await writeFile('dist/server/index.js',runtime+worker);
console.log('Built Worker with '+Object.keys(assets).length+' existing static assets. Live inference remains configuration-gated.');
