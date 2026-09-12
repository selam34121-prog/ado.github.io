import{settings,exportData,importData}from'./storage.js';
const API='https://ado-gemini-proxy.selam34121.workers.dev';
let syncing=false,timer;
export const signedIn=()=>Boolean(settings.get('syncToken',''));
export const accountEmail=()=>settings.get('syncEmail','');
async function request(path,options={}){const response=await fetch(API+path,{...options,headers:{'Content-Type':'application/json',...(signedIn()?{Authorization:`Bearer ${settings.get('syncToken','')}`}:{})}}),data=await response.json().catch(()=>({error:'Sunucudan geçersiz yanıt alındı.'}));if(!response.ok)throw Error(data.error||'İşlem başarısız.');return data}
export async function register(email,password,inviteCode){const data=await request('/auth/register',{method:'POST',body:JSON.stringify({email,password,inviteCode})});settings.set('syncToken',data.token);settings.set('syncEmail',data.email);await pushCloud()}
export async function login(email,password){const data=await request('/auth/login',{method:'POST',body:JSON.stringify({email,password})});settings.set('syncToken',data.token);settings.set('syncEmail',data.email);await pullCloud(true)}
export function logout(){settings.set('syncToken','');settings.set('syncEmail','');settings.set('syncUpdatedAt',0)}
export async function pushCloud(){if(!signedIn()||syncing)return;syncing=true;try{const result=await request('/sync',{method:'PUT',body:JSON.stringify({data:await exportData()})});settings.set('syncUpdatedAt',result.updatedAt)}finally{syncing=false}}
export async function pullCloud(force=false){if(!signedIn()||syncing)return false;syncing=true;try{const result=await request('/sync');if(!result.data){syncing=false;await pushCloud();return false}if(force||result.updatedAt>settings.get('syncUpdatedAt',0)){await importData(result.data);settings.set('syncUpdatedAt',result.updatedAt);return true}return false}finally{syncing=false}}
export function initializeSync(){window.addEventListener('ado:data-changed',()=>{if(syncing||!signedIn())return;clearTimeout(timer);timer=setTimeout(()=>pushCloud().catch(console.error),900)});const refresh=()=>{if(document.visibilityState==='visible')pullCloud().then(changed=>{if(changed)location.reload()}).catch(console.error)};document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);setInterval(refresh,60000);refresh()}
