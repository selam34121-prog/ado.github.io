import{initDB,all}from'./storage.js';
import{head,money,date,esc,modal,$,toast}from'./ui.js';
import{renderExpenses,expenseModal}from'./expenses.js';
import{renderSubscriptions,subscriptionModal}from'./subscriptions.js';
import{renderNotes,newNote}from'./notes.js';
import{renderTools}from'./tools.js';
import{renderSettings,applySettings}from'./settings.js';
import{renderAI}from'./ai.js';
import{renderBrowser}from'./browser.js';
import{openPalette}from'./commands.js';
import{renderAccount}from'./account.js';
import{initializeSync,signedIn}from'./sync.js';
import{renderSharedNotes}from'./sharing.js';

const pages=[['dashboard','◈','Ana Panel'],['browser','⌕','Tarayıcı Asistanı'],['expenses','◒','Harcamalar'],['subscriptions','◇','Abonelikler'],['tools','⌘','Bilgisayar Araçları'],['notes','▤','Notlar'],['command','⌁','Komuta Merkezi'],['ai','✦','Yapay Zekâ Asistanı'],['account','◎','Hesap'],['settings','⚙','Ayarlar']];
const view=$('#view');
function accountIndicator(){const active=signedIn(),avatar=document.querySelector('.avatar');document.body.classList.toggle('account-connected',active);if(avatar){avatar.innerHTML=active?'AK <span style="color:#35d890">●</span>':'AK';avatar.title=active?'Hesap bağlı':'Giriş yapılmadı'}const label=document.querySelector('.sidebar-foot span:last-child');if(label)label.textContent=active?'Hesap bağlı · Eşitleniyor':'Bulut eşitleme hazır'}

async function dashboard(){
 const[expenses,subs,notes,history]=await Promise.all(['expenses','subscriptions','notes','commandHistory'].map(all));
 const now=new Date(),month=expenses.filter(x=>new Date(x.date).getMonth()===now.getMonth()&&new Date(x.date).getFullYear()===now.getFullYear()),today=expenses.filter(x=>x.date===now.toISOString().slice(0,10)),next=subs.sort((a,b)=>new Date(a.date)-new Date(b.date))[0];
 const recentNotes=notes.sort((a,b)=>(b.lastOpenedAt||b.updatedAt)-(a.lastOpenedAt||a.updatedAt)).slice(0,4);
 view.innerHTML=head('İyi günler','Bugünün özeti ve hızlı erişim alanın','<button class="primary" data-action="palette">⌘ Komut çalıştır</button>')+`
 <div class="grid stats"><div class="card"><span class="stat-label">Şu an</span><div class="stat-value" id="big-time">${now.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</div><span class="muted">${date(now)}</span></div><div class="card"><span class="stat-label">Bugünkü harcama</span><div class="stat-value">${money(today.reduce((s,x)=>s+x.amount,0))}</div><span class="muted">${today.length} işlem</span></div><div class="card"><span class="stat-label">Bu ay</span><div class="stat-value">${money(month.reduce((s,x)=>s+x.amount,0))}</div><span class="muted">${month.length} harcama</span></div><div class="card"><span class="stat-label">Yaklaşan abonelik</span><div class="stat-value">${next?esc(next.name):'—'}</div><span class="muted">${next?date(next.date):'Kayıt yok'}</span></div></div>
 <div class="grid two-col"><div class="card"><h2>Son kullanılan notlar</h2>${recentNotes.length?`<div class="recent-notes-grid">${recentNotes.map(n=>`<button class="list-item recent-note" data-open-note="${n.id}"><div><b>${n.pinned?'◆ ':''}${esc(n.title)}</b><p>${esc(n.content||'İçerik yok')}</p><span class="muted">${new Date(n.lastOpenedAt||n.updatedAt).toLocaleString('tr-TR')}</span></div></button>`).join('')}</div>`:'<div class="empty"><b>Henüz not yok</b><span>Ctrl + N ile ilk notunu oluştur.</span></div>'}</div><div class="card"><h2>Komut geçmişi</h2>${history.length?`<div class="list">${history.sort((a,b)=>b.createdAt-a.createdAt).slice(0,5).map(h=>`<div class="list-item"><span>⌁</span><span>${esc(h.command)}</span></div>`).join('')}</div>`:'<div class="empty"><b>Geçmiş boş</b><span>Ctrl + K ile bir komut çalıştır.</span></div>'}</div></div>`;
 view.querySelector('[data-action="palette"]').onclick=()=>openPalette(navigate);
 view.querySelectorAll('[data-open-note]').forEach(button=>button.onclick=()=>{sessionStorage.setItem('ado:openNote',button.dataset.openNote);navigate('notes')});
}

