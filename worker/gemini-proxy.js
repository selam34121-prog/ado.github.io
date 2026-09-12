export default{async fetch(request,env){
 const allowed=env.ALLOWED_ORIGIN||'*';
 const headers={'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json'};
 if(request.method==='OPTIONS')return new Response(null,{headers});
 if(request.method!=='POST')return new Response('{"error":"Method not allowed"}',{status:405,headers});
 try{
  const{message,context,history=[]}=await request.json();
  if(!message||message.length>4000)return new Response('{"error":"Invalid message"}',{status:400,headers});
  const personal=Object.keys(context||{}).length?`\nSoruyla ilgili panel verileri: ${JSON.stringify(context)}`:'';
  const contents=history.slice(-12).map(x=>({role:x.role==='ai'?'model':'user',parts:[{text:String(x.text).slice(0,4000)}]}));
  contents.push({role:'user',parts:[{text:`Genel amaçlı, doğal ve yardımsever bir Türkçe asistan gibi yanıt ver. Genel bilgini kullanabilirsin. Panel verileri varsa yalnızca ilgili olduğunda yararlan.${personal}

Kullanıcı açıkça panele kayıt EKLEMENİ isterse ve gerekli temel bilgiler belliyse, cevabının sonuna görünmez işlem verisi olarak tam bu biçimde tek satır ekle:
<ADO_ACTION>{"type":"add_subscription","name":"...","price":0,"currency":"TRY","period":"monthly","date":"YYYY-MM-DD","category":"Diğer","note":""}</ADO_ACTION>
Desteklenen türler: add_subscription, add_expense (name, amount, currency, category, date, note) ve create_note (title, content). İşlemin henüz uygulanmadığını, kullanıcının aşağıdaki onay düğmesine basması gerektiğini söyle; asla kaydı zaten eklediğini iddia etme. Bilgi eksikse soru sor ve işlem üretme. Silme veya güncelleme işlemi üretme.

Kullanıcı: ${message}`} ]});
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${env.GEMINI_API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents})});
  if(!response.ok)return new Response('{"error":"Gemini request failed"}',{status:502,headers});
  const data=await response.json();let text=data.candidates?.[0]?.content?.parts?.map(x=>x.text).join('')||'';let action=null;
  const match=text.match(/<ADO_ACTION>([\s\S]*?)<\/ADO_ACTION>/);
  if(match){try{const parsed=JSON.parse(match[1]);if(['add_subscription','add_expense','create_note'].includes(parsed.type))action=parsed}catch{}text=text.replace(match[0],'').trim()}
  return new Response(JSON.stringify({text,action}),{headers});
 }catch{return new Response('{"error":"Bad request"}',{status:400,headers})}
}};
