import{settings,all,put}from'./storage.js';
import{head,esc,toast}from'./ui.js';

let messages=[];
const DEFAULT_ENDPOINT='https://ado-gemini-proxy.selam34121.workers.dev';

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

function localFallback(text){
 if(/not(lar)?[ıi]ma[\s\S]*ekle|not[\s\S]*oluştur/i.test(text)){
  const content=text.replace(/^.*?not(lar)?[ıi]ma\s*/i,'').replace(/\s*ekle(sene|r misin)?\s*/i,' ').trim();
  return{type:'create_note',title:'Yeni plan',content:content||text};
 }
 return null;
}

async function askGemini(endpoint,payload){
 let lastError;
 for(let attempt=0;attempt<2;attempt++){
  try{const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});if(!response.ok)throw Error(`HTTP ${response.status}`);return await response.json()}catch(error){lastError=error}
 }
 throw lastError;
}

export function renderAI(root){
 const draw=()=>{
  root.innerHTML=head('Yapay Zekâ Asistanı','Gemini destekli kişisel yardımcın')+`<div class="card chat"><div class="messages">${messages.length?messages.map((m,i)=>`<div class="bubble ${m.role==='user'?'user':'ai'}">${esc(m.text)}${m.action&&!m.done?`<div class="ai-action"><b>Önerilen işlem</b><span>${esc(actionLabel(m.action))}</span><button class="primary" data-confirm-action="${i}">Onayla ve uygula</button></div>`:m.done?'<div class="ai-action-done">✓ Panele kaydedildi</div>':''}</div>`).join(''):'<div class="empty"><b>Ne konuşmak istersin?</b><span>Her konuda sorabilir, paneline kayıt eklememi isteyebilirsin.</span></div>'}</div><form class="chat-form"><input name="message" autocomplete="off" placeholder="Bir şey sor veya işlem iste…" required><button class="primary">Gönder</button><button type="button" class="secondary" id="clear-chat">Temizle</button></form></div>`;
  root.querySelector('#clear-chat').onclick=()=>{messages=[];draw()};
  root.querySelectorAll('[data-confirm-action]').forEach(button=>button.onclick=async()=>{const message=messages[+button.dataset.confirmAction];await executeAction(message.action);message.done=true;draw()});
  root.querySelector('form').onsubmit=async e=>{
   e.preventDefault();const text=e.target.message.value.trim(),endpoint=settings.get('aiEndpoint',DEFAULT_ENDPOINT)||DEFAULT_ENDPOINT,history=messages.slice(-12).map(({role,text})=>({role,text}));
   messages.push({role:'user',text},{role:'ai',text:'Yanıt hazırlanıyor…'});draw();
   try{const data=await askGemini(endpoint,{message:text,history,context:await contextFor(text)});messages[messages.length-1]={role:'ai',text:data.text||'Yanıt alınamadı.',action:data.action||null}}
   catch{const action=localFallback(text);messages[messages.length-1]=action?{role:'ai',text:'Bağlantı yanıt vermedi ancak not isteğini hazırladım. Kaydetmek için aşağıdan onayla.',action}:{role:'ai',text:location.protocol==='file:'?'Gemini güvenlik nedeniyle dosya modunda çalışmaz. Siteyi GitHub Pages adresinden aç.':'Gemini şu anda yanıt vermedi. Birkaç saniye sonra tekrar dene.'}}
   draw();root.querySelector('.messages').scrollTop=1e9;
  };
 };
 draw();
}
