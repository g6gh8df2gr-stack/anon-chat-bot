import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';

test('Mutual filters, private peers, messages, next, and validation',async()=>{
 const server=createApp();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}/api/`;
 const request=async(path,body,token)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {code:r.status,...await r.json()};};
 const profile={name:'Анна',gender:'female',age:25,preference:'male',minAge:24,maxAge:30};
 try {
  assert.equal((await request('join',{...profile,age:17})).code,400);
  assert.equal((await request('join',null)).code,400);
  assert.equal((await request('join',[])).code,400);
  assert.equal((await request('join',{...profile,minAge:40,maxAge:20})).code,400);
  assert.equal((await request('state')).code,401);
  const a=(await request('join',profile)).token;
  const b=(await request('join',{...profile,name:'Борис',gender:'male',age:26,preference:'female',minAge:30,maxAge:40})).token;
  assert.equal((await request('state',undefined,a)).status,'searching');
  assert.equal((await request('state',undefined,b)).status,'searching');
  const c=(await request('join',{...profile,name:'Марк',gender:'male',age:27,preference:'female',minAge:18})).token;
  const state=await request('state',undefined,a);
  assert.equal(state.status,'chat');assert.deepEqual(state.peer,{name:'Марк',age:27});
  assert.equal((await request('message',{text:'Привет <script>!'},a)).code,201);
  const received=await request('state',undefined,c);assert.equal(received.messages[0].text,'Привет <script>!');assert.equal(received.messages[0].mine,false);
  assert.equal((await request('state',undefined,b)).messages.length,0);
  await request('next',{},a);
  assert.equal((await request('state',undefined,c)).status,'ended');
  assert.equal((await request('message',{text:'поздно'},c)).code,409);
  await request('next',{},c);assert.equal((await request('state',undefined,c)).status,'searching');
  const d=(await request('join',{...profile,name:'Лев',gender:'male',age:28,preference:'any',minAge:18})).token;
  assert.equal((await request('state',undefined,a)).peer.name,'Лев');
  await request('leave',{},d);assert.equal((await request('state',undefined,a)).status,'ended');
 }finally{await new Promise(r=>server.close(r));}
});
