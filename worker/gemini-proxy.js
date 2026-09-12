const encoder=new TextEncoder();
const json=(data,status,headers)=>new Response(JSON.stringify(data),{status,headers});
const bytesToBase64=bytes=>btoa(String.fromCharCode(...bytes));
const base64ToBytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const base64url=bytes=>bytesToBase64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

async function passwordHash(password,salt){
 const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:180000,hash:'SHA-256'},material,256);
 return bytesToBase64(new Uint8Array(bits));
}

async function sign(payload,secret){
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return base64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(payload))));
}

async function createToken(user,secret){
 const payload=base64url(encoder.encode(JSON.stringify({uid:user.id,email:user.email,exp:Date.now()+30*24*60*60*1000})));
 return `${payload}.${await sign(payload,secret)}`;
}

async function verifyToken(request,secret){
 const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
 const [payload,signature]=token.split('.');
 if(!payload||!signature||signature!==await sign(payload,secret))return null;
 try{const padded=payload.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((payload.length+3)%4);const data=JSON.parse(new TextDecoder().decode(base64ToBytes(padded)));return data.exp>Date.now()?data:null}catch{return null}
}

async function auth(request,env,path,headers){
 const body=await request.json();
 const email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
 if(!/^\S+@\S+\.\S+$/.test(email)||password.length<8)return json({error:'Geçerli e-posta ve en az 8 karakterli parola gerekli.'},400,headers);
 if(path==='/auth/register'){
  const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM users').first();
  if(Number(count.total)>0)return json({error:'Hesap zaten oluşturulmuş. Giriş yap.'},409,headers);
  if(body.inviteCode!==env.INVITE_CODE)return json({error:'Kurulum kodu yanlış.'},403,headers);
  const salt=crypto.getRandomValues(new Uint8Array(16)),user={id:crypto.randomUUID(),email};
  await env.DB.prepare('INSERT INTO users (id,email,password_hash,salt,created_at) VALUES (?,?,?,?,?)').bind(user.id,email,await passwordHash(password,salt),bytesToBase64(salt),Date.now()).run();
  return json({token:await createToken(user,env.SESSION_SECRET),email},201,headers);
 }
 const user=await env.DB.prepare('SELECT id,email,password_hash,salt FROM users WHERE email=?').bind(email).first();
 if(!user||await passwordHash(password,base64ToBytes(user.salt))!==user.password_hash)return json({error:'E-posta veya parola yanlış.'},401,headers);
 return json({token:await createToken(user,env.SESSION_SECRET),email:user.email},200,headers);
}

