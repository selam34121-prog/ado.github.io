const encoder=new TextEncoder();
const json=(data,status,headers)=>new Response(JSON.stringify(data),{status,headers});
const bytesToBase64=bytes=>btoa(String.fromCharCode(...bytes));
const base64ToBytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const base64url=bytes=>bytesToBase64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const hex=bytes=>[...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');
async function sha256(value){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))))}

async function passwordHash(password,salt){
 const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},material,256);
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
 if(!user){const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM users').first();if(Number(count.total)===0)return json({error:'Henüz hesap oluşturulmamış. Aşağıdaki İlk hesabı oluştur formunu kullan.'},409,headers);return json({error:'E-posta veya parola yanlış.'},401,headers)}
 if(await passwordHash(password,base64ToBytes(user.salt))!==user.password_hash)return json({error:'E-posta veya parola yanlış.'},401,headers);
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

async function createMcpAccess(request,env,headers){
 const session=await verifyToken(request,env.SESSION_SECRET);
 if(!session)return json({error:'Oturum geçersiz. Yeniden giriş yap.'},401,headers);
 const token=base64url(crypto.getRandomValues(new Uint8Array(32))),tokenHash=await sha256(token);
 await env.DB.prepare('DELETE FROM mcp_tokens WHERE user_id=?').bind(session.uid).run();
 await env.DB.prepare('INSERT INTO mcp_tokens (token_hash,user_id,created_at) VALUES (?,?,?)').bind(tokenHash,session.uid,Date.now()).run();
 return json({url:`${new URL(request.url).origin}/mcp?key=${token}`},201,headers);
}

const mcpText=value=>({content:[{type:'text',text:typeof value==='string'?value:JSON.stringify(value,null,2)}],structuredContent:typeof value==='object'?value:undefined});
const tool=(name,description,inputSchema,annotations={})=>({name,description,inputSchema,annotations});
const mcpTools=[
 tool('list_records','ADO hesabındaki notları, harcamaları veya abonelikleri listeler.',{type:'object',properties:{type:{type:'string',enum:['notes','expenses','subscriptions']},query:{type:'string',description:'İsteğe bağlı metin araması'}},required:['type'],additionalProperties:false},{readOnlyHint:true}),
 tool('create_note','Yeni bir not oluşturur.',{type:'object',properties:{title:{type:'string'},content:{type:'string'}},required:['title'],additionalProperties:false}),
 tool('update_note','Kimliği verilen notu günceller.',{type:'object',properties:{id:{type:'string'},title:{type:'string'},content:{type:'string'},pinned:{type:'boolean'}},required:['id'],additionalProperties:false}),
 tool('delete_note','Kimliği verilen notu kalıcı olarak siler.',{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false},{destructiveHint:true}),
 tool('create_expense','Yeni harcama kaydı oluşturur.',{type:'object',properties:{name:{type:'string'},amount:{type:'number',minimum:0},currency:{type:'string',enum:['TRY','USD','EUR']},category:{type:'string'},date:{type:'string',description:'YYYY-MM-DD'},store:{type:'string'},note:{type:'string'}},required:['name','amount','date'],additionalProperties:false}),
 tool('update_expense','Kimliği verilen harcamayı günceller.',{type:'object',properties:{id:{type:'string'},name:{type:'string'},amount:{type:'number',minimum:0},currency:{type:'string',enum:['TRY','USD','EUR']},category:{type:'string'},date:{type:'string'},store:{type:'string'},note:{type:'string'}},required:['id'],additionalProperties:false}),
 tool('delete_expense','Kimliği verilen harcamayı kalıcı olarak siler.',{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false},{destructiveHint:true}),
 tool('create_subscription','Yeni abonelik kaydı oluşturur.',{type:'object',properties:{name:{type:'string'},price:{type:'number',minimum:0},currency:{type:'string',enum:['TRY','USD','EUR']},period:{type:'string',enum:['monthly','yearly']},date:{type:'string',description:'Sonraki ödeme tarihi, YYYY-MM-DD'},category:{type:'string'},note:{type:'string'}},required:['name','price','date'],additionalProperties:false}),
 tool('update_subscription','Kimliği verilen aboneliği günceller.',{type:'object',properties:{id:{type:'string'},name:{type:'string'},price:{type:'number',minimum:0},currency:{type:'string',enum:['TRY','USD','EUR']},period:{type:'string',enum:['monthly','yearly']},date:{type:'string'},category:{type:'string'},note:{type:'string'}},required:['id'],additionalProperties:false}),
 tool('delete_subscription','Kimliği verilen aboneliği kalıcı olarak siler.',{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false},{destructiveHint:true})
];

async function mcpCall(env,userId,name,args={}){
 const row=await env.DB.prepare('SELECT payload FROM user_data WHERE user_id=?').bind(userId).first();
 const data=row?JSON.parse(row.payload):{version:1,settings:{},collections:{notes:[],expenses:[],subscriptions:[],shortcuts:[],commandHistory:[]}};
 data.collections||={};for(const key of ['notes','expenses','subscriptions'])data.collections[key]||=[];
 const now=Date.now(),id=crypto.randomUUID();let result,changed=false;
 if(name==='list_records'){
  const allowed=['notes','expenses','subscriptions'];if(!allowed.includes(args.type))throw Error('Kayıt türü geçersiz.');
  const query=String(args.query||'').toLocaleLowerCase('tr-TR');let records=data.collections[args.type];
  if(query)records=records.filter(item=>JSON.stringify(item).toLocaleLowerCase('tr-TR').includes(query));
  return mcpText({type:args.type,records:records.slice(0,100),total:records.length});
 }
 const configs={
  create_note:['notes',{id,title:String(args.title||'Başlıksız').slice(0,300),content:String(args.content||'').slice(0,100000),tags:[],pinned:false,createdAt:now,updatedAt:now}],
  create_expense:['expenses',{id,name:String(args.name||'Harcama').slice(0,300),amount:Number(args.amount)||0,currency:args.currency||'TRY',category:String(args.category||'Diğer').slice(0,100),date:String(args.date||new Date().toISOString().slice(0,10)),store:String(args.store||'').slice(0,300),note:String(args.note||'').slice(0,2000),createdAt:now}],
  create_subscription:['subscriptions',{id,name:String(args.name||'Abonelik').slice(0,300),price:Number(args.price)||0,currency:args.currency||'TRY',period:args.period||'monthly',date:String(args.date||new Date().toISOString().slice(0,10)),category:String(args.category||'Dijital').slice(0,100),note:String(args.note||'').slice(0,2000)}]
 };
 if(configs[name]){const[collection,item]=configs[name];data.collections[collection].push(item);result=item;changed=true}
 const match=name.match(/^(update|delete)_(note|expense|subscription)$/);
 if(match){const collection={note:'notes',expense:'expenses',subscription:'subscriptions'}[match[2]],items=data.collections[collection],index=items.findIndex(item=>item.id===args.id);if(index<0)throw Error('Kayıt bulunamadı.');if(match[1]==='delete'){result=items.splice(index,1)[0]}else{const safe={...args};delete safe.id;result=items[index]={...items[index],...safe,...(collection==='notes'?{updatedAt:now}:{})}}changed=true}
 if(!changed)throw Error('Bilinmeyen araç.');
 const payload=JSON.stringify(data);if(payload.length>2000000)throw Error('Hesap verisi depolama sınırını aşıyor.');
 await env.DB.prepare('INSERT INTO user_data (user_id,payload,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(userId,payload,now).run();
 return mcpText({ok:true,record:result});
}

async function mcp(request,env,headers){
 if(request.method!=='POST')return new Response(null,{status:405,headers:{...headers,Allow:'POST'}});
 const key=new URL(request.url).searchParams.get('key')||'',access=key?await env.DB.prepare('SELECT user_id FROM mcp_tokens WHERE token_hash=?').bind(await sha256(key)).first():null;
 if(!access)return json({jsonrpc:'2.0',error:{code:-32001,message:'Geçersiz MCP bağlantısı.'},id:null},401,headers);
 const message=await request.json(),id=message.id??null;
 if(message.method==='notifications/initialized')return new Response(null,{status:202,headers});
 if(message.method==='initialize')return json({jsonrpc:'2.0',id,result:{protocolVersion:message.params?.protocolVersion||'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'ADO Komuta Merkezi',version:'1.0.0'}}},200,headers);
 if(message.method==='tools/list')return json({jsonrpc:'2.0',id,result:{tools:mcpTools}},200,headers);
 if(message.method==='tools/call'){try{return json({jsonrpc:'2.0',id,result:await mcpCall(env,access.user_id,message.params?.name,message.params?.arguments)},200,headers)}catch(error){return json({jsonrpc:'2.0',id,result:{isError:true,content:[{type:'text',text:error.message}]}},200,headers)}}
 return json({jsonrpc:'2.0',id,error:{code:-32601,message:'Yöntem bulunamadı.'}},200,headers);
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
  if(path==='/mcp/access'&&request.method==='POST')return await createMcpAccess(request,env,headers);
  if(path==='/mcp')return await mcp(request,env,headers);
  if((path==='/shares'||path.startsWith('/shares/'))&&['GET','POST','PUT'].includes(request.method))return await shares(request,env,path,headers);
  if((path==='/'||path==='/ai')&&request.method==='POST')return await gemini(request,env,headers);
  return json({error:'Bulunamadı.'},404,headers);
 }catch(error){console.error(error);return json({error:'İstek işlenemedi.'},500,headers)}
}};
