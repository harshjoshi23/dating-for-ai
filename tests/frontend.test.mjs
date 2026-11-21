import test from 'node:test';
import assert from 'node:assert/strict';
import {readEvents} from '../dist/encounter.js';
test('spectator SSE reader survives split unicode/CRLF frames and rejects truncation',async()=>{
 const bytes=new TextEncoder().encode('data: {"type":"delta","text":"café 🌌"}\r\n\r\ndata: {"type":"done"}\r\n\r\n');
 const stream=new ReadableStream({start(c){for(const byte of bytes)c.enqueue(new Uint8Array([byte]));c.close();}});
 const events=[];for await(const e of readEvents(stream))events.push(e);
 assert.equal(events[0].text,'café 🌌');assert.equal(events.at(-1).type,'done');
 await assert.rejects(async()=>{for await(const e of readEvents(new Response('data: {"type":').body)){}},/during an event/);
});
