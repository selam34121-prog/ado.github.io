import{esc,toast}from'./ui.js';

const API='https://ado-gemini-proxy.selam34121.workers.dev';
async function request(path,options={}){const response=await fetch(API+path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}}),data=await response.json().catch(()=>({error:'Sunucudan geçersiz yanıt alındı.'}));if(!response.ok)throw Error(data.error||'İşlem başarısız.');return data}

export async function createNoteShare(notes){return request('/shares',{method:'POST',body:JSON.stringify({notes:notes.map(({id,title,content,updatedAt})=>({id,title,content,updatedAt}))})})}
export const shareUrl=token=>{const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('share',token);return url.href};

export async function renderSharedNotes(root,token){
 document.body.classList.add('shared-view');
 let data;
 try{data=await request('/shares/'+encodeURIComponent(token))}catch(error){root.innerHTML=`<div class="shared-shell"><div class="card empty"><b>Paylaşım açılamadı</b><span>${esc(error.message)}</span></div></div>`;return}
 let notes=data.notes,selected=notes[0],timer;
 const draw=()=>{
  root.innerHTML=`<div class="shared-shell"><header class="shared-head"><div class="brand"><span class="brand-mark">A</span><div><b>Paylaşılan notlar</b><small>Bağlantıya sahip herkes düzenleyebilir</small></div></div><span class="badge">${notes.length} not</span></header><div class="note-layout"><div class="card"><div class="list note-list">${notes.map(note=>`<button class="list-item note-item ${selected?.id===note.id?'active':''}" data-shared-note="${esc(note.id)}"><div><b>${esc(note.title)}</b><div class="muted">${new Date(note.updatedAt).toLocaleString('tr-TR')}</div></div></button>`).join('')}</div></div><div class="card note-editor"><div class="field"><input id="shared-title" value="${esc(selected.title)}" aria-label="Başlık"></div><textarea id="shared-content" placeholder="Not…">${esc(selected.content)}</textarea><div class="actions"><span class="muted" id="shared-save-state">Kaydedildi</span></div></div></div></div>`;
  root.querySelectorAll('[data-shared-note]').forEach(button=>button.onclick=()=>{selected=notes.find(note=>note.id===button.dataset.sharedNote);draw()});
  const save=()=>{clearTimeout(timer);root.querySelector('#shared-save-state').textContent='Kaydediliyor…';timer=setTimeout(async()=>{selected.title=root.querySelector('#shared-title').value||'Başlıksız';selected.content=root.querySelector('#shared-content').value;selected.updatedAt=Date.now();try{await request('/shares/'+encodeURIComponent(token),{method:'PUT',body:JSON.stringify({notes})});root.querySelector('#shared-save-state').textContent='Kaydedildi'}catch(error){root.querySelector('#shared-save-state').textContent='Kaydedilemedi';toast(error.message)}},450)};
  root.querySelector('#shared-title').oninput=save;root.querySelector('#shared-content').oninput=save;
 };
 draw();
}
