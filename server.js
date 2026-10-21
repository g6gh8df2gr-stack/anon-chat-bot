import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function createApp() {
  const users = new Map();
  const compatible = (a, b) => [ [a,b], [b,a] ].every(([x,y]) =>
    (x.preference === 'any' || x.preference === y.gender) && y.age >= x.minAge && y.age <= x.maxAge);
  function detach(u) {
    const peer = users.get(u.peer);
    if (peer) { peer.peer = null; peer.status = 'ended'; }
    u.peer = null;
  }
  function match(u) {
    u.status = 'searching'; u.messages = []; u.since = Date.now();
    for (const v of users.values()) {
      if (v.id !== u.id && v.status === 'searching' && Date.now() - v.seen <= 45000 && v.id !== u.previous && u.id !== v.previous && compatible(u,v)) {
        u.peer = v.id; v.peer = u.id; u.status = v.status = 'chat';
        u.messages = v.messages = [];
        break;
      }
    }
  }
  const timer = setInterval(() => {
    for (const [id,u] of users) if (Date.now()-u.seen > 45000) { detach(u); users.delete(id); }
  }, 5000);
  timer.unref();
  const server = http.createServer(async (req,res) => {
    const send = (code, data) => { res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (!path.startsWith('/api/')) {
        const files = {'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
        if (!Object.hasOwn(files, path)) return send(404,{error:'Страница не найдена'});
        const body = await readFile(new URL(`./public/${files[path]}`,import.meta.url));
        res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff'}); return res.end(body);
      }
      if (req.headers.origin && !['http:', 'https:'].some(protocol => req.headers.origin === `${protocol}//${req.headers.host}`)) return send(403,{error:'Запрос отклонён'});
      let body = {};
      if (req.method === 'POST') {
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (raw.length > 12000) return send(413,{error:'Слишком длинный запрос'}); }
        try { body = JSON.parse(raw || '{}'); if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error(); } catch { return send(400,{error:'Некорректный запрос'}); }
      }
      if (path === '/api/join' && req.method === 'POST') {
        const {name,gender,age,preference,minAge,maxAge} = body;
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 30 || !['male','female'].includes(gender) || !['male','female','any'].includes(preference) || ![age,minAge,maxAge].every(n => Number.isInteger(n) && n >=18 && n<=99) || minAge>maxAge) return send(400,{error:'Проверьте анкету: возраст от 18 до 99 лет, имя до 30 символов.'});
        const u = {id:randomUUID(),name:name.trim(),gender,age,preference,minAge,maxAge,seen:Date.now(),peer:null};
        users.set(u.id,u); match(u); return send(201,{token:u.id});
      }
      const u = users.get(req.headers.authorization?.replace('Bearer ',''));
      if (!u) return send(401,{error:'Сессия завершена. Заполните анкету ещё раз.'});
      u.seen = Date.now();
      if (path === '/api/state' && req.method === 'GET') {
        const peer = users.get(u.peer);
        return send(200,{status:u.status,peer:peer?{name:peer.name,age:peer.age}:null,messages:u.messages.map(m=>({id:m.id,text:m.text,mine:m.sender===u.id,time:m.time})),since:u.since});
      }
      if (path === '/api/next' && req.method === 'POST') { u.previous=u.peer || u.previous; detach(u); match(u); return send(200,{ok:true}); }
      if (path === '/api/leave' && req.method === 'POST') { detach(u); users.delete(u.id); return send(200,{ok:true}); }
      if (path === '/api/message' && req.method === 'POST') {
        if (u.status !== 'chat' || !users.has(u.peer)) return send(409,{error:'Диалог уже завершён.'});
        if (typeof body.text !== 'string' || !body.text.trim() || body.text.length>2000) return send(400,{error:'Сообщение должно содержать от 1 до 2000 символов.'});
        if (Date.now()-(u.lastMessage || 0)<250) return send(429,{error:'Подождите немного перед следующим сообщением.'});
        u.lastMessage=Date.now();
        u.messages.push({id:randomUUID(),text:body.text.trim(),sender:u.id,time:Date.now()});
        if(u.messages.length>300) u.messages.shift();
        return send(201,{ok:true});
      }
      send(404,{error:'Неизвестный запрос'});
    } catch { if (!res.headersSent) send(500,{error:'Ошибка сервера. Попробуйте ещё раз.'}); else res.end(); }
  });
  server.on('close',()=>clearInterval(timer));
  return server;
}
const app = createApp();
export default app;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT)||3000;
  app.listen(port,'127.0.0.1',()=>console.log(`Local: http://localhost:${port}`));
}
