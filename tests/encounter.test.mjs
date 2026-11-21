import test from 'node:test';
import assert from 'node:assert/strict';
import {createAPI,modelTurn,PARTICIPANTS,readSSE,RESERVATION_MICRO_USD,TOTAL_CAP_MICRO_USD} from '../server/encounter.mjs';
const token='operator-test-token-32-characters-long';
const env={ENCOUNTERS_ENABLED:'true',OPENAI_API_KEY:'fake-test-only',ENCOUNTER_ACCESS_TOKEN:token};
const settings={setting:'observatory',turns:4,maxOutputTokens:128};
function req(body=settings,headers={},signal){return new Request('http://localhost/api/encounter',{method:'POST',signal,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});}
const ledger=()=>({spent:0,async reserve(amount,cap){if(this.spent+amount>cap)return false;this.spent+=amount;return true;}});
const wire=events=>new Response(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''),{headers:{'Content-Type':'text/event-stream'}});
function provider(calls){return async(url,options)=>{
  const body=JSON.parse(options.body);calls.push({url,...body,signal:options.signal});
  return wire([{type:'response.output_text.delta',delta:'<script>test fixture</script>'},{type:'response.completed',response:{model:body.model,usage:{input_tokens:100,output_tokens:10}}}]);
};}
test('unconfigured endpoint is honest and makes zero provider calls',async()=>{
 let calls=0;const api=createAPI({fetcher:()=>{calls++;throw 0;}});
 const config=await (await api(new Request('http://localhost/api/config'))).json();
 assert.equal(config.available,false);assert.notEqual(config.participants[0].model,config.participants[1].model);
 assert.equal((await api(req())).status,503);assert.equal(calls,0);
});
test('missing durable ledger and weak operator token fail closed',async()=>{
 for(const options of [{env},{env:{...env,ENCOUNTER_ACCESS_TOKEN:'weak'},ledger:ledger()}]){
  const api=createAPI(options);assert.equal((await api(req())).status,503);
 }
});
test('auth, cross-origin, input bounds and arbitrary provider/model payloads rejected before spending',async()=>{
 const budget=ledger();const calls=[];const api=createAPI({env,ledger:budget,fetcher:provider(calls)});
 assert.equal((await api(req(settings,{Authorization:'Bearer wrong'}))).status,401);
 assert.equal((await api(req(settings,{Origin:'https://evil.example'}))).status,403);
 for(const body of [{...settings,turns:9},{...settings,maxOutputTokens:999},{...settings,model:'other'},{...settings,setting:'__proto__'},null,[]])assert.equal((await api(req(body))).status,400);
 assert.equal(budget.spent,0);assert.equal(calls.length,0);
});
test('four-turn integration alternates actual distinct requested model IDs and carries previous dialogue',async()=>{
 const calls=[];const budget=ledger();const api=createAPI({env,ledger:budget,fetcher:provider(calls)});
 const response=await api(req());assert.equal(response.status,200);
 const events=[];for await(const e of readSSE(response.body))events.push(e);
 assert.deepEqual(calls.map(c=>c.model),[PARTICIPANTS[0].model,PARTICIPANTS[1].model,PARTICIPANTS[0].model,PARTICIPANTS[1].model]);
 assert(calls[1].input.includes('Lyra: <script>test fixture</script>'));
 assert(calls.every(c=>c.store===false&&c.max_output_tokens===128&&!c.tools));
 assert.equal(events.at(-1).type,'done');assert.equal(events.filter(e=>e.type==='turn_end').length,4);
 assert.equal(budget.spent,RESERVATION_MICRO_USD);
 assert(!JSON.stringify(events).includes('fake-test-only'));
});
test('durable reservations cap successive runs; no refunds or retries after failed provider calls',async()=>{
 const budget=ledger();let calls=0;const api=createAPI({env,ledger:budget,fetcher:async()=>{calls++;return new Response('private upstream failure',{status:429});}});
 for(let i=0;i<3;i++){
  const r=await api(req());assert.equal(r.status,200);const text=await r.text();assert(text.includes('credit limit'));assert(!text.includes('private upstream'));assert(!text.includes('"type":"done"'));
 }
 assert.equal((await api(req())).status,402);assert.equal(calls,3);assert(budget.spent<=TOTAL_CAP_MICRO_USD);
});
test('truncated and empty provider output never marked successful',async()=>{
 for(const events of [[{type:'response.output_text.delta',delta:'partial'}],[{type:'response.completed'}]]){
  const api=createAPI({env,ledger:ledger(),fetcher:async()=>wire(events)});
  const text=await (await api(req())).text();assert(text.includes('"type":"error"'));assert(!text.includes('"type":"done"'));
 }
});
test('disconnect aborts upstream and does not start another turn',async()=>{
 let upstreamSignal,calls=0;
 const api=createAPI({env,ledger:ledger(),fetcher:async(url,options)=>{calls++;upstreamSignal=options.signal;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError')),{once:true}));}});
 const response=await api(req());const reader=response.body.getReader();await reader.read();await reader.cancel();await new Promise(r=>setTimeout(r,10));assert(upstreamSignal.aborted);assert.equal(calls,1);
});
test('simultaneous starts rejected within one runtime before another reservation',async()=>{
 const api=createAPI({env,ledger:ledger(),fetcher:async(url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError')),{once:true}))});
 const first=await api(req());assert.equal((await api(req())).status,429);await first.body.cancel();
});
test('SSE parsing supports arbitrary UTF-8 and CRLF splits',async()=>{
 const bytes=new TextEncoder().encode('data: {"text":"café 🌌"}\r\n\r\n');
 const stream=new ReadableStream({start(c){for(const byte of bytes)c.enqueue(new Uint8Array([byte]));c.close();}});
 const events=[];for await(const e of readSSE(stream))events.push(e);assert.equal(events[0].text,'café 🌌');
});

test('pre-aborted requests never reserve or call provider',async()=>{
 const budget=ledger();let calls=0;const api=createAPI({env,ledger:budget,fetcher:async()=>{calls++;throw 0;}});
 const abort=new AbortController();abort.abort();assert.equal((await api(req(settings,{},abort.signal))).status,499);assert.equal(budget.spent,0);assert.equal(calls,0);
});
test('cancellation during durable reservation never calls provider',async()=>{
 const abort=new AbortController();let calls=0;
 const api=createAPI({env,ledger:{reserve:async()=>{abort.abort();return true;}},fetcher:async()=>{calls++;throw 0;}});
 assert.equal((await api(req(settings,{},abort.signal))).status,499);assert.equal(calls,0);
});
test('unexpected provider model identity fails rather than mislabels output',async()=>{
 const api=createAPI({env,ledger:ledger(),fetcher:async()=>wire([{type:'response.output_text.delta',delta:'fixture'},{type:'response.completed',response:{model:'unexpected-model'}}])});
 const text=await(await api(req())).text();assert(text.includes('model identity'));assert(!text.includes('"type":"done"'));
});
