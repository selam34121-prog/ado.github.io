import{settings,all,put}from'./storage.js';
import{head,esc,toast}from'./ui.js';

let messages=[];
let activeRecognition=null;
const DEFAULT_ENDPOINT='https://ado-gemini-proxy.selam34121.workers.dev';

export function stopAIListening(){
 if(!activeRecognition)return;
 activeRecognition._adoCancelled=true;
 try{activeRecognition.abort()}catch{}
 activeRecognition=null;
}

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
 stopAIListening();
 const draw=()=>{
  stopAIListening();
  root.innerHTML=head('Yapay Zekâ Asistanı','Gemini destekli kişisel yardımcın')+`<div class="card chat"><div class="messages">${messages.length?messages.map((m,i)=>`<div class="bubble ${m.role==='user'?'user':'ai'}">${esc(m.text)}${m.action&&!m.done?`<div class="ai-action"><b>Önerilen işlem</b><span>${esc(actionLabel(m.action))}</span><button class="primary" data-confirm-action="${i}">Onayla ve uygula</button></div>`:m.done?'<div class="ai-action-done">✓ Panele kaydedildi</div>':''}</div>`).join(''):'<div class="empty"><b>Ne konuşmak istersin?</b><span>Her konuda sorabilir, paneline kayıt eklememi isteyebilirsin.</span></div>'}</div><form class="chat-form"><div class="chat-input-wrap"><input name="message" autocomplete="off" enterkeyhint="send" aria-label="Mesaj" placeholder="Bir şey sor veya işlem iste…" required><button type="button" class="voice-btn" id="voice-input" aria-label="Sesle yazmayı başlat" aria-pressed="false" title="Sesle yaz"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0M12 17v4m-3 0h6"/></svg></button></div><button class="primary">Gönder</button><button type="button" class="secondary" id="clear-chat">Temizle</button><div class="voice-status" id="voice-status" role="status" aria-live="polite" hidden></div></form></div>`;
  root.querySelector('#clear-chat').onclick=()=>{messages=[];draw()};
  root.querySelectorAll('[data-confirm-action]').forEach(button=>button.onclick=async()=>{const message=messages[+button.dataset.confirmAction];await executeAction(message.action);message.done=true;draw()});
  setupSpeechInput(root);
  root.querySelector('.chat-form').onsubmit=async e=>{
   e.preventDefault();const text=e.target.message.value.trim(),endpoint=settings.get('aiEndpoint',DEFAULT_ENDPOINT)||DEFAULT_ENDPOINT,history=messages.slice(-12).map(({role,text})=>({role,text}));
   if(!text)return;
   stopAIListening();
   messages.push({role:'user',text},{role:'ai',text:'Yanıt hazırlanıyor…'});draw();
   try{const data=await askGemini(endpoint,{message:text,history,context:await contextFor(text)});messages[messages.length-1]={role:'ai',text:data.text||'Yanıt alınamadı.',action:data.action||null}}
   catch{const action=localFallback(text);messages[messages.length-1]=action?{role:'ai',text:'Bağlantı yanıt vermedi ancak not isteğini hazırladım. Kaydetmek için aşağıdan onayla.',action}:{role:'ai',text:location.protocol==='file:'?'Gemini güvenlik nedeniyle dosya modunda çalışmaz. Siteyi GitHub Pages adresinden aç.':'Gemini şu anda yanıt vermedi. Birkaç saniye sonra tekrar dene.'}}
   draw();root.querySelector('.messages').scrollTop=1e9;
  };
 };
 draw();
}

function setupSpeechInput(root){
 const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 const button=root.querySelector('#voice-input'),input=root.querySelector('.chat-form [name="message"]'),status=root.querySelector('#voice-status');
 if(!button||!input||!status)return;

 const showStatus=(text,state='')=>{
  status.textContent=text;
  status.hidden=!text;
  button.dataset.state=state;
  button.setAttribute('aria-pressed',state==='listening'?'true':'false');
  const unavailable=state==='unsupported';
  button.setAttribute('aria-label',unavailable?'Sesle yazma desteklenmiyor':state==='listening'?'Sesle yazmayı durdur':'Sesle yazmayı başlat');
  button.title=unavailable?'Sesle yazma bu tarayıcıda desteklenmiyor':state==='listening'?'Dinlemeyi durdur':'Sesle yaz';
 };

 if(!SpeechRecognition){
  button.disabled=true;
  showStatus('Sesle yazma bu tarayıcıda desteklenmiyor. Chrome, Edge veya Safari ile deneyebilirsin.','unsupported');
  return;
 }

 button.onclick=()=>{
  if(activeRecognition){
   showStatus('Konuşma metne çevriliyor…','processing');
   try{activeRecognition.stop()}catch{}
   return;
  }

  const recognition=new SpeechRecognition();
  let baseText=input.value.trimEnd(),finalText='';
  recognition.lang='tr-TR';
  recognition.continuous=true;
  recognition.interimResults=true;
  recognition.maxAlternatives=1;
  recognition._adoCancelled=false;
  activeRecognition=recognition;

  recognition.onstart=()=>showStatus('Dinliyorum… Konuşmaya başlayabilirsin.','listening');
  recognition.onspeechstart=()=>showStatus('Dinliyorum… Konuşmaya devam edebilirsin.','listening');
  recognition.onspeechend=()=>showStatus('Konuşma metne çevriliyor…','processing');
  recognition.onresult=event=>{
   let interimText='';finalText='';
   for(let i=0;i<event.results.length;i++){
    const transcript=event.results[i][0].transcript.trim();
    if(event.results[i].isFinal)finalText=[finalText,transcript].filter(Boolean).join(' ');
    else interimText=[interimText,transcript].filter(Boolean).join(' ');
   }
   const spoken=[finalText,interimText].filter(Boolean).join(' ');
   input.value=[baseText,spoken].filter(Boolean).join(baseText&&spoken?' ':'');
   input.dispatchEvent(new Event('input',{bubbles:true}));
  };
  recognition.onerror=event=>{
   if(recognition._adoCancelled||event.error==='aborted')return;
   const errors={
    'not-allowed':'Mikrofon izni verilmedi. Tarayıcı ayarlarından mikrofon erişimini aç.',
    'service-not-allowed':'Ses tanıma hizmetine erişilemiyor.',
    'audio-capture':'Kullanılabilir bir mikrofon bulunamadı.',
    'no-speech':'Ses algılanamadı. Mikrofon düğmesine dokunup tekrar dene.',
    'network':'Ses tanıma hizmetine bağlanılamadı.'
   };
   showStatus(errors[event.error]||'Sesle yazma başlatılamadı. Tekrar deneyebilirsin.','error');
  };
  recognition.onend=()=>{
   if(activeRecognition===recognition)activeRecognition=null;
   if(recognition._adoCancelled)return;
   if(button.dataset.state!=='error')showStatus(finalText?'Ses metne eklendi.':'','');
  };

  try{recognition.start()}catch{
   if(activeRecognition===recognition)activeRecognition=null;
   showStatus('Sesle yazma başlatılamadı. Tekrar deneyebilirsin.','error');
  }
 };
}
