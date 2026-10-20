const $ = id => document.getElementById(id);
let token=null, profile=null, timer=null, lastMessages='', busy=false, currentStatus='', peer=null, revision=0;
function show(id) { for(const view of ['welcome','search','chat']) $(view).hidden=view!==id; }
let errorTimer;
function error(message) { $('error').textContent=message; $('error').hidden=false; clearTimeout(errorTimer); errorTimer=setTimeout(()=>$('error').hidden=true,6000); }
async function api(path,body) {
  const requestToken=token;
  const response=await fetch(`/api/${path}`,{signal:AbortSignal.timeout(10000),method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();
  if(!response.ok) { if(response.status===401 && token===requestToken) {clearTimeout(timer);token=null;show('welcome');} throw new Error(data.error); }
  return data;
}
function render(data) {
  currentStatus=data.status;
  if(data.status==='searching') {
    show('search');
    $('search-description').textContent=Date.now()-data.since>10000?'Пока никого нет по вашим фильтрам. Продолжаем искать…':'Подбираем собеседника по вашим пожеланиям.';
    return;
  }
  show('chat');
  if(data.peer) peer=data.peer;
  $('peer-title').textContent=peer?`${peer.name}, ${peer.age}`:'Разговор завершён';
  $('avatar').textContent=peer?Array.from(peer.name)[0].toUpperCase():'р';
  const ended=data.status==='ended';
  $('peer-status').textContent=ended?'Диалог завершён':'Вы в диалоге';
  $('ended-note').hidden=!ended;
  $('message').disabled=ended;
  document.querySelector('.send-button').disabled=ended;
  const signature=JSON.stringify(data.messages);
  if(signature!==lastMessages) {
    const el=$('messages'); const nearBottom=el.scrollHeight-el.scrollTop-el.clientHeight<80;
    el.replaceChildren();
    if(!data.messages.length) {
      const empty=document.createElement('div');empty.className='empty-chat';
      const icon=document.createElement('span');icon.textContent='✳';empty.append(icon,document.createTextNode('Новый человек. Новая история.'));
      el.append(empty);
    }
    for(const m of data.messages) {
      const bubble=document.createElement('div');bubble.className=`message${m.mine?' mine':''}`;bubble.append(document.createTextNode(m.text));
      const time=document.createElement('time');time.textContent=new Date(m.time).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});bubble.append(time);el.append(bubble);
    }
    if(nearBottom || !lastMessages) el.scrollTop=el.scrollHeight;
    lastMessages=signature;
  }
}
async function refresh() {
  const version=revision, session=token;
  if(!session)return;
  const data=await api('state');
  if(version===revision && session===token) render(data);
}
async function poll() {
  try {await refresh();} catch(e) {error(e.message==='Failed to fetch'?'Нет связи с сервером. Пробуем снова…':e.message);}
  if(token) timer=setTimeout(poll,1000);
}
$('profile-form').addEventListener('submit',async e=>{
  e.preventDefault(); if(busy)return;
  profile=Object.fromEntries(new FormData(e.target));
  for(const field of ['age','minAge','maxAge']) profile[field]=Number(profile[field]);
  if(profile.minAge>profile.maxAge) return error('Возраст «от» не должен быть больше возраста «до».');
  if(!profile.name.trim()) return error('Введите имя или псевдоним.');
  busy=true; revision++; const button=e.submitter;button.disabled=true;
  try {
    const result=await api('join',profile);token=result.token;peer=null;lastMessages='';
    $('filter-summary').textContent=`${{any:'Любой пол',female:'Женский пол',male:'Мужской пол'}[profile.preference]} · ${profile.minAge}–${profile.maxAge} лет`;
    show('search');clearTimeout(timer);await poll();
  }catch(e){error(e.message);}finally{busy=false;button.disabled=false;}
});
async function leave() {
  if(busy)return;busy=true;revision++;
  try{await api('leave',{});token=null;clearTimeout(timer);show('welcome');$('message').value='';}catch(e){error(e.message);}finally{busy=false;}
}
$('cancel').addEventListener('click',leave);$('exit').addEventListener('click',leave);
$('next').addEventListener('click',async()=>{
  if(busy)return;busy=true;revision++;$('next').disabled=true;
  try {await api('next',{});peer=null;lastMessages='';$('message').value='';await refresh();}catch(e){error(e.message);}finally{busy=false;$('next').disabled=false;}
});
let sending=false;
$('message-form').addEventListener('submit',async e=>{
  e.preventDefault();const text=$('message').value.trim();if(!text || currentStatus!=='chat' || sending)return;
  sending=true;const version=revision;
  try{await api('message',{text});if(version!==revision)return;if($('message').value.trim()===text)$('message').value='';await refresh();$('messages').scrollTop=$('messages').scrollHeight;}catch(e){error(e.message);}finally{sending=false;$('message').focus();}
});
$('message').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('message-form').requestSubmit();}});
window.addEventListener('pagehide',()=>{if(token)fetch('/api/leave',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:'{}',keepalive:true}).catch(()=>{});});