async function navigate(page){
 location.hash=page;document.title=`ADO — ${pages.find(x=>x[0]===page)?.[2]||'Komuta Merkezi'}`;
 document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page));
 $('#sidebar').classList.remove('open');
 if(page==='dashboard')await dashboard();if(page==='browser')await renderBrowser(view);if(page==='expenses')await renderExpenses(view);if(page==='subscriptions')await renderSubscriptions(view);if(page==='tools')renderTools(view);if(page==='notes')await renderNotes(view);if(page==='ai')renderAI(view);if(page==='account')renderAccount(view);if(page==='settings')renderSettings(view);if(page==='command'){await openPalette(navigate);navigate('dashboard')}
}

function quickAdd(){
 modal('Hızlı ekle','<div class="grid three-col"><button class="card" data-quick="expense">◒<br><b>Harcama</b></button><button class="card" data-quick="note">▤<br><b>Not</b></button><button class="card" data-quick="subscription">◇<br><b>Abonelik</b></button></div>');
 document.querySelectorAll('[data-quick]').forEach(button=>button.onclick=()=>{document.querySelector('[data-close]').click();if(button.dataset.quick==='expense')expenseModal(()=>navigate('expenses'));if(button.dataset.quick==='note')newNote(()=>navigate('notes'));if(button.dataset.quick==='subscription')subscriptionModal(()=>navigate('subscriptions'))});
}

async function start(){
 applySettings();await initDB();
 const shareToken=new URLSearchParams(location.search).get('share');if(shareToken){await renderSharedNotes(view,shareToken);return}
 $('#nav').innerHTML=pages.map(([id,icon,label])=>`<button class="nav-item" data-page="${id}"><span class="nav-icon">${icon}</span><span class="nav-label">${label}</span></button>`).join('');
 document.querySelectorAll('[data-page]').forEach(x=>x.onclick=()=>navigate(x.dataset.page));
 document.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(action==='palette')openPalette(navigate);if(action==='quick-add')quickAdd();if(action==='account')navigate('account');if(action==='menu')$('#sidebar').classList.toggle('open');if(action==='collapse')$('#app').classList.toggle('collapsed');if(action==='notifications')toast('Yeni bildirim yok')});
 document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;if(e.key==='Escape')$('#modal-root').replaceChildren();if(e.ctrlKey&&e.key.toLowerCase()==='k'){e.preventDefault();openPalette(navigate)}if(e.ctrlKey&&!e.shiftKey&&e.key.toLowerCase()==='n'){e.preventDefault();newNote(()=>navigate('notes'))}if(e.ctrlKey&&e.shiftKey&&e.key.toLowerCase()==='e'){e.preventDefault();expenseModal(()=>navigate('expenses'))}if(e.ctrlKey&&e.key==='/'){e.preventDefault();modal('Klavye kısayolları','<div class="list"><div class="list-item">Ctrl K <span class="meta">Komuta merkezi</span></div><div class="list-item">Ctrl N <span class="meta">Yeni not</span></div><div class="list-item">Ctrl Shift E <span class="meta">Yeni harcama</span></div><div class="list-item">Esc <span class="meta">Pencereyi kapat</span></div></div>')}});
 setInterval(()=>{const clock=$('#clock');if(clock)clock.textContent=new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});const big=$('#big-time');if(big)big.textContent=new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})},1000);
 window.addEventListener('ado:auth-changed',accountIndicator);accountIndicator();initializeSync();await navigate(location.hash.slice(1)||'dashboard');
 if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js');
}

import('./mobile.js');import('./update.js');
start().catch(error=>{console.error(error);view.innerHTML='<div class="empty"><b>Uygulama açılamadı</b><span>Sayfayı yenilemeyi dene.</span></div>'});