async function sync(request,env,headers){
 const session=await verifyToken(request,env.SESSION_SECRET);
 if(!session)return json({error:'Oturum geçersiz. Yeniden giriş yap.'},401,headers);
 if(request.method==='GET'){
  const row=await env.DB.prepare('SELECT payload,updated_at FROM user_data WHERE user_id=?').bind(session.uid).first();
  return json({data:row?JSON.parse(row.payload):null,updatedAt:row?.updated_at||0},200,headers);
 }
 const body=await request.json(),payload=JSON.stringify(body.data||null);
 if(!body.data||payload.length>2000000)return json({error:'Senkronizasyon verisi geçersiz veya çok büyük.'},400,headers);
 const updatedAt=Date.now();
 await env.DB.prepare('INSERT INTO user_data (user_id,payload,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(session.uid,payload,updatedAt).run();
 return json({ok:true,updatedAt},200,headers);
}

async function shares(request,env,path,headers){
 const token=path.split('/')[2]||'';
 if(request.method==='POST'&&path==='/shares'){
  const body=await request.json(),notes=Array.isArray(body.notes)?body.notes:[];
  if(!notes.length||notes.length>100)return json({error:'Paylaşmak için 1-100 not seç.'},400,headers);
  const clean=notes.map(note=>({id:String(note.id||crypto.randomUUID()).slice(0,80),title:String(note.title||'Başlıksız').slice(0,300),content:String(note.content||'').slice(0,100000),updatedAt:Number(note.updatedAt)||Date.now()}));
  const payload=JSON.stringify(clean);
  if(payload.length>1000000)return json({error:'Seçilen notlar paylaşım sınırını aşıyor.'},413,headers);
  const shareToken=base64url(crypto.getRandomValues(new Uint8Array(24))),now=Date.now();
  await env.DB.prepare('INSERT INTO shared_notes (token,payload,created_at,updated_at) VALUES (?,?,?,?)').bind(shareToken,payload,now,now).run();
  return json({token:shareToken,updatedAt:now},201,headers);
 }
 if(!/^[A-Za-z0-9_-]{32}$/.test(token))return json({error:'Paylaşım bağlantısı geçersiz.'},404,headers);
 if(request.method==='GET'){
  const row=await env.DB.prepare('SELECT payload,updated_at FROM shared_notes WHERE token=?').bind(token).first();
  return row?json({notes:JSON.parse(row.payload),updatedAt:row.updated_at},200,headers):json({error:'Paylaşım bulunamadı.'},404,headers);
 }
 if(request.method==='PUT'){
  const row=await env.DB.prepare('SELECT token FROM shared_notes WHERE token=?').bind(token).first();
  if(!row)return json({error:'Paylaşım bulunamadı.'},404,headers);
  const body=await request.json(),notes=Array.isArray(body.notes)?body.notes:[];
  if(!notes.length||notes.length>100)return json({error:'Paylaşım en az bir not içermeli.'},400,headers);
  const clean=notes.map(note=>({id:String(note.id||'').slice(0,80),title:String(note.title||'Başlıksız').slice(0,300),content:String(note.content||'').slice(0,100000),updatedAt:Number(note.updatedAt)||Date.now()}));
  const payload=JSON.stringify(clean);
  if(payload.length>1000000)return json({error:'Notlar paylaşım sınırını aşıyor.'},413,headers);
  const updatedAt=Date.now();
  await env.DB.prepare('UPDATE shared_notes SET payload=?,updated_at=? WHERE token=?').bind(payload,updatedAt,token).run();
  return json({ok:true,updatedAt},200,headers);
 }
 return json({error:'Bulunamadı.'},404,headers);
}

async function gemini(request,env,headers){
 const{message,context,history=[]}=await request.json();
 if(!message||message.length>4000)return json({error:'Geçersiz mesaj.'},400,headers);
 const personal=Object.keys(context||{}).length?`\nSoruyla ilgili panel verileri: ${JSON.stringify(context)}`:'';
 const contents=history.slice(-12).map(x=>({role:x.role==='ai'?'model':'user',parts:[{text:String(x.text).slice(0,4000)}]}));
 contents.push({role:'user',parts:[{text:`Genel amaçlı, doğal ve yardımsever bir Türkçe asistan gibi yanıt ver. Genel bilgini kullanabilirsin. Panel verileri varsa yalnızca ilgili olduğunda yararlan.${personal}

Kullanıcı açıkça panele kayıt EKLEMENİ isterse ve gerekli temel bilgiler belliyse, cevabının sonuna görünmez işlem verisi olarak tam bu biçimde tek satır ekle:
<ADO_ACTION>{"type":"add_subscription","name":"...","price":0,"currency":"TRY","period":"monthly","date":"YYYY-MM-DD","category":"Diğer","note":""}</ADO_ACTION>
Desteklenen türler: add_subscription, add_expense (name, amount, currency, category, date, note) ve create_note (title, content). İşlemin henüz uygulanmadığını, kullanıcının aşağıdaki onay düğmesine basması gerektiğini söyle; asla kaydı zaten eklediğini iddia etme. Bilgi eksikse soru sor ve işlem üretme. Silme veya güncelleme işlemi üretme.

Kullanıcı: ${message}`} ]});
 const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${env.GEMINI_API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents})});
 if(!response.ok)return json({error:'Gemini isteği başarısız.'},502,headers);
 const data=await response.json();let text=data.candidates?.[0]?.content?.parts?.map(x=>x.text).join('')||'',action=null;
 const match=text.match(/<ADO_ACTION>([\s\S]*?)<\/ADO_ACTION>/);
 if(match){try{const parsed=JSON.parse(match[1]);if(['add_subscription','add_expense','create_note'].includes(parsed.type))action=parsed}catch{}text=text.replace(match[0],'').trim()}
 return json({text,action},200,headers);
}

export default{async fetch(request,env){
 const headers={'Access-Control-Allow-Origin':env.ALLOWED_ORIGIN||'*','Access-Control-Allow-Headers':'content-type,authorization','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
 if(request.method==='OPTIONS')return new Response(null,{headers});
 const path=new URL(request.url).pathname;
 try{
  if(['/auth/register','/auth/login'].includes(path)&&request.method==='POST')return await auth(request,env,path,headers);
  if(path==='/sync'&&['GET','PUT'].includes(request.method))return await sync(request,env,headers);
  if((path==='/shares'||path.startsWith('/shares/'))&&['GET','POST','PUT'].includes(request.method))return await shares(request,env,path,headers);
  if((path==='/'||path==='/ai')&&request.method==='POST')return await gemini(request,env,headers);
  return json({error:'Bulunamadı.'},404,headers);
 }catch(error){console.error(error);return json({error:'İstek işlenemedi.'},500,headers)}
}};
