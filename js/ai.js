import{settings,all,put}from'./storage.js';
import{head,esc,toast}from'./ui.js';

let messages=[];

async function contextFor(text){
 const ctx={};
 if(/harca|gider|para/i.test(text))ctx.expenses=(await all('expenses')).slice(-100);
 if(/abonelik|ödeme/i.test(text))ctx.subscriptions=await all('subscriptions');
 if(/not|özet/i.test(text))ctx.notes=(await all('notes')).slice(-20).map(({title,content,updatedAt})=>({title,content,updatedAt}));
 return ctx;
}

function actionLabel(action){
 if(action.type==='add_subscription')return`${action.name} aboneliğini ${action.price||0} ${action.currency||'TRY'} olarak ekle`;
 if(action.type==='add_expense')return`${action.amount||0} ${action.currency||'TRY'} tutarında ${action.name||'harcama'} ekle`;
 if(action.type==='create_note')return`“${action.title||'Yeni not'}” notunu oluştur`;
 return'';
}

async function executeAction(action){
 const today=new Date().toISOString().slice(0,10);
 if(action.type==='add_subscription')await put('subscriptions',{name:action.name,price:+action.price||0,currency:action.currency||'TRY',period:action.period||'monthly',date:action.date||today,category:action.category||'Diğer',note:action.note||''});
 if(action.type==='add_expense')await put('expenses',{name:action.name||'Harcama',amount:+action.amount||0,currency:action.currency||'TRY',category:action.category||'Diğer',date:action.date||today,note:action.note||'',createdAt:Date.now()});
 if(action.type==='create_note')await put('notes',{title:action.title||'Yeni not',content:action.content||'',tags:[],pinned:false,createdAt:Date.now(),updatedAt:Date.now()});
 toast('İşlem panele kaydedildi');
}

export function renderAI(root){
 const draw=()=>{
  root.innerHTML=head('Yapay Zekâ Asistanı','Gemini destekli kişisel yardımcın')+`<div class="card chat"><div class="messages">${messages.length?messages.map((m,i)=>`<div class="bubble ${m.role==='user'?'user':'ai'}">${esc(m.text)}${m.action&&!m.done?`<div class="ai-action"><b>Önerilen işlem</b><span>${esc(actionLabel(m.action))}</span><button class="primary" data-confirm-action="${i}">Onayla ve uygula</button></div>`:m.done?'<div class="ai-action-done">✓ Panele kaydedildi</div>':''}</div>`).join(''):'<div class="empty"><b>Ne konuşmak istersin?</b><span>Her konuda sorabilir, paneline kayıt eklememi isteyebilirsin.</span></div>'}</div><form class="chat-form"><input name="message" autocomplete="off" placeholder="Bir şey sor veya işlem iste…" required><button class="primary">Gönder</button><button type="button" class="secondary" id="clear-chat">Temizle</button></form></div>`;
  root.querySelector('#clear-chat').onclick=()=>{messages=[];draw()};
  root.querySelectorAll('[data-confirm-action]').forEach(button=>button.onclick=async()=>{const message=messages[+button.dataset.confirmAction];await executeAction(message.action);message.done=true;draw()});
  root.querySelector('form').onsubmit=async e=>{
   e.preventDefault();const text=e.target.message.value.trim(),endpoint=settings.get('aiEndpoint','https://ado-gemini-proxy.selam34121.workers.dev'),history=messages.slice(-12).map(({role,text})=>({role,text}));
   messages.push({role:'user',text},{role:'ai',text:'Yanıt hazırlanıyor…'});draw();
   try{const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:text,history,context:await contextFor(text)})});if(!response.ok)throw Error();const data=await response.json();messages[messages.length-1]={role:'ai',text:data.text||'Yanıt alınamadı.',action:data.action||null}}
   catch{messages[messages.length-1].text='Bağlantı kurulamadı. Gemini bağlantısını kontrol et.'}
   draw();root.querySelector('.messages').scrollTop=1e9;
  };
 };
 draw();
}
