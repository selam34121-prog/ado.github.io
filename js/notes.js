import{all,put,del}from'./storage.js';
import{head,empty,esc,toast,modal}from'./ui.js';
import{createNoteShare,shareUrl}from'./sharing.js';

let timer;

export async function newNote(done){
 await put('notes',{title:'Yeni not',content:'',tags:[],pinned:false,createdAt:Date.now(),updatedAt:Date.now()});
 toast('Not oluşturuldu');
 done?.();
}

export async function renderNotes(root){
 const requestedId=sessionStorage.getItem('ado:openNote');
 sessionStorage.removeItem('ado:openNote');
 let selected;const marked=new Set();let selectionMode=false;
 const draw=async()=>{
  const q=root.querySelector('#note-search')?.value?.toLowerCase()||'';
  let items=(await all('notes')).sort((a,b)=>(b.pinned-a.pinned)||((b.lastOpenedAt||b.updatedAt)-(a.lastOpenedAt||a.updatedAt)));
  if(q)items=items.filter(x=>(x.title+x.content+(x.tags||[]).join(' ')).toLowerCase().includes(q));
  selected=items.find(x=>x.id===(selected?.id||requestedId))||items[0];
  root.innerHTML=head('Notlar',selectionMode?`${marked.size} not seçildi · Eklemek/çıkarmak için dokun`:'Bir nota basılı tut veya Seç ve paylaş’a dokun',`<div class="note-head-actions"><button class="secondary" id="begin-note-selection">Seç ve paylaş</button><button class="primary" data-action="new-note">＋ Yeni not</button></div>`)+`
   ${selectionMode?`<div class="selection-bar"><b>${marked.size} not seçildi</b><div class="actions"><button class="secondary" id="cancel-note-selection">Vazgeç</button><button class="primary" id="share-notes" ${marked.size?'':'disabled'}>↗ Paylaşım linki oluştur</button></div></div>`:''}
   <div class="note-layout"><div class="card"><input id="note-search" placeholder="Notlarda ara…" value="${esc(q)}">
   <div class="list note-list" style="margin-top:12px">${items.map(x=>`<button class="list-item note-item ${!selectionMode&&selected?.id===x.id?'active':''} ${marked.has(x.id)?'selected':''}" data-note="${x.id}" aria-pressed="${marked.has(x.id)}" style="text-align:left;color:inherit"><span class="note-check">${marked.has(x.id)?'✓':''}</span><div><b>${x.pinned?'◆ ':''}${esc(x.title)}</b><div class="muted">${new Date(x.updatedAt).toLocaleString('tr-TR')}</div></div></button>`).join('')||empty('Not yok','İlk notunu oluştur.','new-note','Not ekle')}</div></div>
   <div class="card note-editor">${selected?`<div class="field"><input id="note-title" value="${esc(selected.title)}" aria-label="Başlık"></div><textarea id="note-content" placeholder="Markdown destekli notun…">${esc(selected.content)}</textarea><div class="actions"><span class="muted" id="save-state">Kaydedildi</span><button class="secondary" id="pin-note">${selected.pinned?'Sabitlemeyi kaldır':'Sabitle'}</button><button class="danger" id="delete-note">Sil</button></div>`:empty('Bir not seç','Düzenlemek için listeden bir not seç.')}</div></div>`;

  root.querySelectorAll('[data-action="new-note"]').forEach(button=>button.addEventListener('click',()=>newNote(draw)));
  root.querySelector('#begin-note-selection')?.addEventListener('click',()=>{selectionMode=true;draw()});
  root.querySelectorAll('[data-note]').forEach(button=>{let hold,startX=0,startY=0,suppress=false;const cancel=()=>{clearTimeout(hold);hold=null};const choose=()=>{selectionMode=true;marked.add(button.dataset.note);suppress=true;try{navigator.vibrate?.(35)}catch{}draw()};button.onpointerdown=e=>{if(e.button!==0)return;startX=e.clientX;startY=e.clientY;hold=setTimeout(choose,500)};button.onpointermove=e=>{if(Math.hypot(e.clientX-startX,e.clientY-startY)>12)cancel()};button.onpointerup=button.onpointercancel=cancel;button.oncontextmenu=e=>{e.preventDefault();choose()};button.onclick=async()=>{cancel();if(suppress){suppress=false;return}if(selectionMode){marked.has(button.dataset.note)?marked.delete(button.dataset.note):marked.add(button.dataset.note);draw();return}selected=(await all('notes')).find(x=>x.id===button.dataset.note);selected.lastOpenedAt=Date.now();await put('notes',selected);draw()}});
  root.querySelector('#cancel-note-selection')?.addEventListener('click',()=>{marked.clear();selectionMode=false;draw()});
  root.querySelector('#share-notes')?.addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;button.textContent='Link oluşturuluyor…';try{const chosen=(await all('notes')).filter(note=>marked.has(note.id)),result=await createNoteShare(chosen),url=shareUrl(result.token);modal('Paylaşım bağlantısı',`<p class="muted">Bu bağlantıya sahip herkes hesap açmadan notları görebilir ve düzenleyebilir.</p><div class="share-link-row"><input id="note-share-url" readonly value="${esc(url)}"><button class="primary" id="copy-note-share">Kopyala</button></div><div class="actions"><button class="secondary" id="native-note-share">Paylaş…</button></div>`);document.querySelector('#copy-note-share').onclick=async()=>{await navigator.clipboard.writeText(url);toast('Bağlantı kopyalandı')};const native=document.querySelector('#native-note-share');if(!navigator.share)native.hidden=true;else native.onclick=()=>navigator.share({title:'Paylaşılan notlar',url}).catch(()=>{});marked.clear();selectionMode=false}catch(error){toast(error.message);button.disabled=false;button.textContent='↗ Paylaşım linki oluştur'}});
  root.querySelector('#note-search')?.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(draw,180)});
  const save=()=>{clearTimeout(timer);root.querySelector('#save-state').textContent='Kaydediliyor…';timer=setTimeout(async()=>{selected.title=root.querySelector('#note-title').value||'Başlıksız';selected.content=root.querySelector('#note-content').value;selected.updatedAt=Date.now();await put('notes',selected);root.querySelector('#save-state').textContent='Kaydedildi'},350)};
  root.querySelector('#note-title')?.addEventListener('input',save);
  root.querySelector('#note-content')?.addEventListener('input',save);
  root.querySelector('#pin-note')?.addEventListener('click',async()=>{selected.pinned=!selected.pinned;await put('notes',selected);toast(selected.pinned?'Not sabitlendi':'Sabitleme kaldırıldı');draw()});
  root.querySelector('#delete-note')?.addEventListener('click',async()=>{await del('notes',selected.id);selected=null;toast('Not silindi');draw()});
 };
 await draw();
}
