import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
test('deployed Worker preserves assets and does not expose private source/secrets',async()=>{
 const env={};
 for(const path of ['/','/encounter.html','/encounter.js','/style.css','/vendor/three.module.js'])assert.equal((await worker.fetch(new Request('https://test.example'+path),env)).status,200,path);
 for(const path of ['/.env.local','/server/local.mjs','/docs/project-handoff.md','/work/spend-reservations.jsonl','/server/index.js','/.git/config'])assert.equal((await worker.fetch(new Request('https://test.example'+path),env)).status,404,path);
 const cfg=await(await worker.fetch(new Request('https://test.example/api/config'),env)).json();assert.equal(cfg.available,false);
});
test('hosted runtime fails closed without durable ledger and enforces exhausted D1 atomically',async()=>{
 const env={ENCOUNTERS_ENABLED:'true',OPENAI_API_KEY:'fake',ENCOUNTER_ACCESS_TOKEN:'operator-test-token-32-characters-long'};
 const request=()=>new Request('https://test.example/api/encounter',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.ENCOUNTER_ACCESS_TOKEN},body:JSON.stringify({setting:'observatory',turns:2,maxOutputTokens:64})});
 assert.equal((await worker.fetch(request(),env)).status,503);
 let sql='',values=[];
 const ledgerEnv={...env,DATING_BUDGET:{prepare(query){sql=query;return {bind(...args){values=args;return {async run(){return {meta:{changes:0}};}};}};}}};
 assert.equal((await worker.fetch(request(),ledgerEnv)).status,402);assert(sql.includes('reserved + ? <= ?'));assert.deepEqual(values,[150000,150000,500000]);
});
