import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../dist/encounter.js', import.meta.url),'utf8')).replace('export async function* readEvents','async function* readEvents');
const people = [
 {id:'a',name:'First',provider:'fixture',model:'fixture-a',persona:'Synthetic adult A'},
 {id:'b',name:'Second',provider:'fixture',model:'fixture-b',persona:'Synthetic adult B'},
];
const token = 'dummy-operator-token-never-export';
const encode = events => new TextEncoder().encode(events.map(e=>`data: ${JSON.stringify(e)}\n\n`).join(''));

async function setup(mode) {
 let partialReceived;
 const partial = new Promise(resolve=>partialReceived=resolve);
 class Element {
  constructor(id=''){this.id=id;this.listeners={};this.dataset={};this.children=[];this.value='';this.disabled=false;this._text='';}
  set textContent(value){this._text=value;if(value==='Partial synthetic text')partialReceived();}
  get textContent(){return this._text;}
  addEventListener(type,fn){this.listeners[type]=fn;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  querySelectorAll(){return [];}
  reportValidity(){return true;}
  click(){return this.listeners.click?.();}
 }
 const ids = new Map();
 const get = id => {if(!ids.has(id))ids.set(id,new Element(id));return ids.get(id);};
 get('availability').parentElement=new Element();
 get('setting').value='Synthetic garden';get('turns').value='2';get('tokens').value='64';
 get('access-token').value=token;
 let downloaded, request;
 const initial=[{type:'start',participants:people,limits:{maxTurns:2},setting:'Synthetic garden'},
 {type:'turn',index:0,speaker:'a',model:'fixture-a'}, {type:'delta',text:'Completed synthetic text'},
 {type:'turn_end',index:0,usage:{output_tokens:4}},
 {type:'turn',index:1,speaker:'b',model:'fixture-b'}, {type:'delta',text:'Partial synthetic text'}];
 const fetch = async (path, options={}) => {
  if(path==='/api/config')return Response.json({available:true,participants:people,limits:{maxTurns:2,maxOutputTokens:64}});
  assert.equal(path,'/api/encounter');request=options;
  const body=new ReadableStream({start(controller){
   options.signal.addEventListener('abort',()=>controller.error(new DOMException('Aborted','AbortError')),{once:true});
   controller.enqueue(encode(initial));
   if(mode==='complete'){controller.enqueue(encode([{type:'turn_end',index:1},{type:'done',reason:'completed'}]));controller.close();}
   if(mode==='disconnect')controller.close();
  }});
  return new Response(body,{headers:{'Content-Type':'text/event-stream'}});
 };
 const context=vm.createContext({document:{getElementById:get,createElement:()=>new Element()},window:{addEventListener(){}},fetch,
  TextDecoder,AbortSignal,AbortController,structuredClone,Blob,Date,JSON,
  URL:{createObjectURL(blob){downloaded=blob;return 'blob:fixture';},revokeObjectURL(){}},setTimeout(fn){fn();}});
 vm.runInContext(source,context);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(get('start').disabled,false);
 const submission=get('encounter-form').listeners.submit({preventDefault(){}});
 if(mode==='stop'){await partial;get('stop').click();}
 await submission;
 get('export').click();
 assert.ok(downloaded,'Export click produces a downloadable JSON blob');
 return {run:JSON.parse(await downloaded.text()),request,tokenValue:get('access-token').value};
}

for(const mode of ['complete','stop','disconnect']){
 test(`spectator ${mode} exports settings and completed/partial turns without credentials`,{timeout:5000},async()=>{
  const {run,request,tokenValue}=await setup(mode);
  assert.deepEqual(run.settings,{setting:'Synthetic garden',turns:2,maxOutputTokens:64});
  assert.deepEqual(run.participants,people);
  assert.equal(run.transcript[0].text,'Completed synthetic text');
  assert.equal(run.transcript[0].complete,true);
  assert.equal(run.transcript[1].text,'Partial synthetic text');
  assert.equal(run.transcript[1].model,'fixture-b');
  assert.equal(run.transcript[1].complete,mode==='complete');
  assert.equal(run.status,mode==='complete'?'completed':mode==='stop'?'stopped':'error');
  assert.ok(run.endedAt);
  assert.equal(request.headers.Authorization,`Bearer ${token}`);
  assert.equal(tokenValue,'');
  const exported=JSON.stringify(run);
  assert.ok(!exported.includes(token));
  assert.ok(!/authorization|headers/i.test(exported));
 });
}
