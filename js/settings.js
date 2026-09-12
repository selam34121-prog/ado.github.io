import{settings,exportData,importData}from'./storage.js';
import{head,toast,$}from'./ui.js';

const themes={
 midnight:{label:'Gece Mavisi',color:'#5f7cff'},
 oled:{label:'OLED Siyah',color:'#8b7cff'},
 light:{label:'Açık',color:'#3973e6'},
 red:{label:'ADO Kırmızı',color:'#e5484d'},
 purple:{label:'Mor',color:'#7c5cff'}
};

function selectedTheme(){
 const saved=settings.get('theme',null);
 if(saved&&themes[saved])return saved;
 if(settings.get('light',false))return'light';
 return settings.get('accent','purple')==='red'?'red':'midnight';
}

export function applySettings(){
 const theme=selectedTheme();
 document.documentElement.dataset.theme=theme;
 document.documentElement.removeAttribute('data-light');
 document.documentElement.removeAttribute('data-accent');
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='light'?'#f4f6fb':theme==='oled'?'#000000':'#090b10');
}

export function renderSettings(root){
 const theme=selectedTheme();
 root.innerHTML=head('Ayarlar','Görünüm, yapay zekâ ve veri yönetimi')+`
 <div class="grid two-col">
  <div class="card"><h2>Görünüm</h2><p class="muted">Arayüz teması</p>
   <div class="theme-options">${Object.entries(themes).map(([id,t])=>`<button class="theme-option ${theme===id?'active':''}" data-theme-choice="${id}"><span style="background:${t.color}"></span>${t.label}</button>`).join('')}</div>
   <p class="muted" style="margin-top:14px">Seçimin bu cihazda otomatik olarak hatırlanır.</p>
  </div>
  <div class="card"><h2>Gemini bağlantısı</h2><div class="field"><label>Güvenli bağlantı adresi</label><input id="ai-endpoint" value="${settings.get('aiEndpoint','https://ado-gemini-proxy.selam34121.workers.dev')}"></div><div class="actions"><button class="primary" id="save-ai">Kaydet</button></div><p class="muted">API anahtarı tarayıcıda veya GitHub kodunda tutulmaz.</p></div>
  <div class="card"><h2>Yedekleme</h2><p class="muted">Tüm yerel verileri tek JSON dosyasında dışa veya içe aktar.</p><div class="actions"><label class="secondary">İçe aktar<input id="import-file" type="file" accept="application/json" hidden></label><button class="primary" id="export-data">Dışa aktar</button></div></div>
 </div>`;
 root.querySelectorAll('[data-theme-choice]').forEach(button=>button.onclick=()=>{settings.set('theme',button.dataset.themeChoice);applySettings();renderSettings(root);toast(`${themes[button.dataset.themeChoice].label} teması uygulandı`)});
 $('#save-ai').onclick=()=>{settings.set('aiEndpoint',$('#ai-endpoint').value.trim());toast('Gemini bağlantısı kaydedildi')};
 $('#export-data').onclick=async()=>{const blob=new Blob([JSON.stringify(await exportData(),null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`ado-dashboard-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);toast('Yedek dışa aktarıldı')};
 $('#import-file').onchange=async e=>{if(!confirm('Mevcut veriler değiştirilecek. Yedeği içe aktarmak istiyor musun?'))return;try{await importData(JSON.parse(await e.target.files[0].text()));applySettings();toast('Yedek içe aktarıldı')}catch{toast('Yedek dosyası geçersiz')}};
}
