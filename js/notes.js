import{all,put,del}from'./storage.js';
import{head,empty,esc,toast}from'./ui.js';

let timer;

export async function newNote(done){
 await put('notes',{title:'Yeni not',content:'',tags:[],pinned:false,createdAt:Date.now(),updatedAt:Date.now()});
 toast('Not oluşturuldu');
 done?.();
}

export async function renderNotes(root){
 const requestedId=sessionStorage.getItem('ado:openNote');
 sessionStorage.removeItem('ado:openNote');
 let selected;
 const draw=async()=>{
  const q=root.querySelector('#note-search')?.value?.toLowerCase()||'';
  let items=(await all('notes')).sort((a,b)=>(b.pinned-a.pinned)||((b.lastOpenedAt||b.updatedAt)-(a.lastOpenedAt||a.updatedAt)));
  if(q)items=items.filter(x=>(x.title+x.content+(x.tags||[]).join(' ')).toLowerCase().includes(q));
  selected=items.find(x=>x.id===(selected?.id||requestedId))||items[0];
  root.innerHTML=head('Notlar','Düşüncelerini yerel olarak ve otomatik kaydet','<button class="primary" data-action="new-note">＋ Yeni not</button>')+`
   <div class="note-layout"><div class="card"><input id="note-search" placeholder="Notlarda ara…" value="${esc(q)}">
   <div class="list note-list" style="margin-top:12px">${items.map(x=>`<button class="list-item note-item ${selected?.id===x.id?'active':''}" data-note="${x.id}" style="text-align:left;color:inherit"><div><b>${x.pinned?'◆ ':''}${esc(x.title)}</b><div class="muted">${new Date(x.updatedAt).toLocaleString('tr-TR')}</div></div></button>`).join('')||empty('Not yok','İlk notunu oluştur.','new-note','Not ekle')}</div></div>
   <div class="card note-editor">${selected?`<div class="field"><input id="note-title" value="${esc(selected.title)}" aria-label="Başlık"></div><textarea id="note-content" placeholder="Markdown destekli notun…">${esc(selected.content)}</textarea><div class="actions"><span class="muted" id="save-state">Kaydedildi</span><button class="secondary" id="pin-note">${selected.pinned?'Sabitlemeyi kaldır':'Sabitle'}</button><button class="danger" id="delete-note">Sil</button></div>`:empty('Bir not seç','Düzenlemek için listeden bir not seç.')}</div></div>`;

  root.querySelectorAll('[data-action="new-note"]').forEach(button=>button.addEventListener('click',()=>newNote(draw)));
  root.querySelectorAll('[data-note]').forEach(button=>button.onclick=async()=>{selected=(await all('notes')).find(x=>x.id===button.dataset.note);selected.lastOpenedAt=Date.now();await put('notes',selected);draw()});
  root.querySelector('#note-search')?.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(draw,180)});
  const save=()=>{clearTimeout(timer);root.querySelector('#save-state').textContent='Kaydediliyor…';timer=setTimeout(async()=>{selected.title=root.querySelector('#note-title').value||'Başlıksız';selected.content=root.querySelector('#note-content').value;selected.updatedAt=Date.now();await put('notes',selected);root.querySelector('#save-state').textContent='Kaydedildi'},350)};
  root.querySelector('#note-title')?.addEventListener('input',save);
  root.querySelector('#note-content')?.addEventListener('input',save);
  root.querySelector('#pin-note')?.addEventListener('click',async()=>{selected.pinned=!selected.pinned;await put('notes',selected);toast(selected.pinned?'Not sabitlendi':'Sabitleme kaldırıldı');draw()});
  root.querySelector('#delete-note')?.addEventListener('click',async()=>{await del('notes',selected.id);selected=null;toast('Not silindi');draw()});
 };
 await draw();
}
